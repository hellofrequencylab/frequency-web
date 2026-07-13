'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { claimSpace } from '@/lib/spaces/claim'

/** The real owner claims a seeded Space with its one-time token: ownership transfers to them (and they
 *  are seated as an admin), and they land on the now-theirs Space. Every check (token validity, still
 *  unclaimed) runs inside claimSpace (a compare-and-set). On failure a soft error returns for the button
 *  to render on the same page (mirrors the listing claim action). */
export async function claimSpaceAction(token: string): Promise<{ error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Please sign in to claim this business.' }

  const res = await claimSpace(token, profileId)
  if (!res) return { error: 'This business could not be claimed. The link may already have been used.' }

  revalidatePath(`/spaces/${res.slug}`)
  redirect(`/spaces/${res.slug}?claimed=1`)
}
