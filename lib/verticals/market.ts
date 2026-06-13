import type { Vertical } from './registry'

// Marketplace — the first vertical migrated onto the descriptor (ADR-248/250). A local
// goods/services marketplace on the for-profit (Labs) rail. Today its UI is hand-wired
// (lib/marketplace.ts, app/(main)/market, the 'market' nav literal in lib/nav-areas.ts);
// this descriptor is the single authoritative declaration of the vertical's surface, which
// the registry composes. A test (registry.test.ts) guards the declared nav against the live
// NAV_AREAS literal until the shell is flipped to source nav from here — a safe follow-up
// (the shell groups nav by consecutive section runs, so composing needs anchored ordering).
export const market: Vertical = {
  id: 'market',
  entity: 'labs',
  nav: [
    {
      key: 'market',
      href: '/market',
      label: 'Marketplace',
      section: 'Community',
      defaultAccess: 'visitor',
      surface: 'market',
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
