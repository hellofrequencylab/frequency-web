// WHO CAN SEE A FOOTER LINK (LIVE-1030). The member site map and the Frequency mega footer draw the same
// registry columns (lib/nav/registry.ts footerColumns), so the gate is one function: the SAME logic the
// left rail uses (lib/nav-areas.ts). For a link that mirrors a NAV_AREA (`node.navKey`) the server-resolved
// `navAccess` matrix is authoritative (it folds in role, tier, staff and the view-as preview); a keyless link
// falls back to its own ladder floor and staff domain. A column left empty is dropped whole, so a visitor
// never sees a member-only destination and nobody is linked to a surface they cannot use.

import { meetsAccess, meetsStaff, NAV_AREA_DEFAULTS, type NavAccess } from '@/lib/nav-areas'
import { footerColumns } from '@/lib/nav/registry'
import type { NavNode } from '@/lib/nav/types'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import type { AccessLevel } from '@/lib/core/access-matrix'

export function footerLinkReachable(
  node: NavNode,
  role: CommunityRole | null,
  staffRole: StaffRole | null,
  navAccess: Record<string, AccessLevel> | undefined,
): boolean {
  if (node.navKey) {
    if (navAccess && node.navKey in navAccess) return navAccess[node.navKey] !== 'none'
    const access = NAV_AREA_DEFAULTS[node.navKey] ?? 'visitor'
    return meetsAccess(access, role) || meetsStaff({ staffDomain: node.gate.staffDomain }, staffRole)
  }
  return (
    meetsAccess((node.gate.minAccess as NavAccess) ?? 'visitor', role) ||
    meetsStaff({ staffDomain: node.gate.staffDomain }, staffRole)
  )
}

/** The registry's footer columns, gate-filtered for this viewer, empty columns dropped. */
export function visibleFooterColumns(
  role: CommunityRole | null,
  staffRole: StaffRole | null = null,
  navAccess?: Record<string, AccessLevel>,
) {
  return footerColumns()
    .map((col) => ({ ...col, links: col.links.filter((l) => footerLinkReachable(l, role, staffRole, navAccess)) }))
    .filter((col) => col.links.length > 0)
}
