'use server'

// The RECIPIENT's half of a circle handoff (ADR-845). The offer is created from the owner's side
// (the Space Circles console, or a personal host's own controls); this is where the person it was
// offered to answers. lib/circles/handoff owns every rule, including that only the recipient may
// accept and that answering claims the row first so two clicks cannot both go through.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import {
  listOffersForRecipient,
  respondToCircleOffer,
  type CircleOffer,
} from '@/lib/circles/handoff'

/** The circle handoffs waiting on the signed-in member. Empty for everyone else. */
export async function myCircleOffersAction(): Promise<CircleOffer[]> {
  const profileId = await getMyProfileId().catch(() => null)
  return listOffersForRecipient(profileId)
}

/** Accept or decline one. Accepting makes the circle theirs: root-owned, with them as host. */
export async function respondToCircleOfferAction(
  offerId: string,
  action: 'accept' | 'decline',
): Promise<ActionResult<{ circleSlug: string | null }>> {
  const profileId = await getMyProfileId().catch(() => null)
  if (!profileId) return fail('Sign in first.')

  const res = await respondToCircleOffer(offerId, action, profileId)
  if (!res.ok) return fail(res.reason || 'Could not answer that handoff.')

  revalidatePath('/circles')
  if (res.circleSlug) revalidatePath(`/circles/${res.circleSlug}`)
  return ok({ circleSlug: res.circleSlug })
}
