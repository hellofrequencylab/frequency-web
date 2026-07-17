// PER-SPACE PIPELINE STAGES — the owner-gated, space-scoped WRITE layer for a Space CRM's pipeline
// (ADR-517 Phase F2). A stage is a `crm_stages` row: a name, a `kind` (open / won / lost) that drives
// the deal status + column tone, and a `sort_order`. Reads live in lib/crm/pipeline.ts (getStages,
// fail-safe); this module owns create / rename / set-kind / reorder / delete, all gated + scoped.
//
// SHAPE (mirrors lib/crm/space-tasks.ts): this module has NO 'use server' directive, so it can ALSO
// export the pure helpers (name normalization, the Won/Lost invariant, the reassign-target pick) and
// the types the surfaces import. The thin 'use server' wrappers the CLIENT editor calls live in
// app/(main)/spaces/[slug]/crm/stage-actions.ts; SERVER components read straight from lib/crm/pipeline.ts.
//
// AUTHORIZATION (the gate, end to end):
//   • Every write re-resolves the Space by SLUG and confirms the caller may MANAGE it
//     (resolveSpaceManageAccess.canManage — owner / admin / editor; a staff previewer is NOT canManage,
//     so it is fail-closed to read-only) AND may use the `crm` function (spaceFunctionAccess), the SAME
//     gate the CRM board + rail surface run. A denied caller writes nothing and gets an error.
//   • Every write is SCOPED to the Space: an INSERT stamps space_id; an UPDATE / DELETE filters BOTH id
//     AND space_id, so a stage id from another Space is a no-op, never a cross-space mutation.
//
// INVARIANTS enforced server-side (never trust the client):
//   • At least one `won` and one `lost` stage always remain — a delete / kind-change that would drop the
//     last Won or last Lost is rejected with a clear message.
//   • Deleting a stage that holds deals REASSIGNS those deals to an adjacent `open` stage (never orphan
//     a deal); when no open stage would remain to catch them, the delete is blocked with a clear message.
//
// crm_stages / crm_deals ARE in the generated DB types (space_id included), so these writes use the
// typed admin client (service-role — the crm_* tables are RLS-enabled with NO policies; the owner gate
// above is the authority), matching the lib/crm/pipeline.ts read posture.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getStages, type CrmStage, type StageKind } from '@/lib/crm/pipeline'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** A generous cap so a hostile write can never store an unbounded stage name; trims on write. */
export const MAX_STAGE_NAME = 60

/** The three stage kinds a pipeline column can carry. */
export const STAGE_KINDS: readonly StageKind[] = ['open', 'won', 'lost'] as const

// ── PURE: input validation + the invariants (no IO, fully testable) ───────────────────────────────

/** Narrow an unknown to a valid StageKind. Pure. */
export function isStageKind(raw: unknown): raw is StageKind {
  return raw === 'open' || raw === 'won' || raw === 'lost'
}

/** Trim + collapse + length-cap a raw stage name to a clean string. Anything non-string collapses to
 *  ''. An empty result is the caller's signal to REJECT the write (a stage must have a name). Pure. */
export function normalizeStageName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_STAGE_NAME)
}

/** How many stages carry a given kind. Pure. */
export function countKind(stages: readonly Pick<CrmStage, 'kind'>[], kind: StageKind): number {
  return stages.filter((s) => s.kind === kind).length
}

/** Whether DELETING `stageId` keeps at least one Won and one Lost stage. Returns a reason when it would
 *  not (so the UI + the action can surface the SAME message). Pure. */
export function canDeleteStage(
  stages: readonly Pick<CrmStage, 'id' | 'kind'>[],
  stageId: string,
): { ok: boolean; reason?: string } {
  const target = stages.find((s) => s.id === stageId)
  if (!target) return { ok: false, reason: 'That stage is not part of this pipeline.' }
  if (target.kind === 'won' && countKind(stages, 'won') <= 1) {
    return { ok: false, reason: 'Keep at least one Won stage. Add another before removing this one.' }
  }
  if (target.kind === 'lost' && countKind(stages, 'lost') <= 1) {
    return { ok: false, reason: 'Keep at least one Lost stage. Add another before removing this one.' }
  }
  return { ok: true }
}

/** Whether CHANGING `stageId` to `nextKind` keeps at least one Won and one Lost stage. Pure. */
export function canSetStageKind(
  stages: readonly Pick<CrmStage, 'id' | 'kind'>[],
  stageId: string,
  nextKind: StageKind,
): { ok: boolean; reason?: string } {
  const target = stages.find((s) => s.id === stageId)
  if (!target) return { ok: false, reason: 'That stage is not part of this pipeline.' }
  if (target.kind === nextKind) return { ok: true }
  if (target.kind === 'won' && countKind(stages, 'won') <= 1) {
    return { ok: false, reason: 'Keep at least one Won stage. Add another Won stage first.' }
  }
  if (target.kind === 'lost' && countKind(stages, 'lost') <= 1) {
    return { ok: false, reason: 'Keep at least one Lost stage. Add another Lost stage first.' }
  }
  return { ok: true }
}

/** Pick the `open` stage a deleted stage's deals should move to: the nearest remaining OPEN stage by
 *  sort position, preferring the one just before it. Returns null when NO open stage would remain (the
 *  caller then blocks a delete-with-deals rather than orphaning them). Expects `stages` sorted by
 *  sort_order. Pure. */
export function pickReassignStage(
  stages: readonly Pick<CrmStage, 'id' | 'kind'>[],
  stageId: string,
): string | null {
  const idx = stages.findIndex((s) => s.id === stageId)
  if (idx === -1) return null
  let bestId: string | null = null
  let bestDist = Infinity
  stages.forEach((s, i) => {
    if (s.id === stageId || s.kind !== 'open') return
    // Distance metric: nearer is better; on a tie a PRECEDING stage wins over a following one.
    const dist = Math.abs(i - idx) * 2 + (i < idx ? 0 : 1)
    if (dist < bestDist) {
      bestDist = dist
      bestId = s.id
    }
  })
  return bestId
}

/** Validate that `orderedIds` is a permutation of exactly the current stage ids (no add / drop / dupe),
 *  so a reorder can only ever RESHUFFLE this Space's stages. Pure. */
export function isValidReorder(currentIds: readonly string[], orderedIds: readonly string[]): boolean {
  if (orderedIds.length !== currentIds.length) return false
  if (new Set(orderedIds).size !== orderedIds.length) return false
  const have = new Set(currentIds)
  return orderedIds.every((id) => have.has(id))
}

// ── Authorization seam: the manage gate, returning the resolved space id when allowed ─────────────

/** Re-resolve the Space by slug + confirm the caller may MANAGE it (canManage) AND use the `crm`
 *  function. Returns the Space id + canonical slug when allowed, or null otherwise (fail-closed; a staff
 *  previewer is not canManage, so it is rejected). EXPORTED so the rail Pipeline getter re-gates through
 *  the EXACT same check the writes do (a non-manager gets null there too). Every stage write requires this. */
export async function resolveStageManagerAccess(
  slug: string,
): Promise<{ spaceId: string; slug: string } | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) return null

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!spaceFunctionAccess(space, 'crm', caps.role)) return null

  return { spaceId: space.id, slug: space.slug }
}

/** The typed crm_stages admin-client seam (service-role; the owner gate above is the authority). */
function db() {
  return createAdminClient()
}

/** Revalidate the surface a Space's pipeline renders on (the CRM board). */
function revalidateSpace(slug: string): void {
  revalidatePath(`/spaces/${slug}/crm`)
}

// ── PUBLIC SERVER ACTIONS (all manage-gated + space-scoped) ───────────────────────────────────────

/**
 * Create a stage for a Space. Gated on canManage + the crm function, space-scoped. The name is
 * normalized + length-capped (rejected when empty); the kind must be open / won / lost. The new stage
 * lands at the END (max sort_order + 1). Stamps space_id + returns the new id. Fail-closed on permission.
 */
export async function createStage(
  slug: string,
  name: string,
  kind: StageKind,
): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveStageManagerAccess(slug)
  if (!auth) return fail('You do not have permission to edit this pipeline.')

  const clean = normalizeStageName(name)
  if (!clean) return fail('Name the stage first.')
  if (!isStageKind(kind)) return fail('Pick a stage type.')

  try {
    const current = await getStages(auth.spaceId)
    const nextOrder = current.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1
    const { data, error } = await db()
      .from('crm_stages')
      .insert({ space_id: auth.spaceId, name: clean, kind, sort_order: nextOrder })
      .select('id')
      .maybeSingle()
    if (error || !data) return fail('Could not add the stage. Try again.')
    revalidateSpace(slug)
    return ok({ id: data.id })
  } catch {
    return fail('Could not add the stage. Try again.')
  }
}

/**
 * Rename a stage. Gated + space-scoped (the UPDATE filters id AND space_id, so a cross-space id is a
 * no-op). The name is normalized + length-capped (rejected when empty). Fail-closed on permission.
 */
export async function renameStage(slug: string, stageId: string, name: string): Promise<ActionResult> {
  const auth = await resolveStageManagerAccess(slug)
  if (!auth) return fail('You do not have permission to edit this pipeline.')

  const clean = normalizeStageName(name)
  if (!clean) return fail('A stage needs a name.')

  try {
    const { error } = await db()
      .from('crm_stages')
      .update({ name: clean })
      .eq('id', stageId)
      .eq('space_id', auth.spaceId)
    if (error) return fail('Could not rename the stage. Try again.')
    revalidateSpace(slug)
  } catch {
    return fail('Could not rename the stage. Try again.')
  }
  return ok()
}

/**
 * Change a stage's kind (open / won / lost). Gated + space-scoped. Enforces the Won/Lost invariant (a
 * change that would drop the last Won or last Lost is rejected). The deals SITTING in this stage have
 * their status re-synced to the new kind (an open stage reopens them + clears the close stamp; a
 * won/lost stage stamps closed_at), so the metrics stay honest. Fail-closed on permission.
 */
export async function setStageKind(
  slug: string,
  stageId: string,
  kind: StageKind,
): Promise<ActionResult> {
  const auth = await resolveStageManagerAccess(slug)
  if (!auth) return fail('You do not have permission to edit this pipeline.')
  if (!isStageKind(kind)) return fail('Pick a stage type.')

  try {
    const stages = await getStages(auth.spaceId)
    const guard = canSetStageKind(stages, stageId, kind)
    if (!guard.ok) return fail(guard.reason ?? 'That change is not allowed.')

    // No-op kind change (e.g. Won -> Won): return WITHOUT writing. Re-running the deal re-sync below
    // would re-stamp closed_at = now for every deal in the stage, inflating computeMetrics.upgradesThisMonth
    // and clobbering the real historical close dates. Nothing changes, so there is nothing to persist.
    const target = stages.find((s) => s.id === stageId)
    if (target && target.kind === kind) return ok()

    const { error } = await db()
      .from('crm_stages')
      .update({ kind })
      .eq('id', stageId)
      .eq('space_id', auth.spaceId)
    if (error) return fail('Could not update the stage. Try again.')

    // Re-sync the deals in this stage to the new kind, scoped to this Space (never cross-space).
    await db()
      .from('crm_deals')
      .update({
        status: kind,
        closed_at: kind === 'open' ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stage_id', stageId)
      .eq('space_id', auth.spaceId)

    // TOCTOU compensation (see wonLostFloorHolds): the guard above is a check-then-act across separate
    // statements, so a concurrent setStageKind/deleteStage could pass its own guard and, together with
    // this write, drop the LAST Won or Lost stage to zero. Only a change AWAY from won/lost can do that;
    // if the floor is now broken, revert this stage (and its deals) so >=1 Won and >=1 Lost always remain.
    if (
      (target?.kind === 'won' || target?.kind === 'lost') &&
      !(await wonLostFloorHolds(auth.spaceId))
    ) {
      await db()
        .from('crm_stages')
        .update({ kind: target.kind })
        .eq('id', stageId)
        .eq('space_id', auth.spaceId)
      await db()
        .from('crm_deals')
        .update({
          status: target.kind,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stage_id', stageId)
        .eq('space_id', auth.spaceId)
      revalidateSpace(slug)
      return fail('Another change removed the last Won or Lost stage. Try again.')
    }

    revalidateSpace(slug)
  } catch {
    return fail('Could not update the stage. Try again.')
  }
  return ok()
}

/**
 * Reorder a Space's stages. Gated + space-scoped. `orderedIds` must be a permutation of exactly this
 * Space's stage ids (no add / drop / dupe), so a reorder can only reshuffle — the new sort_order is the
 * index in `orderedIds`. Fail-closed on permission.
 */
export async function reorderStages(slug: string, orderedIds: string[]): Promise<ActionResult> {
  const auth = await resolveStageManagerAccess(slug)
  if (!auth) return fail('You do not have permission to edit this pipeline.')

  try {
    const stages = await getStages(auth.spaceId)
    if (!isValidReorder(stages.map((s) => s.id), orderedIds)) {
      return fail('Could not save the new order. Try again.')
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await db()
        .from('crm_stages')
        .update({ sort_order: i })
        .eq('id', orderedIds[i])
        .eq('space_id', auth.spaceId)
      if (error) return fail('Could not save the new order. Try again.')
    }
    revalidateSpace(slug)
  } catch {
    return fail('Could not save the new order. Try again.')
  }
  return ok()
}

/**
 * Delete a stage. Gated + space-scoped. Enforces the Won/Lost invariant (the last Won or last Lost
 * cannot be deleted). Any deals sitting in the stage are REASSIGNED to an adjacent open stage first, so
 * they are never orphaned; when no open stage would remain to catch them, the delete is blocked with a
 * clear message. Fail-closed on permission.
 */
export async function deleteStage(slug: string, stageId: string): Promise<ActionResult> {
  const auth = await resolveStageManagerAccess(slug)
  if (!auth) return fail('You do not have permission to edit this pipeline.')

  try {
    const stages = await getStages(auth.spaceId)
    const guard = canDeleteStage(stages, stageId)
    if (!guard.ok) return fail(guard.reason ?? 'That stage cannot be removed.')
    const target = stages.find((s) => s.id === stageId)

    // Reassign any deals in this stage to an adjacent open stage before deleting (never orphan a deal).
    const dealCount = await countDealsInStage(auth.spaceId, stageId)
    if (dealCount > 0) {
      const targetId = pickReassignStage(stages, stageId)
      if (!targetId) {
        return fail('Add another open stage before removing this one, so its deals have somewhere to go.')
      }
      const { error: moveError } = await db()
        .from('crm_deals')
        .update({
          stage_id: targetId,
          status: 'open',
          closed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('stage_id', stageId)
        .eq('space_id', auth.spaceId)
      if (moveError) return fail('Could not move the deals off this stage. Try again.')
    }

    const { error } = await db()
      .from('crm_stages')
      .delete()
      .eq('id', stageId)
      .eq('space_id', auth.spaceId)
    if (error) return fail('Could not remove the stage. Try again.')

    // TOCTOU compensation (see wonLostFloorHolds): the canDeleteStage guard is a check-then-act, so a
    // concurrent delete/kind-change could drop the last Won or Lost alongside this one. Only deleting a
    // won/lost stage can do that; if the floor is now broken, recreate an (empty — its deals were already
    // reassigned) same-kind stage so >=1 Won and >=1 Lost always remain, and report a retry.
    if (
      (target?.kind === 'won' || target?.kind === 'lost') &&
      !(await wonLostFloorHolds(auth.spaceId))
    ) {
      await db()
        .from('crm_stages')
        .insert({
          space_id: auth.spaceId,
          name: target.name,
          kind: target.kind,
          sort_order: target.sort_order,
        })
      revalidateSpace(slug)
      return fail('Another change removed the last Won or Lost stage. Try again.')
    }

    revalidateSpace(slug)
  } catch {
    return fail('Could not remove the stage. Try again.')
  }
  return ok()
}

/**
 * Whether the Won/Lost floor (>=1 Won AND >=1 Lost stage) still holds for a Space, read fresh. Used to
 * COMPENSATE after a mutation whose check-then-act guard could have raced another concurrent write to
 * zero. An empty read (getStages is fail-safe to []) is treated as "holds", so a transient read error
 * NEVER triggers a false revert — a real pipeline always carries at least one Won and one Lost. Pure IO.
 */
async function wonLostFloorHolds(spaceId: string): Promise<boolean> {
  const stages = await getStages(spaceId)
  if (stages.length === 0) return true
  return countKind(stages, 'won') >= 1 && countKind(stages, 'lost') >= 1
}

/** Count the deals sitting in a stage, scoped to this Space. Fail-safe to 0. */
async function countDealsInStage(spaceId: string, stageId: string): Promise<number> {
  try {
    const { count } = await db()
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', stageId)
      .eq('space_id', spaceId)
    return count ?? 0
  } catch {
    return 0
  }
}
