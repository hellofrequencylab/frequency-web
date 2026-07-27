// The operator Admin rail, resolved from ONE reconciled source (ADR-850).
//
// Two catalogs describe the same operator destinations and neither knows about the other:
//
//   • `NAV_AREAS` (lib/nav-areas.ts)  — the rail rows. Carries the `key` that `area_permissions`,
//     `AREA_ICONS` and the `/admin/roles` grid are all keyed by, and the gate the rail enforces.
//   • `STUDIO_LEAVES` / `STUDIO_WORLDS` (lib/nav/studio.ts) — the same pages, carrying the `world`
//     each belongs to and the gate the SERVER enforces through `requireAdmin`.
//
// They overlap on eleven destinations, and on two of them THEY DISAGREE (see DIVERGENCES below).
// Nothing detected that until it was looked for, because no code reads both. This module is the
// join: one entry per rail row, naming its legacy key, its world parent, and ONE gate.
//
// THE GATE IS TAKEN FROM `NAV_AREAS`, VERBATIM, INCLUDING WHERE THE TWO DISAGREE. That is a
// deliberate choice and the reason this file changes no access at all: `NAV_AREAS` is what the rail
// enforces today, so sourcing from it means the reconciliation is a refactor rather than a security
// change. Where the catalogs conflict, the conflict is recorded below as data instead of being
// silently resolved by whichever file a future reader happens to open first.

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
 * The two destinations where `NAV_AREAS` and `STUDIO_LEAVES` disagree about who may reach the page.
 * Listed as DATA so the drift guard can distinguish "a known, accepted difference" from "someone
 * just introduced a new one". Resolving either is an access-control decision with a real population
 * behind it, not a refactor, so neither is resolved here.
 *
 *   admin-library  nav: janitor ∪ marketing staff   leaf: janitor, no staff arm
 *                  -> the nav row lets a Marketer reach Loom Studio; the leaf does not.
 *   admin-spaces   nav: admin ∪ platform staff      leaf: janitor, no staff arm
 *                  -> the nav row is BOTH looser (admin, not janitor) and wider (a platform staffer
 *                     qualifies) than the leaf. Note `registry.gate.test.ts` pins the nav side.
 */
export const KNOWN_GATE_DIVERGENCES: ReadonlySet<string> = new Set(['admin-library', 'admin-spaces'])

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
