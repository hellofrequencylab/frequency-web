import 'server-only'

// THE FEATURE BUILDER FINISH (LIVE-2481): save what a builder collected into the real feature, under the person's own
// session, through the writers each feature already has. No second writer anywhere: the personal Spotlight saves
// through savePersonalSpotlight (the one profile writer) and publishes through the Settings switches. Each feature
// lands here as its builder ships; an unwired feature answers an error, never a silent success.

import { revalidatePath } from 'next/cache'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'
import { personalSpotlightHref } from '@/lib/launch/personal'
import { loadStoredProfile, savePersonalSpotlight } from '@/lib/launch/personal-io'
import type { FeatureId } from './catalog'
import type { FeatureDraft } from './draft'

export type ApplyResult = { ok: true; liveHref: string | null } | { ok: false; error: string }

const RETRY = 'We could not save that. Try again.'

async function applySpotlight(profileId: string, draft: FeatureDraft): Promise<ApplyResult> {
  const saved = await savePersonalSpotlight(profileId, { name: draft.name ?? '', line: draft.line ?? '', link: draft.link ?? '' })
  if (!saved) return { ok: false, error: RETRY }
  // Turning the page on and publishing it are the person's own switches (Settings, Profile). Building it here is the
  // explicit act, so both are flipped; a page already on stays on.
  try {
    await setMySpotlightEnabled(true)
    await setSpotlightPublished(true)
  } catch {
    return { ok: false, error: 'Your Spotlight is saved, but we could not publish it. Open Settings, Profile to switch it on.' }
  }
  const handle = (await loadStoredProfile(profileId))?.handle
  revalidatePath('/free-spotlight')
  return { ok: true, liveHref: personalSpotlightHref(handle) }
}

const APPLY: Partial<Record<FeatureId, (profileId: string, draft: FeatureDraft) => Promise<ApplyResult>>> = {
  spotlight: applySpotlight,
}

export async function applyFeature(profileId: string, feature: FeatureId, draft: FeatureDraft): Promise<ApplyResult> {
  const run = APPLY[feature]
  return run ? run(profileId, draft) : { ok: false, error: 'This builder is not open yet.' }
}
