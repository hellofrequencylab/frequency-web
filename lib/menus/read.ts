// Server reads for the DB-backed menu system. Mirrors lib/menu-config.ts: the new
// tables are not in the generated types yet (regenerate lib/database.types.ts after
// the 20260721000000_menu_system migration is applied, ADR-246 pattern), so we cast
// the base client to an untyped shape to query them.
//
// Reads are BEST-EFFORT: nav must ALWAYS render. On any query error, a missing menu
// row, or a missing table (pre-migration), we log and fall back to the code defaults
// (lib/menus/defaults.ts) instead of throwing. The reader returns EVERYTHING
// (including hidden items), the renderer does the per-role / per-mode filtering.

import { menuDb } from './db'
import { defaultMenu, DEFAULT_MENU_SETTINGS } from './defaults'
import type {
  MenuMode,
  MenuSettings,
  MenuSurfaceKey,
  ResolvedCategory,
  ResolvedItem,
  ResolvedMenu,
  ResolvedRailCard,
} from './types'

/** The five surfaces with human labels, drives the editor's surface picker. */
export const MENU_SURFACES: { key: MenuSurfaceKey; label: string }[] = [
  { key: 'public_discover', label: 'Discover (public header)' },
  { key: 'public_explore', label: 'Explore Frequency (public header)' },
  { key: 'admin_subheader', label: 'Admin subheader' },
  { key: 'left_rail', label: 'In-app left rail' },
  { key: 'marketing_footer', label: 'Marketing footer' },
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

/** Read the GLOBAL (space_id IS NULL) menu for a surface, assembled into a
 *  ResolvedMenu. Falls back to defaultMenu(surfaceKey) (isDefault true) when there
 *  is no DB row OR on any query error, nav must always render.
 *
 *  `opts.spaceId` is the seam for per-space menus (a later phase); null / omitted
 *  reads the global menu. */
export async function getMenu(
  surfaceKey: MenuSurfaceKey,
  opts?: { spaceId?: string | null },
): Promise<ResolvedMenu> {
  try {
    // Query the untyped (not-yet-generated) tables via the shared menuDb handle,
    // mirroring lib/menu-config.ts for menu_config.
    const db = menuDb()

    const spaceId = opts?.spaceId ?? null
    let menuQuery = db
      .from<MenuRow>('menus')
      .select('id, surface_key, label, columns')
      .eq('surface_key', surfaceKey)
    menuQuery = spaceId == null ? menuQuery.is('space_id', null) : menuQuery.eq('space_id', spaceId)
    const { data: menuRows, error: menuError } = await menuQuery.limit(1)
    if (menuError) {
      console.error('[menus] getMenu menu query failed', surfaceKey, menuError.message)
      return defaultMenu(surfaceKey)
    }
    const menu = (menuRows ?? [])[0]
    if (!menu) return defaultMenu(surfaceKey)

    const [categoriesRes, itemsRes, railCardsRes] = await Promise.all([
      db
        .from<CategoryRow>('menu_categories')
        .select('id, parent_id, label, position, grid_col, grid_row, col_span')
        .eq('menu_id', menu.id),
      db
        .from<ItemRow>('menu_items')
        .select(
          'id, category_id, label, href, subheading, icon, position, grid_col, grid_row, col_span, mode, role_modes, min_access, ghost_tier, ghost_message',
        )
        .eq('menu_id', menu.id),
      db
        .from<RailCardRow>('menu_rail_cards')
        .select('id, side, title, body, href, cta, position, mode, role_modes')
        .eq('menu_id', menu.id),
    ])

    if (categoriesRes.error || itemsRes.error || railCardsRes.error) {
      console.error(
        '[menus] getMenu child query failed',
        surfaceKey,
        categoriesRes.error?.message ?? itemsRes.error?.message ?? railCardsRes.error?.message,
      )
      return defaultMenu(surfaceKey)
    }

    return assemble(
      menu,
      surfaceKey,
      categoriesRes.data ?? [],
      itemsRes.data ?? [],
      railCardsRes.data ?? [],
    )
  } catch (err) {
    console.error('[menus] getMenu threw, falling back to defaults', surfaceKey, err)
    return defaultMenu(surfaceKey)
  }
}

/** Same as getMenu, for the editor. getMenu already returns everything (hidden
 *  included), the renderers do the role/mode filtering, so this is a thin alias
 *  that exists so callers can express intent. */
export async function getAdminMenu(
  surfaceKey: MenuSurfaceKey,
  opts?: { spaceId?: string | null },
): Promise<ResolvedMenu> {
  return getMenu(surfaceKey, opts)
}

/** Read the singleton menu_settings row. Falls back to DEFAULT_MENU_SETTINGS on a
 *  missing row or any error. */
export async function getMenuSettings(): Promise<MenuSettings> {
  try {
    const db = menuDb()
    const { data, error } = await db
      .from<{ open_delay_ms: number | null; dwell_ms: number | null; fade_ms: number | null }>(
        'menu_settings',
      )
      .select('open_delay_ms, dwell_ms, fade_ms')
      .eq('id', 1)
      .limit(1)
    if (error) {
      console.error('[menus] getMenuSettings failed', error.message)
      return DEFAULT_MENU_SETTINGS
    }
    const row = (data ?? [])[0]
    if (!row) return DEFAULT_MENU_SETTINGS
    return {
      openDelayMs: row.open_delay_ms ?? DEFAULT_MENU_SETTINGS.openDelayMs,
      dwellMs: row.dwell_ms ?? DEFAULT_MENU_SETTINGS.dwellMs,
      fadeMs: row.fade_ms ?? DEFAULT_MENU_SETTINGS.fadeMs,
    }
  } catch (err) {
    console.error('[menus] getMenuSettings threw, falling back to defaults', err)
    return DEFAULT_MENU_SETTINGS
  }
}
