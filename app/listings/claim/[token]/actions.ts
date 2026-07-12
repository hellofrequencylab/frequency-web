'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { claimListing } from '@/lib/listing-seeder/claim'

/** The route a claimed listing lands on, per vertical (the public detail page). */
function listingDetailPath(kind: 'classifieds' | 'housing', listingId: string): string {
  return kind === 'housing' ? `/marketplace/housing/${listingId}` : `/classifieds/${listingId}`
}

/** The poster claims a seeded listing with its one-time token: ownership transfers to them and
 *  they land on the now-theirs listing. Every check (token validity, still seed-owned, unclaimed)
 *  runs inside the engine's claimListing (a compare-and-set). On failure a soft error returns for
 *  the button to render on the same page (mirrors the events claim action). */
export async function claimListingAction(token: string): Promise<{ error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Please sign in to claim this listing.' }

  const res = await claimListing(token, profileId)
  if (!res) return { error: 'This listing could not be claimed. The link may already have been used.' }

  const path = listingDetailPath(res.kind, res.listingId)
  revalidatePath(path)
  redirect(`${path}?claimed=1`)
}
