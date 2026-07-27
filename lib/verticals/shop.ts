import type { Vertical } from './registry'

// Shop — first-party Frequency retail (merch / retreats / events). Labs entity,
// Frequency is the seller (commerce_products owner_kind='platform'): a plain
// PaymentIntent on the platform account (no destination charge, full amount =
// labs/commerce revenue). Retreats/events reuse the event-ticket channel (ADR-177),
// linked not duplicated. Distinct from the Vault (Gems) and the member Marketplace.
//
// The SAME commerce core also powers per-Space storefronts (owner_kind='space'),
// gated by the 'space_storefront' entitlement — that surface renders inside the
// Space profile, not here.
export const shop: Vertical = {
  id: 'shop',
  entity: 'labs',
  // LIVE (2026-06-25): the commerce_* schema is applied to prod and the access matrix
  // registers the 'shop' surface. First-party catalog browses today; checkout settles
  // once billing is enabled (platform PaymentIntent, full amount = labs/commerce).
  enabled: true,
  nav: [
    {
      // Anchored after 'housing' since ADR-868 retired the maker rail row (the old anchor);
      // a missing anchor would APPEND this area after the Admin section and fork a second
      // "Community" header (composeNavAreas groups by consecutive section runs).
      after: 'housing',
      area: {
        key: 'shop',
        href: '/store',
        label: 'Frequency Store',
        section: 'Community',
        defaultAccess: 'visitor',
        surface: 'shop',
      },
    },
  ],
  rail: [
    {
      test: (p) => p === '/store' || p.startsWith('/store/'),
      panels: ['events'],
    },
  ],
  capabilities: [
    {
      scopeKind: 'shop',
      // First-party catalog is operator-managed (web_role/admin in the admin surface);
      // buying needs no special capability.
      resolve: () => new Set<string>(),
    },
  ],
  engagement: {
    source: 'shop',
    eventTypes: ['shop.order.completed'],
  },
}
