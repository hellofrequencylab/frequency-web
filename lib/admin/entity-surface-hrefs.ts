// The core/personal editor-surface → standalone-page href map (inline-first rail, ADR-514 Phase C/D).
// The TWIN of lib/spaces/surface-hrefs.ts (hrefForSurface, the Space map): a PURE module (no React, no
// server action) so the standardized admin rail's link-rows can import it into the client bundle without
// dragging server dependencies. It resolves the destination for a core/personal editor App classified
// `render: 'link'` — a FEATURE WORKFLOW the bar deep-links into rather than inlining.
//
// Scope today:
//   • PERSONAL "You" surfaces (global scope) whose only editor is a settings section — billing
//     (a feature workflow) and Account and privacy (blocked-members + data export + account deletion,
//     not a single reusable form). These carry `render: 'link'` and resolve to a STATIC URL — a
//     /settings#<anchor> section of the one-page suite, or /settings/profile for the full editor
//     (no entity id needed — a signed-in viewer edits their OWN account).
//   • CORE-ENTITY COMMUNICATION MODULES (ADR-827): circle.crm / hub.crm / nexus.crm / event.crm are
//     `render: 'link'` — event + circle resolve to their Manage hubs (the message center leads the
//     Home tab, ADR-828), hub + nexus to their standalone /crm member viewers, keyed on the URL slug
//     the scope carries (`scope.id`). Callers on a detail page must pass a SLUG-corrected scope (the
//     AdminBar detail's scope.id is the DB id): settings-panel's `slugScope` / the manage console's
//     path-derived scope both do.
//   • The THIN LAYOUT/BUILDER surfaces (ADR-846): hub.layout / nexus.layout / journey.builder were cards
//     whose entire body was a single link out, so they fold into their entity's Settings box as `link`
//     rows. Hub + nexus resolve through the manage-console prefix fallbacks below (the same destination
//     their inline card linked to); journey.builder needs its OWN case above, since journey has no prefix
//     fallback and a null href would draw nothing.
//   • Every OTHER core-entity surface (circle / hub / nexus / event / practice / channel) stays
//     `render: 'inline'`: the entity's inline module IS its dedicated editor (the /manage + /settings
//     consoles merely re-compose the SAME module components); the manage-console prefix fallbacks
//     below only feed the ADR-515 bottom bank.

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
    // Personal feature-workflow link-outs — the viewer's own settings section. The Settings suite is
    // ONE page now (DAWN 2 screen pass): each section is a /settings#<anchor> target, so these resolve
    // to the direct anchor rather than the old standalone route (which survives only as a redirect).
    case 'account.privacy':
      return '/settings#account' // the "Account and privacy" section (blocked members, data export, deletion)
    case 'account.billing':
      return '/settings#plan' // the "Plan and billing" section
    // The personal surfaces that render INLINE list their destination too, so a future flip to
    // `link` (or an operator override) resolves without another edit here. Not exercised by the render
    // branch while they are `inline`. Profile keeps its own full-page editor route.
    case 'account.profile':
      return '/settings/profile'
    case 'account.notifications':
      return '/settings#notifications'
    case 'account.connections':
      return '/settings#connections'
    case 'account.appearance':
      return '/settings#appearance'
  }

  // Core-entity surfaces (event / hub / nexus) resolve to their OWNER MANAGE CONSOLE, keyed on the
  // entity's URL slug (`scope.id`). This is the seam the module comment anticipated: a surface tagged
  // `placement: 'bank'` (ADR-515 uniform rail) needs a resolvable href for the bottom bank, and each of
  // these entities has a full `/{entity}/<slug>/manage` console. Circle + practice consoles are thin, so
  // their surfaces stay body-inline (no bank href here); every core surface still renders `inline` today,
  // so this only feeds the bank resolver, never a dead body row. Fail-safe: no slug ⇒ null.
  const entitySlug = scope?.id ?? null
  if (entitySlug) {
    // The communication modules (ADR-827) are `render: 'link'` with their OWN pages, so their explicit
    // cases must precede the manage-console prefix fallbacks below (else 'event.crm' would resolve to
    // /manage). Circle has no prefix fallback, so its case here is what makes the row resolve at all.
    // Message Attendees / Message Circle live at the TOP of their Manage hubs' Home tab now
    // (the message center, ADR-828), so those communication modules deep-link to the hub
    // itself, not a standalone page. Hub + nexus keep their standalone /crm pages.
    // The Journey builder (ADR-846): "Builder and layout" folded into the Journey's Settings box as a
    // LINK row, so it needs a destination here — the full-page course builder. Journey has NO prefix
    // fallback below (its console is that builder, not a /manage page), so WITHOUT this explicit case the
    // row would resolve null and draw nothing at all. Every other journey surface stays `inline`.
    if (appId === 'journey.builder') return `/journeys/${entitySlug}/edit`
    // The Channel Manage hub (ADR-870): channel.manage is a `link` row into the channel's owner
    // console. Channel has NO prefix fallback below (its other surfaces stay inline on the rail), so
    // without this explicit case the row would resolve null and draw nothing. The manage route accepts
    // the DB id or the slug, so a raw-uuid scope still lands.
    if (appId === 'channel.manage') return `/channels/${entitySlug}/manage`
    // The full Channel editor (ADR-882). Like channel.manage this is a `link` row with no prefix
    // fallback, so it needs its own case or it resolves null and draws nothing. Also id-or-slug.
    if (appId === 'channel.edit') return `/channels/${entitySlug}/edit`
    if (appId === 'event.crm') return `/events/${entitySlug}/manage`
    if (appId === 'circle.crm') return `/circles/${entitySlug}/manage`
    if (appId === 'hub.crm') return `/hubs/${entitySlug}/crm`
    if (appId === 'nexus.crm') return `/nexuses/${entitySlug}/crm`
    if (appId.startsWith('event.')) return `/events/${entitySlug}/manage`
    if (appId.startsWith('hub.')) return `/hubs/${entitySlug}/manage`
    if (appId.startsWith('nexus.')) return `/nexuses/${entitySlug}/manage`
  }
  return null
}
