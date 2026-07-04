// The core/personal editor-surface → standalone-page href map (inline-first rail, ADR-514 Phase C/D).
// The TWIN of lib/spaces/surface-hrefs.ts (hrefForSurface, the Space map): a PURE module (no React, no
// server action) so the standardized admin rail's link-rows can import it into the client bundle without
// dragging server dependencies. It resolves the destination for a core/personal editor App classified
// `render: 'link'` — a FEATURE WORKFLOW the bar deep-links into rather than inlining.
//
// Scope today:
//   • PERSONAL "You" surfaces (global scope) whose only editor is a full /settings/* page — billing
//     (a feature workflow) and Account and privacy (blocked-members + data export + account deletion,
//     not a single reusable form). These carry `render: 'link'` and resolve to a STATIC /settings/* URL
//     (no entity id needed — a signed-in viewer edits their OWN account).
//   • CORE ENTITIES (circle / hub / nexus / event / practice / channel) are ALL `render: 'inline'`: each
//     entity's inline module IS its dedicated editor (the /manage + /settings consoles merely re-compose
//     the SAME module components), and where a deeper feature-workflow page exists (e.g. the event guest
//     dashboard) the inline module already deep-links to it. So no core-entity id is classified `link`,
//     and there is no core-entity branch here yet. When one is warranted, add a case keyed on the URL
//     slug the scope carries (`scope.id`), mirroring the Space map.

/** The minimal scope shape this resolver reads — the page's admin scope (lib/layout/page-chrome
 *  AdminScope). `id` is the entity's URL slug on an entity-detail scope, absent on the global scope. */
export interface EntitySurfaceScope {
  kind: string
  id?: string
}

/** Map a core/personal editor App id to the standalone page it opens (null = no destination, so the rail
 *  draws nothing rather than a dead row — fail-safe). PURE, so the map is unit-tested in isolation. */
export function hrefForEntitySurface(appId: string, scope: EntitySurfaceScope | null): string | null {
  // Personal "You" surfaces are a viewer's OWN account — their destination is scope-INDEPENDENT, so they
  // resolve on every page (the always-available menu, entity pages included), NOT only the global scope.
  switch (appId) {
    // Personal feature-workflow link-outs — the viewer's own /settings/* page (a workflow, or a composite
    // management page with no single inline form; see the module comments for why each links).
    case 'account.privacy':
      return '/settings/account'
    case 'account.billing':
      return '/settings/billing'
    // The personal surfaces that render INLINE list their /settings/* page too, so a future flip to
    // `link` (or an operator override) resolves without another edit here. Not exercised by the render
    // branch while they are `inline`.
    case 'account.profile':
      return '/settings/profile'
    case 'account.notifications':
      return '/settings/notifications'
    case 'account.connections':
      return '/settings/connections'
    case 'account.appearance':
      return '/settings/appearance'
  }

  // Core-entity surfaces (event / hub / nexus) resolve to their OWNER MANAGE CONSOLE, keyed on the
  // entity's URL slug (`scope.id`). This is the seam the module comment anticipated: a surface tagged
  // `placement: 'bank'` (ADR-515 uniform rail) needs a resolvable href for the bottom bank, and each of
  // these entities has a full `/{entity}/<slug>/manage` console. Circle + practice consoles are thin, so
  // their surfaces stay body-inline (no bank href here); every core surface still renders `inline` today,
  // so this only feeds the bank resolver, never a dead body row. Fail-safe: no slug ⇒ null.
  const entitySlug = scope?.id ?? null
  if (entitySlug) {
    if (appId.startsWith('event.')) return `/events/${entitySlug}/manage`
    if (appId.startsWith('hub.')) return `/hubs/${entitySlug}/manage`
    if (appId.startsWith('nexus.')) return `/nexuses/${entitySlug}/manage`
  }
  return null
}
