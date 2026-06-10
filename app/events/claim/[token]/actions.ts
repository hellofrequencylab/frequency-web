'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { claimEvent } from '@/lib/events/event-drafts'

/** The organizer claims a posted event with its one-time token: they become the
 *  host and land on the event page with a success note. All checks (token
 *  validity, unclaimed, not removed) run inside the engine's claimEvent. */
export async function claimEventAction(token: string): Promise<{ error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Please sign in to claim this event.' }

  const res = await claimEvent(profileId, token)
  if (!res) return { error: 'This event could not be claimed. The link may already have been used.' }

  revalidatePath(`/events/${res.slug}`)
  revalidatePath('/events')
  redirect(`/events/${res.slug}?claimed=1`)
}
