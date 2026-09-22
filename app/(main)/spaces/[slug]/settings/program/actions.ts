'use server'

// Programs on Channels — the owner actions for the /settings/program surface. ADR-274
// never-trust-client: every action re-resolves the caller and the Space by slug and re-verifies manage
// access + the `program` function gate server-side before any write, exactly like the sibling settings
// actions (airwaves / collaborators). Blueprint sources must be one of THIS Space's own live (non-draft,
// non-archived) circles, re-checked here against the DB — the posted id is never trusted — and the data
// layer re-verifies channel ownership on every edit (a posted channelId from another Space throws).
// v1 was create-only; ADR-869 adds edit, blueprint refresh, and pause/resume. On any failure the
// operator comes back with a short error code the page renders in plain voice.
//
// ── THE PROGRAM HALF OF THE PRODUCTION SEAM (PROG-CAL9, ADR-1386) ───────────────────────────────
// "Make it a Production" on the Plan board opens this surface with the Plan whose target kind is
// `program`. Creating the Program is that Plan reaching Production, so create does two more things:
// writes `topical_channels.space_plan_id` on the insert (the back-link the Plan drawer reads) and
// advances the Plan's stage best-effort, exactly as closeJourneyProductionSeam
// (app/(main)/journeys/create-actions.ts) and closeProductionSeam (app/(main)/events/actions.ts) do.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { listCirclesForSpace } from '@/lib/circles/store'
import {
  createSpaceProgram,
  updateSpaceProgram,
  setProgramPaused,
  refreshProgramBlueprint,
} from '@/lib/channels/programs'
import { getSpacePlan, transitionSpacePlanRows } from '@/lib/calendar/plans-store'
import { briefError, log } from '@/lib/log'
import type { Space } from '@/lib/spaces/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function settingsPath(slug: string): string {
  return `/spaces/${slug}/settings/program`
}

/**
 * The shared server-side gate (ADR-274): re-resolve the caller and the Space and require real manage
 * rights (a staff previewer is read-only, so canManage only, never staffViewing) AND the `program`
 * function gate (enabled + admin-level role) the page renders by. Redirects out on any failure, so
 * callers can treat the return as proven.
 */
async function requireProgramManager(slug: string): Promise<{ space: Space; profileId: string }> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) redirect(`${settingsPath(slug)}?error=denied`)

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) redirect(`${settingsPath(slug)}?error=denied`)

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!canManage || !(await spaceFunctionAccessLive(space, 'program', caps.role))) {
    redirect(`${settingsPath(slug)}?error=denied`)
  }
  return { space, profileId: viewerProfileId }
}

/** A blueprint source must be one of this Space's OWN live circles — re-resolved from the DB, never
 *  trusted from the form (a posted id from another space or a draft is rejected here). */
async function requireLiveCircle(slug: string, spaceId: string, circleId: string): Promise<string> {
  const circles = await listCirclesForSpace(spaceId)
  const source = circles.find(
    (c) => c.id === circleId && c.status !== 'draft' && c.status !== 'archived',
  )
  if (!source) redirect(`${settingsPath(slug)}?error=circle`)
  return source.id
}

/**
 * The Plan this Program is being produced from, AUTHORIZED against the Space the gate just resolved
 * and never taken on the bound argument's word (a bound server-action argument travels through the
 * browser exactly like a form field does). `getSpacePlan` is the authority: it reads through the
 * CALLER'S OWN session, so RLS on `space_plans` decides, and the space_id filter refuses a Plan the
 * caller can see in a different Space. This is the shape `resolveCreateContext` settled for the
 * Journey half and `resolvePlanLink` (lib/events/plan-link.ts) for the event half.
 *
 * A Plan that cannot be honoured comes back null and the link is simply not made: the Program is
 * still created, because the operator's work must never be lost to a bad query string, and
 * `space_plan_id` staying NULL is the honest record of that. The page already said so out loud
 * before the form was submitted (its dropped-link notice), so nothing here is silent.
 */
async function resolveProductionPlan(spaceId: string, spacePlanId: string | null): Promise<string | null> {
  if (!spacePlanId || !UUID_RE.test(spacePlanId)) return null
  const plan = await getSpacePlan(spaceId, spacePlanId)
  return plan?.id ?? null
}

/**
 * THE PROGRAM HALF OF THE PRODUCTION SEAM (PROG-CAL9), the exact counterpart of
 * `closeJourneyProductionSeam` in app/(main)/journeys/create-actions.ts and `closeProductionSeam`
 * in app/(main)/events/actions.ts.
 *
 * The back-link is NOT written here: `createSpaceProgram` puts `space_plan_id` on the insert, so a
 * Program either exists carrying its Plan or does not exist. What is left is the other half of
 * what creating it means: the Plan has reached Production and the Workflow board must stop showing
 * it under Planning.
 *
 * 🔴 WHY BEST-EFFORT AND NOT A THROW. By the time this runs the Channel and its blueprint are
 * COMMITTED and the flagship circle is stamped as Chapter one, and the caller ends in `redirect()`.
 * Throwing would not undo the Program; it would bounce the operator to `?error=failed` while the
 * Program they just made sits live at /channels/<slug>, and a second press would meet "This Space
 * already runs a Program". That is strictly worse than a lagging stage column.
 *
 * AGENTS.md: "every fail-safe needs a gate that notices it fired." One structured line per failure,
 * on the same event name the other two seams use, so one query finds all three. And the lag is
 * DERIVABLE: a Plan with a Program carrying its `space_plan_id` reached Production whatever its
 * stage column says.
 */
async function closeProgramProductionSeam(
  spaceId: string,
  channelId: string,
  spacePlanId: string | null,
): Promise<void> {
  if (!spacePlanId) return
  try {
    const moved = await transitionSpacePlanRows(spaceId, spacePlanId, 'production')
    if ('error' in moved) {
      log.error('calendar.production_plan_stage_not_advanced', { spaceId, channelId, planId: spacePlanId })
    }
  } catch (e) {
    log.error('calendar.production_plan_stage_not_advanced', {
      spaceId,
      channelId,
      planId: spacePlanId,
      error: briefError(e),
    })
  }
}

/** Where a failed create bounces back to. The Plan rides along, so an operator who missed a field
 *  does not lose the link they arrived with on the way back to the form. */
function createErrorPath(slug: string, code: string, spacePlanId: string | null): string {
  const q = new URLSearchParams({ error: code })
  if (spacePlanId) q.set('plan', spacePlanId)
  return `${settingsPath(slug)}?${q.toString()}`
}

/**
 * Create this Space's Program: a Channel it runs (topical_channels.owner_space_id) with the chosen
 * flagship circle saved as the Chapter blueprint (template_id). Bound by the page
 * (`createSpaceProgramAction.bind(null, slug, spacePlanId)`), so the form posts only the
 * member-entered fields. `spacePlanId` is the Plan behind "Make it a Production" (null when the
 * page was opened any other way) and is re-authorized here through `resolveProductionPlan`.
 */
export async function createSpaceProgramAction(
  slug: string,
  spacePlanId: string | null,
  formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)
  const requested = typeof spacePlanId === 'string' ? spacePlanId.trim() : null

  const name = String(formData.get('name') ?? '').trim()
  const oneLiner = String(formData.get('oneLiner') ?? '').trim()
  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!name || !oneLiner || !sourceCircleId) redirect(createErrorPath(slug, 'missing', requested))

  const sourceId = await requireLiveCircle(slug, space.id, sourceCircleId)
  const planId = await resolveProductionPlan(space.id, requested)

  let channelId: string
  let channelSlug: string
  try {
    const created = await createSpaceProgram({
      spaceId: space.id,
      profileId,
      name,
      oneLiner,
      sourceCircleId: sourceId,
      spacePlanId: planId,
    })
    channelId = created.channelId
    channelSlug = created.channelSlug
  } catch {
    redirect(createErrorPath(slug, 'failed', requested))
  }
  await closeProgramProductionSeam(space.id, channelId, planId)
  redirect(`/channels/${channelSlug}`)
}

/**
 * Edit the Program's display copy (name + one liner). The data layer patches the Channel row and keeps
 * the blueprint's card copy in step; the channel slug never changes, so shared links keep working.
 * Bound by the page (`updateSpaceProgramAction.bind(null, slug, channelId)`); ownership of the posted
 * channelId is re-verified in the data layer, which throws on a Program another Space runs.
 */
export async function updateSpaceProgramAction(
  slug: string,
  channelId: string,
  formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  const name = String(formData.get('name') ?? '').trim()
  const oneLiner = String(formData.get('oneLiner') ?? '').trim()
  if (!name || !oneLiner) redirect(`${settingsPath(slug)}?error=missing`)

  try {
    await updateSpaceProgram({
      spaceId: space.id,
      profileId,
      channelId,
      patch: { name, oneLiner },
    })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}

/**
 * Re-snapshot the blueprint from one of the Space's live circles. Existing Chapters keep the setup they
 * started with; only future Chapters start from the new snapshot. Same source checks as create.
 */
export async function refreshProgramBlueprintAction(
  slug: string,
  channelId: string,
  formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  const sourceCircleId = String(formData.get('sourceCircleId') ?? '').trim()
  if (!sourceCircleId) redirect(`${settingsPath(slug)}?error=missing`)
  const sourceId = await requireLiveCircle(slug, space.id, sourceCircleId)

  try {
    await refreshProgramBlueprint({ spaceId: space.id, profileId, channelId, sourceCircleId: sourceId })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}

/**
 * Pause or resume the Program: flips the same is_active retire switch startChapter respects (ADR-865).
 * Paused: the Channel page is hidden and no new Chapters can start. Members and Chapters keep
 * everything they have. Fully bound by the page (slug, channelId, paused); the trailing FormData is the
 * form-action calling convention, unused.
 */
export async function setProgramPausedAction(
  slug: string,
  channelId: string,
  paused: boolean,
  _formData: FormData,
): Promise<void> {
  const { space, profileId } = await requireProgramManager(slug)

  try {
    await setProgramPaused({ spaceId: space.id, profileId, channelId, paused })
  } catch {
    redirect(`${settingsPath(slug)}?error=failed`)
  }
  redirect(`${settingsPath(slug)}?saved=1`)
}
