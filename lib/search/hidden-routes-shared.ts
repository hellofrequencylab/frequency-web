// Client-safe half of lib/search/hidden-routes.ts (SRCH-002): the prefix test and the fail-closed list,
// so the live search overlay can filter its client-side "Go to" list before the first response lands.

/** The routes the left menu hid on 2026-11-17. The server reader falls back to this when the menu
 *  cannot be read; the overlay starts from it until /api/search returns the live list. */
export const FALLBACK_HIDDEN: readonly string[] = ['/classifieds', '/housing', '/nearby', '/network', '/channels']

/** True when `href` is a hidden route or a page beneath one ('/classifieds/new' under '/classifieds'). */
export function isHiddenRoute(href: string, hidden: readonly string[]): boolean {
  const path = href.split(/[?#]/)[0]
  return hidden.some((h) => path === h || path.startsWith(`${h}/`))
}
