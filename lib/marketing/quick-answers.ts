// Quick answers: the five questions an answer engine is asked about Frequency, answered in one place
// (GEO). Read by /llms.txt and /llms-full.txt so the two corpora cannot give different answers.
// Status lives in docs/BUILD-BACKLOG.json; this file is copy, not a plan.
//
// Every answer is built from the canon constants (lib/site.ts, PLAN_STORY, docs/NAMING.md) and the one
// argument the caller prices from the live offerings. No figure, count, quote or person is typed here.
// Names follow docs/NAMING.md: the calendar is "What's happening" (ADR-1738), a Space website theme is
// Default or Bold (ADR-1726, ADR-1748), and tips carry no platform fee, plus card processing (LIVE-913).
// No em dashes (CONTENT-VOICE). PURE: no Supabase, no React, no Next.

import { CATEGORY_LINE, FOUNDING_PLACE, SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { HOME_TZ } from '@/lib/time/zone'

interface QuickAnswer {
  q: string
  a: string
}

/** The member themes a picker offers on this deploy, e.g. ["Default", "Midnight"]. Passed in, so this
 *  module stays free of the theme registry and the caller decides what the build offers. */
export function quickAnswers(opts: {
  /** The whole priced ladder in one phrase, e.g. "Member free, Crew from $5, ...". */
  ladder: string
  /** Absolute URL builder, so links resolve per environment. */
  abs: (path: string) => string
  /** Member theme labels (SELECTABLE_SKINS). */
  memberThemes?: readonly string[]
}): QuickAnswer[] {
  const { ladder, abs, memberThemes = [] } = opts
  const themes = memberThemes.length > 1
    ? ` The app's look is the ${memberThemes[0]} theme; members can switch to ${memberThemes.slice(1).join(' or ')} in Settings, Appearance.`
    : ''
  return [
    {
      q: `What is ${SITE_NAME}?`,
      a: `${CATEGORY_LINE} ${SITE_NAME} is a ${SITE_TAGLINE}: a network of small local groups (Circles), the Events near you, and the Spaces (businesses and organizations) that host them. It is built to get people off their phones and into the same room, again.`,
    },
    {
      q: `Who is ${SITE_NAME} for?`,
      a: 'Two sides of one network. People looking for local groups and events near them, who want to find familiar faces they can keep coming back to. And the hosts and places that bring people together: studios, cafes, gyms, shops, clubs and nonprofits.',
    },
    {
      q: `How much does ${SITE_NAME} cost?`,
      a: `${PLAN_STORY.lines} ${PLAN_STORY.selling} The ladder: ${ladder}. Full pricing: ${abs('/pricing')}.`,
    },
    {
      q: `Does ${SITE_NAME} take a cut of tips or my own bookings?`,
      a: `No. Tips carry no platform fee on any plan, plus card processing, and you keep 100% of the bookings you bring in yourself, ${PLAN_STORY.afterProcessing}. ${PLAN_STORY.rate}`,
    },
    {
      q: `How does ${SITE_NAME} work?`,
      a: `Open What's happening (${abs('/discover/events')}), the calendar of public Events near you, or browse Circles (${abs('/discover/circles')}). Save your spot, show up, and check in at the door. Hosts start a Circle or open a Space for free, post Events, and take RSVPs and tips; paid tickets and memberships open at Business.${themes}`,
    },
    {
      q: `Where is ${SITE_NAME} available?`,
      a: `${SITE_NAME} is local-first and taking root in ${FOUNDING_PLACE}. Anyone can join from anywhere: Circles and Events appear wherever hosts start them, and a city gets its own page (${abs('/discover/cities')}) once enough is happening there. Each Event is shown in its own local time; the community's home time zone is Pacific time (${HOME_TZ}).`,
    },
  ]
}

/** The answers as llms.txt-style lines: a `###` question, then the answer. */
export function quickAnswerLines(answers: readonly QuickAnswer[]): string[] {
  return answers.flatMap((x) => [`### ${x.q}`, x.a, ''])
}
