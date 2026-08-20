// The operator Admin rail's BOX SHAPE, derived (ADR-848).
//
// The left rail's "Admin" section renders thirteen flat rows: Dashboard, Leadership, Programs,
// Growth, Community, Resonance CRM, Marketplace, Manage Spaces, Business Seeder, Vera AI,
// Operations, QR Studio, Loom Studio. That is a list of everything the platform can do rather than
// a map of what an operator runs, the same drift ADR-846 fixed on the Space menu.
//
// NOTHING NEW IS DECLARED HERE. Every one of those destinations is already a `StudioLeaf`
// (lib/nav/studio.ts) carrying the `world` it belongs to, and the five `STUDIO_WORLDS` already name
// their own landing page. So the nesting is a JOIN over data the repo already holds:
//
//     Dashboard   = the `overview` world   (/admin)
//     Community   = the `community` world  (/admin/community)
//     Growth      = the `growth` world     (/admin/growth)      <- QR Studio, Resonance CRM
//     Programs    = the `content` world    (/admin/programs)    <- Loom Studio
//     Operations  = the `platform` world   (/admin/operations)  <- Manage Spaces, Marketplace,
//                                                                  Vera AI, Business Seeder
//     Leadership  = no world; stays a top-level row of its own.
//
// Thirteen rows become six boxes, and not one parent is a judgement call: each is the world its own
// leaf already declared.
//
// TEST-ONLY: nothing at runtime reads this module — the shell's rail render retired the nesting pass
// (it re-sorted rows against the Menu Manager's order; see app-shell.tsx). It survives as a
// drift-guard/test-only record of the ADR-848/850 derivation, consumed by lib/nav/admin-rail.ts
// (itself test-only), admin-nesting.test.ts, and space-rail-coverage.test.ts.
//
// KEYED BY HREF, not by nav key, on purpose. The live rail is DB-backed (lib/menus): its rows are
// `menu_items` whose `id` is a database uuid and which may include destinations that were never
// NAV_AREAS entries at all (Business Seeder is exactly that). The href is the one identifier both
// the code catalog and a DB row share, so a map keyed on it nests both paths with no reseed.

import { STUDIO_LEAVES, STUDIO_WORLDS, type StudioWorldKey } from './studio'

/** Drop the query + fragment: a leaf may address a tab (`/admin/vera-ai?tab=vera`) while the rail
 *  row points at the bare page (`/admin/vera-ai`). Both must resolve to the same box. */
export function normalizeAdminHref(href: string): string {
  const cut = href.search(/[?#]/)
  const base = cut === -1 ? href : href.slice(0, cut)
  // Trailing slash carries no meaning here and would split a box from its own children.
  return base.length > 1 && base.endsWith('/') ? base.slice(0, -1) : base
}

const WORLD_HREF: Record<StudioWorldKey, string> = Object.fromEntries(
  STUDIO_WORLDS.map((w) => [w.key, normalizeAdminHref(w.href)]),
) as Record<StudioWorldKey, string>

/** The normalized href of every world landing page — the BOXES. A row at one of these is a box and
 *  is never itself nested, even if a leaf claims it as a child. */
export const ADMIN_BOX_HREFS: ReadonlySet<string> = new Set(Object.values(WORLD_HREF))

function buildParentMap(): Map<string, string> {
  const out = new Map<string, string>()
  for (const leaf of STUDIO_LEAVES) {
    if (!leaf.world) continue
    const child = normalizeAdminHref(leaf.href)
    const parent = WORLD_HREF[leaf.world]
    if (!parent || child === parent) continue // a world's own landing page is the box, not a child
    if (ADMIN_BOX_HREFS.has(child)) continue // never nest one box under another
    // FIRST DECLARATION WINS. Several leaves can normalize onto one page when they address it by
    // tab (`/admin/vera-ai?tab=…`); studio.ts declaration order decides, matching how every other
    // reader of that catalog resolves a tie.
    if (!out.has(child)) out.set(child, parent)
  }
  return out
}

/** child href -> its box's href, for every operator destination that declares a world. */
export const ADMIN_PARENT_BY_HREF: ReadonlyMap<string, string> = buildParentMap()

/**
 * The box a rail row belongs under, or null when it is a box itself or has no world.
 * Total and fail-safe: an unknown href simply has no parent and renders flat.
 */
export function adminParentHref(href: string): string | null {
  const key = normalizeAdminHref(href)
  if (ADMIN_BOX_HREFS.has(key)) return null
  return ADMIN_PARENT_BY_HREF.get(key) ?? null
}

/** One rail row, reduced to what the nesting pass needs. */
export type NestableRow = { href: string }

/**
 * Order rows so each box is immediately followed by its own children at depth 1, preserving the
 * incoming order of boxes and of children within a box.
 *
 * FAIL-SAFE, and this is the whole contract: a row is only nested when its parent is PRESENT in the
 * same list. The Admin section telescopes — rows the viewer cannot reach are filtered out before
 * this runs — so a child whose box was gated away would otherwise vanish with it. Instead it keeps
 * its own position at depth 0. Nothing is ever dropped or duplicated: the output is a permutation
 * of the input.
 */
export function nestAdminRows<T extends NestableRow>(rows: readonly T[]): (T & { depth: number })[] {
  const present = new Set(rows.map((r) => normalizeAdminHref(r.href)))
  const childrenOf = new Map<string, T[]>()
  for (const row of rows) {
    const parent = adminParentHref(row.href)
    if (!parent || !present.has(parent)) continue
    const list = childrenOf.get(parent)
    if (list) list.push(row)
    else childrenOf.set(parent, [row])
  }

  const out: (T & { depth: number })[] = []
  const emitted = new Set<T>()
  for (const row of rows) {
    if (emitted.has(row)) continue
    const parent = adminParentHref(row.href)
    // A row whose parent is present is emitted by that parent, not here.
    if (parent && present.has(parent)) continue
    out.push({ ...row, depth: 0 })
    emitted.add(row)
    for (const child of childrenOf.get(normalizeAdminHref(row.href)) ?? []) {
      if (emitted.has(child)) continue
      out.push({ ...child, depth: 1 })
      emitted.add(child)
    }
  }
  // Belt and braces: anything the walk did not reach (a cycle in the data, a duplicate href) still
  // renders, flat, in its original position rather than disappearing from the rail.
  for (const row of rows) {
    if (!emitted.has(row)) {
      out.push({ ...row, depth: 0 })
      emitted.add(row)
    }
  }
  return out
}
