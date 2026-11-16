// The North County San Diego hub (SCAN-1209): the always-indexable page for the founding towns. The
// per-town /discover/cities/<slug> pages stay noindex until a town clears the local index floor
// (lib/seo/index-floor.ts), which on opening day is none of them. This hub is editorial, so it carries
// the local-search page from day one, and the sitemap lists it regardless of density.
//
// Status lives in docs/BUILD-BACKLOG.json; this file is copy, not a plan. The towns are
// FOUNDING_CITIES (lib/site.ts), so a town added there appears here, in the Organization schema and in
// llms.txt with no second edit. No figure, member count or named group is typed here: a town's blurb
// says where it is, never what already exists.
// Voice: docs/marketing/voice-and-language-guide.md. No em dashes, no health claims. PURE: no
// Supabase, no React, no Next.

import { FOUNDING_CITIES, FOUNDING_PLACE, OPENING_DATE_LABEL } from '@/lib/site'
import { localAnswers } from '@/lib/marketing/quick-answers'

export const NORTH_COUNTY_PATH = '/north-county-san-diego'

export interface NorthCountyTown {
  name: string
  /** The same form as citySlug() in app/discover/events/_data.ts: lowercase, spaces to hyphens. */
  slug: string
  /** Where it is, in one plain line. */
  blurb: string
}

// Only geography a reader can verify. Cardiff and Leucadia are neighborhoods of Encinitas that people
// search by name.
const BLURBS: Record<(typeof FOUNDING_CITIES)[number], string> = {
  Oceanside: 'The northernmost coastal city of the region, with a harbor, a pier and a long beachfront.',
  Carlsbad: 'A coastal city with a walkable village and beaches, between Oceanside and Encinitas.',
  Encinitas: 'A coastal city made of several neighborhoods, including Cardiff and Leucadia, each with its own main street.',
  Cardiff: 'The Encinitas neighborhood known as Cardiff-by-the-Sea, on the coast just south of downtown Encinitas.',
  Leucadia: 'The Encinitas neighborhood of Leucadia, on the coast north of downtown Encinitas.',
  'Solana Beach': 'A small coastal city south of Encinitas, with beaches and a compact town center.',
  'Del Mar': 'A small coastal city at the south end of North County, by the water and the fairgrounds.',
  Vista: 'An inland city a few miles from the coast, east of Oceanside.',
  'San Marcos': 'An inland city in the middle of North County, home to a university campus.',
  Escondido: 'The largest inland city of the region, with its own downtown.',
}

export const NORTH_COUNTY_TOWNS: NorthCountyTown[] = FOUNDING_CITIES.map((name) => ({
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  blurb: BLURBS[name],
}))

/** The page's questions: the shared local answers (also in llms.txt and llms-full.txt) plus two the hub
 *  alone answers. One list for the visible Questions section and the FAQPage node. Site-relative links,
 *  so the visible text and the markup are the same string. */
export function northCountyFaq(): { q: string; a: string }[] {
  return [
    ...localAnswers({ abs: (path) => path }),
    {
      q: 'Which towns does Frequency cover in North County San Diego?',
      a: `The founding towns are ${FOUNDING_CITIES.join(', ')}. Cardiff and Leucadia are neighborhoods of Encinitas. Anyone can join from anywhere, and a Circle or Event appears in whichever town its host picks.`,
    },
    {
      q: 'How do I start a community group in my town?',
      a: `Join free, then start a Circle: a small group that meets on a standing day. Hosting is free. Post an Event when you are ready, and neighbors can find it in What's happening (/discover/events).`,
    },
  ]
}

export const NORTH_COUNTY_TITLE = 'Community groups and local events in North County San Diego'

export const NORTH_COUNTY_DESCRIPTION =
  'Find local community groups and things to do in Encinitas, Carlsbad, Oceanside, Vista, San Marcos, Escondido and the coastal towns between. Free to join.'

export const NORTH_COUNTY_LEDE = `Small groups that meet in person, and the public Events they hold, across ${FOUNDING_PLACE}. Frequency opens on ${OPENING_DATE_LABEL}. Pick your town, join free, and start the group you wish already existed.`
