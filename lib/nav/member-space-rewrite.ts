// Signed-in members keep the existing Space profile (follow, owner tools, private Spaces).
// Crawlers and signed-out visitors stay on /spaces/<slug>, which is the ISR
// public body (SCAN-644). The URL does not change: proxy rewrites, x-pathname
// stays the share path.
//
// PURE. proxy.ts calls this after getUser(); tests drive it directly.

const RESERVED = new Set(['new', 'directory', 'operating', 'invite', 'claim', 'full'])

/** Internal path for the member Space page, or null when this request stays put. */
export function memberSpaceRewrite(pathname: string, signedIn: boolean): string | null {
  if (!signedIn) return null
  const home = /^\/spaces\/([^/]+)$/.exec(pathname)
  if (home) {
    if (RESERVED.has(home[1])) return null
    return `/spaces/${home[1]}/full`
  }
  const show = /^\/spaces\/([^/]+)\/podcasts\/([^/]+)$/.exec(pathname)
  if (show) {
    if (RESERVED.has(show[1])) return null
    return `/spaces/${show[1]}/full/podcasts/${show[2]}`
  }
  return null
}
