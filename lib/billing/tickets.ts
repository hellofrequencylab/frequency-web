// Event tickets — second payout channel (Phase 3, ADR-177). A host prices an event;
// a signed-in member buys a ticket. Money moves as a Stripe DESTINATION CHARGE to
// the event host's connected account, minus the platform fee — the same one-off
// pattern as tips (ADR-176). Server-only.
//
// Flow mirrors tips: createTicketCheckout validates + records a `pending` ticket +
// returns the hosted Checkout URL; success is captured idempotently both by the
// checkout.session.completed webhook (recordTicketFromSession) and by the
// success-redirect reconcile (recordTicketFromSessionId).

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { getConnectStatus } from './connect'
import { platformFeeCents } from './fees'
import { createAdminClient } from '@/lib/supabase/admin'

export const TICKET_MAX_QTY = 10

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Gross charge for a quantity of tickets at a unit price. Pure (no I/O). */
export function ticketTotalCents(priceCents: number, qty: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return Math.round(priceCents) * Math.floor(qty)
}

export interface TicketResult {
  url?: string
  error?: string
}

interface EventRow {
  id: string
  title: string
  slug: string
  price_cents: number | null
  is_cancelled: boolean | null
  ends_at: string | null
  starts_at: string
  host_id: string | null
}

/** Validate, record a pending ticket, and return the hosted Checkout URL. */
export async function createTicketCheckout(opts: {
  buyerProfileId: string
  eventId: string
  qty?: number
}): Promise<TicketResult> {
  if (!stripe) return { error: 'Ticketing isn’t turned on yet.' }
  const qty = Math.min(Math.max(Math.floor(opts.qty ?? 1), 1), TICKET_MAX_QTY)

  const { data } = await db()
    .from('events')
    .select('id, title, slug, price_cents, is_cancelled, ends_at, starts_at, host_id')
    .eq('id', opts.eventId)
    .maybeSingle()
  const event = data as EventRow | null
  if (!event) return { error: 'Event not found.' }
  if (event.is_cancelled) return { error: 'This event has been cancelled.' }
  if (!event.price_cents || event.price_cents <= 0) return { error: 'This event is free — no ticket needed.' }
  if (new Date(event.ends_at ?? event.starts_at) < new Date()) return { error: 'This event has already ended.' }
  if (!event.host_id) return { error: 'This event has no host to pay.' }
  if (event.host_id === opts.buyerProfileId) return { error: 'You’re hosting this event.' }

  // The host must be able to actually receive money.
  const status = await getConnectStatus(event.host_id)
  if (!status.accountId || !status.ready) return { error: 'Tickets aren’t available for this event yet.' }

  const gross = ticketTotalCents(event.price_cents, qty)
  const fee = platformFeeCents(gross)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: event.price_cents,
          product_data: { name: `Ticket — ${event.title}` },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: status.accountId },
      metadata: { kind: 'ticket', event_id: event.id, buyer_profile_id: opts.buyerProfileId },
    },
    metadata: { kind: 'ticket', event_id: event.id, buyer_profile_id: opts.buyerProfileId },
    success_url: `${appUrl()}/events/${event.slug}?ticket=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/events/${event.slug}`,
  })

  await db().from('event_tickets').insert({
    event_id: event.id,
    buyer_profile_id: opts.buyerProfileId,
    qty,
    amount_cents: gross,
    platform_fee_cents: fee,
    currency: 'usd',
    status: 'pending',
    stripe_checkout_session_id: session.id,
  })

  if (!session.url) return { error: 'Could not start checkout.' }
  return { url: session.url }
}

/** Has this member already bought a (succeeded) ticket to this event? */
export async function hasTicket(eventId: string, profileId: string): Promise<boolean> {
  const { data } = await db()
    .from('event_tickets')
    .select('id')
    .eq('event_id', eventId)
    .eq('buyer_profile_id', profileId)
    .eq('status', 'succeeded')
    .limit(1)
    .maybeSingle()
  return !!data
}

/** Mark the ticket behind a completed Checkout session as succeeded (idempotent). */
export async function recordTicketFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'ticket') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  await db()
    .from('event_tickets')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
}

/** Webhook-independent reconcile on the success redirect; returns gross cents or null. */
export async function recordTicketFromSessionId(sessionId: string): Promise<number | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.metadata?.kind !== 'ticket' || session.payment_status !== 'paid') return null
  await recordTicketFromSession(session)
  return session.amount_total ?? null
}
