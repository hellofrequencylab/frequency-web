// REVIEW + PUBLISH, the IO half. Reads the draft the screen opens with, and writes the edited draft to the SAME records
// the launch inventory reads: the Spotlight (through publishSpotlightStep, the one path that makes and publishes it),
// spaces.tagline and spaces.about, the website (headline and intro, switched on) and the first email (a Space email
// draft, never sent), and the step marks. Server-only. Called by the form action after it has checked the
// switch and the signed-in owner.
//
// The draft the screen opens with is the one Vera built from the person's own words and saved on the launch
// (lib/launch/buildout-io.ts), built on first open. A field she could not quote is empty for them to fill in.

import { revalidatePath } from 'next/cache'
import type { BuildoutDraft } from './buildout'
import { buildLaunchDraft } from './buildout-io'
import type { LaunchCarry } from './carry'
import { recordLaunchEvent } from './events'
import { loadSpotlightAnswers } from './flow-io'
import { publishSpotlightStep } from './spotlight-io'
import type { LaunchSnapshot } from './state'
import * as store from './store'
import { readLaunchDraft } from '@/lib/spaces/launch-draft'
import { handOffFirstEmail, publishWebsiteWords } from './handoff-io'
import { getSpaceBySlug, patchSpacePreferences, patchSpaceWords } from '@/lib/spaces/store'

const blank = (v: unknown): string => (typeof v === 'string' ? v : '')

const emptyDraft = (spotlight: BuildoutDraft['spotlight']): BuildoutDraft => ({
  spotlight,
  space: { tagline: '', about: '' },
  website: { headline: '', intro: '' },
  email: { subject: '', body: '' },
  cites: [],
})

/** The draft the screen opens with: the one saved on this launch, built from the person's own words the first time they
 *  open the screen. Before there is a Space to read, only the Spotlight answers they already gave. Never throws: a failed
 *  read is an empty draft. */
export async function loadReviewDraft(profileId: string, launch: LaunchSnapshot): Promise<BuildoutDraft> {
  try {
    const stored = (await store.getBuildout(launch)) ?? (await buildLaunchDraft(profileId, launch))
    if (stored) return stored.draft
    const spotlight = (await loadSpotlightAnswers(launch)) ?? { name: '', line: '', link: '' }
    return emptyDraft(spotlight)
  } catch {
    return emptyDraft({ name: '', line: '', link: '' })
  }
}

/** Publish the edited draft. The Spotlight first (it makes the Space when this launch has none, with the handle, Theme
 *  Kit and accent the visitor chose on /create-a-space: `carry`, the same hold the Spotlight step reads), then the
 *  Space's words, then the website and email kept as a draft. Each step is marked only when its real record now
 *  exists. Returns the Space's handle, or the line to show. */
export async function publishReview(profileId: string, launch: LaunchSnapshot, edits: Omit<BuildoutDraft, 'cites'>, carry: LaunchCarry = {}): Promise<{ slug: string } | { error: string }> {
  const made = await publishSpotlightStep(profileId, launch, edits.spotlight, carry)
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

  // The website goes live with the person's headline and intro (only when they wrote some). It goes first: switching it on
  // rewrites the preferences blob from its own read, so the key-scoped writes below land after it.
  const site = await publishWebsiteWords(space, edits.website)
  if ('error' in site) return site

  // Keep what they wrote beside the hand-off, so a failure in it never loses their words.
  const kept = readLaunchDraft(space.preferences)
  if (
    (edits.website.headline || edits.website.intro || edits.email.subject || edits.email.body) &&
    !(await patchSpacePreferences(space.id, { launchDraft: { website: edits.website, email: edits.email, emailCampaignId: kept.emailCampaignId } }))
  )
    return { error: 'We could not keep your website and email drafts. Try again.' }

  // The first email is handed to the Space's email drafts and is never sent from here: the owner reads it and sends it
  // themselves from Marketing.
  const email = await handOffFirstEmail(space, edits.email)
  if ('error' in email) return email
  if (email.id && email.id !== kept.emailCampaignId) {
    await patchSpacePreferences(space.id, { launchDraft: { website: edits.website, email: edits.email, emailCampaignId: email.id } })
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
  if (site.live) {
    const fresh = await store.getActiveLaunch(profileId)
    if (fresh && fresh.steps.website?.status !== 'published') {
      await store.markStepPublished(fresh, 'website', space.slug)
      await recordLaunchEvent(profileId, { type: 'step_published', launchId: fresh.id, step: 'website' })
    }
  }
  return { slug: space.slug }
}
