// Connect-only listings contracts (ADR-39Y). General + Housing. No money.

export type ListingVertical = 'market' | 'housing'
export type ListingStatus = 'active' | 'claimed' | 'closed'
// The listing INTENT. 'rental' | 'roommate' | 'sublet' offer a place; the two
// '*_wanted' intents post that a member is LOOKING (Phase 2). Orthogonal to
// PropertyType (the physical form of the place).
export type HousingType = 'rental' | 'roommate' | 'sublet' | 'roommate_wanted' | 'housing_wanted'
export type RoomType = 'private_room' | 'shared_room' | 'entire_place'
export type PropertyType = 'house' | 'apartment' | 'studio' | 'condo' | 'townhouse' | 'room' | 'other'

// Pure data (no server imports) so client forms can render the pickers directly.
// The DB CHECKs in migration 20261129000000 are the source of truth for the slugs.

/** Physical form of the place, orthogonal to the listing intent. */
export const PROPERTY_TYPES: readonly { slug: PropertyType; label: string }[] = [
  { slug: 'apartment', label: 'Apartment' },
  { slug: 'house', label: 'House' },
  { slug: 'studio', label: 'Studio' },
  { slug: 'condo', label: 'Condo' },
  { slug: 'townhouse', label: 'Townhouse' },
  { slug: 'room', label: 'Room' },
  { slug: 'other', label: 'Other' },
]
// Controlled amenity vocabulary — kept in lockstep with the DB CHECK
// (housing_listings_amenities_vocab) in migration 20261129000000.
export type AmenitySlug =
  | 'in_unit_laundry'
  | 'laundry_shared'
  | 'ac'
  | 'heat'
  | 'dishwasher'
  | 'parking'
  | 'garage'
  | 'outdoor_space'
  | 'internet'
  | 'storage'
  | 'pool'
  | 'gym'
  | 'ev_charging'
  | 'wheelchair_accessible'

/** Amenity slug set with member-facing labels, in lockstep with the DB CHECK
 *  housing_listings_amenities_vocab. */
export const AMENITIES: readonly { slug: AmenitySlug; label: string }[] = [
  { slug: 'in_unit_laundry', label: 'In-unit laundry' },
  { slug: 'laundry_shared', label: 'Shared laundry' },
  { slug: 'ac', label: 'Air conditioning' },
  { slug: 'heat', label: 'Heating' },
  { slug: 'dishwasher', label: 'Dishwasher' },
  { slug: 'parking', label: 'Parking' },
  { slug: 'garage', label: 'Garage' },
  { slug: 'outdoor_space', label: 'Outdoor space' },
  { slug: 'internet', label: 'Internet' },
  { slug: 'storage', label: 'Storage' },
  { slug: 'pool', label: 'Pool' },
  { slug: 'gym', label: 'Gym' },
  { slug: 'ev_charging', label: 'EV charging' },
  { slug: 'wheelchair_accessible', label: 'Wheelchair accessible' },
]

export interface Listing {
  id: string
  vertical: ListingVertical
  ownerProfileId: string | null
  entityId: string
  title: string
  description: string | null
  status: ListingStatus
  images: string[]
  priceNote: string | null
  category: string | null
  neighborhood: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  circleId: string | null
  isDemo: boolean
  /** True when this listing is still held by the Frequency seed owner AND unclaimed (a live claim
   *  token, no claimed_at). Drives the "Unclaimed" browse-card badge. Fail-soft false when the seed
   *  owner can't be resolved. */
  seededUnclaimed: boolean
  createdAt: string
  updatedAt: string
}

export interface HousingDetail {
  listingId: string
  listingType: HousingType
  rentCents: number | null
  depositCents: number | null
  bedrooms: number | null
  bathrooms: number | null
  roomType: RoomType | null
  leaseMonths: number | null
  availableFrom: string | null
  furnished: boolean | null
  petsOk: boolean | null
  utilitiesIncluded: boolean | null
  householdSize: number | null
  // Phase 2 attributes.
  propertyType: PropertyType | null
  sqft: number | null
  amenities: AmenitySlug[]
  smokingOk: boolean | null
  cannabisOk: boolean | null
  details: Record<string, unknown>
  preferences: Record<string, unknown>
}

export interface RoommateMatch {
  listingId: string
  ownerId: string
  resonance: number
  rentCents: number | null
  city: string | null
  score: number
}
