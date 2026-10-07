import { cache } from 'react'

// A SPOTLIGHT SERVED ON A WEBSITE HOST (LIVE-855): `<slug>.frequencylocal.com/spotlight` (paid plans) and
// `spotlight.<domain>` (a Space with its own domain). A website stands alone (owner ruling 2026-10-07): a
// visitor there is never sent into Frequency except by a link clearly labeled as Frequency's. So a Link card
// on a website host books and takes messages on the site's own Book and Contact pages, and a card the site
// cannot serve (a product, a Journey, an event, a membership) is an absolute Frequency link marked "on
// Frequency". The hosted route sets this once per request; the Link cards block reads it. Off a website host
// it is null and every card keeps its app path.
//
// REQUEST-SAFE the way lib/spaces/active-space.ts is: one holder per request through React's cache().

export interface SpotlightSiteLinks {
  /** Frequency's origin, for the cards the site cannot serve. */
  appOrigin: string
  /** The site's Book page, when it serves one. */
  book: string | null
  /** The site's Contact page, when it serves one. */
  contact: string | null
}

const holder = cache((): { links: SpotlightSiteLinks | null } => ({ links: null }))

/** Stamp this request's website links (the hosted Spotlight route, once). */
export function setSpotlightSiteLinks(links: SpotlightSiteLinks | null): void {
  holder().links = links
}

/** This request's website links, or null off a website host. */
export function spotlightSiteLinks(): SpotlightSiteLinks | null {
  return holder().links
}

/** Where a Link card goes on a website host, and whether it leaves for Frequency (shown on the card).
 *  PURE: `href` is the card's app path from listLinkCards. */
export function siteCardHref(
  id: string,
  href: string,
  site: SpotlightSiteLinks | null,
): { href: string; onFrequency: boolean } {
  if (!site) return { href, onFrequency: false }
  if (id === 'book' && site.book) return { href: site.book, onFrequency: false }
  if (id === 'contact' && site.contact) return { href: site.contact, onFrequency: false }
  return { href: /^https?:\/\//.test(href) ? href : `${site.appOrigin}${href}`, onFrequency: true }
}
