// Scope resolution for the standardized admin bar (LP4 / ADR-503, docs/LOOM-PLATFORM.md §5). Wraps
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

import { appGatePasses, isSpineApp, surfacesFor } from './access'
import { APPS } from './catalog'
import type { App, AppGate, AppSurfaceKind, AppViewer } from './types'
import type { AdminScope } from '@/lib/layout/page-chrome'
import { moduleScopeChain } from '@/lib/widgets/modules'
import type { ScopeKind } from '@/lib/admin/modules/registry'
import { tierForApp } from '@/lib/admin/modules/spine'
import { isAdvancedModuleId } from '@/lib/admin/modules/space-modules'
import { loadAppOverrides, mergeAppOverrides, effectiveMinRole, scopeKeyFor } from './overrides'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

// A scope kind → its URL section, so a scope can address the page-app route sets keyed under
// ROUTE_MODULE_IDS ('/circles/*', '/events/*', …). 'global' addresses the default '*' set.
const SECTION_BY_KIND: Partial<Record<ScopeKind, string>> = {
  circle: 'circles',
  event: 'events',
  hub: 'hubs',
  nexus: 'nexuses',
  practice: 'practices',
  channel: 'channels',
  journey: 'journeys',
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
 * Apply the owner's Module Manager overrides (spaces.preferences.moduleMenu — `hidden` + `order`, ADR-546b
 * P3b) to the resolved SPACE editor Apps, so hiding / reordering a module in the Module Manager takes
 * effect in the RAIL exactly as it does in the /manage console. SPACE-only (`appsForScope` calls it on the
 * space branch; every other scope is untouched). PURE + fail-safe:
 *   - No menu (or an untyped/other scope) ⇒ the input, byte-for-byte.
 *   - HIDDEN: drop any app whose id the owner hid.
 *   - ORDER: reassign each surviving app's within-band `priority` from its OWN band's priority slots — the
 *     band keyed by the SAME (tier, slot) the rail groups by (groupIntoTiers) — sequenced by the owner's
 *     order. So the DEFAULT catalog order maps priorities back to themselves (the rail is unchanged), and
 *     only a genuine reorder permutes a band. The returned list is also owner-ordered, so the bottom bank
 *     (which follows list order) reflects the owner's reach / growth order too.
 * The feature ON/OFF gate is NOT re-applied here (the viewer's `canUseSpaceFn` already dropped a disabled
 * service upstream), and no gate is weakened — hidden/order are pure presentation.
 */
function applySpaceModuleMenu(apps: App[], menu?: AdminScope['moduleMenu']): App[] {
  if (!menu) return apps
  // Progressive disclosure (ADR-796): collapse an ADVANCED module from the rail unless it's activated —
  // the SAME rule the /manage console applies (spaceModuleManifest), so both surfaces stay consistent. A
  // NULL activated (undefined) means "no override" → no collapse, keeping the rail↔console parity guard
  // (for-scope.test.ts, which passes no `activated`) green; a supplied list collapses advanced not in it.
  const activated = menu.activated ? new Set(menu.activated) : null
  const afterAdvanced =
    activated === null ? apps : apps.filter((a) => !isAdvancedModuleId(a.id) || activated.has(a.id))
  const hidden = menu.hidden && menu.hidden.length ? new Set(menu.hidden) : null
  const visible = hidden ? afterAdvanced.filter((a) => !hidden.has(a.id)) : afterAdvanced
  const order = menu.order ?? []
  if (order.length === 0) return visible
  const rankOf = (id: string): number => {
    const i = order.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  // Group survivors by the rail's (tier, slot) band, then re-sequence each band's own priority slots by
  // the owner order — leaving the default order an identity map (byte-identical rail) while a reorder
  // permutes only within its band.
  const bands = new Map<string, App[]>()
  for (const a of visible) {
    // No editor surface, or the operator nav lane (ADR-848) which carries no spine slot: neither is
    // drawn in the rail body, so neither belongs in a band.
    if (!a.surfaces.editor || !isSpineApp(a)) continue
    const band = `${tierForApp({ category: a.category, tier: a.surfaces.editor.tier })}\x00${a.category}`
    const list = bands.get(band)
    if (list) list.push(a)
    else bands.set(band, [a])
  }
  const nextPriority = new Map<string, number>()
  for (const band of bands.values()) {
    const slots = band
      .map((a) => a.surfaces.editor?.priority ?? a.surfaces.editor?.order ?? 0)
      .sort((x, y) => x - y)
    band
      .slice()
      .sort((a, b) => {
        const ra = rankOf(a.id)
        const rb = rankOf(b.id)
        if (ra !== rb) return ra - rb
        return (a.surfaces.editor?.priority ?? 0) - (b.surfaces.editor?.priority ?? 0)
      })
      .forEach((a, i) => nextPriority.set(a.id, slots[i]))
  }
  return visible
    .map((a) => {
      const p = nextPriority.get(a.id)
      return p != null && a.surfaces.editor
        ? { ...a, surfaces: { ...a.surfaces, editor: { ...a.surfaces.editor, priority: p } } }
        : a
    })
    .sort((a, b) => rankOf(a.id) - rankOf(b.id))
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
  // A Space profile resolves its EDITOR apps by `{ on:'spaceType', type }` (Space authority is SpaceRole +
  // spaceFunctionAccess, carried on the viewer's `canUseSpaceFn`, never a Capability). It has no layout-
  // module page blocks, so a `page` query is empty and the default (no kind) is editor-only. The Space's
  // `type` rides on the scope (the Customize trigger sets it; a path-derived Space scope omits it, so an
  // untyped Space scope resolves nothing — the rail only opens Space-scoped from that typed trigger). This
  // reproduces spaceSurfacesFor(type, canUse) for a viewer holding the same functions (see for-scope.test.ts).
  if (scope.kind === 'space') {
    const type = scope.spaceType
    if (!type) return []
    const resolved = surfacesFor(APPS, { on: 'spaceType', type }, viewer, kind === undefined ? 'editor' : kind)
    return applySpaceModuleMenu(resolved, scope.moduleMenu)
  }
  if (kind === 'page') return pageAppsForScope(scope, viewer)
  if (kind) return surfacesFor(APPS, { on: 'scopeKind', kind: scope.kind }, viewer, kind)
  return [
    ...surfacesFor(APPS, { on: 'scopeKind', kind: scope.kind }, viewer, 'editor'),
    ...pageAppsForScope(scope, viewer),
  ]
}

/** Whether the standardized admin bar appears for this (scope, viewer): it shows iff the viewer has at
 *  least one EDITOR (manage) App to act on here. Editor-only by design (docs/ADMIN-RAIL.md Phase 1):
 *  page blocks self-gate ('none') and are placed by the layout editor, so counting them would falsely
 *  light the bar on every content page for any signed-in viewer (the LP4-flagged hole) — excluding
 *  them ties visibility to real manage authority. NOTE: this only corrects the helper's definition;
 *  page-admin-bar's runtime visibility gate is switched onto it in Phase 4, not here. */
export function showsAdminBar(scope: AdminScope | null, viewer: AppViewer): boolean {
  return appsForScope(scope, viewer, 'editor').length > 0
}

// ── Phase 5: attainable-but-locked Apps (docs/ADMIN-RAIL.md Phase 5, principle P3) ──────────────────
// The rail resolves each App to one of three states: never-eligible (HIDDEN — `appsForScope` already
// drops these), eligible (SHOWN as a working editor), and ATTAINABLE-but-locked — an App the viewer
// cannot act on yet but could plausibly UNLOCK, rendered as a lock + a one-line reason instead of an
// editor. This is P3's "lock-with-reason only for could-unlock; never appear-then-error."
//
// "Attainable" is defined NARROWLY and safely: a `spaceFunction` gate that NAMES the `entitlement`
// (the plan / owner-grant switch) it needs — the one declared upgrade path in the App contract today.
// A plain `capability` the viewer merely lacks is NEVER attainable; it stays filtered out (no silent
// greyed row). A fuller model would flag more gates attainable (e.g. an owner-grantable capability);
// until a gate opts in this resolver returns [] over the live catalog, so the pattern is inert-safe.

/** Whether a FAILING gate names a path the viewer could plausibly unlock (a plan-gated Space function).
 *  Narrow by design: capability / staff / none gates are never attainable — lacking them means hidden. */
export function isAttainableGate(gate: AppGate): boolean {
  return gate.system === 'spaceFunction' && gate.entitlement != null
}

/** One plain line naming what unlocks an attainable App (voice canon: no em dashes). */
function reasonForGate(gate: AppGate): string {
  return gate.system === 'spaceFunction' && gate.entitlement
    ? `Available on the ${gate.entitlement} plan.`
    : 'Ask an owner to turn this on.'
}

/** An attainable-but-locked App: the App plus the one-line reason (+ optional CTA) the rail shows in
 *  place of its editor. Fail-closed: a locked App NEVER exposes its editor — the row is inert. */
export interface LockedApp {
  app: App
  reason: string
  cta?: { label: string; href: string }
}

/**
 * The editor Apps for a page `scope` the `viewer` cannot act on YET but could plausibly unlock (P3):
 * a scope-matching editor App whose gate FAILS for the viewer but is `isAttainableGate`. Rendered as a
 * locked row with a reason, never a working editor. Fail-closed: null scope / viewer ⇒ []. PURE; `apps`
 * defaults to the live catalog and is injectable for tests. Never-eligible Apps stay filtered out.
 */
export function lockedAppsForScope(
  scope: AdminScope | null,
  viewer: AppViewer,
  apps: readonly App[] = APPS,
): LockedApp[] {
  if (!scope || !viewer) return []
  return apps
    .filter(
      (a) =>
        a.surfaces.editor != null &&
        a.scopes.some((s) => s.on === 'scopeKind' && s.kind === scope.kind) &&
        !appGatePasses(a.gate, viewer) &&
        isAttainableGate(a.gate),
    )
    .map((a) => ({ app: a, reason: reasonForGate(a.gate) }))
}

// ── Phase 6: per-scope operator overrides (docs/ADMIN-RAIL.md Phase 6) ───────────────────────────
// The IMPURE, override-aware twin of `appsForScope`. `appsForScope` stays pure (the code catalog,
// resolved for a scope + viewer); this composes the operator overlay OVER it — dropping disabled
// Apps, applying `position`, and gating each survivor on its per-App `min_role` floor. FAIL-SAFE:
// loadAppOverrides returns {} on any error (incl. pre-migration), so with no overrides this is
// exactly `appsForScope(scope, viewer, 'editor')` and the rail never breaks.

/**
 * The EDITOR (manage) Apps to present at a page `scope` for a `viewer`, with operator overrides
 * applied: `mergeAppOverrides(appsForScope(scope, viewer, 'editor'), loadAppOverrides(scopeKeyFor(
 * scope)))`, then the per-App `min_role` render gate (reuse `atLeastRole`) resolved against the
 * viewer's community `role`. FAIL-CLOSED on the role gate: an App with a `min_role` floor is
 * dropped when `role` is null/undefined or below the floor (matching resolveSlots's per-module
 * gate). Fail-safe on scope: a null scope yields []. Server-only (it awaits the service-role
 * reader); `appsForScope` remains the pure client-safe path.
 */
export async function resolveAppsForScope(
  scope: AdminScope | null,
  viewer: AppViewer,
  role?: CommunityRole | null,
): Promise<App[]> {
  if (!scope || !viewer) return []
  const overrides = await loadAppOverrides(scopeKeyFor(scope))
  const merged = mergeAppOverrides(appsForScope(scope, viewer, 'editor'), overrides)
  return merged.filter((a) => {
    const floor = effectiveMinRole(a.id, overrides)
    return floor == null || atLeastRole(role, floor)
  })
}
