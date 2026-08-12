'use server'

// HOUSEHOLD / CIRCLE BUNDLE SEAT ACTIONS (ADR-370). The four things a member can do with a bundle
// seat after the purchase: offer one, withdraw the offer, take a seat, turn one down.
//
// THE CALLER IS ALWAYS RE-RESOLVED FROM THE SESSION. Every action below reads the profile id off
// the signed-in user and passes THAT to the gate; no posted id ever names the actor. A posted id
// that could name the owner would let anyone seat themselves into someone else's bundle, which is
// a paid membership for free.
//
// GATED END TO END on bundleSellable() = billingLive() AND bundle_household_enabled, both default
// OFF and FAIL-SAFE FALSE. While the flag is off there is no bundle to seat and these return the
// same refusal for everyone, so no invite can be written on an unflipped platform.
//
// The authority split is the point (the owner's ruling): the OWNER may send and revoke, the
// INVITEE may accept and decline, and neither can do the other's half. Nobody is seated without
// agreeing.

import { getMyProfileId } from '@/lib/auth'
import { bundleSellable } from '@/lib/pricing/settings'
import {
  sendBundleSeatInvite,
  respondToBundleSeatInvite,
  revokeBundleSeatInvite,
} from '@/lib/billing/bundle-invites'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** The one refusal for a platform where the bundle is not on. Said plainly, in voice: it names the
 *  state rather than apologising for it. */
const NOT_LIVE = 'Bundle seats aren’t turned on yet.'

/** Offer a seat on the caller's bundle to the member at this @handle. Owner-only, enforced in
 *  lib/billing/bundle-invites.ts against the bundle keyed by the caller's own profile id. */
export async function inviteToBundleSeat(handle: string): Promise<ActionResult<void>> {
  const me = await getMyProfileId()
  if (!me) return fail('Not signed in')
  if (!(await bundleSellable())) return fail(NOT_LIVE)

  const res = await sendBundleSeatInvite(handle, me)
  return res.ok ? ok() : fail(res.reason)
}

/** Withdraw a seat offer that has not been answered. Owner-only. */
export async function revokeBundleSeatOffer(inviteId: string): Promise<ActionResult<void>> {
  const me = await getMyProfileId()
  if (!me) return fail('Not signed in')
  if (!(await bundleSellable())) return fail(NOT_LIVE)

  const res = await revokeBundleSeatInvite(inviteId, me)
  return res.ok ? ok() : fail(res.reason)
}

/** Take the seat, or turn it down. INVITEE-ONLY: the gate checks the invite's to_profile_id
 *  against the session, and the seat write re-checks it inside the transaction. */
export async function answerBundleSeatOffer(
  inviteId: string,
  action: 'accept' | 'decline',
): Promise<ActionResult<void>> {
  const me = await getMyProfileId()
  if (!me) return fail('Not signed in')
  if (!(await bundleSellable())) return fail(NOT_LIVE)

  const res = await respondToBundleSeatInvite(inviteId, action, me)
  return res.ok ? ok() : fail(res.reason)
}
