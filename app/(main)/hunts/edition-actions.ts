'use server'

// Edition and import actions for a Trail's creator (FH-044). Each establishes the caller itself and
// refuses while HUNTS_AUTHORING_ENABLED is off, like the creator actions beside it. The gate on the Hunt
// (owner or admin for a release) lives in lib/hunts/edition-store.ts through lib/hunts/authz.ts. An
// import is a governed create, the same road as naming a new trail, and lands as a private draft:
// it carries the legacy hunt's shape and nobody's progress.

import { requireAdmin } from '@/lib/admin/guard'
import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import type { ChecklistItem } from '@/lib/hunts/draft'
import { createImportedDraft, loadQrCampaignImport, loadRegularsImport, previewRelease, releaseEdition, type ReleasePreview } from '@/lib/hunts/edition-store'
import { huntSwitchOn } from '@/lib/hunts/flags'

const OFF = 'Trails are not open yet.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authorizeAuthoring(): Promise<{ profileId: string } | { error: string }> {
  if (!huntSwitchOn('authoring')) return { error: OFF }
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Sign in first.' }
  return { profileId: caller.id }
}

export type ReleaseEditionResult =
  | { released: true; versionNo: number; carried: number; retired: number; pinnedRuns: number }
  | { conflict: true; currentRevision: number }
  | { blocked: true; items: ChecklistItem[] }

/** Release the open draft as the next edition. Runs already playing keep the edition they started on. */
export async function releaseEditionAction(input: { huntId: string; baseRevision: number; label: string; visibility: string; permissionConfirmed: boolean }): Promise<ActionResult<ReleaseEditionResult>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (typeof input.huntId !== 'string' || !UUID.test(input.huntId) || !Number.isInteger(input.baseRevision) || input.baseRevision < 1) return fail('That edition could not be released.')
  try {
    const res = await releaseEdition(input.huntId, { profileId: gate.profileId }, {
      baseRevision: input.baseRevision,
      label: typeof input.label === 'string' ? input.label : '',
      visibility: input.visibility === 'public' ? 'public' : 'unlisted',
      permissionConfirmed: input.permissionConfirmed === true,
    })
    if (res.ok) return ok({ released: true, versionNo: res.versionNo, carried: res.carried, retired: res.retired.length, pinnedRuns: res.pinnedRuns })
    if (res.reason === 'conflict') return ok({ conflict: true, currentRevision: res.currentRevision })
    if (res.reason === 'checklist') return ok({ blocked: true, items: res.items })
    if (res.reason === 'nothing_to_release') return fail('There is no new draft to release.')
    return fail('Only the trail owner or an admin can release an edition.')
  } catch {
    return fail('The edition could not be released. Try again.')
  }
}

/** What a release would do, for the publish step to show before the tap (FH-044S). Writes nothing. */
export async function previewReleaseAction(input: { huntId: string }): Promise<ActionResult<ReleasePreview | null>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (typeof input.huntId !== 'string' || !UUID.test(input.huntId)) return fail('That trail could not be found.')
  try {
    return ok(await previewRelease(input.huntId, { profileId: gate.profileId }))
  } catch {
    return fail('The printed codes could not be read. Try again.')
  }
}

type Imported = NonNullable<Awaited<ReturnType<typeof loadRegularsImport>>>

function commitImport(imported: Imported, rationale: string): Promise<ActionResult<{ huntId: string; notices: string[] }>> {
  const { title, hook, area, audience } = imported.draft
  return proposeAndConfirmCreate<{ huntId: string; notices: string[] }>({
    entity: 'hunt',
    draft: { title, hook, area, audience },
    rationale,
    commit: async ({ actorProfileId }) => ({ ...(await createImportedDraft(actorProfileId, imported)), notices: imported.notices }),
  })
}

/** Start a Trail draft from a Regulars hunt the caller's Space hosts. The Regulars hunt is not changed. */
export async function importRegularsHuntAction(input: { spaceId: string; legacyHuntId: string }): Promise<ActionResult<{ huntId: string; notices: string[] }>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  if (!UUID.test(String(input.spaceId)) || !UUID.test(String(input.legacyHuntId))) return fail('That hunt could not be found.')
  const imported = await loadRegularsImport({ spaceId: input.spaceId, legacyHuntId: input.legacyHuntId })
  if (!imported || !imported.draft.title) return fail('That hunt could not be found.')
  return commitImport(imported, 'A host started a trail from a Regulars hunt.')
}

/** Start a Trail draft from a QR campaign. Host staff only, the same gate as the campaign screen. */
export async function importQrCampaignAction(input: { challengeId: string }): Promise<ActionResult<{ huntId: string; notices: string[] }>> {
  const gate = await authorizeAuthoring()
  if ('error' in gate) return fail(gate.error)
  await requireAdmin('host', { staff: 'qr' })
  if (!UUID.test(String(input.challengeId))) return fail('That campaign could not be found.')
  const imported = await loadQrCampaignImport(input.challengeId)
  if (!imported || !imported.draft.title) return fail('That campaign could not be found.')
  return commitImport(imported, 'Staff started a trail from a QR campaign.')
}
