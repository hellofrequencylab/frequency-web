import 'server-only'

// THE FEATURE BUILDER FINISH (LIVE-2481): save what a builder collected into the real feature, under the person's own
// session, through the writers each feature already has. No second writer anywhere: the personal Spotlight saves
// through savePersonalSpotlight (the one profile writer) and publishes through the Settings switches. Each feature
// lands here as its builder ships; an unwired feature answers an error, never a silent success.

import { revalidatePath } from 'next/cache'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'
import { personalSpotlightHref } from '@/lib/launch/personal'
import { loadStoredProfile, savePersonalSpotlight } from '@/lib/launch/personal-io'
import { makeSpace } from '@/lib/launch/spotlight-io'
import { getSpaceById, patchSpaceWords } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import type { FeatureId } from './catalog'
import { handleFrom, spaceTypeFrom, type FeatureDraft } from './draft'

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

const HANDLE_TRIES = 4

/** Make a Space through createSpace (every guard, including the Crew rule once the beta ends), retrying a taken handle
 *  with a short suffix. Returns the Space, or createSpace's own line. */
async function newSpace(profileId: string, input: { name: string; handle?: string; type?: string; theme?: string | null }): Promise<Space | { error: string }> {
  const base = handleFrom(input.handle ?? '', input.name)
  let last = 'We could not make your Space. Try again.'
  for (let attempt = 0; attempt < HANDLE_TRIES; attempt++) {
    const slug = attempt === 0 ? base : `${base.slice(0, 36).replace(/-+$/g, '')}-${attempt + 1}`
    const made = await makeSpace(profileId, { type: spaceTypeFrom(input.type), name: input.name, slug, ...(input.theme ? { theme: input.theme } : {}) })
    if ('error' in made) {
      last = made.error
      if (!/already taken/i.test(made.error)) return { error: made.error }
      continue
    }
    const space = await getSpaceById(made.spaceId)
    return space ?? { error: last }
  }
  return { error: last }
}

async function applySpace(profileId: string, draft: FeatureDraft): Promise<ApplyResult> {
  const space = await newSpace(profileId, { name: draft.name ?? '', handle: draft.handle, type: draft.type })
  if ('error' in space) return { ok: false, error: space.error }
  if (draft.tagline && !(await patchSpaceWords(space.id, { tagline: draft.tagline }))) {
    return { ok: false, error: 'Your Space is made, but we could not save its line. Add it from your Space settings.' }
  }
  revalidatePath(`/spaces/${space.slug}`)
  return { ok: true, liveHref: `/spaces/${space.slug}` }
}

const APPLY: Partial<Record<FeatureId, (profileId: string, draft: FeatureDraft) => Promise<ApplyResult>>> = {
  spotlight: applySpotlight,
  space: applySpace,
}

export async function applyFeature(profileId: string, feature: FeatureId, draft: FeatureDraft): Promise<ApplyResult> {
  const run = APPLY[feature]
  return run ? run(profileId, draft) : { ok: false, error: 'This builder is not open yet.' }
}
