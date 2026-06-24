// Resolved, normalized menu types, the single contract the runtime renderers and
// the admin editor consume. A "resolved" menu is the assembled shape the reader
// (lib/menus/read.ts) returns: DB rows joined into nested categories + items + rail
// cards, OR the code fallback (lib/menus/defaults.ts) when a surface has no DB rows.
//
// The reader returns EVERYTHING (including hidden items); per-role / per-mode
// filtering is the renderer's job, not the reader's. These types stay framework
// independent (no React, no Supabase) so the server reader, the server actions, and
// any client editor can all import them.
//
// GATE (ADR-390): every item and category carries the SAME two-axis gate the admin
// nav uses — a `minAccess` community/role floor PLUS an optional staff capability
// (`staffDomain` + `staffLevel`, ADR-127). The renderer unions them (see
// canSeeMenuEl in components/layout/menu-role.ts): an element shows if EITHER the
// access floor admits the viewer OR the staff axis grants the domain. This keeps
// staff-gated admin pages safe when they live inside the standardized containers.

import type { StaffDomain, Access } from '@/lib/core/staff-roles'

/** The standardized menu containers the whole site composes (ADR-390):
 *  - header        — the mega-menu for general site navigation (pages + categories)
 *  - left          — the in-app left rail (the "user menu" in the feed); admin section
 *                    entry points live here, role-gated
 *  - footer        — the site footer
 *  - profile       — the account / profile dropdown
 *  - admin_header  — the contextual admin mega sub-header: shows the ACTIVE admin section's
 *                    sub-pages above the content area (with the admin/Vera search bar)
 *  Any page/link is assignable to any container; visibility is role-gated. */
export type MenuSurfaceKey = 'header' | 'left' | 'footer' | 'profile' | 'admin_header'

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
  /** Optional staff capability domain (ADR-127) that ALSO unlocks this link, unioned
   *  with the minAccess floor + roleModes by canSeeMenuEl. */
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'write' for a leaf link). */
  staffLevel?: Access
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
  /** Lowest access that may SEE this category (default 'visitor' when unset). A
   *  category can be a gated section when it doubles as a rail entry / dashboard card. */
  minAccess?: MenuAccess
  /** Optional staff capability domain that ALSO unlocks this section (read-level by
   *  default for a section floor). */
  staffDomain?: StaffDomain
  staffLevel?: Access
  /** Icon NAME (resolved by nav-icons.ts) for when the category renders as a rail
   *  entry / dashboard card. */
  icon?: string
  /** One-line framing shown when the category renders as a dashboard / overview card. */
  blurb?: string
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
