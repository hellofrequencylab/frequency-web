// Server reads for the DB-backed menu system. Mirrors lib/menu-config.ts (retired): the new
// tables are not in the generated types yet (regenerate lib/database.types.ts after
// the 20260721000000_menu_system migration is applied, ADR-246 pattern), so we cast
// the base client to an untyped shape to query them.
//
// Reads are BEST-EFFORT: nav must ALWAYS render. On any query error, a missing menu
// row, or a missing table (pre-migration), we log and fall back to the code defaults
// (lib/menus/defaults.ts) instead of throwing. The reader returns EVERYTHING
// (including hidden items), the renderer does the per-role / per-mode filtering.

import { cache } from 'react'
import { menuDb } from './db'
import { briefError } from '@/lib/log'
import { CHROME_CACHE_TAGS, crossRequestCached } from '@/lib/cross-request-cache'
import { defaultMenu, DEFAULT_MENU_SETTINGS } from './defaults'
import { applyRegistryGates } from './gates'
import { STAFF_DOMAINS, ACCESS_LEVELS, type StaffDomain, type Access } from '@/lib/core/staff-roles'
import type {
  MenuMode,
  MenuSettings,
  MenuSurfaceKey,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
  ResolvedRailCard,
} from './types'

/** Narrow a raw string to a StaffDomain, else undefined (unknown domains drop). */
function toStaffDomain(v: string | null | undefined): StaffDomain | undefined {
  return v && (STAFF_DOMAINS as readonly string[]).includes(v) ? (v as StaffDomain) : undefined
}
/** Narrow a raw string to an Access level, else undefined. */
function toStaffLevel(v: string | null | undefined): Access | undefined {
  return v && (ACCESS_LEVELS as readonly string[]).includes(v) ? (v as Access) : undefined
}

/** The four standardized containers with human labels; drives the editor's surface picker. The admin
 *  sub-nav (admin_header) is manageable here too: it defaults to the code catalog (ADMIN_NAV_SPECS in
 *  lib/nav/studio.ts) when it has no DB rows, and an operator can arrange it in the Menu Manager.
 *  (NOTE: a stale DB copy overrides the code — if a nav-code change does not show live, reset the
 *  admin_header DB menu so it falls back to code, or re-arrange it in the Menu Manager.) */
export const MENU_SURFACES: { key: MenuSurfaceKey; label: string }[] = [
  { key: 'header', label: 'Header menu (mega)' },
  { key: 'left', label: 'Left menu (in-app rail)' },
  { key: 'footer', label: 'Footer menu' },
  { key: 'profile', label: 'Profile menu' },
  { key: 'admin_header', label: 'Admin header (mega sub-nav)' },
]

// ── Raw row shapes (untyped DB) ───────────────────────────────────────────────
type MenuRow = { id: string; surface_key: string; label: string | null; columns: number | null }
type CategoryRow = {
  id: string
  parent_id: string | null
  label: string | null
  position: number | null
  grid_col: number | null
  grid_row: number | null
  col_span: number | null
  min_access: string | null
  staff_domain: string | null
  staff_level: string | null
  icon: string | null
  blurb: string | null
}
type ItemRow = {
  id: string
  category_id: string | null
  label: string
  href: string
  subheading: string | null
  icon: string | null
  position: number | null
  grid_col: number | null
  grid_row: number | null
  col_span: number | null
  mode: string | null
  role_modes: Record<string, string> | null
  min_access: string | null
  staff_domain: string | null
  staff_level: string | null
  ghost_tier: string | null
  ghost_message: string | null
}
type RailCardRow = {
  id: string
  side: string
  title: string
  body: string
  href: string
  cta: string | null
  position: number | null
  mode: string | null
  role_modes: Record<string, string> | null
}

const MODE_VALUES: readonly MenuMode[] = ['active', 'ghost', 'hidden']

function toMode(v: string | null | undefined): MenuMode {
  return v && (MODE_VALUES as readonly string[]).includes(v) ? (v as MenuMode) : 'active'
}

/** Coerce a jsonb role_modes blob into a clean Record<string, MenuMode>. */
function toRoleModes(v: Record<string, string> | null | undefined): Record<string, MenuMode> {
  if (!v || typeof v !== 'object') return {}
  const out: Record<string, MenuMode> = {}
  for (const [role, mode] of Object.entries(v)) {
    if ((MODE_VALUES as readonly string[]).includes(mode)) out[role] = mode as MenuMode
  }
  return out
}

const ACCESS_VALUES = [
  'visitor',
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
] as const

function toAccess(v: string | null | undefined): ResolvedItem['minAccess'] {
  return v && (ACCESS_VALUES as readonly string[]).includes(v)
    ? (v as ResolvedItem['minAccess'])
    : 'visitor'
}

function mapItem(row: ItemRow): ResolvedItem {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    subheading: row.subheading ?? undefined,
    icon: row.icon ?? undefined,
    position: row.position ?? 0,
    gridCol: row.grid_col ?? undefined,
    gridRow: row.grid_row ?? undefined,
    colSpan: row.col_span ?? 1,
    mode: toMode(row.mode),
    roleModes: toRoleModes(row.role_modes),
    minAccess: toAccess(row.min_access),
    staffDomain: toStaffDomain(row.staff_domain),
    staffLevel: toStaffLevel(row.staff_level),
    ghostTier: row.ghost_tier ?? undefined,
    ghostMessage: row.ghost_message ?? undefined,
  }
}

function mapRailCard(row: RailCardRow): ResolvedRailCard {
  return {
    id: row.id,
    side: row.side === 'left' ? 'left' : 'right',
    title: row.title,
    body: row.body,
    href: row.href,
    cta: row.cta ?? undefined,
    position: row.position ?? 0,
    mode: toMode(row.mode),
    roleModes: toRoleModes(row.role_modes),
  }
}

/** Assemble flat category + item rows into the nested ResolvedMenu tree. */
function assemble(
  menu: MenuRow,
  surfaceKey: MenuSurfaceKey,
  categoryRows: CategoryRow[],
  itemRows: ItemRow[],
  railCardRows: RailCardRow[],
): ResolvedMenu {
  // Items grouped by their category_id (null = menu root).
  const itemsByCategory = new Map<string, ResolvedItem[]>()
  const rootItems: ResolvedItem[] = []
  for (const row of itemRows) {
    const mapped = mapItem(row)
    if (row.category_id == null) rootItems.push(mapped)
    else {
      const list = itemsByCategory.get(row.category_id) ?? []
      list.push(mapped)
      itemsByCategory.set(row.category_id, list)
    }
  }

  // Build each category shell, then wire up parent/child nesting.
  const byId = new Map<string, ResolvedCategory>()
  for (const row of categoryRows) {
    byId.set(row.id, {
      id: row.id,
      label: row.label ?? undefined,
      position: row.position ?? 0,
      gridCol: row.grid_col ?? undefined,
      gridRow: row.grid_row ?? undefined,
      colSpan: row.col_span ?? 1,
      minAccess: toAccess(row.min_access),
      staffDomain: toStaffDomain(row.staff_domain),
      staffLevel: toStaffLevel(row.staff_level),
      icon: row.icon ?? undefined,
      blurb: row.blurb ?? undefined,
      items: (itemsByCategory.get(row.id) ?? []).sort((a, b) => a.position - b.position),
      children: [],
    })
  }

  const roots: ResolvedCategory[] = []
  for (const row of categoryRows) {
    const node = byId.get(row.id)!
    if (row.parent_id && byId.has(row.parent_id)) byId.get(row.parent_id)!.children.push(node)
    else roots.push(node)
  }

  const sortCats = (cats: ResolvedCategory[]) => {
    cats.sort((a, b) => a.position - b.position)
    for (const c of cats) sortCats(c.children)
  }
  sortCats(roots)

  return {
    id: menu.id,
    surfaceKey,
    label: menu.label ?? surfaceKey,
    columns: menu.columns ?? 6,
    categories: roots,
    rootItems: rootItems.sort((a, b) => a.position - b.position),
    railCards: railCardRows.map(mapRailCard).sort((a, b) => a.position - b.position),
    isDefault: false,
  }
}

/** The raw rows of one surface at one scope: the menu row and its categories, items and rail
 *  cards. THIS IS THE ONLY SHAPE THAT CROSSES THE CROSS-REQUEST CACHE BOUNDARY (ADR-1243): plain
 *  PostgREST rows, no viewer in them, no gate applied to them. Everything that depends on code
 *  (the defaults, the registry gates) or on the viewer (the renderer's role filter) happens after. */
type MenuRowBundle = {
  menu: MenuRow
  categories: CategoryRow[]
  items: ItemRow[]
  railCards: RailCardRow[]
}

/** 1 + 3 queries in two serial waves. Returns null when the surface has no menu row at this scope
 *  (the "use the code defaults" state, which IS cacheable: `ensureMenu` invalidates the tag when it
 *  inserts one). THROWS on a query error instead of returning a fallback, because a fallback returned
 *  from inside the cache boundary would be stored as if it were the data (lib/cross-request-cache.ts). */
async function readMenuRows(surfaceKey: string, spaceId: string | null): Promise<MenuRowBundle | null> {
  // Query the untyped (not-yet-generated) tables via the shared menuDb handle,
  // mirroring lib/menu-config.ts (retired) for menu_config.
  const db = menuDb()

  let menuQuery = db
    .from<MenuRow>('menus')
    .select('id, surface_key, label, columns')
    .eq('surface_key', surfaceKey)
  menuQuery = spaceId == null ? menuQuery.is('space_id', null) : menuQuery.eq('space_id', spaceId)
  const { data: menuRows, error: menuError } = await menuQuery.limit(1)
  if (menuError) throw new Error(`menus query failed: ${menuError.message}`)
  const menu = (menuRows ?? [])[0]
  if (!menu) return null

  const [categoriesRes, itemsRes, railCardsRes] = await Promise.all([
    db
      .from<CategoryRow>('menu_categories')
      .select(
        'id, parent_id, label, position, grid_col, grid_row, col_span, min_access, staff_domain, staff_level, icon, blurb',
      )
      .eq('menu_id', menu.id),
    db
      .from<ItemRow>('menu_items')
      .select(
        'id, category_id, label, href, subheading, icon, position, grid_col, grid_row, col_span, mode, role_modes, min_access, staff_domain, staff_level, ghost_tier, ghost_message',
      )
      .eq('menu_id', menu.id),
    db
      .from<RailCardRow>('menu_rail_cards')
      .select('id, side, title, body, href, cta, position, mode, role_modes')
      .eq('menu_id', menu.id),
  ])
  const childError = categoriesRes.error ?? itemsRes.error ?? railCardsRes.error
  if (childError) throw new Error(`menu child query failed: ${childError.message}`)

  return {
    menu,
    categories: categoriesRes.data ?? [],
    items: itemsRes.data ?? [],
    railCards: railCardsRes.data ?? [],
  }
}

/** The same rows, cached ACROSS requests under CHROME_CACHE_TAGS.menus, keyed by (surface, scope).
 *  Every mutation in lib/menus/actions.ts invalidates the tag beside its write (`bustMenus`). These
 *  rows are `space_id IS NULL` globals identical for every viewer, so the key carries no viewer;
 *  a per-space menu (the `spaceId` seam) is keyed by its own space, so one Space's nav can never be
 *  served as another's. */
const menuRows = crossRequestCached(readMenuRows, ['menus', 'rows'], {
  tags: [CHROME_CACHE_TAGS.menus],
})

type MenuRowSource = (surfaceKey: string, spaceId: string | null) => Promise<MenuRowBundle | null>

/** Rows in, ResolvedMenu out: the defaults fallback, the empty-row rule and the registry gates all
 *  run HERE, after whichever source supplied the rows, so a code change to a default or a gate is
 *  live on the next request whether or not the cache was invalidated. Falls back to
 *  defaultMenu(surfaceKey) (isDefault true) on a missing row OR any error: nav must always render. */
async function resolveMenu(
  surfaceKey: MenuSurfaceKey,
  spaceId: string | null,
  source: MenuRowSource,
): Promise<ResolvedMenu> {
  try {
    const rows = await source(surfaceKey, spaceId)
    if (!rows) return defaultMenu(surfaceKey)

    const resolved = assemble(rows.menu, surfaceKey, rows.categories, rows.items, rows.railCards)
    // A row that exists but has NO groups, links, or rail cards (a half-seeded surface, or one
    // whose groups were all deleted) is treated as "use the code defaults": the editor shows the
    // default structure to manage (materialized on open) instead of a dead, unmanageable blank,
    // and the live nav keeps rendering from the defaults. A real customization always has rows.
    if (
      resolved.categories.length === 0 &&
      resolved.rootItems.length === 0 &&
      resolved.railCards.length === 0
    ) {
      return defaultMenu(surfaceKey)
    }
    // THE GATE CONTRACT (lib/menus/gates.ts, owner decision 2026-08-06). Permissions are
    // re-derived from the canonical registry here, at the ONE seam every surface reads
    // through -- so no renderer has to remember, and a stored gate can never disagree with
    // the code again. Order, grouping, labels, icons and on/off stay the operator's.
    return applyRegistryGates(resolved)
  } catch (err) {
    console.error('[menus] getMenu failed, falling back to defaults', surfaceKey, briefError(err))
    return defaultMenu(surfaceKey)
  }
}

/** Per-request dedupe over the cross-request rows: the (main) layout, the admin layout and the site
 *  header can each ask for a surface in one render and the rows are read once. */
const getMenuCached = cache(
  async (surfaceKey: MenuSurfaceKey, spaceId: string | null): Promise<ResolvedMenu> =>
    resolveMenu(surfaceKey, spaceId, menuRows),
)

/** Read the GLOBAL (space_id IS NULL) menu for a surface, assembled into a
 *  ResolvedMenu. Falls back to defaultMenu(surfaceKey) (isDefault true) when there
 *  is no DB row OR on any query error, nav must always render.
 *
 *  Cached twice (ADR-1243): once per request (React `cache`) and across requests
 *  (`unstable_cache`, tag CHROME_CACHE_TAGS.menus), because the rows are identical for every
 *  viewer. THE READER STILL RETURNS EVERYTHING, hidden and gated items included; the per-viewer
 *  filter is the renderer's (components/layout/menu-role canSeeMenuItem / effectiveMode), which
 *  runs after both caches, so no viewer's filtered menu is ever stored.
 *
 *  `opts.spaceId` is the seam for per-space menus (a later phase); null / omitted
 *  reads the global menu. */
export async function getMenu(
  surfaceKey: MenuSurfaceKey,
  opts?: { spaceId?: string | null },
): Promise<ResolvedMenu> {
  return getMenuCached(surfaceKey, opts?.spaceId ?? null)
}

/** Same shape as getMenu, for the EDITOR, and it reads the truth: neither the per-request nor the
 *  cross-request cache. The Menu Manager's actions write rows and then read the surface back in the
 *  same call (syncMenuFromDefaults returns the menu it just synced), and a cached read there would
 *  hand the editor the rows from before its own write. The shell never calls this. */
export async function getAdminMenu(
  surfaceKey: MenuSurfaceKey,
  opts?: { spaceId?: string | null },
): Promise<ResolvedMenu> {
  return resolveMenu(surfaceKey, opts?.spaceId ?? null, readMenuRows)
}

/** Read a surface's `synced_default_keys` baseline — every default href this menu has ever
 *  synced, the third input to the per-item drift derivation (lib/menus/drift.ts, ADR-1134):
 *  it is what tells a RETIRED default (removed on purpose, never resurrected) from a MISSING
 *  one (new, injected by the next sync). Best-effort like every read here: an error or a
 *  missing row returns [] — which the derivation reads as "nothing baselined yet", so every
 *  absence shows as missing rather than the page failing. */
export async function getSyncedDefaultKeys(
  surfaceKey: MenuSurfaceKey,
  opts?: { spaceId?: string | null },
): Promise<string[]> {
  try {
    const db = menuDb()
    const spaceId = opts?.spaceId ?? null
    let query = db
      .from<{ synced_default_keys: string[] | null }>('menus')
      .select('synced_default_keys')
      .eq('surface_key', surfaceKey)
    query = spaceId == null ? query.is('space_id', null) : query.eq('space_id', spaceId)
    const { data, error } = await query.limit(1)
    if (error) {
      console.error('[menus] getSyncedDefaultKeys failed', surfaceKey, briefError(error))
      return []
    }
    const raw = (data ?? [])[0]?.synced_default_keys
    return Array.isArray(raw) ? raw.map(String) : []
  } catch (err) {
    console.error('[menus] getSyncedDefaultKeys threw', surfaceKey, briefError(err))
    return []
  }
}

type MenuSettingsRow = { open_delay_ms: number | null; dwell_ms: number | null; fade_ms: number | null }

/** The singleton `menu_settings` row, cached across requests under CHROME_CACHE_TAGS.menuSettings
 *  (`setMenuSettings` invalidates it). null when the row does not exist; THROWS on a query error so
 *  the failure is never cached. */
const menuSettingsRow = crossRequestCached(
  async (): Promise<MenuSettingsRow | null> => {
    const db = menuDb()
    const { data, error } = await db
      .from<MenuSettingsRow>('menu_settings')
      .select('open_delay_ms, dwell_ms, fade_ms')
      .eq('id', 1)
      .limit(1)
    if (error) throw new Error(`menu_settings query failed: ${error.message}`)
    return (data ?? [])[0] ?? null
  },
  ['menus', 'settings'],
  { tags: [CHROME_CACHE_TAGS.menuSettings] },
)

/** Read the singleton menu_settings row. Falls back to DEFAULT_MENU_SETTINGS on a
 *  missing row or any error. Per-request deduped (React `cache`) over the cross-request row. */
export const getMenuSettings = cache(async (): Promise<MenuSettings> => {
  try {
    const row = await menuSettingsRow()
    if (!row) return DEFAULT_MENU_SETTINGS
    return {
      openDelayMs: row.open_delay_ms ?? DEFAULT_MENU_SETTINGS.openDelayMs,
      dwellMs: row.dwell_ms ?? DEFAULT_MENU_SETTINGS.dwellMs,
      fadeMs: row.fade_ms ?? DEFAULT_MENU_SETTINGS.fadeMs,
    }
  } catch (err) {
    console.error('[menus] getMenuSettings failed, falling back to defaults', briefError(err))
    return DEFAULT_MENU_SETTINGS
  }
})
