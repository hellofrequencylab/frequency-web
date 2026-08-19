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
import { platformFeeCents, platformFeePct, spaceTakeRateCents, memberTakeRateCents, resolvedNetworkRate } from './fees'
import { networkTakeRateBpsForPlan, memberNetworkTakeRateBps } from './pricing-keys'
import { classifyOrderSource } from '@/lib/commerce/order-source'
import { TICKETS_NOT_READY } from '@/lib/events/ticket-eligibility'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction } from '@/lib/finance/record'

export const TICKET_MAX_QTY = 10

export type PricingMode = 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'

function db(): SupabaseClient {
  return createAdminClient()
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
  space_id: string | null
  /** The explicit HOSTING entity (ADR-819): when set, ticket money routes through this space
   *  (its owner's Connect account) and the take-rate keys on its plan. */
  host_space_id: string | null
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
  /** ADR-823: only active members of the event's hosting Space may buy this tier. */
  space_members_only: boolean
  /** ADR-823: narrows the gate to one space_membership_tiers row; null = any active membership. */
  space_tier_id: string | null
  active: boolean
}

const TICKET_TYPE_COLS =
  'id, event_id, name, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, active'

/** PURE (tested): does a buyer's membership state clear a tier's space-membership gate (ADR-823)?
 *  `membership` is the buyer's ACTIVE space_memberships row in the event's hosting Space (or null).
 *  Returns null when clear, else the member-readable refusal. A tier that names a specific
 *  membership tier requires THAT tier; otherwise any active membership qualifies. */
export function spaceMembershipGateError(
  tier: Pick<TicketTypeRow, 'space_members_only' | 'space_tier_id'>,
  membership: { tier_id: string } | null,
  spaceName: string,
): string | null {
  if (!tier.space_members_only && !tier.space_tier_id) return null
  if (!membership) return `This ticket is for ${spaceName} members. Join their membership first.`
  if (tier.space_tier_id && membership.tier_id !== tier.space_tier_id) {
    return `This ticket is for a different ${spaceName} membership tier.`
  }
  return null
}

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
    .select('id, title, slug, price_cents, is_cancelled, ends_at, starts_at, host_id, space_id, host_space_id')
    .eq('id', opts.eventId)
    .maybeSingle()
  const event = data as EventRow | null
  if (!event) return { error: 'Event not found.' }
  if (event.is_cancelled) return { error: 'This event has been cancelled.' }
  if (new Date(event.ends_at ?? event.starts_at) < new Date()) return { error: 'This event has already ended.' }

  // PAYEE (ADR-819): a SPACE-hosted event pays the space — through the space owner's Connect
  // account, the same resolution commerce uses (lib/commerce/checkout.ts resolveCharge). A
  // personal event pays the host. The self-purchase guard keys on the resolved payee, so a space
  // manager who merely ORGANIZES the event can still buy a ticket to it.
  let payeeProfileId: string | null = event.host_id
  if (event.host_space_id) {
    const { data: hs } = await db()
      .from('spaces')
      .select('owner_profile_id')
      .eq('id', event.host_space_id)
      .maybeSingle()
    payeeProfileId = (hs as { owner_profile_id: string | null } | null)?.owner_profile_id ?? null
  }
  if (!payeeProfileId) return { error: 'This event has no host to pay.' }
  if (payeeProfileId === opts.buyerProfileId) return { error: 'You’re hosting this event.' }

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

  // SPACE-MEMBERSHIP gate (ADR-823): a tier restricted to the hosting Space's own members
  // requires an ACTIVE space_memberships row for the buyer in that Space — the specific
  // membership tier when the ticket names one. Runs BEFORE the free-claim return so a
  // members-included free ticket is gated exactly like a paid one. Keys on the same space
  // resolution attribution + fees use (host_space_id, else the placement space, ADR-819).
  if (tier && (tier.space_members_only || tier.space_tier_id)) {
    const membershipSpaceId = event.host_space_id ?? event.space_id
    if (!membershipSpaceId) return { error: 'That ticket type isn’t available.' }
    // space_memberships isn't in the generated types yet (ADR-246) — narrow untyped read.
    const mdb = db() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: string) => {
                maybeSingle: () => Promise<{ data: { tier_id: string } | null }>
              }
            }
          }
        }
      }
    }
    const [{ data: membership }, { data: hsName }] = await Promise.all([
      mdb
        .from('space_memberships')
        .select('tier_id')
        .eq('space_id', membershipSpaceId)
        .eq('member_profile_id', opts.buyerProfileId)
        .eq('status', 'active')
        .maybeSingle(),
      db().from('spaces').select('name, brand_name').eq('id', membershipSpaceId).maybeSingle(),
    ])
    const hs = hsName as { name: string | null; brand_name: string | null } | null
    const gateError = spaceMembershipGateError(
      tier,
      membership,
      hs?.brand_name ?? hs?.name ?? 'the hosting space',
    )
    if (gateError) return { error: gateError }
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
    return { error: 'This event is free. No ticket needed.' }
  }

  // ── MAY THIS EVENT SELL AT ALL? (ADR-914, reversing ADR-913) ─────────────────────────────
  // ONE condition, on every tier: the payee (the hosting space's owner, else the personal host) can
  // actually receive money. There is no longer a tier check here. A free Member sells at 10%, a free
  // Space at 10%, Crew at 8%, Business at 5% — the ladder is the RATE, never the permission
  // (docs/VALUE-LADDER.md §2). The `profiles.membership_tier` read this branch used to do is gone
  // with it; the tier still decides the FEE, which is resolved further down from the same row the
  // money routes to.
  //
  // Still checked HERE rather than only at the write seams, and the reason survives the reversal: the
  // buy path is the only place that sees every sale. An account that was ready when the event was
  // priced can be restricted or deauthorized by Stripe later, and this is where that is caught.
  //
  // Fail-closed on purpose. Everywhere else in the pricing model the safe direction is to under-
  // collect, because charging a fee we promised not to is worse than missing one. Not here: letting a
  // buyer pay into an account Stripe cannot pay out of does not under-collect, it takes someone's
  // money and strands it between two parties who both think the other has it.
  const status = await getConnectStatus(payeeProfileId)
  if (!status.accountId || !status.ready) {
    // The BUYER sees a neutral sentence. A stranger is never told anything about the host's account
    // state; the HOST gets the real line (NEEDS_PAYOUT_ACCOUNT) beside the price control, where it is
    // an actionable two-minute setup step rather than a dead end.
    return { error: TICKETS_NOT_READY }
  }

  const gross = ticketTotalCents(unitCents, qty)
  // Differential take-rate (ADR-811 §A). The hard promise holds on EVERY seller channel: 0% on a sale the
  // host brings themselves, a rate only on the business the network sourced.
  //   • SPACE-hosted event  → the space plan's NETWORK rate (self → 0), keyed on the space plan.
  //   • PERSONAL event       → the individual host keeps 100% of their own sales (self → 0) and pays the
  //                            member (Crew) rate on a network-sourced sale (ADR-811, #4).
  //   • ROOT / platform event → Frequency's OWN event: the flat platform fee (internal, not a member sale).
  // Fail-safe: the space resolution is best-effort; any miss falls back to the flat fee (never under-collect).
  // The fee keys on the same entity the money routes to: the explicit hosting space when set,
  // else the placement space, else the personal host — so fee and payee always agree (ADR-819).
  // Hoisted above the classification because the RELATIONSHIP check needs it: "already your audience"
  // is asked of the selling SPACE (its followers, members, CRM) as well as the payee profile.
  const feeSpaceId = event.host_space_id ?? event.space_id
  const { source, attributionRef } = await classifyOrderSource({
    buyerProfileId: opts.buyerProfileId,
    sellerProfileId: payeeProfileId,
    sellerSpaceId: feeSpaceId,
  })
  let fee: number
  // THE RECEIPT (ADR-914). The rate actually applied, recorded rather than recomputed later.
  // `platform_fee_cents / gross` cannot recover it: the fee FLOORS fractional cents, so a small ticket
  // loses the rate to rounding, and an operator changing a rate at /admin/pricing would silently
  // rewrite the history of every past sale if the rate were derived at read time. Captured at each
  // branch beside the fee it belongs to, so the two can never disagree.
  let rateBps: number
  // `effectiveOrderSource` can collapse a network sale to self for a disconnected Space, so the source
  // PERSISTED must be the effective one, not the classified one. Otherwise a receipt would read
  // 'network' next to a 0% fee and look like a bug in exactly the audit this exists to satisfy.
  let effectiveSource: typeof source = source
  if (feeSpaceId) {
    const root = await loadRootSpaceId()
    if (feeSpaceId === root) {
      fee = platformFeeCents(gross) // the platform's own event
      rateBps = platformFeePct() * 100
    } else {
      const { data: sp } = await db()
        .from('spaces')
        .select('plan, network_connected')
        .eq('id', feeSpaceId)
        .maybeSingle()
      const spRow = (sp as { plan?: string | null; network_connected?: boolean | null } | null) ?? null
      const plan = spRow?.plan ?? 'free'
      // A standalone (disconnected) Space has left the graph → no network-sourced revenue, source collapses
      // to self (ADR-811 §3), so it pays 0% even here (independent price is billed on the subscription).
      effectiveSource = effectiveOrderSource(source, spRow?.network_connected)
      fee = await spaceTakeRateCents(gross, plan, effectiveSource) // self → 0, network → tier bps
      // 🔴 The receipt must record the rate that was CHARGED, which means the OPERATOR-resolved vector,
      // not the code default. Recomputing from the default agreed only because production has never
      // had a network_bps row; the first save at /admin/pricing would have charged the new rate and
      // stamped the old one. A receipt that disagrees with the charge is worse than no receipt.
      rateBps = effectiveSource === 'self' ? 0 : networkTakeRateBpsForPlan(plan, await resolvedNetworkRate())
    }
  } else {
    // A PERSONAL event (no owning space): the host is an individual seller. 0% on their own sale, and
    // their TIER's rung on a sale the collective sourced — 10% on the free Member tier, 8% on Crew
    // (ADR-914). This is the ladder's reference case: the free rung is what makes the 8% mean something.
    //
    // Reads the REAL `membership_tier` off `profiles` rather than through resolveCaller. BETA_OPEN_ACCESS
    // reports 'crew' to every signed-in member to make the beta feel open, and billing someone the Crew
    // rate on a tier they have not bought is charging for a discount they do not hold. Fail-safe on the
    // read: an error leaves `payeeTier` null, which prices at the free rung (never under-collect).
    const { data: payeeProf } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', payeeProfileId)
      .maybeSingle()
    const payeeTier = (payeeProf as { membership_tier: string | null } | null)?.membership_tier ?? null
    fee = await memberTakeRateCents(gross, source, payeeTier)
    rateBps = source === 'self' ? 0 : memberNetworkTakeRateBps(payeeTier, await resolvedNetworkRate())
  }
  const tierLabel = tier ? ` (${tier.name})` : ''

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: unitCents,
          product_data: { name: `Ticket: ${event.title}${tierLabel}` },
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
    // Hold the seat for 30 min: the session expires so an abandoned checkout frees its
    // reservation (matches the pending window in reserve_ticket_atomic).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${appUrl()}/events/${event.slug}?ticket=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/events/${event.slug}`,
  })

  // Reserve capacity + record the pending row ATOMICALLY (reserve_ticket_atomic, migration
  // 20260930000000). The old pre-check + separate insert oversold: concurrent buyers all passed
  // `quantity - sold` before any payment settled. The RPC re-checks committed capacity
  // (paid + in-flight pending within 30 min) under a per-tier advisory lock and inserts the
  // pending row only if it fits. On sold-out or error, expire the session so it can't be paid
  // into a void, and refuse the URL. The pre-check above still gives a fast sold-out UX.
  const reserveDb = db()
  const reserveRpc = reserveDb.rpc.bind(reserveDb) as unknown as (
    name: 'reserve_ticket_atomic',
    args: {
      _tier_id: string | null; _event_id: string; _buyer: string; _qty: number
      _amount_cents: number; _fee_cents: number; _currency: string; _session_id: string
    },
  ) => Promise<{ data: { reserved?: boolean; reason?: string } | null; error: { message: string } | null }>

  const { data: reservation, error: reserveErr } = await reserveRpc('reserve_ticket_atomic', {
    _tier_id: tier?.id ?? null,
    _event_id: event.id,
    _buyer: opts.buyerProfileId,
    _qty: qty,
    _amount_cents: gross,
    _fee_cents: fee,
    _currency: 'usd',
    _session_id: session.id,
  })
  if (reserveErr || !reservation?.reserved) {
    if (reserveErr) console.error('[tickets] reserve_ticket_atomic failed', reserveErr.message)
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch {
      // best-effort — an unexpired session simply lapses on its own; we still refuse the URL
    }
    return {
      error: reservation?.reason === 'sold_out'
        ? 'This ticket just sold out.'
        : 'Could not start checkout. Please try again.',
    }
  }

  // ── THE FEE RECEIPT (ADR-914, migration 20270202000000) ──────────────────────────────────
  // Written as a PATCH on the row the RPC just inserted, keyed by the session id, rather than as
  // three more arguments to `reserve_ticket_atomic`. That RPC holds a per-tier advisory lock while it
  // re-checks committed capacity, and widening its signature to carry audit columns would put schema
  // churn on the one path where a mistake oversells an event. The receipt is bookkeeping; the
  // reservation is money. They do not belong in the same transaction.
  //
  // BEST-EFFORT BY CONSTRUCTION. The buyer already has a live Checkout session at this point, so a
  // failure here must never surface as an error or expire the session: losing the explanation for a
  // fee is bad, losing the sale to protect the explanation is worse. A miss leaves the columns NULL,
  // which reads honestly as "no receipt recorded" rather than as a fabricated one.
  //
  // Untyped reach: the three columns are not in the generated types yet (repo convention, ADR-246).
  // NOT AWAITED. The buyer has a live Checkout session and is waiting on the redirect URL; making them
  // wait on a bookkeeping UPDATE trades real conversion for a row nobody reads synchronously. Fired and
  // explicitly caught so an unhandled rejection can never surface, and so a failure still leaves the
  // columns NULL — honestly "no receipt recorded" rather than a fabricated one.
  void (async () => {
    try {
      await (db() as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: unknown }>
          }
        }
      })
        .from('event_tickets')
        .update({
          order_source: effectiveSource,
          // Only meaningful alongside the source that produced it. A disconnected Space collapses
          // 'network' to 'self', and carrying the network ref onto that row would claim Frequency
          // sourced a sale it charged 0% for.
          attribution_ref: effectiveSource === source ? attributionRef : null,
          take_rate_bps: rateBps,
        })
        .eq('stripe_checkout_session_id', session.id)
    } catch {
      // swallowed on purpose — see above
    }
  })()

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
 *  volume. Atomic `sold = sold + delta` (clamped ≥ 0) via the adjust_ticket_sold
 *  RPC, so concurrent webhooks can't lose an increment (audit M1). */
async function adjustTierSold(ticketTypeId: string, delta: number): Promise<void> {
  if (!ticketTypeId || delta === 0) return
  await (db()).rpc('adjust_ticket_sold', {
    p_tier_id: ticketTypeId,
    p_delta: delta,
  })
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
    .select('id, event_id, ticket_type_id, qty, entity_id, platform_fee_cents, buyer_profile_id, currency')
  const rows = (updated ?? []) as {
    id: string
    event_id: string
    ticket_type_id: string | null
    qty: number
    entity_id: string
    platform_fee_cents: number
    buyer_profile_id: string | null
    currency: string
  }[]
  for (const row of rows) {
    if (row.ticket_type_id) await adjustTierSold(row.ticket_type_id, row.qty ?? 1)
    // A BUYER IS A CONTACT (ADR-913). This is what makes "we charge once for the introduction" true:
    // the first sale from someone Frequency sourced is network-rated, this records the relationship,
    // and every later sale to that person resolves to their own audience at 0%.
    //
    // 🔴 Without it the promise silently fails. Nothing else in the product turned a purchase into a
    // contact — `contacts` rows only ever came from opt-in forms, CSV import, beta signup and lead
    // capture — so a repeat buyer looked like a stranger on every visit and would have been charged
    // the network rate forever. It also closes a real CRM gap: people who paid a Space were not in
    // its CRM.
    await recordBuyerAsContact(row.event_id, row.buyer_profile_id).catch(() => {})
    // Record the ENTITY's revenue on the partitioned ledger (ADR-246). A ticket is a
    // Connect destination charge: the gross goes to the host's account; the platform's
    // (entity's) revenue is the application fee. Idempotent per ticket; best-effort so a
    // ledger hiccup never fails the webhook (Stripe would redeliver and we'd dedupe).
    await recordFinancialTransaction({
      entityId: row.entity_id,
      revenueType: 'commerce',
      amountCents: row.platform_fee_cents ?? 0,
      profileId: row.buyer_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'event_tickets',
      sourceId: row.id,
      idempotencyKey: `ticket:${row.id}`,
    }).catch(() => {})
  }
}

/**
 * Record a settled buyer as a contact of the SELLING SPACE (ADR-913).
 *
 * Space-scoped only, deliberately: `contacts` is keyed on `space_id`, so a personal (Crew-hosted)
 * event has no Space CRM to write into. That case is still covered for pricing — the audience check
 * counts a prior settled purchase directly (`prior_purchase`) — so the promise holds either way and
 * this write is a CRM convenience rather than the mechanism.
 *
 * Best-effort and idempotent-ish by design: it checks-then-inserts rather than upserting, because
 * `contacts` has no unique constraint on (space_id, profile_id) to conflict against. A race can
 * therefore produce a duplicate contact row, which is a CRM tidiness issue and never a money one —
 * the audience check only asks whether ANY row exists. Every failure is swallowed by the caller: a
 * ticket must never fail to settle because the CRM write did.
 */
async function recordBuyerAsContact(eventId: string, buyerProfileId: string | null): Promise<void> {
  if (!buyerProfileId) return
  const { data: ev } = await db()
    .from('events')
    .select('host_space_id, space_id')
    .eq('id', eventId)
    .maybeSingle()
  const row = ev as { host_space_id: string | null; space_id: string | null } | null
  const spaceId = (row?.host_space_id ?? row?.space_id)?.trim() || null
  if (!spaceId) return

  const { data: existing } = await db()
    .from('contacts')
    .select('id')
    .eq('space_id', spaceId)
    .eq('profile_id', buyerProfileId)
    .limit(1)
  if (((existing as unknown[] | null) ?? []).length > 0) return

  // ⚠️ NO `email` HERE. `public.profiles` has no email column — a member's address lives in
  // `auth.users`, reached via profiles.auth_user_id. Selecting it is not a null field but a
  // REQUEST-level PostgREST error (42703) that nulls the WHOLE row, so `display_name` would have
  // come back empty too and this contact write would have silently done nothing. Caught by
  // lib/profiles/account-email.test.ts, which exists because five call sites already made this
  // exact mistake. The contact is keyed on `profile_id`, so an address is not needed to record the
  // relationship; the CRM can resolve one later through the proper accessor.
  const { data: prof } = await db()
    .from('profiles')
    .select('display_name')
    .eq('id', buyerProfileId)
    .maybeSingle()
  const p = prof as { display_name: string | null } | null

  await db().from('contacts').insert({
    space_id: spaceId,
    profile_id: buyerProfileId,
    display_name: p?.display_name ?? null,
    // `source` is the introduction ledger the pricing model reads back.
    source: 'event_ticket',
  })
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
export async function refundTicket(ticketId: string, eventId: string): Promise<RefundResult> {
  if (!(await payoutsLive())) return { error: 'Ticketing isn’t turned on yet.' }
  if (!stripe) return { error: 'Ticketing isn’t turned on yet.' }

  const { data } = await db()
    .from('event_tickets')
    .select('id, event_id, status, stripe_payment_intent_id, amount_cents')
    .eq('id', ticketId)
    // Bind the ticket to the event the caller is authorized for — without this a host could
    // refund any ticket on any event by passing their own eventId past the gate (ADR-274).
    .eq('event_id', eventId)
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
    .select('id, ticket_type_id, qty, entity_id, platform_fee_cents, buyer_profile_id, currency')
  const rows = (updated ?? []) as {
    id: string
    ticket_type_id: string | null
    qty: number
    entity_id: string
    platform_fee_cents: number
    buyer_profile_id: string | null
    currency: string
  }[]
  for (const row of rows) {
    if (row.ticket_type_id) await adjustTierSold(row.ticket_type_id, -(row.qty ?? 1))
    // Reverse the entity's recorded revenue (a negative 'refund' row). Idempotent per
    // ticket; best-effort. Keeps the ledger an accurate net of the partition.
    await recordFinancialTransaction({
      entityId: row.entity_id,
      revenueType: 'refund',
      amountCents: -(row.platform_fee_cents ?? 0),
      profileId: row.buyer_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'event_tickets',
      sourceId: row.id,
      idempotencyKey: `ticket-refund:${row.id}`,
    }).catch(() => {})
  }
}

/** Resolve the refund's PaymentIntent id from a `charge.refunded` event's Charge.
 *  We don't filter on charge metadata (the kind tag lives on the PaymentIntent, not
 *  the Charge) — recordTicketRefund itself no-ops unless a matching `succeeded`
 *  ticket exists for that PaymentIntent, so non-ticket charges are harmless. */
export async function recordTicketRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  // Only a FULL refund unwinds the ticket. A partial refund (amount_refunded < amount) must NOT flip
  // the ticket to `refunded`, free the seat, or reverse the FULL platform fee — that would over-free
  // capacity and over-credit the ledger for money that wasn't fully returned. Wait until the charge
  // is fully refunded (the host-initiated full refund in refundTicket calls recordTicketRefund
  // directly, so it is unaffected by this guard).
  if ((charge.amount_refunded ?? 0) < (charge.amount ?? 0)) return
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordTicketRefund(paymentIntentId)
}
