'use server'

// The three server actions behind cross-device Spark drafts (docs/adr-drafts/1001-draft-sync.md).
//
// Entity-blind, exactly like the store they wrap, and they need no per-entity capability gate
// because they can only ever touch the CALLER'S OWN rows: `studio_draft` is keyed by profile id,
// and the id comes from the SESSION, never from the client. The scope does come from the client,
// which is fine and deliberate: it selects among that one author's own drafts and can address
// nothing else.
//
// Every one of them returns a plain value and swallows its own failures. The Spark treats a null
// or a false as "no server today" and carries on against the local copy, which is the degraded
// state this feature is designed to sit in whenever the network is unhappy.

import { getMyProfileId } from '@/lib/auth'
import {
  discardStagedDraft,
  eraseStagedDrafts,
  loadStagedDraft,
  saveStagedDraft,
  type StagedDraft,
} from '@/lib/studio/draft-store'

/** The staged copy of this Spark, for reconciling against what is on the device. */
export async function loadSparkDraftAction(scope: string): Promise<StagedDraft | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  return loadStagedDraft(profileId, scope)
}

/** Stage what the author has typed. False means the Spark stays local-only for now. */
export async function saveSparkDraftAction(
  scope: string,
  step: number,
  values: Record<string, string>,
  /** Where to send the author back to, and what to call it. Both are bounded and validated in the
   *  store: a route that is not a plain in-app path is dropped rather than trusted. */
  place?: { route?: string | null; label?: string | null },
): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  return saveStagedDraft(profileId, scope, { step, values, route: place?.route, label: place?.label })
}

/** Drop the staged copy: the wizard committed, or the author chose to start fresh. */
export async function discardSparkDraftAction(scope: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) return
  await discardStagedDraft(profileId, scope)
}

/** Erase every staged draft this member holds, from Settings. Returns how many rows went. */
export async function eraseSparkDraftsAction(): Promise<number> {
  const profileId = await getMyProfileId()
  if (!profileId) return 0
  return eraseStagedDrafts(profileId)
}
