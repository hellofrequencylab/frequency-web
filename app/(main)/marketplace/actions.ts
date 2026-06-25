'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createListing, setListingStatus, deleteListing, listingOwnerId } from '@/lib/listings'
import type { ListingVertical } from '@/lib/listings/types'

// Server actions for the connect-only listings surface. Auth via getMyProfileId();
// writes go through lib/listings (admin client). Mirrors app/(main)/market/actions.ts.

export async function createListingAction(formData: FormData): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/new')

  const vertical = (String(formData.get('vertical') ?? 'market') as ListingVertical)
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const kind = String(formData.get('kind') ?? '').trim()
  const category = kind && kind !== 'offer' ? kind : null

  const listing = await createListing(profileId, {
    vertical,
    title,
    description: (formData.get('description') as string) || null,
    priceNote: (formData.get('price_note') as string) || null,
    category,
    city: (formData.get('city') as string) || null,
  })
  if (!listing) return

  revalidatePath('/marketplace')
  redirect('/marketplace')
}

export async function setListingStatusAction(id: string, status: 'active' | 'claimed' | 'closed'): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || (await listingOwnerId(id)) !== profileId) return
  await setListingStatus(id, status)
  revalidatePath('/marketplace')
}

export async function deleteListingAction(id: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || (await listingOwnerId(id)) !== profileId) return
  await deleteListing(id)
  revalidatePath('/marketplace')
}
