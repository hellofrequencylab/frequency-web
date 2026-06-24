// The REQUEST-SCOPED active menu surface for the Menu Manager page (/admin/menu).
//
// The page is composed of five self-fetching layout modules (menu-surface, menu-groups,
// menu-speed, menu-layout, menu-rail-cards). Three of them are SURFACE-SCOPED: they edit one
// surface's slice (groups → categories/items, layout → columns + seed, rail-cards → rail cards).
// A nested PageModule is its own RSC and never receives the page's searchParams, so it can't read
// `?surface=` directly. This helper is the seam: the Surface picker navigates to `?surface=<key>`
// (a client router.push), the proxy stamps the query string onto the `x-search` request header
// (proxy.ts), and every surface-scoped block resolves the active surface through this ONE function.
// They therefore stay in lock-step on the same surface, exactly like /practices threads its facets
// through `x-search` to the practices-library module.
//
// Fail-safe: an unset or unknown `surface` defaults to the FIRST surface (header), so a
// block always has a surface to edit and binding these blocks on a route with no picker is harmless.

import { headers } from 'next/headers'
import { MENU_SURFACES } from './read'
import type { MenuSurfaceKey } from './types'

/** The surfaces the picker offers, in display order. The first is the default when none is set. */
const SURFACE_KEYS = MENU_SURFACES.map((s) => s.key)
const DEFAULT_SURFACE: MenuSurfaceKey = SURFACE_KEYS[0] ?? 'header'

function isSurfaceKey(v: string | null | undefined): v is MenuSurfaceKey {
  return !!v && (SURFACE_KEYS as readonly string[]).includes(v)
}

/** Resolve the active menu surface for THIS request from the `surface` query param the proxy
 *  stamps onto `x-search`. Defaults to the first surface (header) when unset or unknown. */
export async function activeMenuSurface(): Promise<MenuSurfaceKey> {
  const search = (await headers()).get('x-search') ?? ''
  const raw = new URLSearchParams(search).get('surface')
  return isSurfaceKey(raw) ? raw : DEFAULT_SURFACE
}
