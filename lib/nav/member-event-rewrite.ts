// Signed-in members keep the existing event page (RSVP, tickets, host tools).
// Crawlers and signed-out visitors stay on /events/<slug>, which is the ISR
// public body (SCAN-636). The URL does not change: proxy rewrites, x-pathname
// stays the share path.
//
// SCAN-799. A claim-link visit (/events/<slug>?claim=<token>, where the outreach
// message sends an organizer) also reaches the member page when SIGNED OUT: the
// "Claim This Event" banner and its /join funnel live only there, and the ISR
// public body never reads ?claim. The member page checks the token against the
// row before it shows anything, and x-pathname stays the share path, so the
// (main) layout still renders a signed-out visitor in public chrome. Every other
// anonymous request keeps the cookie-free ISR body.
//
// PURE. proxy.ts calls this after getUser(); tests drive it directly.

const RESERVED = new Set(['new', 'calendar', 'drafts', 'scan', 'claim'])

/**
 * Internal path for the member event page, or null when this request stays put.
 * `hasClaim` is whether the request carries a `?claim=` query (the organizer claim link).
 */
export function memberEventRewrite(
  pathname: string,
  signedIn: boolean,
  hasClaim: boolean = false,
): string | null {
  if (!signedIn && !hasClaim) return null
  const m = /^\/events\/([^/]+)$/.exec(pathname)
  if (!m) return null
  if (RESERVED.has(m[1])) return null
  return `/events/${m[1]}/full`
}
