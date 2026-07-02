// Scope resolution for the standardized admin bar (LP4 / ADR-501, docs/LOOM-PLATFORM.md §5). Wraps
// `surfacesFor` over the App catalog so the admin bar's menu IS the App catalog, resolved for a
// concrete page scope (`adminScopeFor`) and viewer. PURE — no IO, no React.
//
//   • editor apps → EXACT scope-kind match (a manage module attaches to one entity kind), so
//     `appsForScope(scope, viewer, 'editor')` reproduces `modulesForScopeKind(kind, 'sidebar')`
//     for a viewer that holds the modules' gates (the LP4 behavior-preservation guarantee — see
//     for-scope.test.ts).
//   • page apps → a MOST-SPECIFIC-WINS route chain mirroring `moduleIdsForScope`: the entity
//     section set ('/circles/*') wins over the global default ('*'). This layers the route CHAIN
//     onto `surfacesFor`'s exact-key match (the seam access.ts left for LP4).
//
// The site-wide law (docs/LOOM-PLATFORM.md §5): the bar appears anywhere `appsForScope(scope,
// viewer)` is non-empty. NOTE (step B2, deferred): page apps self-gate ('none') and are placed via
// the layout editor, so runtime bar VISIBILITY still rides the settings panel's manager/operator
// gate; `showsAdminBar` is the resolver a later pass switches visibility onto once the viewer's
// per-scope capabilities are threaded into PageAdminProvider.

import { surfacesFor } from './access'
import { APPS } from './catalog'
import type { App, AppSurfaceKind, AppViewer } from './types'
import type { AdminScope } from '@/lib/layout/page-chrome'
import { moduleScopeChain } from '@/lib/widgets/modules'
import type { ScopeKind } from '@/lib/admin/modules/registry'

// A scope kind → its URL section, so a scope can address the page-app route sets keyed under
// ROUTE_MODULE_IDS ('/circles/*', '/events/*', …). 'global' addresses the default '*' set.
const SECTION_BY_KIND: Partial<Record<ScopeKind, string>> = {
  circle: 'circles',
  event: 'events',
  hub: 'hubs',
  nexus: 'nexuses',
  practice: 'practices',
  channel: 'channels',
  profile: 'people',
}

/** The most-specific-wins route-key chain for a scope (mirrors `moduleScopeChain`): the entity
 *  section then the global default; the operator `global` scope is just '*'. */
function routeChainForScope(scope: AdminScope): string[] {
  const section = SECTION_BY_KIND[scope.kind]
  return section ? moduleScopeChain(`/${section}/*`) : ['*']
}

/** The PAGE apps offered at a scope: the first route level in the chain that declares any (most-
 *  specific wins), mirroring `moduleIdsForScope`. */
function pageAppsForScope(scope: AdminScope, viewer: AppViewer): App[] {
  for (const key of routeChainForScope(scope)) {
    const hit = surfacesFor(APPS, { on: 'route', key }, viewer, 'page')
    if (hit.length) return hit
  }
  return []
}

/**
 * The Apps to present for a page `scope` (from `adminScopeFor`) and `viewer`, optionally narrowed
 * to one surface `kind`. Editor apps match the scope kind exactly; page apps resolve through a
 * most-specific-wins route chain. With no `kind`, returns the union an admin bar would offer — the
 * manage modules plus the page blocks. Fail-closed: a null scope or null/undefined viewer yields [].
 */
export function appsForScope(
  scope: AdminScope | null,
  viewer: AppViewer,
  kind?: AppSurfaceKind,
): App[] {
  if (!scope || !viewer) return []
  if (kind === 'page') return pageAppsForScope(scope, viewer)
  if (kind) return surfacesFor(APPS, { on: 'scopeKind', kind: scope.kind }, viewer, kind)
  return [
    ...surfacesFor(APPS, { on: 'scopeKind', kind: scope.kind }, viewer, 'editor'),
    ...pageAppsForScope(scope, viewer),
  ]
}

/** Whether the standardized admin bar appears for this (scope, viewer): the site-wide law is it
 *  shows iff there is at least one App to present here (docs/LOOM-PLATFORM.md §5). */
export function showsAdminBar(scope: AdminScope | null, viewer: AppViewer): boolean {
  return appsForScope(scope, viewer).length > 0
}
