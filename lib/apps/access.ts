// The ONE role resolver for the App contract (LP1 / ADR-498, docs/LOOM-PLATFORM.md §7). PURE — no IO.
// The server seam fills `AppViewer` once per request (community + Space worlds); this module only
// decides. Fail-closed end to end: an unknown gate, a missing predicate, a null viewer all deny.
//
//   view  = the App's own gate (`appGatePasses` below).
//   edit  = a higher app.manage bar (Layer 2/3/4 in The Loom), resolved by the caller, not here.
//   apply = the surface owner's manage capability, resolved by the caller.
//
// Every App's server action re-checks the SAME gate before mutating (capabilities are UX on the
// client, law on the server — docs/LOOM-PLATFORM.md §10).

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
      return viewer.isStaff === true
    default:
      return false // fail-closed for an unknown / malformed gate system
  }
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
