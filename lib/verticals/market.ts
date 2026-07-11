import type { Vertical } from './registry'

// Classifieds — the first vertical migrated onto the descriptor (ADR-248/250). The id `market`
// backs the member-facing Classifieds peer board at /classifieds (backed by lib/marketplace.ts),
// NOT the Maker umbrella (that is the separate `maker` vertical at /market). This descriptor is now
// the single source of the vertical's nav: lib/nav-areas.ts composes it into NAV_AREAS at the
// anchored position (`after: 'events'`), so the area sits in its exact spot in the Community
// section. The Classifieds UI (lib/marketplace.ts, route /classifieds) still owns the pages.
export const market: Vertical = {
  id: 'market',
  entity: 'labs',
  nav: [
    {
      after: 'events',
      area: {
        key: 'market',
        href: '/classifieds',
        label: 'Classifieds',
        section: 'Community',
        defaultAccess: 'visitor',
        surface: 'market',
      },
    },
  ],
  // The marketplace's own right-rail (was a hardcoded `/classifieds` arm of the base map): who's
  // around + circles to join + what's on — the people-led-browse panels. Owned here now, so
  // adding a vertical's rail is one descriptor edit, not a core edit (ADR-278).
  rail: [
    {
      test: (p) => p === '/classifieds' || p.startsWith('/classifieds/'),
      panels: ['online', 'circles', 'events'],
    },
  ],
  capabilities: [
    {
      scopeKind: 'market',
      // A signed-in member may list; finer gates (verified seller, trust threshold per
      // ADR-247) layer on here as the marketplace's RPCs adopt the resolver. Namespaced
      // so it never collides with the core Capability union.
      resolve: (viewer) => {
        const caps = new Set<string>()
        if (viewer.profileId) caps.add('market.listing.create')
        return caps
      },
    },
  ],
  engagement: { source: 'marketplace', eventTypes: ['market.listing.created', 'market.deal.completed'] },
}
