import 'server-only'

// THE FEATURE BUILDER FINISH (LIVE-2481): save what a builder collected into the real feature, under the person's own
// session, through the writers each feature already has. No second writer anywhere: the personal Spotlight saves
// through savePersonalSpotlight (the one profile writer) and publishes through the Settings switches. Each feature
// lands here as its builder ships; an unwired feature answers an error, never a silent success.

import { revalidatePath } from 'next/cache'
import { setMySpotlightEnabled, setSpotlightPublished } from '@/app/(main)/settings/profile/actions'
import { personalSpotlightHref } from '@/lib/launch/personal'
import { loadStoredProfile, savePersonalSpotlight } from '@/lib/launch/personal-io'
import { publishWebsiteWords } from '@/lib/launch/handoff-io'
import { listOwnedSpaces } from '@/lib/launch/spaces-io'
import { makeSpace } from '@/lib/launch/spotlight-io'
import { starterRows } from '@/lib/entity-blocks/layout'
import { siteSubdomainHost } from '@/lib/sites/host'
import { createSpaceEmailDraft, saveSpaceEmailDraft } from '@/lib/spaces/email-drafts'
import { publishStarterSite } from '@/lib/spaces/starter-site'
import { getSpaceById, patchSpaceWords } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import type { FeatureId } from './catalog'
import { handleFrom, spaceTypeFrom, websiteKitFrom, type FeatureDraft } from './draft'

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

/** The Space a website or an email goes on: the person's newest Space, or a new one named for it (with the look,
 *  when the builder picked one). A website and an email list only exist on a Space, so one is made when there is none. */
async function spaceFor(profileId: string, name: string, theme?: string): Promise<{ space: Space; made: boolean } | { error: string }> {
  const newest = (await listOwnedSpaces(profileId)).at(-1)
  const owned = newest ? await getSpaceById(newest.id) : null
  if (owned) return { space: owned, made: false }
  const made = await newSpace(profileId, { name, theme })
  return 'error' in made ? made : { space: made, made: true }
}

async function applyWebsite(profileId: string, draft: FeatureDraft): Promise<ApplyResult> {
  const kit = websiteKitFrom(draft.kit)
  const found = await spaceFor(profileId, draft.name ?? '', kit)
  if ('error' in found) return { ok: false, error: found.error }
  let space = found.space
  // A new Space was born in the picked look with its starter website (createSpace). An existing one takes the look
  // through the one theme apply, and gets the starter website only when it has none (publishStarterSite never
  // replaces a website: it writes against revision 0).
  if (!found.made) {
    const { applyMegaTheme } = await import('@/lib/theme/apply-mega-theme')
    const themed = await applyMegaTheme(space.id, kit)
    if (!themed.ok) return { ok: false, error: themed.error }
    await publishStarterSite(space.id, kit)
    space = (await getSpaceById(space.id)) ?? space
  }
  const words = await publishWebsiteWords(space, { headline: draft.headline ?? '', intro: draft.about ?? '' })
  if ('error' in words) return { ok: false, error: words.error }
  revalidatePath(`/spaces/${space.slug}`)
  const host = siteSubdomainHost(space.slug)
  return { ok: true, liveHref: host ? `https://${host}` : `/sites/${space.slug}` }
}

async function applyEmail(profileId: string, draft: FeatureDraft): Promise<ApplyResult> {
  const found = await spaceFor(profileId, draft.from ?? '')
  if ('error' in found) return { ok: false, error: found.error }
  const { space } = found
  const subject = draft.subject ?? ''
  // A DRAFT, never a send: the owner opens it in Marketing, checks it and sends it to their list themselves.
  const made = await createSpaceEmailDraft(space.id)
  if ('error' in made) return { ok: false, error: 'We could not save your email. Try again.' }
  const saved = await saveSpaceEmailDraft(space.id, made.data.id, {
    subject,
    layout: { rows: starterRows('email', 'minimal'), content: { heading: { text: subject }, text: { text: draft.body ?? '' } } },
  })
  if (saved.error) return { ok: false, error: 'We could not save your email. Try again.' }
  revalidatePath(`/spaces/${space.slug}/marketing`)
  return { ok: true, liveHref: `/spaces/${space.slug}/marketing` }
}

const APPLY: Partial<Record<FeatureId, (profileId: string, draft: FeatureDraft) => Promise<ApplyResult>>> = {
  spotlight: applySpotlight,
  space: applySpace,
  website: applyWebsite,
  email: applyEmail,
}

export async function applyFeature(profileId: string, feature: FeatureId, draft: FeatureDraft): Promise<ApplyResult> {
  const run = APPLY[feature]
  return run ? run(profileId, draft) : { ok: false, error: 'This builder is not open yet.' }
}
