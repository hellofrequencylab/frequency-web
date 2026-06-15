// The VERTICAL registry — the single place a capability-vertical (Marketplace, Store,
// Practitioners, …) declares its whole surface so the core never edits to add one
// (ADR-248/250, docs/EXPANSION-FRAMEWORK.md). A vertical is one descriptor; this file
// composes the registered descriptors into selectors the core seams read.
//
// Module capabilities live in their OWN namespaced string space ('market.listing.create')
// and a vertical's OWN scope kind ('market'); they do NOT extend the core Capability/Scope
// unions in lib/core/capabilities.ts, which stay pure and closed for the built-in scopes.
// The descriptors are imported here statically (no runtime registration side-effects), so
// the registry is deterministic regardless of import order.

import type { NavArea } from '@/lib/nav-areas'
import type { AdminModule } from '@/lib/admin/modules/registry'
import type { Viewer } from '@/lib/core/capabilities'
import { market } from './market'

/** A vertical's own scope (its kind + whatever ids/state its resolver needs). */
export interface ModuleScope {
  /** The vertical's scope kind, e.g. 'market'. */
  kind: string
  [key: string]: unknown
}

/** Resolves a vertical's namespaced capabilities for the viewer in one of its scopes. */
export type ModuleCapabilityResolver = (viewer: Viewer, scope: ModuleScope) => Set<string>

/** A nav area plus where to place it. `after` names the nav key it follows so the area
 *  lands in its exact spot — the shell groups nav by *consecutive* section runs, so a
 *  vertical's area must sit inside its section's run, not be appended to the end. */
export interface NavPlacement {
  area: NavArea
  /** Insert immediately after this nav key; omitted ⇒ appended (end of the list). */
  after?: string
}

/** A right-rail rule a vertical owns: which of its routes show which panel keys. The keys are
 *  bound in components/sidebar/rail-registry.tsx (and unknown keys are skipped at render), so a
 *  vertical reuses existing panels here, or registers its own panel there. Mirrors the base map
 *  in lib/layout/rail-panels.ts, but composed from the registry (ADR-250 step 2 / ADR-278). */
export interface RailRule {
  /** Matches the routes this rule governs. */
  test: (path: string) => boolean
  /** Panel keys to show, in order (PanelKey strings; unknown keys are skipped at render). */
  panels: readonly string[]
}

/** The full declaration of a vertical — its entire public surface. */
export interface Vertical {
  /** Stable id, also the capability/table namespace ('market', 'store', …). */
  id: string
  /** Money partition for this vertical's commerce, if any (PLATFORM-VISION §1). */
  entity: 'foundation' | 'labs' | 'partner' | 'shared'
  /** Left-nav area(s) this vertical contributes, with placement. */
  nav?: readonly NavPlacement[]
  /** Admin-dock modules this vertical contributes (merged into the admin registry). */
  adminModules?: readonly AdminModule[]
  /** Right-rail rules for this vertical's routes (composed before the base map). */
  rail?: readonly RailRule[]
  /** Capability resolvers for this vertical's own scope kind(s). */
  capabilities?: readonly { scopeKind: string; resolve: ModuleCapabilityResolver }[]
  /** Engagement source declaration (ENGAGEMENT-ARCHITECTURE, ADR-247) — wired in step 5. */
  engagement?: { source: string; eventTypes: readonly string[] }
}

/** Every registered vertical. Add a vertical = import its descriptor and add it here. */
export const VERTICALS: readonly Vertical[] = [market]

export function verticalById(id: string): Vertical | undefined {
  return VERTICALS.find((v) => v.id === id)
}

/** All vertical-contributed nav placements (area + where it goes). nav-areas.ts composes
 *  these into NAV_AREAS, so the descriptor is the single source of a vertical's nav. */
export function verticalNavPlacements(): NavPlacement[] {
  return VERTICALS.flatMap((v) => (v.nav ? [...v.nav] : []))
}

/** Just the nav areas (placement dropped) — for consumers that only need the areas. */
export function verticalNavAreas(): NavArea[] {
  return verticalNavPlacements().map((p) => p.area)
}

/** All vertical-contributed admin modules (mergeable into the admin registry by scope). */
export function verticalAdminModules(): AdminModule[] {
  return VERTICALS.flatMap((v) => (v.adminModules ? [...v.adminModules] : []))
}

/** All vertical-contributed right-rail rules, in registry order. lib/layout/rail-panels.ts
 *  consults these BEFORE its base rules, so a vertical owns its own routes' rail (ADR-278). */
export function verticalRailRules(): RailRule[] {
  return VERTICALS.flatMap((v) => (v.rail ? [...v.rail] : []))
}

/** The viewer's namespaced capabilities within a vertical scope, unioned across verticals. */
export function resolveVerticalCapabilities(viewer: Viewer, scope: ModuleScope): Set<string> {
  const out = new Set<string>()
  for (const v of VERTICALS) {
    for (const c of v.capabilities ?? []) {
      if (c.scopeKind !== scope.kind) continue
      for (const cap of c.resolve(viewer, scope)) out.add(cap)
    }
  }
  return out
}
