import type { Vertical } from './registry'

// Housing — rentals + roommates. Connect-only (no in-app money), shared entity
// (matching on identity + geo + the resonance engine; ID-verified, high-trust per
// PLATFORM-VISION §4). Pages live in app/(main)/marketplace/housing; data in
// listings + housing_listings (ADR-39Y). Nav sits in the Marketplace hub run.
export const housing: Vertical = {
  id: 'housing',
  entity: 'shared',
  // LIVE (2026-06-25): the listings + housing_* schema is applied to prod and the access
  // matrix registers the 'housing' surface, so accessTo cannot throw in the shared shell
  // (the 2026-06-24 outage guardrail). Connect-only, so it works with billing off.
  enabled: true,
  nav: [
    {
      after: 'market',
      area: {
        key: 'housing',
        href: '/marketplace/housing',
        label: 'Housing',
        section: 'Community',
        defaultAccess: 'member',
        surface: 'housing',
      },
    },
  ],
  rail: [
    {
      test: (p) => p === '/marketplace/housing' || p.startsWith('/marketplace/housing/'),
      panels: ['online', 'circles', 'events'],
    },
  ],
  capabilities: [
    {
      scopeKind: 'housing',
      resolve: (viewer) => {
        const caps = new Set<string>()
        if (viewer.profileId) {
          caps.add('housing.listing.create')
          caps.add('housing.match.optin')
        }
        return caps
      },
    },
  ],
  engagement: {
    source: 'housing',
    eventTypes: ['housing.listing.created', 'housing.match.accepted'],
  },
}
