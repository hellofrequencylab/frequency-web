// ── THE GATE CONTRACT: code owns permissions, the database owns presentation ──────────
//
// Owner decision, 2026-08-06 (docs/MENU-AUDIT-2026-08-06.md §4.2-§4.4). Every gate bug the
// audit found was the same bug: a `menu_items` row is allowed to state its own permissions,
// and nothing reads that data except the renderer. So they drifted, silently, in production:
//
//   • `Admin > Market` was seeded `min_access: 'visitor'` — every member saw an Admin group.
//   • SIX admin rows lost their `staff_domain`, which is one half of the ADR-390 union gate.
//     A staff-only operator (community token 'member') stopped seeing their own domains.
//   • `Journal` was seeded 'visitor' against a code default of 'member'.
//
// A drift guard would have caught those. It would not have PREVENTED them, and a gate you can
// still set wrongly is a gate you will set wrongly. So the gate stops being data.
//
// WHAT THIS MODULE DOES. `applyRegistryGates` walks a ResolvedMenu and, for every item and
// category whose href the canonical registry (lib/nav/registry.ts) knows, OVERWRITES
// minAccess / staffDomain / staffLevel / requiresOperatedSpaces with the registry's gate. The
// DB keeps everything an operator should actually control: order, grouping, label, icon,
// subheading, grid placement, mode (active/ghost/hidden), and role modes.
//
// It runs inside getMenu (lib/menus/read.ts), so EVERY surface — rail, header, footer, account
// menu, admin sub-nav — is covered by one call and no renderer has to remember.
//
// 🔴 THE UNKNOWN-HREF FLOOR. A row can point somewhere the registry does not declare; the live
// rail has one today (Business Seeder, `/admin/business-seeder`, which was never a NAV_AREA).
// Those keep their stored gate — that is the escape hatch that lets an operator add a page
// without a code change. It is also the hole an operator could fall through, so any unknown
// href under `/admin/` is FLOORED at 'admin'. An operator surface can never be seeded open to
// the public by accident, whether or not the registry has heard of it.
//
// Hidden is still hidden: this raises and lowers the ACCESS FLOOR only. It never touches `mode`,
// so an operator who hides a row keeps it hidden.

import { NAV_REGISTRY } from '@/lib/nav/registry'
import type { StaffDomain, Access } from '@/lib/core/staff-roles'
import type { MenuAccess, ResolvedCategory, ResolvedItem, ResolvedMenu } from './types'

/** The gate fields the registry owns. Anything else on a row stays the operator's. */
export type RegistryGate = {
  minAccess: MenuAccess
  staffDomain?: StaffDomain
  staffLevel?: Access
  requiresOperatedSpaces?: boolean
}

/** Strip query + fragment + a trailing slash so a row addressing a tab (`/admin/vera-ai?tab=x`)
 *  resolves to the same gate as the bare page. Mirrors normalizeAdminHref in lib/nav/admin-nesting
 *  deliberately: two normalizers that disagree would nest a row under one page and gate it as
 *  another. PURE. */
export function normalizeGateHref(href: string): string {
  const cut = href.search(/[?#]/)
  const base = cut === -1 ? href : href.slice(0, cut)
  return base.length > 1 && base.endsWith('/') ? base.slice(0, -1) : base
}

/** Is this an operator destination? Drives the unknown-href floor. */
function isOperatorHref(href: string): boolean {
  return href === '/admin' || href.startsWith('/admin/')
}

/** The floor an unknown operator href is held to. Never public, never a member surface. */
const UNKNOWN_OPERATOR_FLOOR: MenuAccess = 'admin'

// href -> gate, from every node the registry declares. FIRST declaration wins, matching how
// lib/nav/admin-nesting resolves the same kind of tie: several nodes can normalize onto one page
// (a world's landing and a leaf addressing it by tab), and registry declaration order is the
// answer every other reader of that catalog already uses.
function buildGateMap(): Map<string, RegistryGate> {
  const out = new Map<string, RegistryGate>()
  for (const node of NAV_REGISTRY) {
    const key = normalizeGateHref(node.href)
    if (out.has(key)) continue
    out.set(key, {
      minAccess: node.gate.minAccess,
      ...(node.gate.staffDomain ? { staffDomain: node.gate.staffDomain } : {}),
      ...(node.gate.staffLevel ? { staffLevel: node.gate.staffLevel } : {}),
      ...(node.gate.requiresOperatedSpaces ? { requiresOperatedSpaces: true } : {}),
    })
  }
  return out
}

/** Every gate the registry declares, keyed by normalized href. Computed once at module load
 *  (the registry is static), so resolving a menu costs a map lookup per row. */
export const REGISTRY_GATES: ReadonlyMap<string, RegistryGate> = buildGateMap()

/** The gate for one href: the registry's if it knows the page, else null (the caller keeps the
 *  stored gate, subject to the operator floor). Exported for the drift test. PURE. */
export function registryGateFor(href: string): RegistryGate | null {
  return REGISTRY_GATES.get(normalizeGateHref(href)) ?? null
}

/** Rewrite ONE item's gate. Returns the same object when nothing changes, so an unseeded
 *  (code-default) menu allocates nothing — its gates already came from the registry. */
function gateItem(item: ResolvedItem): ResolvedItem {
  const gate = registryGateFor(item.href)
  if (gate) {
    if (
      item.minAccess === gate.minAccess &&
      item.staffDomain === gate.staffDomain &&
      item.staffLevel === gate.staffLevel &&
      !!item.requiresOperatedSpaces === !!gate.requiresOperatedSpaces
    ) {
      return item
    }
    return {
      ...item,
      minAccess: gate.minAccess,
      staffDomain: gate.staffDomain,
      staffLevel: gate.staffLevel,
      requiresOperatedSpaces: gate.requiresOperatedSpaces,
    }
  }
  // Unknown href. Keep the operator's stored gate, but never below the floor for an operator
  // surface — a row nobody declared must not be the one that opens /admin to the public.
  if (isOperatorHref(normalizeGateHref(item.href)) && item.minAccess !== UNKNOWN_OPERATOR_FLOOR) {
    const raised = raiseFloor(item.minAccess)
    if (raised !== item.minAccess) return { ...item, minAccess: raised }
  }
  return item
}

// The MenuAccess ladder, lowest to highest. Local to keep this module free of a render-layer
// import (components/layout/menu-role owns the same order for the renderer).
const LADDER: readonly MenuAccess[] = [
  'visitor', 'member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor',
]

/** Raise an access floor to at least UNKNOWN_OPERATOR_FLOOR. A row already at or above it
 *  (e.g. a janitor-only tool) keeps its own, stricter floor. PURE. */
function raiseFloor(current: MenuAccess): MenuAccess {
  const have = LADDER.indexOf(current)
  const need = LADDER.indexOf(UNKNOWN_OPERATOR_FLOOR)
  return have >= need ? current : UNKNOWN_OPERATOR_FLOOR
}

/** A category's own gate is DERIVED, never stored: it is the LOWEST floor among the items it
 *  can show (its own plus every descendant's), so a labelled group can never advertise itself
 *  to someone who cannot reach a single row inside it.
 *
 *  This is the structural answer to the "ADMIN group with one visitor row" bug: with the item
 *  gates corrected above, the group's floor follows them automatically and there is no second
 *  number for an operator to set wrongly. A category with no items at all keeps its stored
 *  floor (nothing to derive from). */
function gateCategory(cat: ResolvedCategory): ResolvedCategory {
  const items = cat.items.map(gateItem)
  const children = cat.children.map(gateCategory)

  const floors: MenuAccess[] = [
    ...items.map((i) => i.minAccess),
    ...children.map((c) => c.minAccess ?? 'visitor'),
  ]
  const derived = floors.length > 0
    ? floors.reduce((lo, f) => (LADDER.indexOf(f) < LADDER.indexOf(lo) ? f : lo))
    : cat.minAccess

  // The staff axis is a UNION, so a group is reachable via staff if ANY row inside it is. Carry
  // the first such domain up so canSeeMenuEl can admit a staff-only operator to the header their
  // own row lives under. (One domain, not a set: the gate type takes one, and the item's own
  // gate is what actually admits the row.)
  const staffDomain =
    items.find((i) => i.staffDomain)?.staffDomain ?? children.find((c) => c.staffDomain)?.staffDomain

  return { ...cat, items, children, minAccess: derived, staffDomain }
}

/**
 * Re-derive every gate in a resolved menu from the canonical registry.
 *
 * Call this on ANY ResolvedMenu before it reaches a renderer. It is idempotent and total: a
 * code-default menu passes through unchanged (its gates already came from the registry), and a
 * DB-backed menu comes out with the registry's permissions and the operator's presentation.
 */
export function applyRegistryGates(menu: ResolvedMenu): ResolvedMenu {
  return {
    ...menu,
    categories: menu.categories.map(gateCategory),
    rootItems: menu.rootItems.map(gateItem),
  }
}
