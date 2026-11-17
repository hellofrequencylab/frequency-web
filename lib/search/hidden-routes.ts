import 'server-only'
import { cache } from 'react'
import { getMenu } from '@/lib/menus/read'
import type { ResolvedCategory, ResolvedItem } from '@/lib/menus/types'
import { FALLBACK_HIDDEN } from './hidden-routes-shared'

export { isHiddenRoute } from './hidden-routes-shared'

// The member routes search must not offer while the left menu hides them (SRCH-002).
//
// Hiding a route is a DB edit: its left-menu item is set to mode 'hidden' (owner ruling 2026-11-12,
// production menus live in menus/menu_items). Search used to ignore that and kept linking to
// /classifieds, /housing, /nearby, /network and /channels from its results and its "Go to" lists.
// This reads the same cached menu the shell renders, so unhiding a route in the Menu Manager puts it
// back in search with no code change.
//
// A route counts as hidden when every left-menu item for it is hidden and no role override makes it
// active. FAIL-CLOSED: when the menu cannot be read (it falls back to the code default) the list
// in hidden-routes-shared.ts stands, so a database hiccup never reopens a hidden route.
//
// /journeys is exempt by owner ruling 2026-11-17 (decision card in the search thread): public
// Journeys answer member search while the route stays out of the menu.

const SHOWN_IN_SEARCH_ANYWAY: readonly string[] = ['/journeys']

function walk(categories: ResolvedCategory[], out: ResolvedItem[]): void {
  for (const c of categories) {
    out.push(...c.items)
    walk(c.children, out)
  }
}

/** Route prefixes search leaves out for every viewer, e.g. ['/classifieds', '/housing']. */
export const hiddenRoutes = cache(async (): Promise<string[]> => {
  let menu
  try {
    menu = await getMenu('left')
  } catch {
    return [...FALLBACK_HIDDEN]
  }
  if (menu.isDefault) return [...FALLBACK_HIDDEN]
  const items: ResolvedItem[] = [...menu.rootItems]
  walk(menu.categories, items)
  const shown = new Set<string>()
  const hidden = new Set<string>()
  for (const item of items) {
    if (!item.href.startsWith('/')) continue
    const visible = item.mode !== 'hidden' || Object.values(item.roleModes ?? {}).some((m) => m !== 'hidden')
    ;(visible ? shown : hidden).add(item.href)
  }
  return [...hidden].filter((href) => !shown.has(href) && !SHOWN_IN_SEARCH_ANYWAY.includes(href))
})
