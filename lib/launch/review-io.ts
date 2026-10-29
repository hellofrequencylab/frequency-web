// REVIEW + PUBLISH, the IO half. Reads the draft the screen opens with, and writes the edited draft to the SAME records
// the launch inventory reads: the Spotlight (through publishSpotlightStep, the one path that makes and publishes it),
// spaces.tagline and spaces.about, and the step marks. Server-only. Called by the form action after it has checked the
// switch and the signed-in owner.
//
// What Publish does NOT do, on purpose: it does not flip preferences.websitePublished. The site publish seam exists
// (setWebsitePublished in the Space's layout actions) but a site with a headline and intro we have nowhere to write yet
// would go live half empty, so the website and the first email are kept as a draft under preferences.launchDraft and
// shown as such. TEMPORARY loader: lane E's buildout supplies the real BuildoutDraft; loadReviewDraft is replaced then.

import { revalidatePath } from 'next/cache'
import type { BuildoutDraft } from './buildout'
import { recordLaunchEvent } from './events'
import { loadSpotlightAnswers } from './flow-io'
import { publishSpotlightStep } from './spotlight-io'
import type { LaunchSnapshot } from './state'
import * as store from './store'
import { getSpaceById, getSpaceBySlug, patchSpacePreferences, patchSpaceWords } from '@/lib/spaces/store'

const blank = (v: unknown): string => (typeof v === 'string' ? v : '')

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** The draft the screen opens with: what the Space and its Spotlight already hold, plus any website and email draft
 *  Publish kept earlier. The cites are the person's own saved words and nothing else. Never throws: a failed read is
 *  an empty draft. */
export async function loadReviewDraft(launch: LaunchSnapshot): Promise<BuildoutDraft> {
  const empty: BuildoutDraft = {
    spotlight: { name: '', line: '', link: '' },
    space: { tagline: '', about: '' },
    website: { headline: '', intro: '' },
    email: { subject: '', body: '' },
    cites: [],
  }
  try {
    const spotlight = (await loadSpotlightAnswers(launch)) ?? empty.spotlight
    const space = launch.spaceId ? await getSpaceById(launch.spaceId) : null
    const kept = record(record(space?.preferences).launchDraft)
    const website = record(kept.website)
    const email = record(kept.email)
    const draft: BuildoutDraft = {
      spotlight,
      space: { tagline: blank(space?.tagline), about: blank(space?.about) },
      website: {
        headline: blank(website.headline),
        intro: blank(website.intro),
      },
      email: { subject: blank(email.subject), body: blank(email.body) },
      cites: [],
    }
    if (spotlight.line.trim()) {
      const origin = 'Your line for the Spotlight'
      if (draft.space.tagline)
        draft.cites.push({
          slot: 'space',
          field: 'tagline',
          snippet: spotlight.line,
          origin,
        })
      if (draft.space.about)
        draft.cites.push({
          slot: 'space',
          field: 'about',
          snippet: spotlight.line,
          origin,
        })
    }
    return draft
  } catch {
    return empty
  }
}

/** Publish the edited draft. The Spotlight first (it makes the Space when this launch has none), then the Space's
 *  words, then the website and email kept as a draft. Each step is marked only when its real record now exists.
 *  Returns the Space's handle, or the line to show. */
export async function publishReview(profileId: string, launch: LaunchSnapshot, edits: Omit<BuildoutDraft, 'cites'>): Promise<{ slug: string } | { error: string }> {
  const made = await publishSpotlightStep(profileId, launch, edits.spotlight)
  if ('error' in made) return made
  const space = await getSpaceBySlug(made.slug)
  if (!space || space.ownerProfileId !== profileId) return { error: 'We could not find your Space. Try again.' }

  // Never blank a record: an empty field leaves what is stored alone.
  const tagline = edits.space.tagline || blank(space.tagline).trim()
  const about = edits.space.about || blank(space.about).trim()
  const words: { tagline?: string; about?: string } = {}
  if (edits.space.tagline) words.tagline = edits.space.tagline
  if (edits.space.about) words.about = edits.space.about
  if (!(await patchSpaceWords(space.id, words)))
    return {
      error: 'We made your Spotlight but could not save your Space words. Try again.',
    }

  const draftKept = edits.website.headline || edits.website.intro || edits.email.subject || edits.email.body
  if (
    draftKept &&
    !(await patchSpacePreferences(space.id, {
      launchDraft: { website: edits.website, email: edits.email },
    }))
  )
    return {
      error: 'We could not keep your website and email drafts. Try again.',
    }

  revalidatePath(`/spaces/${space.slug}`)
  if (tagline && about) {
    // The Spotlight step wrote its own mark; read the launch again so this one is added to it, not over it.
    const fresh = await store.getActiveLaunch(profileId)
    if (fresh && fresh.steps.space?.status !== 'published') {
      await store.markStepPublished(fresh, 'space', space.slug)
      await recordLaunchEvent(profileId, {
        type: 'step_published',
        launchId: fresh.id,
        step: 'space',
      })
    }
  }
  return { slug: space.slug }
}
