// The Marketplace umbrella's last-visited memory (ADR-868). One tiny, framework-free
// vocabulary shared by the /marketplace redirect page (server, reads the cookie) and the
// CommerceLastVisited client component (writes it), so the whitelist can never drift
// between the writer and the reader.
//
// The cookie remembers WHICH of the umbrella's four areas (Classifieds | Housing | Market |
// Events) the member last browsed, so clicking Marketplace lands them back where they were. It
// is non-sensitive UI preference state: plain (not httpOnly — a client component writes it),
// SameSite=Lax, one year.
//
// IT REMEMBERED TWO OF THE FOUR UNTIL 2026-09-15 (LIVE-243). The area nav
// (components/marketplace/facet-nav.tsx) has carried Housing and Events since ADR-596, but this
// whitelist carried only ['classifieds','market'] and the writer was mounted only under those
// two, so a member last browsing Housing or Events had their cookie narrowed back to
// 'classifieds' by parseCommerceSurface and was returned somewhere they had not been. The nav
// and the cookie are now pinned together by lib/marketplace/last-visited.test.ts, which is what
// stops the two halves drifting again: nothing had ever measured them in the same place.
//
// The Frequency Store is deliberately NOT here. Its publication is an open ruling (LIVE-245) and
// its flag has no production reader, so the umbrella must not learn to return a member to a door
// that may be shut. Add 'store' the day that row closes, with the writer in its layout.

export const COMMERCE_LAST_COOKIE = 'commerce_last'

export const COMMERCE_SURFACES = ['classifieds', 'housing', 'market', 'events'] as const
export type CommerceSurface = (typeof COMMERCE_SURFACES)[number]

/** Route each surface token lands on.
 *
 *  Events carries its `price=paid` facet, because the umbrella's Events door is the COMMERCE
 *  FACE of Events (paid and ticketed), not the full member index — the same href the area nav
 *  points at, and what lets Events be a tab here while it also holds its own member rail row.
 *  The facet is a real one: PRICE_OPTIONS in app/(main)/events/index-data.ts. */
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
