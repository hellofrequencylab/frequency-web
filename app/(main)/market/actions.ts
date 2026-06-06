'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  createListing, updateListing, setListingStatus, deleteListing, listingAuthorId,
  type ListingInput, type ListingPatch, type ListingStatus,
} from '@/lib/marketplace'

// Local Marketplace actions (ADR-146). Building/managing a listing is free for any
// member (own listings only); there is no payment — "contact" hands off to DMs.

async function assertOwner(id: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await listingAuthorId(id)
  return author && author === profileId ? profileId : null
}

export async function createListingAction(input: ListingInput): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post a listing.')
  if (!input.title?.trim()) return fail('Give your listing a title.')
  const listing = await createListing(profileId, input)
  if (!listing) return fail('Could not post the listing. Try again.')
  revalidatePath('/market')
  return ok({ id: listing.id })
}

export async function updateListingAction(id: string, patch: ListingPatch): Promise<ActionResult> {
  if (!(await assertOwner(id))) return fail('Not allowed.')
  await updateListing(id, patch)
  revalidatePath('/market')
  revalidatePath(`/market/${id}`)
  return ok()
}

export async function setListingStatusAction(id: string, status: ListingStatus): Promise<ActionResult> {
  if (!(await assertOwner(id))) return fail('Not allowed.')
  await setListingStatus(id, status)
  revalidatePath('/market')
  revalidatePath(`/market/${id}`)
  return ok()
}

export async function deleteListingAction(id: string): Promise<ActionResult> {
  if (!(await assertOwner(id))) return fail('Not allowed.')
  await deleteListing(id)
  revalidatePath('/market')
  return ok()
}
