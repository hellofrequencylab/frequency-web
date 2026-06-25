import type { Surface } from '@/lib/core/access-matrix'

// The navigable destinations the in-app search can jump to — the "Go to" group in the
// search overlay (components/search/search-overlay.tsx) and /api/search. Search used to
// index only people / posts / events / leads, so a member who typed "marketplace" got
// nothing and assumed the feature was missing. These entries make every key destination
// findable by name.
//
// Each destination carries the access-matrix `surface` it lives behind, so /api/search
// returns ONLY the ones the viewer can actually reach: admin tools stay invisible to
// members, Housing stays hidden from logged-out visitors, etc. (gating mirrors the nav).
// `keywords` widen the match past the visible label, so "buy", "rent", "storefront",
// "refund" all resolve to the right page. Keep labels in the product's voice + naming
// canon (docs/NAMING.md, docs/CONTENT-VOICE.md) — they are member-facing copy.

export type Destination = {
  href: string
  label: string
  /** Shown as the result's subtitle, e.g. "Marketplace" or "Admin". */
  group: string
  /** The access-matrix surface gating this page. Omit for always-reachable personal pages. */
  surface?: Surface
  keywords: string[]
}

export const SEARCH_DESTINATIONS: Destination[] = [
  // ── Marketplace — the General market plus the Housing / Makers / Shop verticals ──
  {
    href: '/market', label: 'Marketplace', group: 'Marketplace', surface: 'market',
    keywords: ['marketplace', 'market', 'buy', 'sell', 'listings', 'classifieds', 'goods', 'services'],
  },
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

  // ── Core community destinations (so search navigates generally, not just commerce) ──
  { href: '/feed', label: 'Feed', group: 'Community', surface: 'feed', keywords: ['feed', 'home', 'timeline'] },
  { href: '/circles', label: 'Circles', group: 'Community', surface: 'circles', keywords: ['circles', 'groups'] },
  { href: '/events', label: 'Events', group: 'Community', surface: 'events', keywords: ['events', 'calendar', 'gatherings'] },
  { href: '/channels', label: 'Channels', group: 'Community', surface: 'channels', keywords: ['channels'] },
  { href: '/network', label: 'Community', group: 'Community', surface: 'people', keywords: ['community', 'members', 'directory', 'network', 'people'] },
  { href: '/settings', label: 'Settings', group: 'You', surface: 'settings', keywords: ['settings', 'account', 'preferences'] },
]

// Match destinations against a query: the label or any keyword contains it. Cheap
// substring scan — the list is tiny and the query is short. Returns [] under 2 chars
// to mirror the overlay's own threshold.
export function matchDestinations(query: string): Destination[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return SEARCH_DESTINATIONS.filter(
    (d) => d.label.toLowerCase().includes(q) || d.keywords.some((k) => k.includes(q)),
  )
}
