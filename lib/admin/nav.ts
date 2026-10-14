// Admin sub-header catalog — the operator sections and the sub-pages each fans out
// into. The admin layout filters this to the sections a viewer can reach, then renders
// them as a mega menu (each section trigger navigates to its root AND reveals its
// sub-pages). Framework-independent (no React) so the server layout and client menu share it.
//
// STRANGLER-FIG (NAV-SYSTEM-REDESIGN §5b, §8, phase 2): this catalog is now a THIN
// DERIVATION of the ONE Studio sub-tree (lib/nav/studio.ts). ADMIN_NAV is built from
// ADMIN_NAV_SPECS (the sub-header layout descriptor) + STUDIO_LEAVES (the operator
// destinations, declared ONCE). The shape + `canSeeAdminSection` signature are UNCHANGED,
// so lib/menus/defaults.ts (the only consumer) keeps compiling and rendering identically.
//
// Gating: a section shows when the viewer meets its role floor OR holds its staff domain. Each
// sub-page carries ITS OWN gate (ADR-1745) — the leaf's row gate, which check:gate-parity locks to the
// page — rather than inheriting the section's, so sections can group by job without re-gating a link.

import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type StaffRole, type StaffDomain, type Access } from '@/lib/core/staff-roles'
import { ADMIN_NAV_SPECS, adminNavLeafGate, studioLeaf } from '@/lib/nav/studio'

/** One sub-page link, carrying ITS OWN gate (ADR-1745): the leaf's row gate, or the page-side override
 *  for a FROZEN_GATE_DEBT row. lib/menus/defaults.ts stamps it onto the menu item. */
type AdminNavLink = { label: string; href: string; min: CommunityRole; staffDomain?: StaffDomain; staffLevel?: Access }
type AdminNavGroup = { heading?: string; items: AdminNavLink[] }

export type AdminNavSection = {
  href: string
  label: string
  /** Community-ladder floor: 'janitor' / 'admin' read the staff web_role; others read the
   *  trust ladder. */
  min: CommunityRole
  /** Optional staff capability that also unlocks the section (unioned with `min`). */
  staffDomain?: StaffDomain
  /** The sub-pages this section fans out into. Omitted for a section that is just a direct
   *  link (Dashboard, Leadership) — it renders as a plain tab, no panel. */
  groups?: AdminNavGroup[]
}

// Built from the Studio sub-tree (lib/nav/studio.ts). Order IS the render order across the
// admin bar. Each spec section's groups reference their sub-page leaves by id; the leaf's
// href + (optionally overridden) label produce the AdminNavLink. Mirrors the left-rail
// Admin section; every `/admin/*` page is verified against the route tree there.
export const ADMIN_NAV: readonly AdminNavSection[] = ADMIN_NAV_SPECS.map((spec) => {
  const section: AdminNavSection = { href: spec.href, label: spec.label, min: spec.min }
  if (spec.staffDomain) section.staffDomain = spec.staffDomain
  if (spec.groups && spec.groups.length > 0) {
    section.groups = spec.groups.map((g) => {
      const items: AdminNavLink[] = g.leaves.flatMap((ref) => {
        const leaf = studioLeaf(ref.leaf)
        const gate = adminNavLeafGate(ref)
        if (!leaf || !gate) return []
        return [{ label: ref.label ?? leaf.label, href: leaf.href, ...gate }]
      })
      return g.heading ? { heading: g.heading, items } : { items }
    })
  }
  return section
})

/** Whether a viewer can see an admin section: the role floor (web_role for admin/janitor,
 *  else the trust ladder) OR the staff domain. Mirrors the prior flat-menu gate exactly. */
export function canSeeAdminSection(
  section: AdminNavSection,
  role: CommunityRole,
  webRole: WebRole,
  staffRole: StaffRole | null,
): boolean {
  const meetsMin =
    section.min === 'janitor'
      ? isJanitor(webRole)
      : section.min === 'admin'
        ? isStaff(webRole)
        : atLeastRole(role, section.min)
  return meetsMin || (!!section.staffDomain && staffCan(staffRole, section.staffDomain, 'write'))
}
