import type { Vertical } from './registry'

// Maker market — Etsy-like, individual members sell handmade/physical/digital goods.
// Labs entity, in-app payment via Stripe Connect (destination charge + maker rake).
// Built on the commerce core (commerce_products owner_kind='profile'). A member
// becomes a seller by completing Connect onboarding (reuses lib/billing/connect.ts,
// the same path hosts use for tips/tickets). ADR-39X.
export const maker: Vertical = {
  id: 'maker',
  entity: 'labs',
  // DORMANT until the commerce_* migrations are applied to prod and a signed-in session is
  // verified (guardrail after the 2026-06-24 outage). Flip to true to go live.
  enabled: false,
  nav: [
    {
      after: 'housing',
      area: {
        key: 'maker',
        href: '/marketplace/makers',
        label: 'Makers',
        section: 'Community',
        defaultAccess: 'visitor',
        surface: 'maker',
      },
    },
  ],
  rail: [
    {
      test: (p) => p === '/marketplace/makers' || p.startsWith('/marketplace/makers/'),
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
