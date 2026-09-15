'use server'

import { getMyProfileId } from '@/lib/auth'
import { createTipCheckout } from '@/lib/billing/tips'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Start a tip to a host/partner: validates + records a pending tip and returns EITHER an on-page
// client secret or the hosted Stripe Checkout URL (ADR-176, LIVE-359). Real money, destination
// charge — the recipient must already be payouts-ready.
//
// ⚠️ Both fields are optional and exactly one arrives, so a caller that reads only `url` goes DEAD
// the moment elements mode is on. components/billing/onpage-callers.test.ts fails any caller that
// does not branch on both.
export async function startTip(
  toProfileId: string,
  amountCents: number,
  message?: string,
): Promise<ActionResult<{ url?: string; clientSecret?: string }>> {
  const fromProfileId = await getMyProfileId()
  if (!fromProfileId) return fail('Sign in to send a tip.')

  const r = await createTipCheckout({
    fromProfileId,
    toProfileId,
    amountCents,
    message,
    // Ask for the on-page form only when the browser can actually mount it. Without the
    // publishable key Stripe.js cannot load, so requesting elements would strand the buyer.
    ui: onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (r.error) return fail(r.error)
  if (r.clientSecret) return ok({ clientSecret: r.clientSecret })
  if (!r.url) return fail('Could not start checkout.')
  return ok({ url: r.url })
}
