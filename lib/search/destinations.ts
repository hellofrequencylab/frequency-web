import type { Surface } from '@/lib/core/access-matrix'
import { NAV_AREAS } from '@/lib/nav-areas'

// The navigable destinations the in-app search can jump to — the "Go to" group in the
// search overlay (components/search/search-overlay.tsx) and /api/search. Search used to
// index only people / posts / events / leads, so a member who typed "marketplace" got
// nothing and assumed the feature was missing.
//
// COMPLETENESS BY DERIVATION (so the list never drifts as we add features): the bulk is
// derived from NAV_AREAS — the canonical nav catalog — so every nav destination is
// automatically searchable. CURATED below adds the things NAV_AREAS can't express:
// sub-pages that aren't top-level nav areas (Housing / Makers / Shop / orders / the admin
// marketplace tools) and richer keywords ("buy", "rent", "refund") that widen matching
// past the visible label.
//
// Each destination carries the access-matrix `surface` it lives behind, so /api/search
// returns ONLY the ones the viewer can reach: admin tools stay invisible to members,
// Housing stays hidden from logged-out visitors, etc. Keep labels in the product's voice
// + naming canon (docs/NAMING.md, docs/CONTENT-VOICE.md) — they are member-facing copy.
//
// Server-only module (imports NAV_AREAS as a value). /api/search and the /search page
// import it; the overlay receives the resolved `pages` over the wire.

export type Destination = {
  href: string
  label: string
  /** Shown as the result's subtitle, e.g. "Marketplace" or "Admin". */
  group: string
  /** The access-matrix surface gating this page. Omit for always-reachable personal pages. */
  surface?: Surface
  keywords: string[]
}

// Sub-pages + richer keywords that NAV_AREAS doesn't carry. These override the nav-derived
// entry for the same href (so /admin/marketplace gets the clearer "Marketplace admin" label
// and the marketplace family is fully covered).
const CURATED: Destination[] = [
  // ── Marketplace — the General market plus the Housing / Makers / Shop verticals ──
  {
    href: '/market/new', label: 'List something', group: 'Marketplace', surface: 'market',
    keywords: ['sell', 'list', 'new listing', 'post item', 'create listing'],
  },
  {
    href: '/marketplace/housing', label: 'Housing', group: 'Marketplace', surface: 'housing',
    keywords: ['housing', 'rent', 'rentals', 'apartment', 'room', 'sublet', 'lease', 'place to live'],
  },
  {
    href: '/marketplace/housing/roommates', label: 'Roommate matches', group: 'Marketplace', surface: 'housing',
    keywords: ['roommate', 'roommates', 'housemate', 'match'],
  },
  {
    href: '/marketplace/makers', label: 'Makers', group: 'Marketplace', surface: 'maker',
    keywords: ['makers', 'maker', 'artisans', 'handmade', 'crafts', 'creators'],
  },
  {
    href: '/marketplace/makers/sell', label: 'Sell as a maker', group: 'Marketplace', surface: 'maker',
    keywords: ['sell', 'maker', 'open a shop', 'become a seller'],
  },
  {
    href: '/marketplace/makers/manage', label: 'My storefront', group: 'Marketplace', surface: 'maker',
    keywords: ['storefront', 'my shop', 'manage products', 'my listings', 'seller dashboard'],
  },
  {
    href: '/shop', label: 'Shop', group: 'Marketplace', surface: 'shop',
    keywords: ['shop', 'store', 'merch', 'merchandise', 'products', 'frequency shop'],
  },
  {
    href: '/orders', label: 'My orders', group: 'Marketplace', surface: 'market',
    keywords: ['orders', 'my orders', 'purchases', 'receipts', 'order history'],
  },

  // ── Admin · Marketplace (staff only — gated to admin/janitor by platformManage) ──
  {
    href: '/admin/marketplace', label: 'Marketplace admin', group: 'Admin', surface: 'platformManage',
    keywords: ['marketplace admin', 'manage marketplace', 'shop catalog', 'listings admin'],
  },
  {
    href: '/admin/marketplace/orders', label: 'Marketplace orders', group: 'Admin', surface: 'platformManage',
    keywords: ['orders admin', 'refund', 'refunds', 'fulfilment', 'fulfillment'],
  },
  {
    href: '/admin/marketplace/reports', label: 'Marketplace reports', group: 'Admin', surface: 'platformManage',
    keywords: ['reports', 'flags', 'moderation', 'reported listings'],
  },

  // ── Personal pages (not nav areas) ──
  { href: '/settings', label: 'Settings', group: 'You', surface: 'settings', keywords: ['settings', 'account', 'preferences'] },
  { href: '/settings/billing', label: 'Billing', group: 'You', surface: 'settings', keywords: ['billing', 'payment method', 'subscription', 'plan', 'invoices'] },
]

// Derive the bulk from the canonical nav catalog. Every nav area becomes a searchable
// destination, gated by its access-matrix surface (areas with no surface fall back to
// "any logged-in viewer", matching the filter in /api/search).
const NAV_DERIVED: Destination[] = NAV_AREAS.map((a) => ({
  href: a.href,
  label: a.label,
  group: a.section ?? 'Frequency',
  surface: (a.surface as Surface | undefined) ?? undefined,
  keywords: [a.label.toLowerCase()],
}))

// Merge nav-derived + curated, deduped by href. Curated wins on label/group/surface and
// its keywords are unioned with the nav label, so the same destination is never listed twice.
function buildDestinations(): Destination[] {
  const byHref = new Map<string, Destination>()
  for (const d of NAV_DERIVED) byHref.set(d.href, d)
  for (const c of CURATED) {
    const existing = byHref.get(c.href)
    byHref.set(
      c.href,
      existing ? { ...c, keywords: [...new Set([...existing.keywords, ...c.keywords])] } : c,
    )
  }
  return [...byHref.values()]
}

export const SEARCH_DESTINATIONS: Destination[] = buildDestinations()

// Match destinations against a query: the label or any keyword contains it. Cheap
// substring scan — the list is small and the query is short. Returns [] under 2 chars
// to mirror the overlay's own threshold.
export function matchDestinations(query: string): Destination[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return SEARCH_DESTINATIONS.filter(
    (d) => d.label.toLowerCase().includes(q) || d.keywords.some((k) => k.includes(q)),
  )
}
