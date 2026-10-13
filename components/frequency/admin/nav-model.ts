// THE FREQUENCY ADMIN SHELL'S NAV MODEL (design_handoff/frequency/templates/admin/shell.js). Pure data and
// one pure resolver, shared by the server builders (which turn the registered menu catalogs into these rows)
// and the client nav (which marks the active row from the URL). No row is typed here: every item a shell
// renders is projected from a registered catalog or a route-local hub registry by its builder
// (docs/MENU-CONTRACT.md), so this file only describes the shape.

import type { FqIconName } from '@/components/frequency/icon'

/** One link in the sidebar. `badge` is a live count (the Moderation queue); omitted or 0 shows nothing. */
export interface AdminNavLeaf {
  key: string
  label: string
  href: string
  badge?: number
  /** A door that leaves the app router (a route handler that redirects to another host): a plain anchor. */
  external?: boolean
}

/** A top-level sidebar row. `children` render beneath it while it is active (an admin world's pages);
 *  `match` lists extra paths that also belong to it (a Space settings page under its hub tab). */
export interface AdminNavItem extends AdminNavLeaf {
  icon: FqIconName
  children?: AdminNavLeaf[]
  match?: string[]
}

/** How well one href describes the current location: -1 for no match, else longer paths and more
 *  matching query keys score higher. A query in the href must match the URL exactly; a path matches
 *  itself and anything beneath it. PURE. */
export function hrefScore(href: string, pathname: string, search: URLSearchParams): number {
  const [rawPath, query = ''] = href.split('#')[0].split('?')
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
  if (!(pathname === path || pathname.startsWith(`${path}/`))) return -1
  const wanted = new URLSearchParams(query)
  let keys = 0
  for (const [key, value] of wanted) {
    if (search.get(key) !== value) return -1
    keys++
  }
  return path.length * 10 + keys
}

function bestScore(hrefs: string[], pathname: string, search: URLSearchParams): number {
  return hrefs.reduce((best, href) => Math.max(best, hrefScore(href, pathname, search)), -1)
}

/** The active top-level row and the active child inside it, by the best-scoring href. PURE. */
export function activeNav(
  items: AdminNavItem[],
  pathname: string,
  search: URLSearchParams,
): { item: AdminNavItem | null; leaf: AdminNavLeaf | null } {
  let item: AdminNavItem | null = null
  let top = -1
  for (const candidate of items) {
    const score = bestScore([candidate.href, ...(candidate.children ?? []).map((c) => c.href), ...(candidate.match ?? [])], pathname, search)
    if (score > top) { top = score; item = candidate }
  }
  if (!item) return { item: null, leaf: null }
  let leaf: AdminNavLeaf | null = null
  let leafTop = -1
  for (const child of item.children ?? []) {
    const score = hrefScore(child.href, pathname, search)
    if (score > leafTop) { leafTop = score; leaf = child }
  }
  return { item, leaf }
}

/** A top-level row's badge: its own, else the sum of its children's (so a folded world still shows the
 *  Moderation count). PURE. */
export function itemBadge(item: AdminNavItem): number {
  if (item.badge) return item.badge
  return (item.children ?? []).reduce((sum, child) => sum + (child.badge ?? 0), 0)
}
