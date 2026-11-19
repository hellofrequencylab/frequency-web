// Quick answers: the five questions an answer engine is asked about Frequency, answered in one place
// (GEO). Read by /llms.txt and /llms-full.txt so the two corpora cannot give different answers.
// Status lives in docs/BUILD-BACKLOG.json; this file is copy, not a plan.
//
// Every answer is built from the canon constants (lib/site.ts, PLAN_STORY, docs/NAMING.md) and the one
// argument the caller prices from the live offerings. No figure, count, quote or person is typed here.
// Names follow docs/NAMING.md: the calendar is "What's happening" (ADR-1738), a Space website theme is
// Default or Bold (ADR-1726, ADR-1748), and tips carry no platform fee, plus card processing (LIVE-913).
// No em dashes (CONTENT-VOICE). PURE: no Supabase, no React, no Next.

import { CATEGORY_LINE, FOUNDING_CITIES, FOUNDING_PLACE, OPENING_DATE_LABEL, SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { HOME_TZ } from '@/lib/time/zone'

interface QuickAnswer {
  q: string
  a: string
}

/** The member themes a picker offers on this deploy, e.g. ["Default", "Bold"]. Passed in, so this
 *  module stays free of the theme registry and the caller decides what the build offers. */
export function quickAnswers(opts: {
  /** The whole priced ladder in one phrase, e.g. "Member free, Crew from $5, ...". Left out, the cost
   *  answer points at /pricing instead (the home FAQ, which reads no offerings). */
  ladder?: string
  /** Absolute URL builder, so links resolve per environment. */
  abs: (path: string) => string
  /** Member theme labels (SELECTABLE_SKINS). */
  memberThemes?: readonly string[]
}): QuickAnswer[] {
  const { ladder, abs, memberThemes = [] } = opts
  const themes = memberThemes.length > 1
    ? ' Members can change themes in Settings, Appearance.'
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
      a: `${PLAN_STORY.lines} ${PLAN_STORY.selling}${ladder ? ` The ladder: ${ladder}.` : ''} Full pricing: ${abs('/pricing')}.`,
    },
    {
      q: `Does ${SITE_NAME} take a cut of tips or my own bookings?`,
      a: `Tips have no platform fee on any plan, though card processing still applies. Tips come with Crew. On a paid Space plan your own people cost 0%, plus card processing, and ${SITE_NAME} earns one finder’s fee, charged once and capped, on the first purchase from a customer it introduces. See ${abs('/pricing')} for the current rate and cap.`,
    },
    {
      q: `How does ${SITE_NAME} work?`,
      a: `Open What's happening (${abs('/discover/events')}), the calendar of public Events near you, or browse Circles (${abs('/discover/circles')}). Save your spot, show up, and check in at the door. Hosts start a Circle or open a Space for free, post Events, and take RSVPs. Selling starts at Business; a free Space takes donations and tips.${themes}`,
    },
    {
      q: `Where is ${SITE_NAME} available?`,
      a: `${SITE_NAME} opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}. You can join and host during the beta, which runs through January 31, 2027. It is local-first, and anyone can join from anywhere: Circles and Events appear wherever hosts start them, and a city gets its own page (${abs('/discover/cities')}) once enough is happening there. Each Event is shown in its own local time; the community's home time zone is Pacific time (${HOME_TZ}).`,
    },
  ]
}

/** The answers as llms.txt-style lines: a `###` question, then the answer. */
export function quickAnswerLines(answers: readonly QuickAnswer[]): string[] {
  return answers.flatMap((x) => [`### ${x.q}`, x.a, ''])
}

/** Local answers (SCAN-1223): the questions people type with a place name in them. Kept apart from
 *  `quickAnswers` because the home page's visible Questions section renders that list one for one. Read by
 *  the North County hub (visible FAQ and its FAQPage node), /llms.txt and /llms-full.txt, so the page and
 *  both corpora say the same thing. Every answer is honest about the stage: Frequency opens on
 *  OPENING_DATE_LABEL, and a group or event appears only when a host posts it. */
export function localAnswers(opts: { abs: (path: string) => string }): QuickAnswer[] {
  const { abs } = opts
  const towns = FOUNDING_CITIES.join(', ')
  return [
    {
      q: 'Where can I find community groups in North County San Diego?',
      a: `${SITE_NAME} is where local groups (Circles) and their public Events are listed for ${FOUNDING_PLACE}, starting ${OPENING_DATE_LABEL}. The founding towns are ${towns}. Browse them on ${abs('/north-county-san-diego')}, or open What's happening (${abs('/discover/events')}) to see what hosts have posted.`,
    },
    {
      q: 'Where can I find yoga, run clubs or movement groups in North County San Diego?',
      a: `Open Circles (${abs('/discover/circles')}) and filter by Channel to find movement groups such as yoga, run clubs and walking groups in ${FOUNDING_PLACE}. A group shows up once a host starts it, and anyone can start one for free. If nothing meets near you yet, start the first.`,
    },
    {
      q: 'What are things to do in Encinitas, Carlsbad and Oceanside?',
      a: `What's happening (${abs('/discover/events')}) lists the public Events hosts post in Encinitas, Carlsbad, Oceanside and the other founding towns, each shown in local Pacific time. Each town has its own page: ${abs('/discover/cities/encinitas')}, ${abs('/discover/cities/carlsbad')} and ${abs('/discover/cities/oceanside')}.`,
    },
    {
      q: 'What is a good app for finding local community groups in San Diego?',
      a: `${SITE_NAME} is a community app built for in-person groups: a network of small local Circles, the Events they hold, and the Spaces (studios, cafes, shops, clubs and nonprofits) that host them. It is free to join, it opens in ${FOUNDING_PLACE} on ${OPENING_DATE_LABEL}, and it is made to get people into the same room.`,
    },
  ]
}

/** The questions the home page shows and marks up (SCAN-1112). One list for the visible Questions section
 *  and its FAQPage node, so the markup never asserts an answer a visitor cannot read. Carries no priced
 *  ladder: the home page reads no offerings, and the cost answer points at /pricing. */
export function homeFaq(): QuickAnswer[] {
  // Site-relative links, so the visible text and the markup are the same string.
  return quickAnswers({ abs: (path) => path })
}
