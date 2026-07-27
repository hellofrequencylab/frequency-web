// The ONE role resolver for the App contract (LP1 / ADR-502, docs/LOOM-PLATFORM.md §7). PURE — no IO.
// The server seam fills `AppViewer` once per request (community + Space worlds); this module only
// decides. Fail-closed end to end: an unknown gate, a missing predicate, a null viewer all deny.
//
//   view  = the App's own gate (`appGatePasses` below).
//   edit  = a higher app.manage bar (Layer 2/3/4 in The Loom), resolved by the caller, not here.
//   apply = the surface owner's manage capability, resolved by the caller.
//
// Every App's server action re-checks the SAME gate before mutating (capabilities are UX on the
// client, law on the server — docs/LOOM-PLATFORM.md §10).

import { meetsAccess, meetsStaff } from '@/lib/nav-areas'
import { staffCan, type StaffDomain } from '@/lib/core/staff-roles'
import { isJanitor, isStaff } from '@/lib/core/roles'
import type { App, AppGate, AppScope, AppScopeQuery, AppSurfaceKind, AppViewer } from './types'

/**
 * Does `viewer` pass `gate`? Fail-closed: a `spaceFunction` gate with no `canUseSpaceFn` predicate,
 * a `staff` gate with `isStaff` unset, and any unknown gate system all return false.
 */
export function appGatePasses(gate: AppGate, viewer: AppViewer): boolean {
  if (!viewer) return false
  switch (gate.system) {
    case 'none':
      return true
    case 'capability':
      return viewer.caps.has(gate.capability)
    case 'spaceFunction':
      return viewer.canUseSpaceFn?.(gate.fn) ?? false // fail-closed: no predicate ⇒ deny
    case 'staff':
      // `domain` was DECLARED on this gate from the start and never read, so a domain-narrowed
      // staff gate silently degraded to "any staff at all" — the resolver granted MORE than the
      // catalog said. Honor it: a gate naming a domain now requires that capability (read level,
      // matching nav surfacing), and one naming none keeps the plain platform-staff meaning.
      if (!viewer.isStaff) return false
      if (!gate.domain) return true
      return staffCan(viewer.staffRole ?? null, gate.domain as StaffDomain, 'read')
    case 'role':
      return rolePasses(gate, viewer)
    default:
      return false // fail-closed for an unknown / malformed gate system
  }
}

/**
 * The PLATFORM nav axis (ADR-848). A DELIBERATE line-for-line mirror of `canSee`
 * (lib/nav/registry.ts), which is itself the mirror of nav-areas' meetsAccess + meetsStaff pair —
 * so moving where an operator nav gate is DECLARED never changes what it PERMITS. Three rules, in
 * this order, and the order matters:
 *
 *   1. `requiresOperatedSpaces` is a DATA predicate and a HARD VETO, evaluated first. Unlike the two
 *      axes below it does not union in — a viewer who runs no Space is hidden even when their role
 *      or staff capability would otherwise reveal the row.
 *   2. The role floor and the staff capability UNION: EITHER admits. This is the one gate system
 *      here with union semantics, and it is why a Marketer with no community standing still reaches
 *      the Growth surfaces while a host with no staff row reaches them by role.
 *   3. `staffLevel: 'write'` makes the staff arm STRICTER (write, not read). Nav surfacing is
 *      read-level by default, matching nav-areas; a row that opts into write is honored at write.
 *
 * Fail-closed throughout: an absent role reads as a visitor, an absent staffRole never admits.
 */
function rolePasses(gate: Extract<AppGate, { system: 'role' }>, viewer: AppViewer): boolean {
  if (gate.requiresOperatedSpaces && viewer.operatesSpaces !== true) return false
  const role = viewer.role ?? null
  // WHICH ladder the floor is measured against, stated by the gate rather than inferred from the
  // token (see AppGate.axis). `web` reproduces lib/admin/guard.ts::meetsMin: 'janitor' means the
  // Executive Admin rung of `web_role`, 'admin' means any platform staff, and anything lower has no
  // web meaning at all so it falls through to the community ladder.
  const webRole = viewer.webRole ?? 'none'
  const floor =
    gate.axis === 'web'
      ? gate.minAccess === 'janitor'
        ? isJanitor(webRole)
        : gate.minAccess === 'admin'
          ? isStaff(webRole)
          : meetsAccess(gate.minAccess, role)
      : meetsAccess(gate.minAccess, role)
  const staffRole = viewer.staffRole ?? null
  if (gate.staffLevel === 'write' && gate.staffDomain) {
    return floor || (staffRole != null && staffCan(staffRole, gate.staffDomain, 'write'))
  }
  return floor || meetsStaff({ staffDomain: gate.staffDomain }, staffRole)
}

/** Whether an App's declared placement `s` satisfies a concrete scope `query`. */
function scopeMatches(s: AppScope, query: AppScopeQuery): boolean {
  switch (query.on) {
    case 'scopeKind':
      return s.on === 'scopeKind' && s.kind === query.kind
    case 'route':
      // LP1: exact key match (the honest minimal seam). The most-specific-wins scope CHAIN that
      // mirrors moduleIdsForScope is layered on at LP4 (the standardized admin bar).
      return s.on === 'route' && s.key === query.key
    case 'spaceType':
      return s.on === 'spaceType' && (s.type === '*' || s.type === query.type)
    case 'library':
      return s.on === 'library'
    default:
      return false
  }
}

/**
 * The Apps to present for a concrete `scope` and `viewer`, optionally narrowed to one surface `kind`.
 * An App qualifies when (a) it declares a placement matching `scope`, (b) its gate passes for the
 * viewer, and (c) — when `kind` is given — it presents that surface. Preserves catalog order (the
 * catalog seeds editor Apps in AdminModule order and page Apps in LAYOUT_MODULES order, so per-scope
 * order already mirrors the source registries). Fail-closed: a null/undefined viewer yields [].
 *
 * With `kind: 'editor'` on a `scopeKind` query this reproduces `modulesFor(scope, caps)` exactly (the
 * gate-parity guarantee — docs/LOOM-PLATFORM.md §7); map the result through `toAdminModule` to compare.
 */
export function surfacesFor(
  apps: readonly App[],
  scope: AppScopeQuery,
  viewer: AppViewer,
  kind?: AppSurfaceKind,
): App[] {
  if (!viewer) return []
  return apps.filter(
    (a) =>
      a.scopes.some((s) => scopeMatches(s, scope)) &&
      appGatePasses(a.gate, viewer) &&
      (kind === undefined || a.surfaces[kind] != null),
  )
}
