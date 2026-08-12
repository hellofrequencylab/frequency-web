'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import {
  createListing, updateListing, setListingStatus, deleteListing, listingAuthorId,
  type ListingInput, type ListingPatch, type ListingStatus,
} from '@/lib/marketplace'

// Local Marketplace actions (ADR-148). Building/managing a listing is free for any
// member (own listings only); there is no payment — "contact" hands off to DMs.

async function assertOwner(id: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const author = await listingAuthorId(id)
  return author && author === profileId ? profileId : null
}

// Delete is the one action platform staff (admin/janitor) may take on ANOTHER member's
// listing — moderation. Every other action stays owner-only.
async function assertOwnerOrStaff(id: string): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  if ((await listingAuthorId(id)) === profileId) return true
  return await isPlatformStaff()
}

export async function createListingAction(input: ListingInput): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post a listing.')
  if (!input.title?.trim()) return fail('Give your listing a title.')
  const listing = await createListing(profileId, input)
  if (!listing) return fail('Could not post the listing. Try again.')
  revalidatePath('/classifieds')
  return ok({ id: listing.id })
}

/** How each listing kind is described to Vera. Plain, and never "for sale": the board takes no
 *  payment, so the copy must not imply a checkout (docs/NAMING.md, Classifieds is connect-only). */
const KIND_FRAMING: Record<string, string> = {
  offer: 'something a neighbour is offering to another neighbour on a community board (no checkout, they arrange it between themselves)',
  free: 'something a neighbour is giving away for free on a community board',
  lend: 'something a neighbour is lending out on a community board, to be borrowed and returned',
  request: 'a neighbour asking whether anyone nearby has a thing they need, on a community board',
}

/**
 * Draft the headline + details for a Classifieds listing with Vera (the Spark's first door, ADR-986).
 * Posting is free for any signed-in member, so the gate here is exactly that: signed in.
 *
 * NEVER throws and never blocks: draftListingCopy falls back to a deterministic draft when Vera is off
 * or over budget, and a signed-out caller gets empty copy (the Spark then leaves its fields alone).
 */
export async function draftBoardListingCopyAction(input: {
  kind?: string | null
  seed?: string | null
}): Promise<ListingCopy> {
  const profileId = await getMyProfileId()
  if (!profileId) return { title: '', description: '' }
  return draftListingCopy({
    // A Classifieds listing is not a commerce row at all. `kind` only picks the default framing, which
    // `framing` overrides with the truth for this board.
    kind: 'physical',
    framing: KIND_FRAMING[String(input.kind ?? 'offer')] ?? KIND_FRAMING.offer,
    seed: input.seed ?? null,
    profileId,
  })
}

export async function updateListingAction(id: string, patch: ListingPatch): Promise<ActionResult> {
  if (!(await assertOwner(id))) return fail('Not allowed.')
  try {
    await updateListing(id, patch)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the listing.')
  }
  revalidatePath('/classifieds')
  revalidatePath(`/classifieds/${id}`)
  return ok()
}

export async function setListingStatusAction(id: string, status: ListingStatus): Promise<ActionResult> {
  if (!(await assertOwner(id))) return fail('Not allowed.')
  try {
    await setListingStatus(id, status)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not update the listing status.')
  }
  revalidatePath('/classifieds')
  revalidatePath(`/classifieds/${id}`)
  return ok()
}

export async function deleteListingAction(id: string): Promise<ActionResult> {
  if (!(await assertOwnerOrStaff(id))) return fail('Not allowed.')
  try {
    await deleteListing(id)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not delete the listing.')
  }
  revalidatePath('/classifieds')
  revalidatePath(`/classifieds/${id}`)
  return ok()
}
