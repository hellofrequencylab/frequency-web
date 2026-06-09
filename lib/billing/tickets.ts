// Event tickets — second payout channel (Phase 3, ADR-177). A host prices an event;
// a signed-in member buys a ticket. Money moves as a Stripe DESTINATION CHARGE to
// the event host's connected account, minus the platform fee — the same one-off
// pattern as tips (ADR-176). Server-only.
//
// Flow mirrors tips: createTicketCheckout validates + records a `pending` ticket +
// returns the hosted Checkout URL; success is captured idempotently both by the
// checkout.session.completed webhook (recordTicketFromSession) and by the
// success-redirect reconcile (recordTicketFromSessionId).
//
// TIERS (EVENTS-SYSTEM §2.2): an event may have named ticket tiers in
// `event_ticket_types` with richer pricing — fixed / free / pwyc / sliding_scale /
// donation — plus per-tier inventory (`quantity` / `sold`). createTicketCheckout
// takes an optional `ticketTypeId`; for buyer-chosen modes the buyer supplies
// `amountCents`, floored server-side at the tier's `min_cents`. BACKWARD COMPAT:
// an event with a flat `events.price_cents` and NO tiers keeps working as an
// implicit single fixed tier (omit `ticketTypeId`).
//
// REFUNDS (EVENTS-SYSTEM §7): a host can refund a succeeded ticket. The refund is
// created on the destination charge with the transfer reversed and the application
// fee returned, then the webhook/charge.refunded handler flips the ticket to
// `refunded` and frees the tier's `sold` capacity. Flag-gated like all billing.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { getConnectStatus, payoutsLive } from './connect'
import { platformFeeCents } from './fees'
import { createAdminClient } from '@/lib/supabase/admin'

export const TICKET_MAX_QTY = 10

export type PricingMode = 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Gross charge for a quantity of tickets at a unit price. Pure (no I/O). */
export function ticketTotalCents(priceCents: number, qty: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return Math.round(priceCents) * Math.floor(qty)
}

/** Resolve the unit charge (cents) for a tier given the buyer's chosen amount.
 *  Pure (no I/O), so it's trivially testable and shared by checkout + validation.
 *
 *  - fixed         → the tier price_cents (buyer amount ignored)
 *  - free          → 0 (no charge; checkout is skipped upstream)
 *  - pwyc/donation → the buyer's amount, but never below min_cents
 *  - sliding_scale → the buyer's amount, never below min_cents (the floor IS the
 *                    only hard rule; the suggested band is a UI nudge, not a cap)
 *
 *  Returns `{ unitCents }` on success or `{ error }` when the buyer's amount is
 *  below the enforced floor for a buyer-chosen mode. */
export function resolveUnitCents(opts: {
  mode: PricingMode
  priceCents: number | null
  minCents: number | null
  amountCents?: number | null
}): { unitCents: number } | { error: string } {
  const { mode } = opts
  if (mode === 'free') return { unitCents: 0 }
  if (mode === 'fixed') {
    const fixed = Math.round(opts.priceCents ?? 0)
    if (!Number.isFinite(fixed) || fixed <= 0) return { error: 'This ticket has no price set.' }
    return { unitCents: fixed }
  }
  // Buyer-chosen (pwyc / sliding_scale / donation): enforce the floor server-side.
  const floor = Math.max(0, Math.round(opts.minCents ?? 0))
  const chosen = Math.round(opts.amountCents ?? 0)
  if (!Number.isFinite(chosen) || chosen <= 0) return { error: 'Enter an amount.' }
  if (chosen < floor) return { error: `Minimum is $${(floor / 100).toFixed(2)}.` }
  return { unitCents: chosen }
}

export interface TicketResult {
  url?: string
  error?: string
  /** True when a `free` tier needs no checkout (the caller records the RSVP-style
   *  claim instead of redirecting to Stripe). */
  free?: boolean
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

interface TicketTypeRow {
  id: string
  event_id: string
  name: string
  pricing_mode: PricingMode
  price_cents: number | null
  min_cents: number | null
  suggested_cents: number | null
  quantity: number | null
  sold: number
  member_only: boolean
  active: boolean
}

const TICKET_TYPE_COLS =
  'id, event_id, name, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, active'

/** Validate, record a pending ticket, and return the hosted Checkout URL.
 *
 *  Pass `ticketTypeId` to buy a specific tier; omit it to buy at the event's flat
 *  `events.price_cents` (backward compat — implicit single fixed tier). For
 *  buyer-chosen tiers (pwyc/sliding_scale/donation) pass `amountCents`; it is
 *  floored at the tier's `min_cents` server-side and rejected below it. */
export async function createTicketCheckout(opts: {
  buyerProfileId: string
  eventId: string
  qty?: number
  /** Buy this specific tier. Omit for the flat-price (legacy) path. */
  ticketTypeId?: string | null
  /** Buyer's chosen amount (cents) for pwyc/sliding_scale/donation tiers. */
  amountCents?: number | null
}): Promise<TicketResult> {
  if (!(await payoutsLive())) return { error: 'Ticketing isn’t turned on yet.' }
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
  if (new Date(event.ends_at ?? event.starts_at) < new Date()) return { error: 'This event has already ended.' }
  if (!event.host_id) return { error: 'This event has no host to pay.' }
  if (event.host_id === opts.buyerProfileId) return { error: 'You’re hosting this event.' }

  // ── Resolve the tier (or the implicit flat-price tier) ────────────────────────
  let tier: TicketTypeRow | null = null
  if (opts.ticketTypeId) {
    const { data: tt } = await db()
      .from('event_ticket_types')
      .select(TICKET_TYPE_COLS)
      .eq('id', opts.ticketTypeId)
      .eq('event_id', event.id)
      .maybeSingle()
    tier = (tt as TicketTypeRow | null) ?? null
    if (!tier) return { error: 'That ticket type isn’t available.' }
    if (!tier.active) return { error: 'That ticket type is no longer on sale.' }
  }

  const mode: PricingMode = tier?.pricing_mode ?? 'fixed'

  // member_only: only paying members (Crew+). Resolved against the buyer's tier so
  // it's enforced server-side regardless of what the client renders.
  if (tier?.member_only) {
    const { data: prof } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', opts.buyerProfileId)
      .maybeSingle()
    const t = (prof as { membership_tier?: string | null } | null)?.membership_tier ?? 'free'
    if (t === 'free') return { error: 'This ticket is for members only.' }
  }

  // ── Inventory: never oversell. quantity NULL = unlimited. Sold-out routes the
  // buyer back (the UI shows a sold-out / waitlist state from the same `sold`). ──
  if (tier && tier.quantity != null) {
    const remaining = tier.quantity - tier.sold
    if (remaining <= 0) return { error: 'This ticket type is sold out.' }
    if (qty > remaining) return { error: `Only ${remaining} left for this ticket.` }
  }

  // ── Free tier: no money moves, no checkout. The caller records the claim. ──
  if (mode === 'free') {
    return { free: true }
  }

  // ── Resolve the per-ticket charge amount for this mode (floor enforced). ──
  const unit = resolveUnitCents({
    mode,
    priceCents: tier ? tier.price_cents : event.price_cents,
    minCents: tier?.min_cents ?? null,
    amountCents: opts.amountCents,
  })
  if ('error' in unit) return unit
  const unitCents = unit.unitCents
  if (unitCents <= 0) {
    // A flat event with no price and no tier = free; nothing to charge.
    return { error: 'This event is free — no ticket needed.' }
  }

  // The host must be able to actually receive money.
  const status = await getConnectStatus(event.host_id)
  if (!status.accountId || !status.ready) return { error: 'Tickets aren’t available for this event yet.' }

  const gross = ticketTotalCents(unitCents, qty)
  const fee = platformFeeCents(gross)
  const tierLabel = tier ? ` (${tier.name})` : ''

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: unitCents,
          product_data: { name: `Ticket — ${event.title}${tierLabel}` },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: status.accountId },
      metadata: {
        kind: 'ticket',
        event_id: event.id,
        buyer_profile_id: opts.buyerProfileId,
        ...(tier ? { ticket_type_id: tier.id } : {}),
      },
    },
    metadata: {
      kind: 'ticket',
      event_id: event.id,
      buyer_profile_id: opts.buyerProfileId,
      ...(tier ? { ticket_type_id: tier.id } : {}),
    },
    success_url: `${appUrl()}/events/${event.slug}?ticket=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/events/${event.slug}`,
  })

  await db().from('event_tickets').insert({
    event_id: event.id,
    buyer_profile_id: opts.buyerProfileId,
    ticket_type_id: tier?.id ?? null,
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

/** Bump a tier's `sold` by `delta` (service role). Re-reads then writes — low
 *  volume, and the webhook is the only concurrent writer per ticket, so a plain
 *  read-modify-write is sufficient. Never lets `sold` go below 0. */
async function adjustTierSold(ticketTypeId: string, delta: number): Promise<void> {
  if (!ticketTypeId || delta === 0) return
  const { data } = await db()
    .from('event_ticket_types')
    .select('sold')
    .eq('id', ticketTypeId)
    .maybeSingle()
  const current = (data as { sold?: number } | null)?.sold ?? 0
  const next = Math.max(0, current + delta)
  await db().from('event_ticket_types').update({ sold: next }).eq('id', ticketTypeId)
}

/** Mark the ticket behind a completed Checkout session as succeeded (idempotent),
 *  and bump the tier's `sold` by the ticket qty IFF this call is the one that
 *  flipped pending → succeeded (so a redelivered webhook never double-counts). */
export async function recordTicketFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'ticket') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  // Only advance pending → succeeded; `.select()` returns the rows we actually
  // flipped, so a redelivered event (already succeeded) updates nothing and the
  // sold-count bump below is skipped — idempotent.
  const { data: updated } = await db()
    .from('event_tickets')
    .update({ status: 'succeeded', succeeded_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, ticket_type_id, qty')
  const rows = (updated ?? []) as { id: string; ticket_type_id: string | null; qty: number }[]
  for (const row of rows) {
    if (row.ticket_type_id) await adjustTierSold(row.ticket_type_id, row.qty ?? 1)
  }
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

export interface RefundResult {
  ok?: true
  error?: string
}

interface TicketForRefundRow {
  id: string
  event_id: string
  status: string
  stripe_payment_intent_id: string | null
  amount_cents: number
}

/** Refund a succeeded ticket (host action, EVENTS-SYSTEM §7). Issues a Stripe
 *  refund on the destination charge with the transfer REVERSED and the application
 *  fee RETURNED, so both the host's connected account and the platform fee are
 *  pulled back. The actual ticket status flip + capacity free happens in
 *  `recordTicketRefund`, driven by the `charge.refunded` webhook (and reconciled
 *  here on success so it's never lost if the webhook isn't wired).
 *
 *  Authorization (the caller hosts/manages this event) is enforced by the server
 *  action that calls this — see app/(main)/events/[slug]/ticket-actions.ts. */
export async function refundTicket(ticketId: string): Promise<RefundResult> {
  if (!(await payoutsLive())) return { error: 'Ticketing isn’t turned on yet.' }
  if (!stripe) return { error: 'Ticketing isn’t turned on yet.' }

  const { data } = await db()
    .from('event_tickets')
    .select('id, event_id, status, stripe_payment_intent_id, amount_cents')
    .eq('id', ticketId)
    .maybeSingle()
  const ticket = data as TicketForRefundRow | null
  if (!ticket) return { error: 'Ticket not found.' }
  if (ticket.status === 'refunded') return { ok: true } // already refunded — idempotent
  if (ticket.status !== 'succeeded') return { error: 'Only a completed purchase can be refunded.' }
  if (!ticket.stripe_payment_intent_id) return { error: 'This ticket has no charge to refund.' }

  try {
    // Destination charge refund: refund on the PaymentIntent from the PLATFORM
    // account, reversing the transfer (pull money back from the connected account)
    // and refunding the application fee (return the platform's cut) so the buyer is
    // made whole and no party is left holding funds. These two flags are the
    // documented way to fully unwind a destination charge — verified against the
    // Stripe Connect refunds docs (2026-06-09): "Set both reverse_transfer: true and
    // refund_application_fee: true when processing refunds for destination charges."
    await stripe.refunds.create({
      payment_intent: ticket.stripe_payment_intent_id,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { kind: 'ticket', ticket_id: ticket.id, event_id: ticket.event_id },
    })
  } catch (err) {
    console.error('[tickets] refund failed', { ticketId, err })
    return { error: 'Refund failed at the payment processor.' }
  }

  // Reconcile immediately (belt-and-suspenders); the charge.refunded webhook also
  // calls recordTicketRefund. Both are idempotent (only succeeded → refunded flips).
  await recordTicketRefund(ticket.stripe_payment_intent_id)
  return { ok: true }
}

/** Flip a refunded ticket to `refunded` and free its tier capacity (idempotent).
 *  Driven by the `charge.refunded` webhook and the inline reconcile in refundTicket.
 *  Keyed by the PaymentIntent id so it works from either source. Only flips a row
 *  that is currently `succeeded`, so a redelivered event decrements `sold` once. */
export async function recordTicketRefund(paymentIntentId: string | null): Promise<void> {
  if (!paymentIntentId) return
  const { data: updated } = await db()
    .from('event_tickets')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('status', 'succeeded')
    .select('id, ticket_type_id, qty')
  const rows = (updated ?? []) as { id: string; ticket_type_id: string | null; qty: number }[]
  for (const row of rows) {
    if (row.ticket_type_id) await adjustTierSold(row.ticket_type_id, -(row.qty ?? 1))
  }
}

/** Resolve the refund's PaymentIntent id from a `charge.refunded` event's Charge.
 *  We don't filter on charge metadata (the kind tag lives on the PaymentIntent, not
 *  the Charge) — recordTicketRefund itself no-ops unless a matching `succeeded`
 *  ticket exists for that PaymentIntent, so non-ticket charges are harmless. */
export async function recordTicketRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordTicketRefund(paymentIntentId)
}
