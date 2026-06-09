'use server'

import { getMyProfileId } from '@/lib/auth'
import { createTicketCheckout } from '@/lib/billing/tickets'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Start a ticket purchase: validates + records a pending ticket and returns the
// hosted Stripe Checkout URL for the client to redirect to (ADR-177). Real money,
// destination charge to the event host — the host must be payouts-ready.
export async function startTicket(eventId: string, qty = 1): Promise<ActionResult<{ url: string }>> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return fail('Sign in to buy a ticket.')

  const r = await createTicketCheckout({ buyerProfileId, eventId, qty })
  if (r.error || !r.url) return fail(r.error ?? 'Could not start checkout.')
  return ok({ url: r.url })
}
