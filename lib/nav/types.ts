// The ONE navigation node type (docs/NAV-SYSTEM-REDESIGN.md §3). Every destination
// on the site — member rail area, operator admin page, footer link — is one
// `NavNode`, declared once in lib/nav/registry.ts and *projected* onto each surface
// (rail, mobile bar, header, admin sub-nav, footer, ⌘K). This is the strangler-fig
// spine that the three hand-maintained catalogs (NAV_AREAS, ADMIN_NAV, ADMIN_GROUPS)
// collapse into.
//
// Framework-independent (no React / Next) so it can be shared by the server shell,
// the permission grid, and the future mobile app — same rule as lib/nav-areas.ts and
// lib/core/*. Roles are REUSED, never redefined: the access floor is the menu system's
// `MenuAccess` (== 'visitor' | CommunityRole, ADR-390) and the staff axis is the
// `StaffDomain` / `Access` capability model (lib/core/staff-roles, ADR-127).

import type { MenuAccess } from '@/lib/menus/types'
import type { StaffDomain, Access } from '@/lib/core/staff-roles'

/** The Calm ↔ Studio mode axis (NAV-SYSTEM-REDESIGN §4). `calm` = the member app
 *  spine; `studio` = the operator/creator workspace the same spine repopulates into.
 *  Phase 1 declares only `calm` nodes; the Studio sub-tree lands in the next stage. */
export type NavMode = 'calm' | 'studio'

/** Which surfaces a node projects onto. A surface is a filtered view of the registry
 *  (§3): the desktop rail + mobile bar read `spine`; the admin sub-nav reads `sub`;
 *  the marketing header reads `header`; the footer `footer`; the account menu
 *  `profile`; and ⌘K spans `palette` (every node the viewer can see). */
export type NavSurface = 'spine' | 'sub' | 'header' | 'footer' | 'profile' | 'palette'

/** The two-axis gate (ADR-390, unchanged): a `minAccess` community/role floor UNIONED
 *  with an optional staff capability (`staffDomain` at `staffLevel`, ADR-127). Mirrors
 *  the ResolvedItem gate + nav-areas' meetsAccess/meetsStaff pair exactly — moving where
 *  a gate is declared, never what it permits. */
export type NavGate = {
  minAccess: MenuAccess
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'read' — reading is enough to
   *  SURFACE a nav item, matching meetsStaff in lib/nav-areas.ts). */
  staffLevel?: Access
}

/** How a node presents for a viewer once gating resolves. `ghost` = shown muted
 *  (upsell / preview, e.g. the Vault's previewBelowAccess); `hidden` = dropped.
 *  Mirrors MenuMode; optional — absent ⇒ 'active'. */
export type NavDisplay = 'active' | 'ghost' | 'hidden'

/** A single destination in the unified registry (NAV-SYSTEM-REDESIGN §3). */
export type NavNode = {
  /** Stable key — the permission key AND the DB primary key AND the icon key
   *  (AREA_ICONS in components/layout/nav-icons.ts). == NavArea.key today. */
  id: string
  /** The rendered NAME (nav / footer / search / card). Canon-governed (docs/NAMING.md). */
  label: string
  href: string
  /** Icon NAME resolved by nav-icons.ts. For spine nodes this is the `id` (AREA_ICONS
   *  is keyed by area key); custom DB rows may store a lucide name instead. */
  icon: string
  /** One-liner for dashboard / mega cards. */
  blurb?: string
  /** world → section → leaf (max two nav levels). For a calm spine node this is the
   *  section header label (null-section home-anchor nodes carry no parent). */
  parent?: string
  /** Which spine this node belongs to (§4). */
  mode: NavMode
  /** Every surface this node projects onto (§3). */
  surfaces: NavSurface[]
  /** The two-axis gate (ADR-390). */
  gate: NavGate
  /** Optional presentation hint (ghost = muted upsell/preview). */
  display?: NavDisplay
}
