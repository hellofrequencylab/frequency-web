// THE HAND-OFF (SCAN-1219), the IO half of Review + Publish for the two things that are not the Space's own words: the
// website and the first email. Server-only, called by publishReview after the owner pressed Publish.
//
// The website: the person's headline and intro go to the site hero seam (preferences.siteHero, the words the website
// leads with) and the website is switched on through setWebsitePublished, the one publish path (it also attaches the free
// subdomain and clears the site cache). It is switched on only when the person has words for it, never an empty site.
//
// The first email: handed to the Space's email drafts as a DRAFT. It is never sent from here. The owner opens it in
// Marketing, checks it, and sends it to their list themselves. A second Publish does not make a second draft.

import { setWebsitePublished } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import { starterRows } from '@/lib/entity-blocks/layout'
import { createSpaceEmailDraft, saveSpaceEmailDraft } from '@/lib/spaces/email-drafts'
import { readLaunchDraft } from '@/lib/spaces/launch-draft'
import { patchSpacePreferences } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import { MAX_SITE_HERO_HEADING, MAX_SITE_HERO_TAGLINE, readSiteHero, readWebsitePublished } from '@/lib/spaces/website'
import type { BuildoutDraft } from './buildout'

/** Put the headline and intro on the website and switch it on. `live` is true only when this call turned it on. */
export async function publishWebsiteWords(space: Space, website: BuildoutDraft['website']): Promise<{ live: boolean } | { error: string }> {
  const headline = website.headline.trim()
  const intro = website.intro.trim()
  if (!headline && !intro) return { live: false }
  const was = readWebsitePublished(space.preferences)
  // Switch on first: it rewrites the blob from its own read, so the key-scoped words are written after it.
  if (!was) {
    const res = await setWebsitePublished(space.slug, true)
    if ('error' in res) return { error: 'We could not put your website live. Try again.' }
  }
  const hero = { ...readSiteHero(space.preferences) }
  if (headline) hero.heading = headline.slice(0, MAX_SITE_HERO_HEADING)
  if (intro) hero.tagline = intro.slice(0, MAX_SITE_HERO_TAGLINE)
  if (!(await patchSpacePreferences(space.id, { siteHero: hero }))) return { error: 'Your website is live but we could not save its words. Try again.' }
  return { live: !was }
}

/** Hand the first email to the Space's email drafts. Returns the draft's id, '' when there was no email to hand over, or the
 *  line to show. A draft made on an earlier Publish stays as it is, now the owner's to edit in Marketing. */
export async function handOffFirstEmail(space: Space, email: BuildoutDraft['email']): Promise<{ id: string } | { error: string }> {
  const subject = email.subject.trim()
  const body = email.body.trim()
  if (!subject && !body) return { id: '' }
  const kept = readLaunchDraft(space.preferences).emailCampaignId
  if (kept) return { id: kept }
  const made = await createSpaceEmailDraft(space.id)
  if ('error' in made) return { error: 'We could not set your first email aside as a draft. Try again.' }
  const saved = await saveSpaceEmailDraft(space.id, made.data.id, {
    subject,
    layout: { rows: starterRows('email', 'minimal'), content: { heading: { text: subject }, text: { text: body } } },
  })
  if (saved.error) return { error: 'We could not set your first email aside as a draft. Try again.' }
  return { id: made.data.id }
}
