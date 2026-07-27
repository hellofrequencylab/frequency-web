'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { listingOwnerId, saveListing, unsaveListing, updateListing } from '@/lib/listings'
import { toAmenities, toPropertyType, upsertHousingDetail } from '@/lib/listings/housing'
import { approxCoordsForArea } from '@/lib/marketplace/area-geocode'
import type { HousingType, RoomType } from '@/lib/listings/types'

// Housing EDIT + favorites actions. The create/status/delete actions live in
// app/(main)/marketplace/actions.ts; this file adds the missing update half (audit
// Tier A #4) plus the tiny save/unsave pair the heart toggle calls (#7). Auth via
// getMyProfileId(); the update is owner-checked twice — here (listingOwnerId) and
// row-level inside updateListing's WHERE.

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
    // updateListing caps at 6; mirror it so the count the member sees is what persists.
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

/** Update a housing listing (base row + housing extension). Validation mirrors
 *  createHousingListingAction field for field, so create and edit can never drift. */
export async function updateHousingListingAction(listingId: string, formData: FormData): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/housing/${listingId}/edit`)
  if ((await listingOwnerId(listingId)) !== profileId) return

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

  const city = (formData.get('city') as string) || null
  const neighborhood = (formData.get('neighborhood') as string) || null

  // Re-geocode on edit exactly as create does (ADR-863): without this, changing the city left
  // the OLD coordinates, so geo_fit and proximity reads scored against the wrong place forever.
  // Best-effort; a miss leaves coordinates untouched rather than blocking the save.
  let coords: { latitude: number; longitude: number } | null = null
  try {
    const c = await approxCoordsForArea([neighborhood, city].filter(Boolean).join(', '))
    if (c) coords = { latitude: c.lat, longitude: c.lng }
  } catch {
    coords = null
  }

  const updated = await updateListing(listingId, profileId, {
    title,
    description: (formData.get('description') as string) || null,
    city,
    neighborhood,
    priceNote: rentDollars ? `$${rentDollars}/mo` : null,
    images: parseImages(formData.get('images')),
    ...(coords ?? {}),
  })
  if (!updated) return

  await upsertHousingDetail(listingId, {
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

  revalidatePath('/housing')
  revalidatePath(`/housing/${listingId}`)
  redirect(`/housing/${listingId}`)
}

// ── Favorites (the heart toggle) ─────────────────────────────────────────────
// Signed-out callers are handled in the button (it links to /sign-in), so these
// quietly no-op without a profile rather than throwing at a race.

export async function saveListingAction(listingId: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) return
  await saveListing(profileId, listingId)
  revalidatePath('/housing')
}

export async function unsaveListingAction(listingId: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) return
  await unsaveListing(profileId, listingId)
  revalidatePath('/housing')
}
