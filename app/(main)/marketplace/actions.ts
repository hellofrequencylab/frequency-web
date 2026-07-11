'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createListing, setListingStatus, deleteListing, listingOwnerId } from '@/lib/listings'
import {
  sanitizeSeekerPreferences,
  toAmenities,
  toPropertyType,
  upsertHousingDetail,
  upsertSeekerProfile,
} from '@/lib/listings/housing'
import type { HousingType, ListingStatus, RoomType } from '@/lib/listings/types'

// Housing actions (connect-only, ADR-39Y/148). General goods live on /market
// (lib/marketplace.ts); these write the shared `listings` base + the housing
// extension. Auth via getMyProfileId(); writes go through lib/listings (admin
// client behind app-code authz: only the owner edits their own listing).

const HOUSING_TYPES: readonly HousingType[] = [
  'rental',
  'roommate',
  'sublet',
  'roommate_wanted',
  'housing_wanted',
]
const ROOM_TYPES: readonly RoomType[] = ['private_room', 'shared_room', 'entire_place']

function posNum(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A checkbox toggle: present in the form (checked) → true, else false. */
function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) !== null
}

/** Parse the client gallery's hidden JSON field into a clean string[] of paths. */
function parseImages(v: FormDataEntryValue | null): string[] {
  if (typeof v !== 'string' || !v) return []
  try {
    const parsed: unknown = JSON.parse(v)
    // createListing caps at 6; mirror it so the count the member sees is what persists.
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

export async function createHousingListingAction(formData: FormData): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/housing/new')

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const listingType = String(formData.get('listing_type') ?? 'rental') as HousingType
  if (!HOUSING_TYPES.includes(listingType)) return

  const roomTypeRaw = String(formData.get('room_type') ?? '')
  const roomType = (ROOM_TYPES as readonly string[]).includes(roomTypeRaw) ? (roomTypeRaw as RoomType) : null

  const rentDollars = posNum(formData.get('rent'))
  const depositDollars = posNum(formData.get('deposit'))
  const bathroomsRaw = Number(formData.get('bathrooms'))
  const bathrooms = Number.isFinite(bathroomsRaw) && bathroomsRaw > 0 ? bathroomsRaw : null
  // lease_months allows 0 (month-to-month), so accept >= 0, empty → null.
  const leaseRaw = formData.get('lease_months')
  const leaseNum = Number(leaseRaw)
  const leaseMonths = leaseRaw !== null && leaseRaw !== '' && Number.isFinite(leaseNum) && leaseNum >= 0 ? Math.round(leaseNum) : null

  const listing = await createListing(profileId, {
    vertical: 'housing',
    title,
    description: (formData.get('description') as string) || null,
    city: (formData.get('city') as string) || null,
    neighborhood: (formData.get('neighborhood') as string) || null,
    priceNote: rentDollars ? `$${rentDollars}/mo` : null,
    images: parseImages(formData.get('images')),
  })
  if (!listing) return

  await upsertHousingDetail(listing.id, {
    listingType,
    rentCents: rentDollars ? Math.round(rentDollars * 100) : null,
    depositCents: depositDollars ? Math.round(depositDollars * 100) : null,
    bedrooms: posNum(formData.get('bedrooms')),
    bathrooms,
    roomType,
    leaseMonths,
    availableFrom: (formData.get('available_from') as string) || null,
    furnished: checkbox(formData, 'furnished'),
    utilitiesIncluded: checkbox(formData, 'utilities_included'),
    petsOk: checkbox(formData, 'pets_ok'),
    householdSize: posNum(formData.get('household_size')),
    propertyType: toPropertyType(formData.get('property_type')),
    sqft: posNum(formData.get('sqft')),
    amenities: toAmenities(formData.getAll('amenities').map(String)),
    smokingOk: checkbox(formData, 'smoking_ok'),
    cannabisOk: checkbox(formData, 'cannabis_ok'),
  })

  revalidatePath('/marketplace/housing')
  redirect(`/marketplace/housing/${listing.id}`)
}

export async function setListingStatusAction(id: string, status: ListingStatus): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || (await listingOwnerId(id)) !== profileId) return
  await setListingStatus(id, status)
  revalidatePath('/marketplace/housing')
  revalidatePath(`/marketplace/housing/${id}`)
}

export async function deleteListingAction(id: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || (await listingOwnerId(id)) !== profileId) return
  await deleteListing(id)
  revalidatePath('/marketplace/housing')
  redirect('/marketplace/housing')
}

/** Save the caller's roommate seeker profile (what they're looking for). The matching
 *  itself runs server-side via a consent-gated RPC; this is the seeker half. */
export async function saveSeekerProfileAction(formData: FormData): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/housing/roommates')

  const dollarsToCents = (k: string): number | null => {
    const n = Number(formData.get(k))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
  }

  const coord = (k: string): number | null => {
    const raw = formData.get(k)
    if (raw === null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  // Radius arrives in miles from the slider; store metres. Clamp to a sane band.
  const radiusMiles = Number(formData.get('radius_miles'))
  const radiusM =
    Number.isFinite(radiusMiles) && radiusMiles > 0
      ? Math.round(Math.min(Math.max(radiusMiles, 1), 100) * 1609.344)
      : 25000

  const str = (k: string): string | null => {
    const v = formData.get(k)
    return typeof v === 'string' ? v : null
  }
  // Lifestyle block → the lean preferences jsonb the roommate match blends on. Validated +
  // Fair-Housing gated in the pure sanitizer (gender_pref kept only for shared living).
  const preferences = sanitizeSeekerPreferences({
    cleanliness: str('cleanliness'),
    social_level: str('social_level'),
    schedule: str('schedule'),
    diet: str('diet'),
    pets: str('pets'),
    smoking: str('smoking'),
    cannabis: str('cannabis'),
    arrangement: str('arrangement'),
    gender_pref: str('gender_pref'),
    age_min: str('age_min'),
    age_max: str('age_max'),
  })

  await upsertSeekerProfile(profileId, {
    active: formData.get('active') !== null,
    budgetMinCents: dollarsToCents('budget_min'),
    budgetMaxCents: dollarsToCents('budget_max'),
    searchCity: (formData.get('city') as string)?.trim() || null,
    moveInFrom: (formData.get('move_in') as string) || null,
    searchLat: coord('search_lat'),
    searchLng: coord('search_lng'),
    searchRadiusM: radiusM,
    preferences,
  })
  revalidatePath('/marketplace/housing/roommates')
}
