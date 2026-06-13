import type { Vertical } from './registry'

// Marketplace — the first vertical migrated onto the descriptor (ADR-248/250). A local
// goods/services marketplace on the for-profit (Labs) rail. This descriptor is now the
// single source of the vertical's nav: lib/nav-areas.ts composes it into NAV_AREAS at the
// anchored position (`after: 'events'`), so the area sits in its exact spot in the Community
// section. The marketplace UI (lib/marketplace.ts, app/(main)/market) still owns the pages.
export const market: Vertical = {
  id: 'market',
  entity: 'labs',
  nav: [
    {
      after: 'events',
      area: {
        key: 'market',
        href: '/market',
        label: 'Marketplace',
        section: 'Community',
        defaultAccess: 'visitor',
        surface: 'market',
      },
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
