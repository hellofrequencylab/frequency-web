// A SPACE REFUNDS ITS OWN SALES (LIVE-2550).
//
// The Orders tab lists every sale a Space made: shop orders, event tickets and donations. Before this
// an owner could refund a ticket from the event page and nothing else: a shop order went back only
// through staff, and a donation had no refund path at all outside the Stripe dashboard.
//
// One door, three money paths, each the one that already exists for that kind of sale:
//   order     refundCommerceOrder (unwinds the destination charge, honours a booking policy)
//   ticket    refundTicket        (reverses the transfer, frees the seat)
//   donation  refundSpaceDonation (reverses the transfer, returns any fee)
//
// EVERY REFUND IS PINNED TO THE SPACE before money moves. The caller's authority over the Space is
// checked by the action; this module checks that the sale is the Space's own, so a manager of one
// Space can never refund another's sale by passing its id. A split order (several sellers on one
// charge) is refused here: refunding it takes money back from other sellers, so it stays with staff.
// Server-only. No em or en dashes.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { refundCommerceOrder } from '@/lib/commerce/checkout'
import { refundTicket } from '@/lib/billing/tickets'
import { refundSpaceDonation } from '@/lib/billing/space-donation-checkout'

export type RefundableSaleKind = 'order' | 'ticket' | 'donation'

type RefundOutcome = { ok: true } | { error: string }

function db(): SupabaseClient {
  return createAdminClient()
}

const NOT_YOURS = 'That sale is not one of this Space’s.'

/** Does this event sell for this Space? The same rule the Orders tab lists by: the Space hosts it, or
 *  owns it with no other host. PURE. */
export function eventSellsForSpace(
  event: { host_space_id: string | null; space_id: string | null } | null | undefined,
  spaceId: string,
): boolean {
  if (!event || !spaceId) return false
  if (event.host_space_id) return event.host_space_id === spaceId
  return event.space_id === spaceId
}

async function refundOrder(spaceId: string, orderId: string): Promise<RefundOutcome> {
  const { data, error } = await db()
    .from('commerce_orders')
    .select('id, owner_space_id, funds_flow')
    .eq('id', orderId)
    .maybeSingle()
  if (error) return { error: 'We could not read that order. Try again.' }
  const order = data as { id: string; owner_space_id: string | null; funds_flow: string | null } | null
  if (!order || order.owner_space_id !== spaceId) return { error: NOT_YOURS }
  if (order.funds_flow === 'separate') {
    return { error: 'This order pays more than one seller. Ask Frequency support to refund it.' }
  }
  const res = await refundCommerceOrder(order.id)
  return res.error ? { error: res.error } : { ok: true }
}

async function refundTicketSale(spaceId: string, ticketId: string): Promise<RefundOutcome> {
  const { data: t, error } = await db().from('event_tickets').select('id, event_id').eq('id', ticketId).maybeSingle()
  if (error) return { error: 'We could not read that ticket. Try again.' }
  const ticket = t as { id: string; event_id: string } | null
  if (!ticket) return { error: NOT_YOURS }
  const { data: e } = await db().from('events').select('host_space_id, space_id').eq('id', ticket.event_id).maybeSingle()
  if (!eventSellsForSpace(e as { host_space_id: string | null; space_id: string | null } | null, spaceId)) {
    return { error: NOT_YOURS }
  }
  const res = await refundTicket(ticket.id, ticket.event_id)
  return res.error ? { error: res.error } : { ok: true }
}

/** Refund one of a Space's own sales in full. The caller must already be cleared to manage the
 *  Space's money; this pins the sale to the Space and runs the refund path for its kind. */
export async function refundSpaceSale(spaceId: string, kind: RefundableSaleKind, id: string): Promise<RefundOutcome> {
  if (!spaceId || !id) return { error: NOT_YOURS }
  if (kind === 'order') return refundOrder(spaceId, id)
  if (kind === 'ticket') return refundTicketSale(spaceId, id)
  if (kind === 'donation') {
    const res = await refundSpaceDonation(id, spaceId)
    return res.error ? { error: res.error } : { ok: true }
  }
  return { error: NOT_YOURS }
}
