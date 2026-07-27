// The operator Admin rail, resolved from ONE reconciled source (ADR-850).
//
// Two catalogs describe the same operator destinations and neither knows about the other:
//
//   • `NAV_AREAS` (lib/nav-areas.ts)  — the rail rows. Carries the `key` that `area_permissions`,
//     `AREA_ICONS` and the `/admin/roles` grid are all keyed by, and the gate the rail enforces.
//   • `STUDIO_LEAVES` / `STUDIO_WORLDS` (lib/nav/studio.ts) — the same pages, carrying the `world`
//     each belongs to and the gate the SERVER enforces through `requireAdmin`.
//
// They overlap on eleven destinations. Nothing had ever compared them, because no code reads both,
// and two of the eleven turned out to disagree — each in a way that made the RAIL promise access the
// PAGE refused. Both are resolved (ADR-851); see KNOWN_GATE_DIVERGENCES. This module is the join:
// one entry per rail row, naming its legacy key, its world parent, and ONE gate.
//
// THE GATE IS TAKEN FROM `NAV_AREAS`, VERBATIM. `NAV_AREAS` is what the rail enforces, so sourcing
// from it means this join can never itself change access: a gate change has to be made in the
// catalog, deliberately, where the drift guard will see it.

import { NAV_AREAS, type NavArea } from '@/lib/nav-areas'
import { STUDIO_LEAVES, STUDIO_WORLDS } from './studio'
import { adminParentHref, normalizeAdminHref } from './admin-nesting'
import type { CommunityRole } from '@/lib/core/roles'
import type { StaffDomain, Access } from '@/lib/core/staff-roles'

/** The section label the operator rows live under. Load-bearing: `TELESCOPE_SECTIONS` in the shell
 *  matches this exact string, and `registry.gate.test.ts` asserts it. Never rename it here. */
export const ADMIN_SECTION = 'Admin'

/** One row of the operator rail, with everything any surface needs to render or gate it. */
export type AdminRailEntry = {
  /** The LEGACY NavArea key. `area_permissions` rows, the `/admin/roles` grid, `AREA_ICONS` and the
   *  request-time `navAccess` map are all keyed by this, so it is preserved exactly. */
  key: string
  label: string
  href: string
  /** The `key` of the box this row nests under, or null when it IS a box. Derived from the world its
   *  StudioLeaf declares, never hand-set. */
  parentKey: string | null
  /** The id of the StudioLeaf or `world:<key>` this row corresponds to, or null when no operator
   *  catalog entry claims it (only Leadership today). */
  leafId: string | null
  /** The gate, verbatim from NAV_AREAS. */
  gate: { minAccess: CommunityRole | 'visitor'; staffDomain?: StaffDomain; staffLevel?: Access }
}

/**
 * Destinations where `NAV_AREAS` and `STUDIO_LEAVES` disagree about who may reach the page.
 *
 * EMPTY, and that is the point. Two divergences existed when this join was first written; the owner
 * resolved both (ADR-851), and each turned out to be a live mismatch between the rail and the page
 * rather than a cosmetic difference:
 *
 *   admin-library  A Marketer reaches Loom Studio. The rail already advertised it to the `marketing`
 *                  staff domain, but the page guarded on `requireAdmin('janitor')` with no staff arm,
 *                  so a Marketer was shown the row and then redirected. The leaf gained the domain
 *                  and the page gained the staff arm.
 *   admin-spaces   Manage Spaces sits at janitor. The page already guarded on
 *                  `requireAdmin('janitor')`; the rail row advertised the looser `admin` plus a
 *                  platform-staff arm, so it promised access the page refused. The rail row now
 *                  matches the page.
 *
 * The list stays as a mechanism, not a habit. Adding a key here means "we have decided to live with
 * this difference"; the drift guard fails the build for any divergence NOT listed, so a new one
 * cannot land silently, and it also fails if a key listed here no longer diverges.
 */
export const KNOWN_GATE_DIVERGENCES: ReadonlySet<string> = new Set<string>()

/** `key` of the NAV_AREA whose href is a world landing page — the BOXES. */
function boxKeyByHref(): Map<string, string> {
  const out = new Map<string, string>()
  const worldHrefs = new Set(STUDIO_WORLDS.map((w) => normalizeAdminHref(w.href)))
  for (const area of NAV_AREAS) {
    const href = normalizeAdminHref(area.href)
    if (worldHrefs.has(href)) out.set(href, area.key)
  }
  return out
}

/** The StudioLeaf / world id backing a destination, for traceability in the drift guard. */
function leafIdForHref(href: string): string | null {
  const key = normalizeAdminHref(href)
  const world = STUDIO_WORLDS.find((w) => normalizeAdminHref(w.href) === key)
  if (world) return `world:${world.key}`
  const leaf = STUDIO_LEAVES.find((l) => normalizeAdminHref(l.href) === key)
  return leaf ? leaf.id : null
}

function buildAdminRail(): AdminRailEntry[] {
  const boxes = boxKeyByHref()
  return NAV_AREAS.filter((a) => a.section === ADMIN_SECTION).map((area: NavArea): AdminRailEntry => {
    const parentHref = adminParentHref(area.href)
    return {
      key: area.key,
      label: area.label,
      href: area.href,
      // A row nests only when its box is itself a rail row; otherwise it stays top level.
      parentKey: parentHref ? (boxes.get(parentHref) ?? null) : null,
      leafId: leafIdForHref(area.href),
      gate: {
        minAccess: area.defaultAccess,
        ...(area.staffDomain ? { staffDomain: area.staffDomain } : {}),
      },
    }
  })
}

/** THE operator rail, in NAV_AREAS declaration order. */
export const ADMIN_RAIL: readonly AdminRailEntry[] = buildAdminRail()

/** The rail rows that are BOXES (no parent). */
export const ADMIN_RAIL_BOXES: readonly AdminRailEntry[] = ADMIN_RAIL.filter((e) => e.parentKey == null)

/** The rows nested under `key`, in rail order. */
export function adminRailChildren(key: string): AdminRailEntry[] {
  return ADMIN_RAIL.filter((e) => e.parentKey === key)
}

/** Look a rail row up by its legacy key. */
export function adminRailEntry(key: string): AdminRailEntry | undefined {
  return ADMIN_RAIL.find((e) => e.key === key)
}
