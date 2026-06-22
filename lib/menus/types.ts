// Resolved, normalized menu types, the single contract the runtime renderers and
// the admin editor consume. A "resolved" menu is the assembled shape the reader
// (lib/menus/read.ts) returns: DB rows joined into nested categories + items + rail
// cards, OR the code fallback (lib/menus/defaults.ts) when a surface has no DB rows.
//
// The reader returns EVERYTHING (including hidden items); per-role / per-mode
// filtering is the renderer's job, not the reader's. These types stay framework
// independent (no React, no Supabase) so the server reader, the server actions, and
// any client editor can all import them.

/** The five menu surfaces the system can drive. */
export type MenuSurfaceKey =
  | 'public_discover'
  | 'public_explore'
  | 'admin_subheader'
  | 'left_rail'
  | 'marketing_footer'

/** How an item / rail card presents. 'ghost' = shown muted (upsell / preview),
 *  'hidden' = removed for that viewer. Mirrors the DB CHECK constraint. */
export type MenuMode = 'active' | 'ghost' | 'hidden'

/** Lowest access level that may USE an item; everyone below is ghosted or hidden by
 *  the renderer. 'visitor' = everyone (even logged-out). Mirrors the DB CHECK. */
export type MenuAccess =
  | 'visitor'
  | 'member'
  | 'crew'
  | 'host'
  | 'guide'
  | 'mentor'
  | 'admin'
  | 'janitor'

/** A leaf link in a menu (root-level or inside a category). */
export type ResolvedItem = {
  id: string
  label: string
  href: string
  subheading?: string
  icon?: string
  position: number
  gridCol?: number
  gridRow?: number
  colSpan: number
  mode: MenuMode
  /** Per-role overrides of `mode`, keyed by role name (e.g. { host: 'active' }). */
  roleModes: Record<string, MenuMode>
  minAccess: MenuAccess
  ghostTier?: string
  ghostMessage?: string
}

/** A grouped column within a menu. Categories nest via `children`. */
export type ResolvedCategory = {
  id: string
  label?: string
  position: number
  gridCol?: number
  gridRow?: number
  colSpan: number
  items: ResolvedItem[]
  children: ResolvedCategory[]
}

/** A featured side card on a mega-menu panel. */
export type ResolvedRailCard = {
  id: string
  side: 'left' | 'right'
  title: string
  body: string
  href: string
  cta?: string
  position: number
  mode: MenuMode
  roleModes: Record<string, MenuMode>
}

/** A fully assembled menu for one surface. */
export type ResolvedMenu = {
  /** The DB menu row id. Absent when `isDefault` (served from the code fallback). */
  id?: string
  surfaceKey: MenuSurfaceKey
  label: string
  columns: number
  categories: ResolvedCategory[]
  rootItems: ResolvedItem[]
  railCards: ResolvedRailCard[]
  /** True when this menu came from the code fallback (no DB row), false when from DB. */
  isDefault: boolean
}

/** Mega-menu interaction timings (the singleton menu_settings row). */
export type MenuSettings = {
  openDelayMs: number
  dwellMs: number
  fadeMs: number
}
