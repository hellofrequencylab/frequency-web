// The Marketplace umbrella's last-visited memory (ADR-868). One tiny, framework-free
// vocabulary shared by the /marketplace redirect page (server, reads the cookie) and the
// CommerceLastVisited client component (writes it), so the whitelist can never drift
// between the writer and the reader.
//
// The cookie remembers WHICH of the two umbrella surfaces (Classifieds | Market) the
// member last browsed, so clicking Marketplace lands them back where they were. It is
// non-sensitive UI preference state: plain (not httpOnly — a client component writes it),
// SameSite=Lax, one year.

export const COMMERCE_LAST_COOKIE = 'commerce_last'

export const COMMERCE_SURFACES = ['classifieds', 'market'] as const
export type CommerceSurface = (typeof COMMERCE_SURFACES)[number]

/** Route each surface token lands on. */
const SURFACE_HREF: Record<CommerceSurface, string> = {
  classifieds: '/classifieds',
  market: '/market',
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
