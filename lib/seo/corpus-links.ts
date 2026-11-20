// The links the AI corpus (/llms-full.txt) may carry (SCAN-1276).
//
// The help center is written for members, so an article links straight to member pages: the
// Founder's First Week, the Journal, Rewards, the upgrade page, On Air. A signed-in reader taps
// through. An answer engine reading /llms-full.txt is never signed in, so each of those links
// bounced it to the sign-in form and it cited a login page as the answer. The corpus keeps the
// words and drops the link for a member-only address, and points a member index that has a public
// listing (/circles) at that listing, the address a signed-out reader actually lands on.
//
// PURE (no server imports), so the route and its probe read one list.

import { publicIndexTwin } from '@/lib/nav/public-twin'

/** First path segments a signed-out reader cannot open: proxy.ts sends them to sign-in, or the
 *  (main) layout sends them home. /events is left out on purpose (its detail pages are public). */
export const MEMBER_ONLY_CORPUS_PREFIXES: readonly string[] = [
  '/admin',
  '/channels',
  '/crew',
  '/feed',
  '/founder',
  '/groups',
  '/journal',
  '/messages',
  '/nearby',
  '/on-air',
  '/onboarding',
  '/partners',
  '/people',
  '/practices',
  '/profile',
  '/rewards',
  '/search',
  '/settings',
  '/support',
  '/upgrade',
]

/** True when a root-relative path is one a signed-out reader cannot open. */
export function isMemberOnlyPath(path: string): boolean {
  const bare = path.split(/[?#]/)[0].replace(/\/$/, '') || '/'
  return MEMBER_ONLY_CORPUS_PREFIXES.some((p) => bare === p || bare.startsWith(`${p}/`))
}

/**
 * A help body as the corpus carries it: every root-relative markdown link made absolute against
 * `siteUrl`, a member index pointed at its public listing, and a member-only link reduced to its
 * words. External links and anchors are left alone.
 */
export function publicCorpusLinks(body: string, siteUrl: string): string {
  return body.replace(/\[([^\]]*)\]\((\/(?!\/)[^)\s]*)\)/g, (_m, text: string, path: string) => {
    const bare = path.split(/[?#]/)[0]
    const twin = publicIndexTwin(bare)
    if (twin) return `[${text}](${siteUrl}${twin}${path.slice(bare.length)})`
    if (isMemberOnlyPath(path)) return text
    return `[${text}](${siteUrl}${path})`
  })
}
