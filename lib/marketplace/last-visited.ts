// The Marketplace umbrella's last-visited memory (ADR-868). One tiny, framework-free
// vocabulary shared by the /marketplace redirect page (server, reads the cookie) and the
// CommerceLastVisited client component (writes it), so the whitelist can never drift
// between the writer and the reader.
//
// The cookie remembers WHICH of the umbrella's areas the member last browsed, so clicking
// Marketplace lands them back where they were. It is non-sensitive UI preference state:
// plain (not httpOnly — a client component writes it), SameSite=Lax, one year.
//
// 🔴 IT CARRIED TWO OF FOUR UNTIL LIVE-243, and that is worse than carrying none. The area
// nav has listed Classifieds, Housing, Market and Events since ADR-596, but this whitelist
// knew only classifieds and market, and parseCommerceSurface NARROWS an unknown value to
// 'classifieds'. So a member whose last commerce surface was Housing or Events clicked
// Marketplace and was sent somewhere they had not been, silently and by design.

export const COMMERCE_LAST_COOKIE = 'commerce_last'

export const COMMERCE_SURFACES = ['classifieds', 'housing', 'market', 'events'] as const
export type CommerceSurface = (typeof COMMERCE_SURFACES)[number]

/** Route each surface token lands on.
 *
 *  ⚠️ EVENTS LANDS ON THE COMMERCE FACE, NOT THE MEMBER INDEX (owner ruling, LIVE-243).
 *  Events is a marketplace area AND one of the four member nouns with its own rail row, so
 *  it appears twice; the tab has to read as the commerce face (paid and ticketed) rather
 *  than a second Events index. `price=paid` is a facet /events already declares
 *  (PRICE_OPTIONS in app/(main)/events/index-data.ts), so this is a filter the surface
 *  supports rather than a route invented here. */
const SURFACE_HREF: Record<CommerceSurface, string> = {
  classifieds: '/classifieds',
  housing: '/housing',
  market: '/market',
  events: '/events?price=paid',
}

/** Narrow an arbitrary cookie value to a CommerceSurface; anything unknown (or absent)
 *  reads as 'classifieds', the umbrella's default door. */
export function parseCommerceSurface(v: string | undefined | null): CommerceSurface {
  return (COMMERCE_SURFACES as readonly string[]).includes(v ?? '') ? (v as CommerceSurface) : 'classifieds'
}

export function commerceSurfaceHref(surface: CommerceSurface): string {
  return SURFACE_HREF[surface]
}

/** One year, in seconds — the cookie's max-age. */
export const COMMERCE_LAST_MAX_AGE = 60 * 60 * 24 * 365
