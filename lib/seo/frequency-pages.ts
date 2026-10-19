// GOOGLE'S VIEW OF THE FREQUENCY DESIGN'S CODED PAGES (ADR-1737). Under SITE_DESIGN=frequency the
// bodies of /, /the-community and /spaces are coded design pages (components/frequency/site/pages),
// while their metadata and JSON-LD were still written for the DAWN page-editor document they replaced:
// /spaces published an Article whose headline was the DAWN title, /the-community promised "four Pillars"
// the page no longer shows, and / published a WebPage headlined by the DAWN hero. This table is the
// Frequency half of each, read ONLY on the Frequency branch, so a DAWN build's output is untouched.
//
// THE RULE: every string here is what the visible Frequency page says (its h1, its lede, its breadcrumb
// labels), so the search result, the share card and the structured data describe the page a visitor
// lands on. Nothing is dated, rated, priced or counted: a landing page has none of those facts.
// Descriptions stay under the ~160 characters a search result shows (scripts/check-seo.mjs Scan E),
// titles never re-append the site name the root template adds, and no copy uses an em dash.

import type { Metadata } from 'next'
import { breadcrumbSchema, webPageSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_DESCRIPTION } from '@/lib/site'

export interface FrequencyPageSeo {
  /** Canonical path. */
  path: string
  /** The <title> (the root template appends " · Frequency"). */
  title: string
  /** The meta description, under 160 characters. */
  description: string
  /** The share-card title (OpenGraph and X). */
  shareTitle: string
  /** The visible h1, as plain text. */
  headline: string
  /** The visible lede under the h1, verbatim. The WebPage node's description. */
  lede: string
  /** The visible breadcrumb trail after Home, as the page labels it. Empty on the home page. */
  crumbs: { name: string; path: string }[]
}

export const FREQUENCY_PAGE_SEO = {
  // components/frequency/site/pages/home/frequency-home.tsx. The hero is sided (Browse / Host); the
  // first-paint side is Browse, so the page node reads that side's h1 and lede. The home <title> and
  // meta description stay app/page.tsx's (operator-editable, and SITE_DESCRIPTION is the owner-ruled
  // category line, LIVE-912), so only the JSON-LD reads this entry; title and description here are
  // what the WebPage node and the share card would say and match that route's defaults.
  home: {
    path: '/',
    // Owner ruling 2026-10-19 (SCAN-1017): the title tag carries the search words; "Community Collective"
    // stays the words under the mark (SITE_TAGLINE) and the logo lockup, not the <title>.
    title: 'Frequency · Local groups and events near you',
    description: SITE_DESCRIPTION,
    shareTitle: 'Frequency · Local groups and events near you',
    headline: 'Find local groups and events near you.',
    lede: 'A hundred contacts. No one to call on a Tuesday. Frequency is where you find the people near you, and keep finding them, around something you like doing. Free to join, and built to get you off your phone.',
    crumbs: [],
  },
  // components/frequency/site/pages/people/frequency-people.tsx ("Home / For people").
  community: {
    path: '/the-community',
    title: 'For people: find your Circle near you',
    description:
      'A hundred contacts, no one to call on a Tuesday. Find the people near you around something you like doing. Free to join, built to get you off your phone.',
    shareTitle: 'For people · Frequency',
    headline: 'A hundred contacts. No one to call on a Tuesday.',
    lede: 'Frequency is where you find the people near you, and keep finding them, around something you like doing. Free to join, and built to get you off your phone.',
    crumbs: [{ name: 'For people', path: '/the-community' }],
  },
  // components/frequency/site/pages/spaces/frequency-spaces.tsx ("Home / For spaces").
  spaces: {
    path: '/spaces',
    title: 'Spaces for businesses, studios and organizations',
    description:
      'Put your Circles, events and programs on the calendar your town reads. Frequency remembers who came and gives them a reason to come back. Free to start.',
    shareTitle: 'For spaces · Frequency',
    headline: 'You’ve built a community. Let the people looking for one find it.',
    lede: 'Every Circle, event and program you run is an experience. Frequency puts them on the calendar your town reads, remembers who came, and gives them a reason to come back.',
    crumbs: [{ name: 'For spaces', path: '/spaces' }],
  },
  // The three Frequency-only routes (DAWN answers 404 on each). /features and /vision keep the titles
  // and descriptions they shipped with; the entry adds the WebPage node their visible hero supports.
  features: {
    path: '/features',
    // Not the bare word (SCAN-678): 'Features · Frequency' names nothing a query contains.
    title: 'Features: everything it takes to gather',
    description:
      'Everything Frequency does for people and Spaces: the town calendar, Circles, Events, door check-in, programs, tickets and memberships.',
    shareTitle: 'Features · Frequency',
    headline: 'Everything it takes to gather.',
    lede: 'Every feature, for both sides of the door. Open one to see how it works.',
    crumbs: [{ name: 'Features', path: '/features' }],
  },
  // /stories has no published story yet: the page is an empty state and an invitation ("No stories
  // here yet", "Tell us your story"). The title and description say exactly that, and the WebPage
  // reads the empty state's own paragraph, so no result promises stories a visitor will not find.
  stories: {
    path: '/stories',
    title: 'Stories: tell us yours',
    description:
      'The first Frequency stories are being written now. Run a Circle or a Space? Tell us what happened, in your own words, and we may feature it.',
    shareTitle: 'Stories: tell us yours · Frequency',
    headline: 'Hosts and Spaces, in their own words.',
    lede: 'We only publish stories from real Hosts and Spaces, told in their own words, with photos from their rooms.',
    crumbs: [{ name: 'Stories', path: '/stories' }],
  },
  vision: {
    path: '/vision',
    title: 'Vision: when a community is ready, it earns a home',
    description:
      'For partners, investors, civic leaders and press: the vision for Frequency third spaces. The first is planned for 2028, and nothing is bookable yet.',
    shareTitle: 'Vision: when a community is ready, it earns a home',
    headline: 'When a community is ready, it earns a home.',
    lede: 'For partners, investors, civic leaders and press. The vision for Frequency third spaces: the first is planned to open in 2028, and nothing is bookable yet.',
    crumbs: [{ name: 'Vision', path: '/vision' }],
  },
  networks: {
    path: '/networks',
    title: 'Networks: run every chapter as one organization',
    description:
      'For organizations with chapters: one membership in every chapter, central admins, chapter leaders, one calendar and a roll-up report.',
    shareTitle: 'Frequency Networks: run every chapter as one organization',
    headline: 'Run every chapter as one organization.',
    lede: 'For organizations with chapters, circles or local teams. Each chapter runs its own day. You see the whole network.',
    crumbs: [
      { name: 'Pricing', path: '/pricing' },
      { name: 'Networks', path: '/networks' },
    ],
  },
} as const satisfies Record<string, FrequencyPageSeo>

/** The page's Metadata under Frequency: title, description, canonical, OpenGraph and X card, all from
 *  the one entry so they cannot disagree. The share image is the root card (no new OG route). */
export function frequencyPageMetadata(seo: FrequencyPageSeo): Metadata {
  return {
    // The home title is the whole brand line, so it opts out of the "%s · Frequency" template.
    title: seo.path === '/' ? { absolute: seo.title } : seo.title,
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: {
      ...OG_SITE,
      images: ROOT_OG_IMAGES,
      title: seo.shareTitle,
      description: seo.description,
      url: seo.path,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: seo.shareTitle, description: seo.description },
  }
}

/** The page's JSON-LD under Frequency: the visible breadcrumb (when the page shows one) and a WebPage
 *  node read from the visible h1 and lede. FAQPage nodes are NOT here: the bodies that show questions
 *  emit their own beside the questions, so the schema can never out-claim the page. */
export function frequencyPageJsonLd(seo: FrequencyPageSeo): Record<string, unknown>[] {
  return [
    ...(seo.crumbs.length ? [breadcrumbSchema(seo.crumbs)] : []),
    webPageSchema({ path: seo.path, name: seo.title, headline: seo.headline, description: seo.lede }),
  ]
}
