// Signed-in members keep the existing event page (RSVP, tickets, host tools).
// Crawlers and signed-out visitors stay on /events/<slug>, which is the ISR
// public body (SCAN-636). The URL does not change: proxy rewrites, x-pathname
// stays the share path.
//
// PURE. proxy.ts calls this after getUser(); tests drive it directly.

const RESERVED = new Set(['new', 'calendar', 'drafts', 'scan', 'claim'])

/** Internal path for the member event page, or null when this request stays put. */
export function memberEventRewrite(pathname: string, signedIn: boolean): string | null {
  if (!signedIn) return null
  const m = /^\/events\/([^/]+)$/.exec(pathname)
  if (!m) return null
  if (RESERVED.has(m[1])) return null
  return `/events/${m[1]}/full`
}
