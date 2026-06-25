// Connect-only listings contracts (ADR-39Y). General + Housing. No money.

export type ListingVertical = 'market' | 'housing'
export type ListingStatus = 'active' | 'claimed' | 'closed'
export type HousingType = 'rental' | 'roommate' | 'sublet'
export type RoomType = 'private_room' | 'shared_room' | 'entire_place'

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
  preferences: Record<string, unknown>
}

export type HousingListing = Listing & { housing: HousingDetail }

export interface RoommateMatch {
  listingId: string
  ownerId: string
  resonance: number
  rentCents: number | null
  city: string | null
  score: number
}
