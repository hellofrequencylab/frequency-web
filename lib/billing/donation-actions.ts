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

/** Start a gift to a Space's fund. Returns the hosted Checkout URL, or a member-facing refusal. */
export async function startSpaceDonationCheckout(
  spaceId: string,
  amountCents: number,
  message?: string | null,
): Promise<ActionResult<{ url: string }>> {
  if (!spaceId) return fail('This fund is not available.')
  const donorProfileId = await getMyProfileId()
  const result = await createSpaceDonationCheckout({
    spaceId,
    amountCents,
    donorProfileId,
    message: message ?? null,
  })
  if (result.url) return ok({ url: result.url })
  return fail(result.error ?? 'Could not start your gift. Please try again.')
}
