// The marketplace VOCABULARY — the kinds, the field shapes, and the patch contract.
//
// Split out of lib/marketplace.ts (LIVE-037). The reads and writes there go through the
// service-role admin client; these four declarations are all the browse grid and the listing
// builder need. They shared a module, so market-grid.tsx and listing-builder.tsx ('use client')
// importing LISTING_KINDS pulled the RLS-bypassing Supabase client into the market bundle.
//
// All of it is re-exported from lib/marketplace.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

export type ListingKind = 'offer' | 'request' | 'free' | 'lend'
export type ListingStatus = 'active' | 'claimed' | 'closed'

export const LISTING_KINDS: { key: ListingKind; label: string; blurb: string }[] = [
  { key: 'offer', label: 'Offering', blurb: 'Something to sell or hand on' },
  { key: 'free', label: 'Free', blurb: 'Giving it away' },
  { key: 'lend', label: 'To lend', blurb: 'Borrow and return' },
  { key: 'request', label: 'Looking for', blurb: 'Something you need' },
]

/** One compact item-detail chip (Condition, Brand, Dimensions, ...) shown in the listing right rail. */
export interface ListingDetailField {
  label: string
  value: string
}

export interface ListingPatch {
  title?: string
  description?: string | null
  kind?: ListingKind
  category?: string | null
  priceNote?: string | null
  neighborhood?: string | null
  city?: string | null
  images?: string[]
  latitude?: number | null
  longitude?: number | null
  details?: ListingDetailField[]
  pickupAddress?: string | null
  pickupPrecision?: 'area' | 'exact'
}
