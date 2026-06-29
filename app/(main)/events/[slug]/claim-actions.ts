'use server'

// Public "Is this your event? Claim it" action. It never reveals or accepts an
// arbitrary address: it only (re)sends the one-time claim link to the organizer
// contact ON FILE, so just whoever controls that inbox can complete the claim.
// Sign-in is required as a light anti-abuse gate (claiming needs an account anyway).

import { getMyProfileId } from '@/lib/auth'
import { resendClaimInvite } from '@/lib/events/event-drafts'

export type RequestClaimResult =
  | { ok: true }
  | { ok: false; error: 'sign_in' | 'no_email_on_file' | 'already_claimed' | 'unavailable' }

export async function requestClaimLink(eventId: string): Promise<RequestClaimResult> {
  const me = await getMyProfileId()
  if (!me) return { ok: false, error: 'sign_in' }

  const res = await resendClaimInvite(eventId)
  if (res.ok) return { ok: true }
  if (res.error === 'no_email_on_file') return { ok: false, error: 'no_email_on_file' }
  if (res.error === 'already_claimed') return { ok: false, error: 'already_claimed' }
  return { ok: false, error: 'unavailable' }
}
