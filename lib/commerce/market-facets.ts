import { COMMERCE_CATEGORIES } from '@/lib/commerce/categories'
import type { MarketGroup, ProductCondition } from '@/lib/commerce/types'

// MARKET FACETS (DEF-ETSY P4). The filters a buyer can narrow the live Market query by, read from the
// URL so a filtered Market is a link someone can share and the back button undoes a filter. PURE: the
// page parses the search params here, lib/commerce/products.ts listMarketListings turns the parsed
// facets into the database query, and itemMatchesMarketFacets applies the SAME rules in memory to the
// ticketed-event projections, which are not commerce_products rows.
//
// Only what the listing data already carries: the controlled category taxonomy
// (lib/commerce/categories.ts), the price, New or Used, and who sells it (a maker's own listing or a
// Business Space's). Listings carry no place, so there is no location facet yet.
//
// Default-deny: an unknown value is dropped, never passed to the query.

type MarketPriceBand = 'free' | 'under-25' | '25-50' | '50-100' | '100-plus'
type MarketSellerType = 'maker' | 'business'

export interface MarketFacets {
  /** A top-level category (matches its subcategories too) or one subcategory, as stored. */
  category: string | null
  price: MarketPriceBand | null
  condition: ProductCondition | null
  seller: MarketSellerType | null
}

export const NO_MARKET_FACETS: MarketFacets = { category: null, price: null, condition: null, seller: null }

/** Price bands in display order, with the cents they cover: min inclusive, max exclusive (null = no top). */
export const MARKET_PRICE_BANDS: readonly { value: MarketPriceBand; label: string; min: number; max: number | null }[] = [
  { value: 'free', label: 'Free', min: 0, max: 1 },
  { value: 'under-25', label: 'Under $25', min: 1, max: 2500 },
  { value: '25-50', label: '$25 to $50', min: 2500, max: 5000 },
  { value: '50-100', label: '$50 to $100', min: 5000, max: 10000 },
  { value: '100-plus', label: '$100 and up', min: 10000, max: null },
]

export const MARKET_CONDITIONS: readonly { value: ProductCondition; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Used' },
]

/** Who sells it. A maker lists as a person (owner_kind profile); a business lists from its Space. */
export const MARKET_SELLER_TYPES: readonly { value: MarketSellerType; label: string; ownerKind: 'profile' | 'space' }[] = [
  { value: 'maker', label: 'Makers', ownerKind: 'profile' },
  { value: 'business', label: 'Businesses', ownerKind: 'space' },
]

type Raw = string | string[] | undefined

function one(raw: Raw): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t : null
}

/** The stored category values a facet value covers: a top-level group brings its subcategories. An
 *  unknown value covers nothing (and parseMarketFacets drops it before it gets here). */
export function categoryFacetValues(category: string | null): string[] {
  if (!category) return []
  for (const c of COMMERCE_CATEGORIES) {
    if (c.value === category) return [c.value, ...c.subcategories.map((s) => s.value)]
    if (c.subcategories.some((s) => s.value === category)) return [category]
  }
  return []
}

/** Read the facets from a page's search params. Unknown values are dropped. */
export function parseMarketFacets(params: Record<string, Raw>): MarketFacets {
  const category = one(params.category)
  const price = one(params.price)
  const condition = one(params.condition)
  const seller = one(params.seller)
  return {
    category: category && categoryFacetValues(category).length > 0 ? category : null,
    price: MARKET_PRICE_BANDS.find((b) => b.value === price)?.value ?? null,
    condition: MARKET_CONDITIONS.find((c) => c.value === condition)?.value ?? null,
    seller: MARKET_SELLER_TYPES.find((s) => s.value === seller)?.value ?? null,
  }
}

export function hasMarketFacets(f: MarketFacets): boolean {
  return !!(f.category || f.price || f.condition || f.seller)
}

/** The cents a price band covers, or null when no band is set. */
export function priceBandBounds(band: MarketPriceBand | null): { min: number; max: number | null } | null {
  const b = MARKET_PRICE_BANDS.find((x) => x.value === band)
  return b ? { min: b.min, max: b.max } : null
}

/** The owner_kind a seller facet keeps, or null when no seller facet is set. */
export function sellerOwnerKind(seller: MarketSellerType | null): 'profile' | 'space' | null {
  return MARKET_SELLER_TYPES.find((s) => s.value === seller)?.ownerKind ?? null
}

/** The in-memory twin of the query listMarketListings builds, for items that are not commerce rows
 *  (the ticketed-event projections). A null price reads as free. */
export function itemMatchesMarketFacets(
  item: { category: string | null; priceCents: number | null; condition: ProductCondition | null; ownerKind: string },
  f: MarketFacets,
): boolean {
  if (f.category && !categoryFacetValues(f.category).includes(item.category ?? '')) return false
  const band = priceBandBounds(f.price)
  if (band) {
    const cents = item.priceCents ?? 0
    if (cents < band.min || (band.max !== null && cents >= band.max)) return false
  }
  if (f.condition && item.condition !== f.condition) return false
  const kind = sellerOwnerKind(f.seller)
  if (kind && item.ownerKind !== kind) return false
  return true
}

/** The /market URL for a group and a set of facets, in a stable key order. With no group and no
 *  facets it is plain /market, so the unfiltered links never change. */
export function marketHref(group: MarketGroup | null, f: MarketFacets = NO_MARKET_FACETS): string {
  const q = new URLSearchParams()
  if (group) q.set('group', group)
  if (f.category) q.set('category', f.category)
  if (f.price) q.set('price', f.price)
  if (f.condition) q.set('condition', f.condition)
  if (f.seller) q.set('seller', f.seller)
  const s = q.toString()
  return s ? `/market?${s}` : '/market'
}
