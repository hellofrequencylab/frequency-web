'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createListing, setListingStatus, deleteListing, listingOwnerId } from '@/lib/listings'
import { upsertHousingDetail } from '@/lib/listings/housing'
import type { HousingType, ListingStatus, RoomType } from '@/lib/listings/types'

// Housing actions (connect-only, ADR-39Y/148). General goods live on /market
// (lib/marketplace.ts); these write the shared `listings` base + the housing
// extension. Auth via getMyProfileId(); writes go through lib/listings (admin
// client behind app-code authz: only the owner edits their own listing).

const HOUSING_TYPES: readonly HousingType[] = ['rental', 'roommate', 'sublet']
const ROOM_TYPES: readonly RoomType[] = ['private_room', 'shared_room', 'entire_place']

function posNum(v: FormDataEntryValue | null): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
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

  const listing = await createListing(profileId, {
    vertical: 'housing',
    title,
    description: (formData.get('description') as string) || null,
    city: (formData.get('city') as string) || null,
    neighborhood: (formData.get('neighborhood') as string) || null,
    priceNote: rentDollars ? `$${rentDollars}/mo` : null,
  })
  if (!listing) return

  await upsertHousingDetail(listing.id, {
    listingType,
    rentCents: rentDollars ? Math.round(rentDollars * 100) : null,
    bedrooms: posNum(formData.get('bedrooms')),
    roomType,
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
