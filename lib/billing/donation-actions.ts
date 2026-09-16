'use server'

// The one callable seam for giving (LIVE-235). A thin 'use server' wrapper over
// lib/billing/space-donation-checkout.ts, which cannot carry the directive itself because it also
// exports the pure helper and the webhook recorders (a server-action module may export only async
// functions).
//
// THE DONOR IS RESOLVED FROM THE SESSION, never posted. A signed-out donor is allowed on purpose
// (a gift does not require an account) and simply resolves to a null profile id, which the checkout
// treats as a self-sourced gift at 0%.

import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { createSpaceDonationCheckout } from './space-donation-checkout'
import { onPageCheckoutAvailable } from './stripe-browser'

/**
 * Start a gift to a Space's fund. Returns EITHER an on-page client secret or the hosted Checkout
 * URL (LIVE-359), or a member-facing refusal.
 *
 * ⚠️ Both fields are optional and exactly one arrives, so a caller that reads only `url` goes DEAD
 * the moment elements mode is on. components/billing/onpage-callers.test.ts fails any caller that
 * does not branch on both.
 */
export async function startSpaceDonationCheckout(
  spaceId: string,
  amountCents: number,
  message?: string | null,
  opts?: {
  /** 🔴 Set by a caller whose on-page form already FAILED, to demand a session it can redirect
   *  to. Without it the fallback re-asks for elements, gets another client secret, finds no `url`
   *  and dead-ends the buyer -- the live 2026-09-15 ticket failure. */
    forceHosted?: boolean
  },
): Promise<ActionResult<{ url?: string; clientSecret?: string }>> {
  if (!spaceId) return fail('This fund is not available.')
  const donorProfileId = await getMyProfileId()
  const result = await createSpaceDonationCheckout({
    spaceId,
    amountCents,
    donorProfileId,
    message: message ?? null,
    // Ask for the on-page form only when the browser can actually mount it.
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (result.clientSecret) return ok({ clientSecret: result.clientSecret })
  if (result.url) return ok({ url: result.url })
  return fail(result.error ?? 'Could not start your gift. Please try again.')
}
