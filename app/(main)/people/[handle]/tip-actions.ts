'use server'

import { getMyProfileId } from '@/lib/auth'
import { createTipCheckout } from '@/lib/billing/tips'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Start a tip to a host/partner: validates + records a pending tip and returns the
// hosted Stripe Checkout URL for the client to redirect to (ADR-176). Real money,
// destination charge — the recipient must already be payouts-ready.
export async function startTip(
  toProfileId: string,
  amountCents: number,
  message?: string,
): Promise<ActionResult<{ url: string }>> {
  const fromProfileId = await getMyProfileId()
  if (!fromProfileId) return fail('Sign in to send a tip.')

  const r = await createTipCheckout({ fromProfileId, toProfileId, amountCents, message })
  if (r.error || !r.url) return fail(r.error ?? 'Could not start checkout.')
  return ok({ url: r.url })
}
