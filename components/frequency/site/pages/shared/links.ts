// Where the design's page links land in this app. The export links its own static files
// (People.html, Spaces.html, Features.html#f-zaps, Join.html, Pricing.html); these are the routes
// that serve those pages here. One table, so a route move is one edit.
//
//   People.html    -> /the-community  The people-facing marketing page. /people is the MEMBER directory
//                                     ((main)/people), so the design's "For people" page cannot take it.
//   Spaces.html    -> /spaces
//   Features.html  -> /features       (app/(marketing)/features, new with the Frequency rebuild)
//   Join.html      -> /join           (BETA_CTA_HREF: signup is one door for both readers, ADR-1197)
//   Pricing.html   -> /pricing
//   Stories.html   -> /stories         (app/(marketing)/stories, new with the Frequency rebuild)

import { BETA_CTA_HREF } from '@/lib/site'

export const SITE = {
  people: '/the-community',
  peopleNear: '/the-community#near',
  peopleFirstNight: '/the-community#first-night',
  spaces: '/spaces',
  spacesMap: '/spaces#map',
  join: BETA_CTA_HREF,
  pricing: '/pricing',
  features: '/features',
  stories: '/stories',
} as const

/** A Features anchor: `feature('f-zaps')` -> `/features#f-zaps`; `feature('people')` -> `/features#people`. */
export function feature(id: string): string {
  return `${SITE.features}#${id}`
}
