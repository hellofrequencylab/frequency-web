import type { Vertical } from './registry'

// Maker market — Etsy-like, individual members sell handmade/physical/digital goods.
// Labs entity, in-app payment via Stripe Connect (destination charge + maker rake).
// Built on the commerce core (commerce_products owner_kind='profile'). A member
// becomes a seller by completing Connect onboarding (reuses lib/billing/connect.ts,
// the same path hosts use for tips/tickets). ADR-39X.
export const maker: Vertical = {
  id: 'maker',
  entity: 'labs',
  // LIVE (2026-06-25): the commerce_* schema is applied to prod and the access matrix
  // registers the 'maker' surface. Browse + list work today; checkout settles once
  // billing is enabled (Connect destination charge, same path as tips/tickets).
  enabled: true,
  // NAV (ADR-868): the Maker market no longer contributes its own rail row. The member menu's
  // commerce area is just Marketplace + Housing; the single "Marketplace" umbrella row (the
  // `market` vertical's nav, href /marketplace) reaches this surface via the last-visited
  // commerce redirect. /market itself, the member footer link, and every page stay live —
  // only the dedicated left-rail row is retired.
  nav: [],
  rail: [
    {
      test: (p) => p === '/market' || p.startsWith('/market/'),
      panels: ['online', 'circles', 'events'],
    },
  ],
  capabilities: [
    {
      scopeKind: 'maker',
      resolve: (viewer) => {
        const caps = new Set<string>()
        if (viewer.profileId) caps.add('maker.product.create')
        return caps
      },
    },
  ],
  engagement: {
    source: 'maker',
    eventTypes: ['maker.product.created', 'maker.sale.completed'],
  },
}
