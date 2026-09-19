'use client'

// LIVE-412 / ADR-1466. Rail helpers extracted from app-shell.tsx so the composer
// stays under the 1800-line ratchet. Still on the shell's static client graph.

import { Globe } from 'lucide-react'
import { NAV_AREAS, meetsAccess, meetsStaff, type NavAccess, type NavArea } from '@/lib/nav-areas'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { StaffRole, StaffDomain } from '@/lib/staff'
import type { CommunityRole } from '@/lib/community-roles'
import type { ProfileIdentity } from '@/lib/types/profile'
import { AREA_ICONS, railIconFor } from '@/components/layout/nav-icons'
import { effectiveMode, canSeeMenuItem, flattenCategoryTree, type MenuViewer } from '@/components/layout/menu-role'
import type { ResolvedCategory, ResolvedItem, ResolvedMenu } from '@/lib/menus/types'
import type { ElementType } from 'react'

export type MainNavItem = {
  key: string
  href: string
  label: string
  Icon: ElementType
  defaultAccess: NavAccess
  /** Below-access viewers may still click through to a muted preview. */
  preview?: boolean
  /** Staff capability domain (team_members) that also unlocks this item. */
  staffDomain?: StaffDomain
  /** DATA gate (not a role gate): show this item ONLY to a viewer who operates a Space. The shell
   *  resolves that boolean once (operatesSpaces) and threads it into itemAccess. */
  requiresOperatedSpaces?: boolean
  /** DB-menu mode for this item (lib/menus). Present ONLY when the rail is DB-driven:
   *  the menu reader + effectiveMode already resolved active/ghost (hidden was dropped),
   *  so NavLinkList renders by this mode and SKIPS the legacy itemAccess/telescope gating
   *  (the DB item's minAccess + role modes now own visibility — no double-gate). */
  mode?: 'active' | 'ghost'
  /** Tier this entry is gated behind, for the ghost upgrade lightbox. */
  ghostTier?: string
  /** Optional override copy for the ghost upgrade lightbox. */
  ghostMessage?: string
}

export type NavSectionGroup = { label: string | null; items: MainNavItem[] }

// Group a list of areas into ordered sections, preserving declaration order.
export function buildSections(areas: typeof NAV_AREAS[number][]): NavSectionGroup[] {
  const sections: NavSectionGroup[] = []
  // Group by section LABEL, not by consecutive run: an item whose section already has a
  // group joins THAT group instead of forking a new one. Without this, a saved menu order
  // that scatters a section's items (a late-added "orphan" key appended past the end of its
  // section's run — My Contacts, Journal, Spaces) renders a second, near-empty duplicate
  // header. Order follows each section's FIRST appearance, so the default rail is unchanged.
  const byLabel = new Map<string | null, NavSectionGroup>()
  for (const area of areas) {
    // Declared, but not a rail row (lib/nav-areas `railHidden`): My Contacts is a tab of the
    // Members hub, Journal belongs to My Frequency. They keep their permission row, their
    // matrix surface and their palette entry; they just are not rows here.
    if (area.railHidden) continue
    const item: MainNavItem = {
      key: area.key,
      href: area.href,
      label: area.label,
      Icon: AREA_ICONS[area.key] ?? Globe,
      defaultAccess: area.defaultAccess,
      preview: area.previewBelowAccess,
      staffDomain: area.staffDomain,
      requiresOperatedSpaces: area.requiresOperatedSpaces,
    }
    const existing = byLabel.get(area.section)
    if (existing) existing.items.push(item)
    else {
      const group: NavSectionGroup = { label: area.section, items: [item] }
      byLabel.set(area.section, group)
      sections.push(group)
    }
  }
  return sections
}

// One vertical rail holds every destination: the Home anchors (Feed · Around You,
// pinned top), then the worlds — Community · The Quest — and finally the single
// Admin category (admin + studio + platform rolled into one, mirroring the back-end
// admin menu). Sections and their order are derived entirely from NAV_AREAS (no
// hardcoded section list). The desktop rail and mobile drawer render the same set.
export const NAV_SECTIONS = buildSections([...NAV_AREAS])

// Build the rail from an operator-resolved key order (the GLOBAL menu config —
// /admin/menu). Hidden items are already filtered out upstream (orderedVisibleAreas),
// so this only reorders + drops unknown keys; an empty/missing list falls back to the
// full code rail so the rail is NEVER empty. Per-role gating is unchanged — it still
// runs over these items via `permissions` / `navAccess`.
const AREA_BY_KEY = new Map(NAV_AREAS.map((a) => [a.key, a]))
export function sectionsFromKeys(keys: string[] | undefined): NavSectionGroup[] {
  if (!keys || keys.length === 0) return NAV_SECTIONS
  const areas = keys.map((k) => AREA_BY_KEY.get(k)).filter((a): a is NavArea => !!a)
  return areas.length > 0 ? buildSections(areas) : NAV_SECTIONS
}

// ── The Profile pin is now MY FREQUENCY (owner directive, 2026-08-06) ─────────────────
//
// This used to drop a flat "Profile" link into the home-anchor group beside Feed. It is a
// DISCLOSURE now — profile, journal, contacts, the Spaces you run and the Circles you are in,
// each with its own notice count (components/layout/my-frequency-menu.tsx). A flat link could
// not carry any of that, and the things it opens onto were previously reachable only from the
// account dock at the far bottom of the rail.
//
// So there is no item to inject: the rail renders <MyFrequencyMenu> itself, immediately after
// the home anchor's rows. This helper stays as the ONE place that decides where in the section
// list that boundary is, because both the desktop rail and the mobile drawer need the same
// answer and a second copy is how they would disagree.
//
// The seam is the home anchor itself, which NavLinkList already identifies as it maps
// (`isHomeAnchor` below): the row renders at the END of that group, exactly where the flat
// Profile link used to sit. A menu order with no leading null group has no anchor, and the
// row leads the rail instead.

// Build the rail's sections from a DB-backed menu (lib/menus, getMenu('left_rail')).
// effectiveMode resolves each item for the viewer: 'hidden' is DROPPED here, 'ghost'
// becomes a muted GhostLink row (the upgrade lightbox), 'active' a normal link — so the
// DB item's minAccess + role modes OWN visibility and NavLinkList must NOT re-gate these
// (every item carries `mode`, the signal to skip the legacy itemAccess path). The stored
// `icon` (a NAV_AREAS key for defaults, a lucide name for custom rows) maps via railIconFor.
//
// Menu shape → rail sections: rootItems (category-less) become the leading label-less
// HOME ANCHOR group (Feed et al, pinned top); each top-level category becomes a labelled
// section. Nested child categories are FLATTENED into their parent section in order (the
// rail is a single vertical list with one header level, so a deeper tree reads as one
// group) — their own items keep their resolved mode. An empty group (everything hidden)
// is skipped. Returns [] when nothing is visible, so the caller can fall back to the code rail.
// TWO-AXIS gate (ADR-390): an item shows if the viewer passes EITHER the access floor
// (effectiveMode) OR the staff capability axis — so admin links folded into the `left`
// menu stay visible to the right operators (e.g. a Marketer) and hidden from everyone
// else. A staff-admitted item whose token mode is 'hidden' (its floor is above the
// viewer's collapsed token) is presented as a normal active link.
export function menuItemToNav(item: ResolvedItem, viewer: MenuViewer): MainNavItem | null {
  if (!canSeeMenuItem(item, viewer)) return null
  const tokenMode = effectiveMode(item, viewer.viewerRole)
  const mode = tokenMode === 'hidden' ? 'active' : tokenMode
  return {
    key: item.id,
    href: item.href,
    label: item.label,
    Icon: railIconFor(item.icon),
    // defaultAccess is unused on menu-driven items (mode owns visibility); carry the item's
    // own access floor for completeness. MenuAccess and NavAccess share the same tokens.
    defaultAccess: item.minAccess as NavAccess,
    mode,
    ghostTier: item.ghostTier,
    ghostMessage: item.ghostMessage,
  }
}

// Collect a category's own items plus all descendants', flattened in tree order (the
// shared flattenCategoryTree walk), each resolved for the viewer (not-visible dropped).
export function flattenCategoryItems(cat: ResolvedCategory, viewer: MenuViewer): MainNavItem[] {
  const out: MainNavItem[] = []
  for (const it of flattenCategoryTree(cat, (item) => canSeeMenuItem(item, viewer))) {
    const nav = menuItemToNav(it, viewer)
    if (nav) out.push(nav)
  }
  return out
}

export function menuToSections(menu: ResolvedMenu, viewer: MenuViewer): NavSectionGroup[] {
  const sections: NavSectionGroup[] = []

  // Root items (no category) lead as the headerless home anchor.
  const rootItems: MainNavItem[] = []
  for (const it of menu.rootItems) {
    const nav = menuItemToNav(it, viewer)
    if (nav) rootItems.push(nav)
  }
  if (rootItems.length > 0) sections.push({ label: null, items: rootItems })

  // Each top-level category is a labelled section; descendants flatten into it.
  for (const cat of menu.categories) {
    const items = flattenCategoryItems(cat, viewer)
    if (items.length > 0) sections.push({ label: cat.label ?? null, items })
  }

  return sections
}

// The active admin section resolution (longest href-prefix) moved to AdminSubNav
// (components/admin/admin-sub-nav.tsx), which now owns the flat admin sub-nav row and
// resolves the active world client-side via usePathname (NAV-SYSTEM-REDESIGN §6).

// The Manage sections TELESCOPE: an item the viewer can't reach is hidden (not
// muted), and a group with nothing reachable is skipped entirely (header included)
// — so a member never sees empty admin headers and a host isn't shown greyed-out
// janitor tools. Member worlds (Community, The Quest) still mute/preview instead,
// as aspirational surfaces.
export const TELESCOPE_SECTIONS = new Set(['Steward', 'Structure', 'Admin', 'Leadership'])

// Mobile renders the SAME rail as desktop (owner call, mobile-menus pass): the
// left drawer carries the member worlds AND the axis-gated Manage groups — one
// menu structure everywhere. Manage telescopes, so members never see admin
// headers; the account menu stays purely personal.

// The effective access for an area = a janitor's per-area override, if any,
// else the code default. `role` is the viewer's community role (null = visitor).
export function effectiveAccess(
  item: MainNavItem,
  permissions: Record<string, NavAccess> | undefined,
): NavAccess {
  return permissions?.[item.key] ?? item.defaultAccess
}

// Matrix-driven access (owner directive): the viewer's level on a nav item's surface,
// 'none' | 'limited' | 'full'. `navAccess` (server-resolved per key via the access matrix)
// is AUTHORITATIVE when present — it already folds in the viewer's effective role/tier/
// staff (and under a view-as preview those are the impersonated values), so we do NOT
// union a separate staff check on top of it (that path leaked real staff access into a
// downgraded preview). Only DYNAMIC extras with no matrix key fall back to the role/staff
// ladder, so a pinned/extra item is never wrongly hidden.
export function itemAccess(
  item: MainNavItem,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  permissions: Record<string, NavAccess> | undefined,
  navAccess: Record<string, AccessLevel> | undefined,
  operatesSpaces: boolean,
): AccessLevel {
  // DATA predicate first, as a hard veto: an item that requires an operated Space is fully hidden
  // for a viewer who runs none — before the matrix/role/staff axes can reveal it (its matrix key
  // resolves to 'full' since it names no surface, so the veto must win).
  if (item.requiresOperatedSpaces && !operatesSpaces) return 'none'
  if (navAccess && item.key in navAccess) return navAccess[item.key]
  return meetsAccess(effectiveAccess(item, permissions), role) || meetsStaff(item, staffRole) ? 'full' : 'none'
}


export interface Profile extends ProfileIdentity {
  community_role: CommunityRole
  current_season_zaps?: number | null
  lifetime_gems?: number | null
  meta?: unknown
}

// The account menu's "Receive payments" item (lib/nav/registry payouts seed) is gated in the menu
// DATA by the `host` trust tier as an EARNER PROXY. The shell now threads the REAL payouts
// capability (payoutsLive() AND canReceivePayouts — payouts switched on platform-wide, and this
// person a host+ or a live partner persona; resolved server-side in the layout, the SAME pair the
// #payouts card itself renders on) and gates that ONE item on it instead of the proxy. Both halves
// matter: the eligibility half alone left the link pointing at an anchor that does not exist while
// payouts are off. Identified by its
// destination (the payouts tab of the billing page — distinct from the plain Billing href) + the
// `host` access floor the seed carries. A custom DB menu that re-gated the item off `host` falls
// through to the normal canSeeMenuItem path (fail-safe: no worse than the old proxy).
export function isPayoutsMenuItem(it: ResolvedItem): boolean {
  // '/settings/billing?tab=payouts' is the retired pre-one-pager href: DB-authored menus
  // may still carry it, so both spellings ride the real payouts capability.
  return (
    (it.href === '/settings#payouts' || it.href === '/settings/billing?tab=payouts') &&
    it.minAccess === 'host'
  )
}

// Visibility for one account-menu (profile surface) link: the payouts item rides the real payouts
// capability; every other link rides the shared two-axis gate (canSeeMenuItem).
export function canSeeAccountItem(it: ResolvedItem, viewer: MenuViewer, canReceivePayouts: boolean): boolean {
  if (isPayoutsMenuItem(it)) return canReceivePayouts
  return canSeeMenuItem(it, viewer)
}

