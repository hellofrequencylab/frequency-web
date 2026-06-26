'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createTicketCheckout, refundTicket } from '@/lib/billing/tickets'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Start a ticket purchase: validates + records a pending ticket and returns the
// hosted Stripe Checkout URL for the client to redirect to (ADR-177). Real money,
// destination charge to the event host — the host must be payouts-ready.
//
// `ticketTypeId` selects a tier (omit for the event's flat price — backward compat).
// `amountCents` is the buyer's chosen amount for pwyc/sliding_scale/donation tiers;
// the floor (min_cents) is enforced server-side in createTicketCheckout. A `free`
// tier returns `{ free: true }` instead of a URL — there's nothing to charge.
export async function startTicket(
  eventId: string,
  opts?: { qty?: number; ticketTypeId?: string | null; amountCents?: number | null },
): Promise<ActionResult<{ url?: string; free?: boolean }>> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return fail('Sign in to buy a ticket.')

  const r = await createTicketCheckout({
    buyerProfileId,
    eventId,
    qty: opts?.qty ?? 1,
    ticketTypeId: opts?.ticketTypeId ?? null,
    amountCents: opts?.amountCents ?? null,
  })
  if (r.error) return fail(r.error)
  // Free tier: no money moves, no checkout (createTicketCheckout already enforced the
  // tier's active/member-only/inventory gates). Record the claim as a normal "going"
  // RSVP (ADR-410): it rides event capacity (full ⇒ waitlist, via the DB capacity
  // trigger), fires the first-RSVP gem + confirmation, and is idempotent — exactly the
  // path a free event already uses. We deliberately do NOT mint an event_tickets row or
  // bump the tier's `sold`, so a free tier's own `quantity` isn't separately enforced
  // for claims (event capacity governs); the inventory gate above still blocks a
  // sold-out free tier. Best-effort recording must not mask the claim from the client.
  if (r.free) {
    await setRsvpStatus(eventId, 'going')
    return ok({ free: true })
  }
  if (!r.url) return fail('Could not start checkout.')
  return ok({ url: r.url })
}

// Refund a ticket (host action, EVENTS-SYSTEM §7). The caller must be able to edit
// this event's settings (they host it / manage its circle / are admin+) — the same
// gate the admin editor uses. The Stripe refund reverses the transfer and returns
// the platform fee; the webhook/reconcile flips the ticket to `refunded` and frees
// the tier's capacity. Real money — re-checked server-side, never trusts the client.
export async function refundTicketAction(
  ticketId: string,
  eventId: string,
  slug: string,
): Promise<ActionResult<void>> {
  if (!(await getMyProfileId())) return fail('Sign in.')
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You can’t refund tickets for this event.')

  const r = await refundTicket(ticketId, eventId)
  if (r.error) return fail(r.error)

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/admin/events`)
  return ok()
}
