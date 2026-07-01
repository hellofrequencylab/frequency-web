// The canonical navigation registry (docs/NAV-SYSTEM-REDESIGN.md §3, §5) — the ONE
// place every destination is declared, and the ONE resolver every surface gates with.
//
// PHASE 1 (strangler-fig, backward-compatible): the registry is BUILT FROM the existing
// composed rail list (lib/nav-areas.ts::NAV_AREAS) so there is a SINGLE underlying source
// of truth and the site renders identically. Each current member rail area — base areas
// AND the vertical-contributed ones (Marketplace, Housing, Makers, Shop) — becomes one
// `mode: 'calm'` NavNode, preserving exact order, label, href, icon (the area key),
// section (as `parent`), and the exact two-axis gate. The Studio (operator) sub-tree
// that folds ADMIN_NAV + ADMIN_GROUPS comes in the NEXT stage; nothing here declares it.
//
// canSee() is the one gate resolver: it UNIONS the trust-ladder floor with the staff
// capability, mirroring lib/nav-areas.ts::meetsAccess + meetsStaff EXACTLY (nav gating
// is a READ-level unlock). Every surface collapses onto this single function.

import { NAV_AREAS, meetsAccess, meetsStaff, type NavArea } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/core/roles'
import { staffCan, type StaffRole } from '@/lib/core/staff-roles'
import type { MenuAccess } from '@/lib/menus/types'
import { STUDIO_WORLDS, STUDIO_LEAVES, type StudioWorld, type StudioLeaf } from './studio'
import type { NavNode, NavSurface, NavMode } from './types'

/** Project one existing rail area (calm spine) into its canonical NavNode. The area's
 *  `key` is the node id AND its icon key (AREA_ICONS is keyed by area key), its `section`
 *  becomes the node's `parent` (null section = the headerless home anchor, no parent), and
 *  its two-axis gate (defaultAccess + staffDomain) carries over UNCHANGED. `previewBelowAccess`
 *  areas (the Vault) project as `ghost` so the muted-preview intent survives the move. */
function nodeFromArea(area: NavArea): NavNode {
  return {
    id: area.key,
    label: area.label,
    href: area.href,
    icon: area.key,
    parent: area.section ?? undefined,
    mode: 'calm',
    // Member rail areas are the desktop rail / mobile bar spine, and every visible
    // destination is reachable from ⌘K — so calm spine nodes project onto both.
    surfaces: ['spine', 'palette'],
    // `defaultAccess` is NavAccess ('visitor' | CommunityRole) which is structurally the
    // MenuAccess enum; staffLevel is omitted so canSee defaults to 'read' (== meetsStaff).
    gate: {
      minAccess: area.defaultAccess as MenuAccess,
      ...(area.staffDomain ? { staffDomain: area.staffDomain } : {}),
    },
    ...(area.previewBelowAccess ? { display: 'ghost' as const } : {}),
  }
}

// ── Studio (operator) sub-tree → mode:'studio' nodes (NAV-SYSTEM-REDESIGN §5b) ──────
// The five approved Studio worlds are the top-level (parentless) studio spine nodes; each
// §5b sub-page leaf projects as a studio node whose `parent` is its world's label. The
// two legacy admin catalogs (lib/admin/nav.ts, app/(main)/admin/sections.ts) derive from
// the SAME lib/nav/studio.ts source, so there is one operator IA and no drift.

/** A Studio world (Overview · Community · Growth · Content · Platform) as a top-level
 *  studio spine node — the left-rail category the sub-nav + dashboards hang off. */
function nodeFromWorld(world: StudioWorld): NavNode {
  return {
    id: `studio:${world.key}`,
    label: world.label,
    href: world.href,
    icon: world.icon,
    blurb: world.blurb,
    mode: 'studio',
    // Studio worlds are the operator spine; every operator destination is ⌘K-reachable.
    surfaces: ['spine', 'palette'],
    gate: {
      minAccess: world.min as MenuAccess,
      ...(world.staffDomain ? { staffDomain: world.staffDomain } : {}),
    },
  }
}

/** A Studio leaf that belongs to one of the five §5b worlds → a studio node parented on
 *  that world. Leaves without a `world` are legacy-only (they ride the derived admin
 *  catalogs, not the new five-world spine) and are NOT projected onto the registry. Its
 *  gate carries over UNCHANGED (min + staffDomain + staffLevel). */
function nodeFromLeaf(leaf: StudioLeaf, world: StudioWorld): NavNode {
  return {
    id: `studio:${leaf.id}`,
    label: leaf.worldLabel ?? leaf.label,
    href: leaf.href,
    icon: leaf.icon,
    blurb: leaf.desc,
    parent: world.label,
    mode: 'studio',
    surfaces: ['sub', 'palette'],
    gate: {
      minAccess: leaf.min as MenuAccess,
      ...(leaf.staffDomain ? { staffDomain: leaf.staffDomain } : {}),
      ...(leaf.staffLevel ? { staffLevel: leaf.staffLevel } : {}),
    },
  }
}

/** The Studio sub-tree as registry nodes: each world, immediately followed by its §5b
 *  sub-pages (in world order), so the registry reads top-to-bottom like the rail. */
function studioNodes(): NavNode[] {
  const worldByKey = new Map(STUDIO_WORLDS.map((w) => [w.key, w]))
  const out: NavNode[] = []
  for (const world of STUDIO_WORLDS) {
    out.push(nodeFromWorld(world))
    const leaves = STUDIO_LEAVES
      .filter((l) => l.world === world.key)
      .sort((a, b) => (a.worldOrder ?? 0) - (b.worldOrder ?? 0))
    for (const leaf of leaves) out.push(nodeFromLeaf(leaf, world))
  }
  // Defensive: a leaf naming an unknown world is skipped above (worldByKey guards intent).
  void worldByKey
  return out
}

/** THE canonical registry: every current member rail destination as a calm-mode node
 *  (exact composed order: base spine + vertical placements), then the five-world Studio
 *  sub-tree as studio-mode nodes. Computed once at module load, like NAV_AREAS. */
export const NAV_REGISTRY: readonly NavNode[] = [
  ...NAV_AREAS.map(nodeFromArea),
  ...studioNodes(),
]

/** The one viewer identity every surface gates against — the two axes (ADR-208): the
 *  community trust ladder (`role`) + the coarse/fine staff axis (`webRole` reserved for
 *  the Studio stage; `staffRole` is the capability axis meetsStaff reads). `webRole` is
 *  accepted now so callers keep a stable shape as the Studio nodes land. */
export type NavViewer = {
  role: CommunityRole | null
  /** The coarse web_role floor (reserved for Studio nodes; unused by calm gating today). */
  webRole?: 'none' | 'admin' | 'janitor' | null
  staffRole: StaffRole | null
}

/**
 * THE gate resolver (NAV-SYSTEM-REDESIGN §3). A node shows if EITHER the trust-ladder
 * floor admits the viewer OR the staff capability grants the node's domain — the exact
 * union lib/nav-areas.ts applies (meetsAccess ∪ meetsStaff). Read-level is enough to
 * SURFACE nav (a leaf still gates its own writes); `staffLevel` (default 'read') lets a
 * future node demand write. Moving where a gate lives, never what it permits.
 */
export function canSee(node: NavNode, viewer: NavViewer): boolean {
  const floor = meetsAccess(node.gate.minAccess, viewer.role)
  const staff = meetsStaff(
    { staffDomain: node.gate.staffDomain },
    viewer.staffRole,
  )
  // meetsStaff checks 'read'; nav surfacing is read-level, matching nav-areas exactly.
  // A node that opts into staffLevel:'write' is stricter — honor it at write level. No
  // calm node uses this today; it keeps the resolver honest for future Studio nodes.
  if (node.gate.staffLevel === 'write' && node.gate.staffDomain) {
    return floor || (viewer.staffRole != null && staffCan(viewer.staffRole, node.gate.staffDomain, 'write'))
  }
  return floor || staff
}

// ── Projection helpers (§3: every surface is a filtered projection) ──────────────────

/** Nodes that project onto `surface`, in registry order. */
export function nodesForSurface(surface: NavSurface): NavNode[] {
  return NAV_REGISTRY.filter((n) => n.surfaces.includes(surface))
}

/** Nodes belonging to `mode`'s spine (calm = member app, studio = operator workspace). */
export function nodesForMode(mode: NavMode): NavNode[] {
  return NAV_REGISTRY.filter((n) => n.mode === mode)
}

/** Direct children of a `parent` (section label), in registry order. A null/undefined
 *  parent returns the headerless home-anchor nodes (section-less spine). */
export function childrenOf(parent: string | null | undefined): NavNode[] {
  const key = parent ?? undefined
  return NAV_REGISTRY.filter((n) => n.parent === key)
}
