'use server'

// The Trail creator actions (FH-013, docs/hunts/CREATOR-FLOW.md). Every one establishes the caller
// itself and refuses when HUNTS_AUTHORING_ENABLED is off (lib/hunts/flags.ts), the same answer the
// pages give with a 404. The gate on the Hunt itself (owner, admin, editor) lives in lib/hunts/store.ts
// through lib/hunts/authz.ts; these actions never pass a profile id they did not derive here.

import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { parseTrailDraft, saveDraft, type ChecklistItem, type TrailDraft } from '@/lib/hunts/draft'
import { createTrailDraft, markRouteTested, publishTrail, trailStoreFor, type PublishVisibility } from '@/lib/hunts/store'

const OFF = 'Trails are not open yet.'

async function authorizeAuthoring(): Promise<{ profileId: string } | { error: string }> {
  if (!huntSwitchOn('authoring')) return { error: OFF }
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in first.' }
  return { profileId: caller.id }
}

/** Step 1, "Name it": the governed create. A row exists only once the resident taps Continue here. */
export async function createTrailAction(input: { title: string; hook?: string; area?: string; audience?: string }): Promise<ActionResult<{ huntId: string }>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  const draft: TrailDraft = parseTrailDraft({ title: input.title, hook: input.hook, area: input.area, audience: input.audience, stops: [] })
  if (!draft.title.trim()) return fail('Give the trail a title.')
  return proposeAndConfirmCreate<{ huntId: string }>({
    entity: 'hunt',
    draft: { title: draft.title, hook: draft.hook, area: draft.area, audience: draft.audience },
    rationale: 'A resident named a new trail.',
    commit: async ({ actorProfileId }) => {
      const made = await createTrailDraft({ ownerProfileId: actorProfileId, draft })
      return { huntId: made.huntId }
    },
  })
}

export type SaveTrailResult = { revision: number } | { conflict: true; currentRevision: number }

/** Steps 2 to 5: one revision-checked save. A stale tab gets `conflict` and nothing is written. */
export async function saveTrailAction(input: { huntId: string; baseRevision: number; draft: unknown }): Promise<ActionResult<SaveTrailResult>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (typeof input.huntId !== 'string' || !Number.isInteger(input.baseRevision) || input.baseRevision < 1) return fail('That trail could not be saved.')
  try {
    const res = await saveDraft(trailStoreFor({ profileId: gate.profileId }), {
      huntId: input.huntId,
      baseRevision: input.baseRevision,
      draft: parseTrailDraft(input.draft),
    })
    return ok(res.ok ? { revision: res.revision } : { conflict: true, currentRevision: res.currentRevision })
  } catch {
    return fail('That trail could not be saved. Try again.')
  }
}

/** Step 4, after every stop was previewed in order: the route test is recorded on this revision. */
export async function routeTestedAction(input: { huntId: string; revision: number }): Promise<ActionResult<SaveTrailResult>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (typeof input.huntId !== 'string' || !Number.isInteger(input.revision)) return fail('That trail could not be saved.')
  try {
    const res = await markRouteTested(input.huntId, { profileId: gate.profileId }, input.revision)
    return ok(res.ok ? { revision: input.revision } : { conflict: true, currentRevision: res.currentRevision })
  } catch {
    return fail('The route test could not be recorded. Try again.')
  }
}

export type PublishTrailResult =
  | { published: true; visibility: PublishVisibility }
  | { conflict: true; currentRevision: number }
  | { blocked: true; items: ChecklistItem[] }

/** Step 5: the immutable publish. Refused by the store while any checklist item is open. */
export async function publishTrailAction(input: { huntId: string; baseRevision: number; visibility: string; permissionConfirmed: boolean }): Promise<ActionResult<PublishTrailResult>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (typeof input.huntId !== 'string' || !Number.isInteger(input.baseRevision)) return fail('That trail could not be published.')
  const visibility: PublishVisibility = input.visibility === 'public' ? 'public' : 'unlisted'
  try {
    const res = await publishTrail(input.huntId, { profileId: gate.profileId }, input.baseRevision, visibility, input.permissionConfirmed === true)
    if (res.ok) return ok({ published: true, visibility: res.visibility })
    if (res.reason === 'conflict') return ok({ conflict: true, currentRevision: res.currentRevision })
    if (res.reason === 'checklist') return ok({ blocked: true, items: res.items })
    return fail('Only the trail owner or an admin can publish it.')
  } catch {
    return fail('The trail could not be published. Try again.')
  }
}
