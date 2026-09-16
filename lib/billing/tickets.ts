// Event tickets — second payout channel (Phase 3, ADR-177). A host prices an event;
// a member, OR a signed-out guest with an email address, buys a ticket. Money moves as a
// Stripe DESTINATION CHARGE to the event host's connected account, minus the platform
// fee — the same one-off pattern as tips (ADR-176). Server-only.
//
// IDENTITY (the guest door): createTicketCheckout takes EXACTLY ONE of `buyerProfileId` and
// `guestEmail`, the same either/or `event_tickets` carries in SQL and `reserve_ticket_atomic`
// refuses on. A guest is treated as a stranger everywhere it matters: every server-side gate
// (tier active, member_only, space_members_only, inventory, the min_cents floor, the payee's
// Connect readiness) runs identically, and the two membership gates refuse a guest by
// construction rather than by a read. A guest reaches no tier a signed-out person should not.
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
// MEMBER BENEFITS (ADR-1372): a membership tier can carry a priced modifier (15% off, a fixed member
// price, included). The ADR-823 gate still decides ADMISSION; a benefit only decides PRICE. 🔴 It is
// applied to the unit price BEFORE the gross, and therefore before the platform take-rate: computing
// the application fee on the list price bills the Space a percentage of money nobody paid. Locked by
// lib/billing/benefit-fee-order.test.ts.
//
// SALES WINDOW (ADR-1373): a tier may carry an open time (absolute, or a day count before the event
// starts) and a close time. Outside it the checkout refuses and NAMES the moment it opens. This is
// what turns "members get first RSVP" from an operator remembering to flip a row active into a rule
// a recurring series keeps by itself. Admission (ADR-823) is checked FIRST, so a buyer who can never
// hold the ticket is never told to come back on a date.
//
// REFUNDS (EVENTS-SYSTEM §7): a host can refund a succeeded ticket. The refund is
// created on the destination charge with the transfer reversed and the application
// fee returned, then the webhook/charge.refunded handler flips the ticket to
// `refunded` and frees the tier's `sold` capacity. Flag-gated like all billing.
//
// TIMED INVENTORY (LIVE-343, migration 20270345004700). A ticket holds a seat, so this creator is
// the ONE place in the repo that narrows the payment-method set: instant money only, because a
// delayed-notification method completes Checkout WITHOUT paying and settles days later, which
// cannot share a product with a 30 minute hold (`ticketPaymentMethodParams`). Three defences, in
// order: narrow the methods; hold the seat of a payment that is genuinely in flight
// (`markTicketPaymentProcessing` starts the second clock); and re-measure capacity at the settle,
// under the same per-tier advisory lock the reservation takes. A ticket that no longer fits is
// HONOURED and reported, never silently dropped, because the buyer has already been charged.
//
// THE SELLER'S SIDE (LIVE-345). `notifyTicketSaleHost` (./ticket-sale-notify.ts) tells the payee
// they sold something, with a bell and an email, beside the buyer's receipts. Until it landed there
// was no ticket-sold notification of any kind anywhere in the product.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from './stripe'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from './checkout-ui'
import { savedCardParamsFor, createAllowingSavedCard } from './saved-card'
import { getConnectStatus, payoutsLive } from './connect'
import { platformFeeCents, platformFeePct, spaceTakeRateCents, memberTakeRateCents, resolvedNetworkRate } from './fees'
import { networkTakeRateBpsForPlan, memberNetworkTakeRateBps } from './pricing-keys'
import { classifyOrderSource } from '@/lib/commerce/order-source'
import { TICKETS_NOT_READY } from '@/lib/events/ticket-eligibility'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction } from '@/lib/finance/record'
import { resolveHostingSpaceId, resolveHostingSpaceIdFromRow } from '@/lib/events/host-space'
import { feeBearingSpaceId } from '@/lib/events/belonging'
import { sendGuestTicketReceipt } from '@/lib/events/guest-ticket-email'
import { sendMemberTicketReceipt } from '@/lib/events/member-ticket-email'
import { notifyTicketSaleHost } from './ticket-sale-notify'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { payableCents, type MemberBenefit, type AppliedBenefit } from '@/lib/spaces/benefits'
import { ticketSalesWindowError } from '@/lib/events/sales-window'
import { eventInstant, resolveZone } from '@/lib/time/zone'

export const TICKET_MAX_QTY = 10

/** The env key holding a Stripe payment method configuration (`pmc_…`) scoped to INSTANT methods,
 *  used for ticket checkouts only. Optional; see `ticketPaymentMethodParams`. */
export const TICKET_PMC_ENV = 'STRIPE_TICKET_PAYMENT_METHOD_CONFIGURATION'

/** The instant set, named explicitly, for the fallback branch. Apple Pay and Google Pay are not
 *  payment method TYPES: they ride on `card` and Checkout offers them automatically on a supported
 *  device, so listing `card` lists them. Link is its own type and has to be named or it disappears. */
export const TICKET_INSTANT_METHODS = ['card', 'link'] as const

/**
 * The payment-method half of a TICKET Checkout Session, and the only place in this repo that
 * narrows the set (owner decision). Every other creator stays on the full dashboard-controlled list.
 *
 * WHY TICKETS ARE DIFFERENT. A ticket is timed inventory. A delayed-notification method (ACH debit,
 * a bank redirect) completes the Checkout Session without paying and settles three to five days
 * later, which cannot share a product with a 30 minute seat hold: it is the mechanism behind the
 * oversell LIVE-343 exists for, and no amount of locking makes "you have a seat, we will know in a
 * week" a good answer for a Tuesday evening event. Narrowing the set removes the cause; the settle
 * re-check remains for the rows already in flight and for any method Stripe reclassifies later.
 *
 * ⚠️ TWO WAYS TO DO THIS, AND THEY ARE NOT EQUIVALENT.
 *
 *   1. A PAYMENT METHOD CONFIGURATION (`payment_method_configuration: 'pmc_…'`) — PREFERRED, and
 *      used whenever the env names one. The configuration is a Stripe-side object the owner edits
 *      in the Dashboard, so tickets keep dashboard control over a SCOPED set: turning on a new
 *      instant wallet next year is a Dashboard toggle and reaches tickets with no deploy.
 *   2. An explicit `payment_method_types` array — the FALLBACK. It is a hardcoded list, and its
 *      cost is exactly the thing the configuration avoids: a creator that passes one ignores the
 *      Stripe Dashboard permanently, so any method enabled there later silently skips tickets and
 *      nothing reports it. That is a real regression with a long fuse, and it is accepted here only
 *      because the alternative is worse.
 *
 * 🔴 WHY THE FALLBACK EXISTS AT ALL: a configuration is addressed by an ID that must be created in
 * the Stripe Dashboard (or through the API against the live account) and cannot be invented by this
 * repo. There is no "the instant one" to reference by name. So the id is read from the env, and
 * with no id we fall back rather than ship a ticket checkout that offers ACH.
 *
 * 🟢 WHAT THE OWNER DOES TO SWITCH, once and for good:
 *   1. Stripe Dashboard → Settings → Payment methods → add a configuration named "Tickets (instant
 *      only)", with card and Link ON and every delayed-notification method OFF (ACH direct debit,
 *      Cash App Pay, bank redirects, Klarna / Afterpay and the other pay-later methods).
 *   2. Copy its id (`pmc_…`) into STRIPE_TICKET_PAYMENT_METHOD_CONFIGURATION in the Vercel env.
 *   3. Redeploy. Nothing else changes: this function starts returning branch 1 and the Dashboard is
 *      back in charge of the ticket set.
 *
 * The two parameters are MUTUALLY EXCLUSIVE at Stripe (passing both is a request error), which is
 * why this returns one or the other and never merges them.
 */
export function ticketPaymentMethodParams():
  | { payment_method_configuration: string }
  | { payment_method_types: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] } {
  const configured = (process.env[TICKET_PMC_ENV] ?? '').trim()
  if (configured) return { payment_method_configuration: configured }
  return {
    payment_method_types: [
      ...TICKET_INSTANT_METHODS,
    ] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
  }
}

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
  /**
   * The Checkout Session client secret, returned INSTEAD of `url` when the caller asked for
   * `ui_mode: 'elements'` (LIVE-347). The card form then mounts on Frequency and the buyer never
   * leaves the page.
   *
   * ⚠️ Exactly one of `url` / `clientSecret` is ever set. A hosted session has no client secret to
   * hand out, and an elements session has no `url` to redirect to -- Stripe returns `url: null` for
   * it. Callers branch on which one arrived rather than on what they asked for, so an elements
   * request that could not be honoured DEGRADES to the hosted redirect instead of failing: the
   * buyer still gets to pay, which is the only outcome that matters on a money path.
   */
  clientSecret?: string
  /** The elements session's id, so the caller can settle from its own success handler rather than
   *  waiting on the webhook (LIVE-366). See `CheckoutUiResult.sessionId` for why that matters. */
  sessionId?: string
  error?: string
  /** True when a `free` tier needs no checkout. The caller records the claim as a going RSVP
   *  instead of redirecting to Stripe: `setRsvpStatus` for a member, `submitGuestRsvp` with the
   *  tier id for a guest (LIVE-318, 20270345004000). The result is the same shape for both; the
   *  identity the caller holds decides which recorder it uses. */
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
  /** IANA zone the stored wall-clock parts are read in (lib/time/zone.ts). Needed to resolve the
   *  TRUE start instant a relative sales window counts back from, and to name the open time in the
   *  event's own city rather than in UTC. */
  time_zone: string | null
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
  /** ADR-1373: absolute open time; wins over the relative day count when both are set. */
  sales_start_at: string | null
  /** ADR-1373: opens this many days before the event starts. The shape a recurring series survives. */
  sales_starts_days_before: number | null
  /** ADR-1373: absolute close time; null = sells until the event ends. */
  sales_end_at: string | null
  active: boolean
}

const TICKET_TYPE_COLS =
  'id, event_id, name, pricing_mode, price_cents, min_cents, suggested_cents, quantity, sold, member_only, space_members_only, space_tier_id, sales_start_at, sales_starts_days_before, sales_end_at, active'

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

/** The buyer's ACTIVE `space_memberships` row in a Space, or null when they hold none.
 *  `space_memberships` isn't in the generated types yet (ADR-246) — narrow untyped read.
 *
 *  ONE read, TWO questions (ADR-1372). The ADR-823 gate asks whether this membership ADMITS the
 *  buyer; a benefit asks what it is WORTH. They were never allowed to disagree about which row they
 *  are reading, so they read it once, here. */
async function loadActiveMembership(
  spaceId: string,
  profileId: string | null,
): Promise<{ tier_id: string } | null> {
  // 🔴 A GUEST HOLDS NO SPACE MEMBERSHIP, BY DEFINITION, so no read is attempted for one:
  // `member_profile_id = null` is not a query that could ever match, and issuing it would let a
  // future reader believe the refusal was measured. Answering with a literal `null` is the truth,
  // and the SAME pure gate turns it into the SAME space-named refusal a signed-in non-member gets.
  if (!profileId) return null
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
  const { data } = await mdb
    .from('space_memberships')
    .select('tier_id')
    .eq('space_id', spaceId)
    .eq('member_profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return data ?? null
}

/** The member benefits assigned to the buyer's membership tier in the hosting Space (ADR-1372).
 *
 *  FAIL-SAFE TO NONE, and in the only safe direction: a benefit we cannot read becomes a ticket sold
 *  at the LIST price. The opposite fail-safe would hand out a discount nobody configured, and a
 *  discount is money out of the Space's payout.
 *
 *  The store (`lib/spaces/benefits-store.ts`) is imported dynamically, the same shape `fees.ts` uses
 *  for its settings reads: it keeps the service-role read off the module graph of every caller that
 *  only wants `ticketTotalCents`, and it means a throw here is caught rather than fatal. */
async function loadTicketBenefits(
  spaceId: string | null,
  tierId: string | null,
): Promise<MemberBenefit[]> {
  if (!spaceId || !tierId) return []
  try {
    const { listBenefitsForTier } = await import('@/lib/spaces/benefits-store')
    return await listBenefitsForTier(spaceId, tierId)
  } catch (err) {
    console.error('[tickets] member benefit lookup failed; charging the list price', err)
    return []
  }
}

/** The redemption counts a `max_uses` cap is resolved against, per benefit, in that benefit's own
 *  period bucket (a monthly pass and a yearly pass are different windows).
 *
 *  FAIL-CLOSED, matching `countRedemptions`: an unreadable ledger reads as EXHAUSTED, never as
 *  unused. Erring the other way hands out an uncapped free redemption every time the database
 *  hiccups and nothing downstream ever notices. The worst case here is a member asking why their
 *  guest pass did not apply, which is a support message rather than a hole in the revenue. */
async function loadBenefitUses(
  benefits: readonly MemberBenefit[],
  memberProfileId: string | null,
  nowIso: string,
): Promise<Record<string, number>> {
  const capped = benefits.filter((b) => b.id && b.maxUses != null)
  if (capped.length === 0) return {}
  // A GUEST has no ledger to read (the guest door, #2556): no account, so no redemption has ever
  // been stamped to them. Empty is the truth here and costs nothing, because a guest also holds no
  // membership, so `tierId` is null and no benefit resolves for them in the first place. This is the
  // one place the fail-CLOSED posture above does not apply: there is no read to fail.
  if (!memberProfileId) return {}
  try {
    const { usesForMember } = await import('@/lib/spaces/benefits-store')
    return await usesForMember(capped, memberProfileId, nowIso)
  } catch (err) {
    console.error('[tickets] benefit redemption ledger unreadable; capped benefits will not apply', err)
    return Object.fromEntries(capped.map((b) => [b.id as string, Number.MAX_SAFE_INTEGER]))
  }
}

/** PURE (tested): the per-ticket charge after any member benefit (ADR-1372).
 *
 *  🔴 THE ORDER THAT COSTS REAL MONEY (ADR-1372 §2). This returns the DISCOUNTED unit, and the gross
 *  the platform take-rate is computed from is derived from it and from nothing else. Computing the
 *  application fee on the list price bills the Space a percentage of money nobody paid, and it is
 *  invisible in every test that only checks the buyer's total. `lib/billing/benefit-fee-order.test.ts`
 *  is the test that fails if the two are ever reordered.
 *
 *  🔴 A BENEFIT PRICES A `fixed` TICKET ONLY, never a buyer-chosen one (pwyc / sliding_scale /
 *  donation). Those modes have no list price to take a percentage OF: the buyer names the amount and
 *  `min_cents` is the Space's stated floor under it. A benefit applied there either breaks that floor
 *  or is silently clamped back up to it and reads as broken, and "15% off" a donation is a discount on
 *  a gift. What a member's benefit is worth on those tiers is that they may pay the floor, which they
 *  already may. `free` never reaches here at all (it returns the claim path upstream).
 *
 *  🔴 AN UNRESOLVED CAP NEVER APPLIES. `benefitApplies` counts a MISSING `usesByBenefitId` entry as
 *  zero uses, so a `max_uses` benefit handed no counts would apply EVERY time — "one guest pass a
 *  month" silently becomes an unlimited one, and the only evidence is a payout that is quietly
 *  smaller than it should be. A capped benefit with no count in the map is therefore dropped here
 *  rather than resolved optimistically: the caller must have READ the ledger (loadBenefitUses, which
 *  fails closed on its own) for a cap to be spendable at all. */
export function benefitAdjustedUnitCents(args: {
  mode: PricingMode
  /** The per-ticket price before any benefit. */
  listUnitCents: number
  benefits: readonly MemberBenefit[]
  /** The buyer's ACTIVE membership tier in the hosting Space, or null when they hold none. */
  tierId: string | null
  /** Redemptions already spent, by benefit id, in each benefit's own period. A capped benefit
   *  missing from this map is an UNRESOLVED cap and does not apply. */
  usesByBenefitId?: Record<string, number>
  /** Injected so the benefit's date window is testable without faking a clock. */
  now?: string
}): { unitCents: number; applied: AppliedBenefit | null } {
  const list = Math.max(0, Math.round(args.listUnitCents))
  if (args.mode !== 'fixed' || !args.tierId) return { unitCents: list, applied: null }

  const uses = args.usesByBenefitId ?? {}
  const { amountCents, applied } = payableCents(
    args.benefits.filter((b) => b.maxUses == null || (!!b.id && b.id in uses)),
    {
      listCents: list,
      // Only the hosting Space's OWN event is priced here. `guest_events` needs a VENUE axis the
      // ticket path does not have: on a guest-hosted event the money routes to the GUEST, so a
      // discount granted by the venue's membership would come out of a third party's payout. Until
      // that axis exists a venue benefit must be scoped 'all' to reach a ticket, which is a
      // deliberate choice by whoever writes the row rather than an accident of resolution.
      scope: 'space_events',
      tierId: args.tierId,
      usesByBenefitId: uses,
      now: args.now ?? new Date().toISOString(),
    },
  )
  return { unitCents: amountCents, applied }
}

/** Validate, record a pending ticket, and return the hosted Checkout URL.
 *
 *  Pass EXACTLY ONE of `buyerProfileId` (a member) and `guestEmail` (a signed-out guest).
 *  Pass `ticketTypeId` to buy a specific tier; omit it to buy at the event's flat
 *  `events.price_cents` (backward compat — implicit single fixed tier). For
 *  buyer-chosen tiers (pwyc/sliding_scale/donation) pass `amountCents`; it is
 *  floored at the tier's `min_cents` server-side and rejected below it. */
export async function createTicketCheckout(opts: {
  /** The signed-in buyer's profile. EXACTLY ONE of this and `guestEmail`. */
  buyerProfileId?: string | null
  /** A signed-out guest's address. EXACTLY ONE of this and `buyerProfileId`.
   *  Everything below re-validates identically for a guest: a guest reaches no tier a
   *  stranger could not reach, and every entitlement gate refuses them by construction. */
  guestEmail?: string | null
  eventId: string
  qty?: number
  /** Buy this specific tier. Omit for the flat-price (legacy) path. */
  ticketTypeId?: string | null
  /** Buyer's chosen amount (cents) for pwyc/sliding_scale/donation tiers. */
  amountCents?: number | null
  /**
   * `'elements'` asks for an ON-PAGE card form (LIVE-347) and returns `clientSecret`; `'hosted'`
   * (the default) returns the Stripe-hosted `url`. Defaulting to hosted on purpose: every existing
   * caller keeps the behaviour it was written against, and the new path is opted into one caller at
   * a time rather than switched on under all of them at once.
   */
  ui?: 'hosted' | 'elements'
}): Promise<TicketResult> {
  // ── EXACTLY ONE IDENTITY ────────────────────────────────────────────────────────────────────
  // A ticket belongs to a profile OR to an address, never to both and never to neither. This is
  // the same invariant `event_tickets` carries in SQL (buyer_profile_id / guest_email) and that
  // `reserve_ticket_atomic` refuses on, restated here so a malformed call never reaches Stripe
  // and creates a session nothing can be reserved against. It is a PROGRAMMING error rather than
  // a buyer's mistake, so it is logged and answered with the neutral retry line: no reader of
  // this message could act on "both identities supplied".
  const buyerProfileId = opts.buyerProfileId || null
  const guestEmail = (opts.guestEmail || '').trim().toLowerCase() || null
  // Opt-in, never inferred. See the `ui` option: hosted stays the default so no existing caller
  // changes behaviour when this ships.
  const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'
  if (!!buyerProfileId === !!guestEmail) {
    console.error(
      '[tickets] createTicketCheckout needs exactly one identity, got',
      buyerProfileId ? 'both' : 'neither',
    )
    return { error: 'Could not start checkout. Please try again.' }
  }

  if (!(await payoutsLive())) return { error: 'Ticketing isn’t turned on yet.' }
  if (!stripe) return { error: 'Ticketing isn’t turned on yet.' }
  const qty = Math.min(Math.max(Math.floor(opts.qty ?? 1), 1), TICKET_MAX_QTY)

  // ── TWO BUYER-ONLY READS, STARTED NOW INSTEAD OF LAST (LIVE-363) ─────────────────────────
  // Both depend on nothing but `buyerProfileId`, which is already known here, and both used to
  // sit immediately before the Stripe call -- so their round trips were pure tail latency added
  // to every purchase after all the pricing work had finished. `profileAccountEmail` is the more
  // expensive of the two: a `profiles` read AND a second HTTP call to the Supabase Auth API.
  //
  // ⚠️ `.catch()` AT CREATION, NOT AT AWAIT. Every refusal between here and the await is an early
  // `return`, and a floating promise that rejects after its function returned is an unhandled
  // rejection. Catching here turns that into a value the awaiting code already knows how to read:
  // a null email is the documented "omit the field" case, and a saved-card error is the
  // fail-closed case. Neither invents a new behaviour, they just arrive earlier.
  //
  // The cost of being wrong is one wasted read for a buyer who gets refused. The gates themselves
  // are untouched: nothing below reads these until the point it always did.
  const receiptEmailPromise: Promise<string | null> = guestEmail
    ? Promise.resolve(guestEmail)
    : buyerProfileId
      ? profileAccountEmail(buyerProfileId).catch(() => null)
      : Promise.resolve(null)
  const savedCardPromise = savedCardParamsFor(db(), buyerProfileId, 'tickets').catch(
    () => ({ error: true }) as const,
  )

  // ── THREE READS THAT DEPEND ON NOTHING, WARMED NOW ───────────────────────────────────────
  // The root Space id and the operator pricing settings take no arguments at all: they are the
  // same for every buyer and every event, yet they were read mid-chain, each adding a serial
  // round trip between the click and the Stripe call.
  //
  // Both are already wrapped in React `cache()` (lib/spaces/store.ts, lib/pricing/settings.ts),
  // so this changes WHEN the request is made and nothing else -- the awaits below get the very
  // same memoised promise. Results are deliberately ignored here; the real call sites are
  // unchanged and still decide what to do with them.
  //
  // ⚠️ The payouts gate above is NOT part of this and must not become one. "Never reach Stripe
  // when payouts are off" is a refusal whose position in the order is the guarantee.
  void loadRootSpaceId().catch(() => null)
  void resolvedNetworkRate().catch(() => null)

  const { data } = await db()
    .from('events')
    .select(
      'id, title, slug, price_cents, is_cancelled, ends_at, starts_at, host_id, time_zone, space_id, host_space_id',
    )
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
  // `buyerProfileId &&` guards the GUEST case: both sides are null for a guest, and `null === null`
  // would refuse every guest on an event whose payee could not be resolved. (It cannot be, today —
  // the line above returns on a null payee — but the guard is one token and the failure would be a
  // silent refusal of every guest, so it does not depend on the line above staying there.)
  if (buyerProfileId && payeeProfileId === buyerProfileId) return { error: 'You’re hosting this event.' }

  // ── THE HEAVIEST READ ON THIS PATH, STARTED ~200 LINES EARLY (LIVE-363) ──────────────────
  // `classifyOrderSource` is up to SIX database reads in two waves (the four audience checks in
  // parallel, then a prior-purchase scan). Every input it needs is already known here:
  // `buyerProfileId`, `payeeProfileId` (resolved just above) and `feeBearingSpaceId(event)`, which
  // is pure. It was awaited only after the tier read, the membership read, three benefit reads and
  // one round trip per capped benefit -- none of which it depends on, and all of which it could
  // have been running underneath.
  //
  // 🔴 TIMING-ONLY, AND THAT IS ENFORCED BY THE SHAPE. The result is settled into a VALUE rather
  // than caught: a rejection today fails the checkout, and quietly turning that into the classifier's
  // fail-safe (`self`, 0%) would be a money change smuggled in as a performance change. So the
  // rejection is carried and RE-THROWN at the original await point, where it would have arrived
  // anyway. Settling it here is also what stops an early `return` between here and there from
  // leaving an unhandled rejection.
  // The payee's payout readiness (LIVE-363). Keyed on payeeProfileId, which resolved on the line
  // above, and it was awaited AFTER the tier read, the membership read and the whole benefit chain
  // -- none of which it depends on. `getConnectStatus` is a `profiles` read and never calls Stripe
  // (lib/billing/connect.ts), so this is one more round trip taken off the serial path.
  //
  // ⚠️ THE READ MOVES, THE GATE DOES NOT. The fail-closed check stays exactly where it was, for the
  // reason written there: letting a buyer pay into an account Stripe cannot pay out of strands
  // someone's money between two parties who each think the other has it. Starting the read early
  // cannot change that verdict -- it is the same row, read at the same request.
  const connectStatusPromise = getConnectStatus(payeeProfileId).then(
    (value) => ({ ok: true as const, value }),
    (reason: unknown) => ({ ok: false as const, reason }),
  )

  const orderSourcePromise = classifyOrderSource({
    buyerProfileId,
    sellerProfileId: payeeProfileId,
    sellerSpaceId: feeBearingSpaceId(event),
  }).then(
    (value) => ({ ok: true as const, value }),
    (reason: unknown) => ({ ok: false as const, reason }),
  )

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
    // 🔴 A GUEST IS NOT A MEMBER, BY DEFINITION. No read is attempted: there is no profile to
    // read a `membership_tier` off, and reaching for one would only invite a future reader to
    // think the refusal came from the database. Same words a signed-in free-tier member gets, so
    // the gate leaks nothing about who is asking.
    if (!buyerProfileId) return { error: 'This ticket is for members only.' }
    // DIRECTION — FAIL CLOSED, BUT HONEST (SCAN-539). A PostgREST error arrives in `error`, not as a
    // throw, so an unchecked read defaulted the buyer's tier to 'free' and answered the gate with
    // "This ticket is for members only." — telling a paying Crew member they are not a member and
    // refusing them their own ticket, for a reason they cannot act on. We keep failing CLOSED (an
    // entitlement gate must never hand out a restricted ticket on an unreadable tier), but we stop
    // asserting the buyer's tier: an unknown tier is a transient failure, and it says so, so the
    // member retries instead of going to support to argue about a membership they do hold.
    const { data, error } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', buyerProfileId)
      .maybeSingle()
    if (error) {
      console.error('[tickets] buyer membership tier unreadable, refusing member-only ticket:', error.message)
      return { error: 'Could not check your membership. Please try again.' }
    }
    const t = (data as { membership_tier?: string | null } | null)?.membership_tier ?? 'free'
    if (t === 'free') return { error: 'This ticket is for members only.' }
  }

  // ── THE BUYER'S MEMBERSHIP IN THE HOSTING SPACE ───────────────────────────────────────────────
  // Resolved ONCE for both halves of the membership (ADR-1372): the ADR-823 gate below asks whether
  // it ADMITS the buyer, and the benefit further down asks what it is WORTH. Two reads could answer
  // the same question two ways after a mid-checkout change; one cannot.
  //
  // Root EXCLUDED (resolveHostingSpaceId): every event inherits the root tenant, so the raw
  // placement fallback resolved this to "must hold a membership in Frequency", which nobody does —
  // an unbuyable ticket, refused for a reason no one could act on. Keys on the same space resolution
  // attribution + fees use (host_space_id, else the placement space, ADR-819).
  const membershipSpaceId = await resolveHostingSpaceId({
    spaceId: event.space_id,
    hostSpaceId: event.host_space_id,
  })
  const tierIsGated = !!(tier && (tier.space_members_only || tier.space_tier_id))
  // Skip the read when nothing downstream could use it: an ungated FREE tier has no gate to clear
  // and no price for a benefit to modify, so the query would only cost the buyer latency.
  const membership =
    membershipSpaceId && (tierIsGated || mode !== 'free')
      ? await loadActiveMembership(membershipSpaceId, buyerProfileId)
      : null

  // SPACE-MEMBERSHIP gate (ADR-823): a tier restricted to the hosting Space's own members
  // requires an ACTIVE space_memberships row for the buyer in that Space — the specific
  // membership tier when the ticket names one. Runs BEFORE the free-claim return so a
  // members-included free ticket is gated exactly like a paid one. A BENEFIT NEVER TOUCHES THIS:
  // admission is still the gate's decision alone, and a benefit only prices what it lets through.
  if (tier && tierIsGated) {
    if (!membershipSpaceId) return { error: 'That ticket type isn’t available.' }
    // ── ASK THE GATE BEFORE PAYING FOR THE WORDS (LIVE-363) ────────────────────────────────
    // The Space's name is read ONLY to word a refusal, and it used to be fetched before anyone
    // knew whether there would be one -- so every member who passed this gate paid for a round
    // trip whose only output was a string they never saw.
    //
    // `spaceMembershipGateError` is PURE (no client, no IO), so asking it twice costs nothing and
    // the verdict cannot differ between the two calls: same tier, same membership, and the name
    // only ever appears INSIDE the message. A pass returns before the read happens at all.
    const verdict = spaceMembershipGateError(tier, membership, 'the hosting space')
    if (verdict) {
      const { data: hsName } = await db()
        .from('spaces')
        .select('name, brand_name')
        .eq('id', membershipSpaceId)
        .maybeSingle()
      const hs = hsName as { name: string | null; brand_name: string | null } | null
      // Re-worded with the real name. Falls back to the verdict we already hold, so an unreadable
      // Space still refuses -- it just refuses in the generic words rather than not at all.
      const named = spaceMembershipGateError(tier, membership, hs?.brand_name ?? hs?.name ?? 'the hosting space')
      return { error: named ?? verdict }
    }
  }

  // ── SALES WINDOW (ADR-1373): may this ticket be bought YET? ───────────────────────────────────
  // The third question at one checkout, and the only one about time. ADR-823 above decided WHO
  // (admission) and the benefit below decides WHAT THEY PAY (price); this decides WHEN. It composes
  // with both rather than replacing either: a members tier can be gated, discounted AND early.
  //
  // ORDER MATTERS, and it is admission first. A buyer who can never hold this ticket must not be
  // told to come back on a date, because the date is not what is stopping them and they would come
  // back to the same refusal. Only someone the gate lets through is told when the doors open.
  //
  // The relative rule counts back from the event's TRUE start instant, so the stored wall-clock
  // parts go through `eventInstant` first (lib/time/zone.ts) rather than being read as UTC. Skipped
  // outright for the legacy flat-price path, which has no tier row and therefore no window.
  if (tier) {
    // resolveZone, not the raw column: the instant and the printed abbreviation have to be read in
    // the SAME zone, or a refusal names a time that does not match the moment it was computed from.
    const eventTz = resolveZone(event.time_zone)
    const windowError = ticketSalesWindowError(
      tier,
      eventInstant(event.starts_at, eventTz),
      new Date(),
      eventTz,
    )
    if (windowError) return { error: windowError }
  }

  // ── Inventory: never oversell. quantity NULL = unlimited. Sold-out routes the
  // buyer back (the UI shows a sold-out / waitlist state from the same `sold`). ──
  if (tier && tier.quantity != null) {
    const remaining = tier.quantity - tier.sold
    if (remaining <= 0) return { error: 'This ticket type is sold out.' }
    if (qty > remaining) return { error: `Only ${remaining} left for this ticket.` }
  }

  // ── Free tier: no money moves, no checkout. The caller records the claim. ──
  // The SAME answer for a member and a guest. Every gate above has already run for both, so a
  // members-only, space-members-only, inactive or sold-out free tier was refused before reaching
  // here. The caller holds the identity and picks the recorder: a member's claim is a going RSVP
  // through `setRsvpStatus`; a guest's is the same row through `submitGuestRsvp`, whose SQL takes
  // a free tier on a tickets-mode event (LIVE-318, 20270345004000) and re-checks these gates.
  if (mode === 'free') return { free: true }

  // ── Resolve the per-ticket charge amount for this mode (floor enforced). ──
  const unit = resolveUnitCents({
    mode,
    priceCents: tier ? tier.price_cents : event.price_cents,
    minCents: tier?.min_cents ?? null,
    amountCents: opts.amountCents,
  })
  if ('error' in unit) return unit
  const listUnitCents = unit.unitCents
  if (listUnitCents <= 0) {
    // A flat event with no price and no tier = free; nothing to charge.
    return { error: 'This event is free. No ticket needed.' }
  }

  // ── MEMBER BENEFIT (ADR-1372): what the buyer's membership tier is WORTH here ─────────────────
  // 🔴 APPLIED HERE, BEFORE THE GROSS, AND THEREFORE BEFORE THE TAKE-RATE. Every line below derives
  // from `unitCents`; the list price does not survive into the fee math at all, which is the one
  // property this whole feature has to keep. There is deliberately no list-price gross variable in
  // scope for anyone to hand to `spaceTakeRateCents` by mistake.
  //
  // No read at all for a mode a benefit cannot price (see benefitAdjustedUnitCents) or for a buyer
  // holding no membership: the resolver would refuse them anyway, so this is the same answer
  // without the query.
  const benefitNow = new Date().toISOString()
  const benefits =
    mode === 'fixed' && membership
      ? await loadTicketBenefits(membershipSpaceId, membership.tier_id)
      : []
  const { unitCents, applied: benefit } = benefitAdjustedUnitCents({
    mode,
    listUnitCents,
    benefits,
    tierId: membership?.tier_id ?? null,
    // The cap ledger, in each benefit's own period bucket. Read from the SAME instant the window
    // rules are evaluated against, so a checkout crossing midnight on the first of the month cannot
    // count against one bucket and be priced in another.
    usesByBenefitId: await loadBenefitUses(benefits, buyerProfileId, benefitNow),
    now: benefitNow,
  })

  // A benefit that covers the ticket entirely takes the SAME claim path a free tier takes: no
  // zero-amount Stripe session, no destination charge for nothing, no payouts-ready host required for
  // money that never moves. Today's free members ticket IS this case (a 100% benefit scoped to the
  // Space's own events), so the two have to land on one path or they will drift apart.
  //
  // Inventory nuance, inherited from that path and unchanged here: the claim is recorded as an RSVP
  // and does NOT bump the tier's `sold`, so event capacity governs a fully-covered claim rather than
  // the tier's own `quantity`. The sold-out check above still refuses a sold-out tier.
  if (unitCents <= 0) return { free: true }

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
  // Started as soon as the payee resolved; this is where it was always consumed, and a rejection is
  // re-thrown HERE so the failure surfaces exactly where it used to.
  const connectStatus = await connectStatusPromise
  if (!connectStatus.ok) throw connectStatus.reason
  const status = connectStatus.value
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
  // feeBearingSpaceId, NOT resolveHostingSpaceId: root is a real answer here. See its header —
  // a platform-hosted event is Frequency's own event and pays the flat platform fee, and
  // collapsing root to null would reprice the platform's own sales as personal ones.
  const feeSpaceId = feeBearingSpaceId(event)
  // A GUEST passes `null`, which is the honest answer: there is no profile to test the
  // relationship check ("already your audience") against, so a guest falls through to the cookie
  // signals and is priced as the stranger they are. Never `self` by accident.
  // Started right after the payee resolved; this is where it was always consumed. A rejection is
  // re-thrown HERE so the failure surfaces exactly where it used to (see the hoist above).
  const orderSource = await orderSourcePromise
  if (!orderSource.ok) throw orderSource.reason
  const { source, attributionRef } = orderSource.value
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
    // rate on a tier they have not bought is charging for a discount they do not hold.
    //
    // DIRECTION — FAIL CLOSED ON THE TRANSACTION (SCAN-539). The old comment here said "fail-safe on the
    // read: an error leaves payeeTier null, which prices at the free rung (never under-collect)", but a
    // PostgREST error arrives in `error`, not as a throw, so that arm was never a decision — it was the
    // unchecked null falling through, and it billed a Crew host the free rung's 10% on a rate they had
    // paid to buy down to 8%. Over-charging against a rate someone bought is worse than not selling the
    // ticket: it takes real money on a contract we could not verify, and it is invisible until the host
    // audits their receipts. Refusing costs one retryable checkout. `data === null` with no error still
    // means a genuinely absent profile row and still prices at the free rung — only the UNKNOWN case
    // refuses.
    const { data: payeeProf, error: payeeProfErr } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', payeeProfileId)
      .maybeSingle()
    if (payeeProfErr) {
      console.error('[tickets] host membership tier unreadable, refusing checkout:', payeeProfErr.message)
      return { error: 'Could not start checkout. Please try again.' }
    }
    const payeeTier = (payeeProf as { membership_tier: string | null } | null)?.membership_tier ?? null
    fee = await memberTakeRateCents(gross, source, payeeTier)
    rateBps = source === 'self' ? 0 : memberNetworkTakeRateBps(payeeTier, await resolvedNetworkRate())
  }
  const tierLabel = tier ? ` (${tier.name})` : ''
  // The BUYER's own words for why this line costs less than the posted price. `label` is written for
  // them ("Temple Member, 15% off"), never the internal kind, so a lower number on the Stripe page is
  // explained where they are looking rather than discovered on a receipt.
  const benefitLabel = benefit ? ` (${benefit.label})` : ''
  // The stamp the success paths redeem against. A redemption is NOT recorded here on purpose: this
  // is a pending session a buyer can abandon, and burning a once-a-month guest pass on a checkout
  // nobody completed spends the benefit without selling the ticket. The id travels on the session so
  // the completion path can record it against a payment that actually happened.
  const benefitMeta: Record<string, string> = benefit
    ? {
        benefit_id: benefit.benefitId,
        benefit_discount_cents: String(benefit.discountCents * qty),
      }
    : {}

  // ── WHO THIS TICKET BELONGS TO, CARRIED ACROSS THE STRIPE BOUNDARY ──────────────────────────
  // EXACTLY ONE key, mirroring the identity invariant above and the one `event_tickets` holds:
  // a member's session carries `buyer_profile_id` and NO `guest_email`; a guest's carries
  // `guest_email` and NO `buyer_profile_id`. The webhook settles off these, so the key names are
  // a contract with it and must not drift. Written into BOTH blocks because the two are read by
  // different events: `metadata` by checkout.session.completed, `payment_intent_data.metadata`
  // by the charge/refund events, which never see the session.
  const identityMeta: Record<string, string> = buyerProfileId
    ? { buyer_profile_id: buyerProfileId }
    : { guest_email: guestEmail as string }

  // THE ADDRESS STRIPE SENDS ITS OWN RECEIPT TO. `receipt_email` was set nowhere in this codebase,
  // so Stripe's native receipt -- the one that arrives whatever happens to our outbox, our webhook
  // or our send gate -- was never sent for anything. The buyer's own record of the charge depended
  // entirely on us. A ticket is the one channel where that is least acceptable: the buyer may have
  // no account at all, and the thing they bought has a door and a start time.
  //
  // A GUEST's address is the one they typed and the one the ticket is written against. A MEMBER's
  // is their PROVEN account address, never anything the client supplied, for the same reason
  // `customer_email` below is guest-only: a member's receipt must not be routable by form input.
  // Best-effort by construction -- `profileAccountEmail` never throws and answers null for a
  // profile with no auth user -- and a null simply omits the field, which is exactly where this
  // path has been since it shipped.
  const receiptEmail = await receiptEmailPromise

  // ── CAN THIS BUYER SAVE THEIR CARD? (LIVE-362) ───────────────────────────────────────────
  // A member reuses their one Stripe customer, or gets one minted to save against; a GUEST gets
  // nothing, because there is no account for a card to belong to and `customer_email` (which a
  // guest session sets) cannot coexist with `customer`. An unreadable profile row REFUSES rather
  // than guessing -- see ./saved-card for why a wrong guess is permanent.
  const savedCard = await savedCardPromise
  if ('error' in savedCard) return { error: 'Could not start checkout. Please try again.' }

  // Captured locally because the create call is now inside a closure (the saved-card retry), and
  // TypeScript does not carry the earlier `if (!stripe)` narrowing of an imported binding across
  // one. Same client, named so the narrowing survives.
  const sdk = stripe

  const session = await createAllowingSavedCard(
    (savedCardParams) =>
      sdk.checkout.sessions.create({
    ...savedCardParams,
    mode: 'payment',
    // TICKETS ARE TIMED INVENTORY, SO THEY TAKE INSTANT MONEY ONLY (owner decision).
    // See ticketPaymentMethodParams: a 3 to 5 day settlement cannot share a product with a 30
    // minute seat hold. This is the ONLY creator in the repo that narrows the set; every other
    // channel keeps the full dashboard-controlled list.
    ...ticketPaymentMethodParams(),
    line_items: [
      {
        quantity: qty,
        price_data: {
          currency: 'usd',
          unit_amount: unitCents,
          product_data: { name: `Ticket: ${event.title}${tierLabel}${benefitLabel}` },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: status.accountId },
      // Stripe's OWN receipt, the backstop to ours. It lives here rather than at the top level
      // because a Checkout Session has no `receipt_email` of its own: the field belongs to the
      // PaymentIntent the session creates. Omitted rather than sent to a null.
      ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
      metadata: {
        kind: 'ticket',
        event_id: event.id,
        ...identityMeta,
        ...(tier ? { ticket_type_id: tier.id } : {}),
        ...benefitMeta,
      },
    },
    metadata: {
      kind: 'ticket',
      event_id: event.id,
      ...identityMeta,
      ...(tier ? { ticket_type_id: tier.id } : {}),
      ...benefitMeta,
    },
    // Prefills Checkout for the guest and, because Stripe echoes it back on the session, gives the
    // webhook a second reading of the address it is settling against. Absent for a member: their
    // email is resolved from the profile, and setting it here would let the client's input decide
    // where a member's receipt goes. GUEST INPUT ONLY, and never authoritative: the address the
    // ticket is written against is the one in `metadata`/the reservation, not the one Stripe may
    // have let the buyer edit at the card step.
    ...(guestEmail ? { customer_email: guestEmail } : {}),
    // Hold the seat for 30 min: the session expires so an abandoned checkout frees its
    // reservation (matches the pending window in reserve_ticket_atomic).
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    // ── WHERE THE BUYER ENDS UP, AND WHY THE TWO MODES SPELL IT DIFFERENTLY (LIVE-347) ────────
    //
    // Hosted Checkout takes `success_url` + `cancel_url`, because Stripe owns the page and has to
    // know where to send the browser back to. An `ui_mode: 'elements'` session is rendered by US,
    // so there is no "back": Stripe REJECTS both of those fields in a non-hosted mode and takes a
    // single `return_url` instead, used only when a payment method redirects away and returns
    // (3DS, a bank app).
    //
    // 🔴 `session_id={CHECKOUT_SESSION_ID}` MUST SURVIVE THE SWAP. That placeholder is what makes
    // the success path work WITHOUT the webhook: app/(main)/events/[slug]/page.tsx reads
    // `?ticket=success&session_id=...` and calls recordTicketFromSessionId, which settles the
    // ticket even if the webhook is late, retried, or never arrives. Dropping it would leave the
    // buyer on a page that cannot see their own purchase until a background event lands.
    //
    // It stays a CLAIM, never proof: LIVE-322 and lib/events/ticket-ownership.ts keep
    // `purchaseConfirmed` (message-grade, derived from the reconcile) apart from `ownsTicket`
    // (registration-grade, derived from a real row), because a session id in a URL is typed by
    // whoever is holding the keyboard.
    ...checkoutReturnFields(ui, {
      successUrl: `${appUrl()}/events/${event.slug}?ticket=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/events/${event.slug}`,
    }),
      } as Parameters<typeof sdk.checkout.sessions.create>[0]),
    savedCard.params,
    'tickets',
  )

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
      _tier_id: string | null; _event_id: string; _buyer: string | null; _qty: number
      _amount_cents: number; _fee_cents: number; _currency: string; _session_id: string
      /** Guest door. OMITTED for a member so the function's own default (null) applies and the
       *  member call is byte-identical to what it has always been. */
      _guest_email?: string
    },
  ) => Promise<{ data: { reserved?: boolean; reason?: string } | null; error: { message: string } | null }>

  const { data: reservation, error: reserveErr } = await reserveRpc('reserve_ticket_atomic', {
    _tier_id: tier?.id ?? null,
    _event_id: event.id,
    _buyer: buyerProfileId,
    _qty: qty,
    _amount_cents: gross,
    _fee_cents: fee,
    _currency: 'usd',
    _session_id: session.id,
    // The KEY IS ABSENT for a member, not null. `reserve_ticket_atomic` defaults it and refuses
    // when both identity arguments are set or both are null, so the identity invariant is enforced
    // one more time inside the transaction that actually inserts the row. A spread rather than
    // `_guest_email: guestEmail ?? undefined` so the member's argument list is unchanged.
    ...(guestEmail ? { _guest_email: guestEmail } : {}),
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

  // ── WHAT COMES BACK, AND THE DELIBERATE DEGRADE ───────────────────────────────────────────
  // An elements session has `url: null` and carries a `client_secret`; a hosted one is the
  // reverse. If we ASKED for elements and got a secret, hand it back and the form mounts here.
  //
  // 🔴 If we asked for elements and got NO secret, fall through to the hosted URL rather than
  // erroring. That is the whole safety property of this change: the on-page form is an
  // enhancement over a working redirect, so every way it can fail to materialise -- an API
  // version that does not know the mode, a Stripe-side rejection, a field this repo has wrong --
  // lands the buyer on Stripe's page instead of a dead end. The compiler cannot help here
  // (`stripe` ships no types; `Stripe.*` is `any`), so this branch is the check.
  return resolveCheckoutSession(session, ui, 'tickets')
}

/**
 * Release a ticket whose checkout expired or failed (LIVE-364).
 *
 * The mirror of `recordTicketFromSession`, and it exists because there was NO tip/ticket arm on
 * `checkout.session.expired` at all: commerce orders and Space donations were swept, tickets were
 * not, so every abandoned ticket checkout left a `pending` row behind forever. Production held 11
 * of them, from 9 expired sessions and not one completed payment.
 *
 * ⚠️ `failed`, NOT `abandoned`. event_tickets_status_check allows pending|succeeded|failed|refunded
 * and space_donations allows abandoned -- so copying the donation arm verbatim would violate a check
 * constraint on a money table at runtime, where nothing in this repo's build could have caught it.
 * Read off the live schema before it was written.
 *
 * 🔴 NEVER TOUCHES A PAYMENT STILL IN FLIGHT. A delayed-notification ticket (ACH, Cash App, a bank
 * redirect) is ALSO `status = 'pending'`, distinguished only by `payment_processing_at` -- that is
 * the second clock markTicketPaymentProcessing starts so the seat survives a settlement that takes
 * days. Flipping one of those to `failed` would cancel a seat somebody is in the middle of paying
 * for. Stripe should never expire a session it already completed, so this guard should be
 * unreachable; it is here because "should" is not a guarantee worth a seat.
 *
 * Idempotent by the same predicate the settle uses: keyed on the session id AND `status = 'pending'`,
 * so a redelivered event flips nothing, and a ticket that settled first is untouched.
 */
export async function abandonTicketFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'ticket') return
  try {
    const { error } = await db()
      .from('event_tickets')
      .update({ status: 'failed' })
      .eq('stripe_checkout_session_id', session.id)
      .eq('status', 'pending')
      .is('payment_processing_at', null)
    if (error) console.error('[tickets] could not release an abandoned ticket', error.message)
  } catch (e) {
    console.error('[tickets] releasing an abandoned ticket threw', e instanceof Error ? e.message : String(e))
  }
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

/** The row a settle or a refund RPC hands back: exactly the columns the two recorders below need
 *  to write the ledger, the CRM contact, and the log line. */
interface SettledTicketRow {
  id: string
  event_id: string
  ticket_type_id: string | null
  qty: number
  entity_id: string
  platform_fee_cents: number
  buyer_profile_id: string | null
  currency: string
  /** LIVE-343, migration 20270345004700. `settle_ticket_atomic` re-measures the tier under the same
   *  per-tier advisory lock `reserve_ticket_atomic` takes, and reports what it found on the row it
   *  flipped. True means honouring this ticket put the tier past its `quantity`.
   *
   *  OPTIONAL on the type, not because the SQL omits them but because the SETTLE and the REFUND
   *  share this row shape and `refund_ticket_atomic` returns the original eight columns. They are
   *  also absent for the moments between this file merging and the migration being applied, which
   *  reads as "not measured" rather than "measured false". Every consumer treats `undefined` as no
   *  verdict. Untyped by construction: lib/database.types.ts still carries the eight-column shape
   *  (ADR-246), and this cast is where the real one is declared. */
  over_capacity?: boolean | null
  tier_quantity?: number | null
  tier_committed?: number | null
}

/**
 * Flip a ticket AND move its tier's `sold` in ONE statement (LIVE-161, migrations
 * 20270345001700). Returns the rows this call actually flipped -- empty on a redelivered event.
 *
 * WHAT THIS REPLACED, AND WHY THE REPLACEMENT IS NOT COSMETIC. The settle used to be an
 * `update event_tickets ... where status = 'pending'` followed by a SECOND request to
 * `adjust_ticket_sold(tier, +qty)`. Both halves were individually safe -- the RPC did
 * `sold = greatest(0, sold + delta)` so concurrent bumps could not lose an increment, and the
 * `pending` predicate made a redelivered webhook flip nothing and bump nothing. The GAP between
 * them was the defect: a crash, a timeout or an unavailable second call after a successful flip
 * left the ticket sold and `sold` short FOREVER, because the flip is exactly-once and nothing
 * re-enters. L6-15 added a retry and an error log, which made that drift visible; no number of
 * retries closes a window that exists between two round trips.
 *
 * Now the flip and the bump are one transaction, so there is no interval in which a ticket is
 * succeeded and its tier has not counted it, and the bump is derived from the rows the same
 * statement returned rather than inferred across a gap.
 *
 * NOT RETRIED, deliberately. The RPC is idempotent, but a call that COMMITS and then loses its
 * response would return zero rows on a retry -- and zero rows is how this function says "somebody
 * else settled it", which would skip the ledger row. That was already true of the bare flip, so
 * this keeps the semantics and logs instead. `sold` is derived, never authoritative (capacity is
 * counted from event_tickets rows by reserve_ticket_atomic, migration 20260930000000), and the
 * reconcile below is safe to run at any time:
 *   update event_ticket_types t set sold = coalesce((select sum(qty) from event_tickets
 *     where ticket_type_id = t.id and status = 'succeeded'), 0)
 */
function flippedRows(
  fn: 'settle_ticket_atomic' | 'refund_ticket_atomic',
  args: Record<string, string | null>,
  result: { data: unknown; error: { message: string } | null },
): SettledTicketRow[] {
  if (result.error) {
    // One transaction: a failure flipped nothing and moved no `sold`, so the ticket is untouched
    // and a Stripe redelivery can settle it cleanly. Loud, because nothing here retries.
    console.error(`[tickets] ${fn} failed; the ticket was NOT flipped and its tier was NOT moved`, {
      args,
      error: result.error.message,
    })
    return []
  }
  return (result.data ?? []) as SettledTicketRow[]
}

/** Mark the ticket behind a completed Checkout session as succeeded (idempotent),
 *  and bump the tier's `sold` by the ticket qty IFF this call is the one that
 *  flipped pending → succeeded (so a redelivered webhook never double-counts).
 *
 *  GUEST TICKETS (the guest door). A guest session carries `metadata.guest_email` and NO
 *  `buyer_profile_id`, so the settled row has a null buyer. Everything below that does per-BUYER
 *  work was walked one at a time and given an explicit answer rather than a null:
 *    • the tier bump + the flip  — identity-blind, keyed on the ticket. Unchanged.
 *    • recordBuyerAsContact      — SKIPPED. `contacts` is keyed on `profile_id`, so there is no
 *                                  contact to write for someone who has no profile. The guest
 *                                  equivalent is the `signup_leads` row below, which is the table
 *                                  that exists precisely for an address that is not yet a member.
 *    • recordFinancialTransaction— RUN, with `profileId: null`. financial_transactions.profile_id
 *                                  is nullable by design and the ENTITY is what partitions the
 *                                  ledger. Dropping the row to avoid a null would lose real
 *                                  revenue, which is the one thing this ledger may never do.
 *    • the guest ticket email    — the guest's ONLY record of the purchase (lib/events/
 *                                  guest-ticket-email.ts). It carries the single account offer.
 *    • the member ticket email   — the MEMBER's receipt (lib/events/member-ticket-email.ts,
 *                                  LIVE-316): same message family as the guest one, with the
 *                                  calendar in place of the account offer. Until 2026-09-14 a
 *                                  member who paid got nothing at all.
 *    • the signup_leads row      — the CRM half, at a HIGHER step than the RSVP door, because
 *                                  somebody who PAID is a stronger signal than somebody who said
 *                                  they might come.
 *  Nothing here passes a null profile id into a filter. `.eq('id', null)` matches no row and
 *  `.in('id', [null])` is worse, so every guest branch is taken on `!row.buyer_profile_id`
 *  BEFORE a query is built, never inside one. */
/**
 * Persist the Stripe customer a checkout minted, if we do not already hold one.
 *
 * Guarded on `stripe_customer_id is null` so this can only ever FILL a gap, never replace an
 * existing id: a member's customer is their identity across subscriptions, invoices, saved cards
 * and the billing portal, and overwriting it is the permanent split SCAN-539 names.
 *
 * Silent no-op for a guest (no profile to write to) and for a session that reused a customer.
 */
async function rememberStripeCustomer(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
  const profileId = session.metadata?.buyer_profile_id || null
  if (!customerId || !profileId) return
  try {
    const { error } = await db()
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', profileId)
      .is('stripe_customer_id', null)
    if (error) console.error('[tickets] could not remember the Stripe customer', error.message)
  } catch (err) {
    console.error('[tickets] remembering the Stripe customer threw', err instanceof Error ? err.message : String(err))
  }
}

export async function recordTicketFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'ticket') return
  if (session.payment_status !== 'paid') {
    // ⏳ NOT PAID, BUT NOT ABANDONED EITHER (LIVE-343). A delayed-notification buyer (ACH debit,
    // Cash App Pay, a bank redirect) does not pay at Checkout, they SUBMIT: Stripe completes the
    // session at once with payment_status 'unpaid' and settles it days later with
    // checkout.session.async_payment_succeeded, which lands here again as 'paid'. This function is
    // only ever reached from those two events, so an unpaid arrival means exactly one thing: the
    // payment is in flight.
    //
    // That fact has to reach the database, because capacity is decided there. `reserve_ticket_atomic`
    // released a pending seat 30 minutes after `created_at` -- the Checkout SESSION expiry, which is
    // the right clock for an abandoned card checkout and the wrong one for a payment that is still
    // settling. At minute 31 the tier read a free seat and sold it to somebody else, and the settle
    // days later flipped the first ticket anyway. Two buyers, one seat, nobody told.
    //
    // Stamping the row starts the second clock (7 days, migration 20270345004700), so the seat stays
    // held while the payment settles and an abandoned card checkout still frees its seat in 30
    // minutes. Best-effort: a miss costs the widened hold and leaves the settle-time capacity
    // re-check as the backstop, which is exactly what that backstop is for.
    await markTicketPaymentProcessing(session)
    return
  }
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  // The guest's address, off the session Stripe SIGNED. Normalised the same way the checkout
  // normalises it (trim + lowercase) so the value that lands on the row is the value
  // `claim_guest_tickets()` will later compare against a proven `auth.users` address. Empty for a
  // member purchase, which is how the guest legs below stay unreachable for one.
  const guestEmail = (session.metadata?.guest_email || '').trim().toLowerCase() || null
  // Only advance pending → succeeded, and count the sale on the tier in the same transaction.
  // The RPC returns the rows it actually flipped, so a redelivered event (already succeeded)
  // flips nothing, bumps nothing, and lands here with an empty list — idempotent.
  // The RPC name is written out at the call site, not passed through a variable: check:schema-contract
  // resolves `.rpc('<literal>')` against the generated types and SKIPS a dynamic one, and a phantom
  // RPC on an untyped client fails at runtime, not at tsc (ADR-1207).
  // ── REMEMBER THE CUSTOMER, SO A SAVED CARD IS FINDABLE NEXT TIME (LIVE-362) ──────────────
  // When the checkout minted a customer (`customer_creation: 'always'`), THIS is the only place
  // its id ever reaches us. Without writing it back, a member who ticked "save this card" has the
  // card stored against a customer the next checkout will not reuse -- so they would be asked for
  // it again, and a second customer would be minted, which is the split identity ./saved-card
  // exists to prevent.
  //
  // Best-effort and NEVER-CLEARING, matching apply_membership_event_atomic's `coalesce(...)`: the
  // write is guarded on the column still being null, so a redelivered webhook cannot overwrite an
  // id an earlier purchase or a subscription already established. A failure here costs the
  // convenience, never the ticket, so it does not gate the settle below.
  await rememberStripeCustomer(session)

  const settleArgs = { _session_id: session.id, _payment_intent_id: paymentIntentId }
  const rows = flippedRows('settle_ticket_atomic', settleArgs, await db().rpc('settle_ticket_atomic', settleArgs))
  // ZERO ROWS IS TWO DIFFERENT FACTS AND ONLY ONE OF THEM IS FINE. A Stripe redelivery flips
  // nothing because the ticket is already `succeeded`; that is the design. A session whose ticket
  // row does not exist at all flips nothing for a completely different reason: money moved and
  // there is nothing to show for it. The two were indistinguishable here, and silence on the
  // second is the worst outcome this file can produce, so they are now told apart.
  if (rows.length === 0) {
    await warnOnPaymentWithoutTicket(session.id, guestEmail)
    return
  }
  for (const row of rows) {
    // ONE identity per row, decided BEFORE any query is built (see the header note). Read off the
    // ROW rather than off the session, which matters in one real case: `claim_guest_tickets()`
    // attaches any ticket with a null buyer, `pending` ones included, so a guest who signs in
    // between checkout and this webhook arrives here already owning the ticket. The row is then a
    // member's and is treated as one, which is the correct answer.
    const isGuest = !row.buyer_profile_id
    // Persist the address on the ticket. `reserve_ticket_atomic` already wrote it at checkout
    // (migration 20270345003400 normalises and format-checks it there), so this is a RE-AFFIRMATION
    // from the session Stripe actually signed, and a backstop for any row that reached `pending`
    // without one. It is what makes the row claimable: `claim_guest_tickets()` matches
    // `event_tickets.guest_email` against the caller's PROVEN auth.users address, so a settled guest
    // ticket carrying no address can never be attached to anybody and is a payment with no owner.
    // Written on the row THIS delivery flipped, so a redelivery neither re-enters this loop nor
    // rewrites it, and the value written is byte-identical to the one already there.
    if (isGuest) await persistGuestEmail(row.id, guestEmail, session.id)
    // THE SEAT (owner report 2026-09-16). A paid ticket takes the same going RSVP a free claim
    // takes, so the buyer is counted, shown and reminded like everyone else in the room. Runs for a
    // member and a guest alike, once, on the row THIS delivery flipped -- a redelivery neither
    // re-enters this loop nor re-seats anyone, and the RPC is idempotent besides.
    await seatTicketHolder(row.id, session.id)
    // A BUYER IS A CONTACT (ADR-913). This is what makes "we charge once for the introduction" true:
    // the first sale from someone Frequency sourced is network-rated, this records the relationship,
    // and every later sale to that person resolves to their own audience at 0%.
    //
    // 🔴 Without it the promise silently fails. Nothing else in the product turned a purchase into a
    // contact — `contacts` rows only ever came from opt-in forms, CSV import, beta signup and lead
    // capture — so a repeat buyer looked like a stranger on every visit and would have been charged
    // the network rate forever. It also closes a real CRM gap: people who paid a Space were not in
    // its CRM.
    //
    // A GUEST reaches its `if (!buyerProfileId) return` guard and writes nothing, which is correct:
    // a contact row is keyed on a profile id that does not exist yet. The lead row below is the
    // guest's half of the same job.
    await recordBuyerAsContact(row.event_id, row.buyer_profile_id).catch(() => {})
    // Record the ENTITY's revenue on the partitioned ledger (ADR-246). A ticket is a
    // Connect destination charge: the gross goes to the host's account; the platform's
    // (entity's) revenue is the application fee. Idempotent per ticket; best-effort so a
    // ledger hiccup never fails the webhook (Stripe would redeliver and we'd dedupe).
    //
    // `profileId` is NULL for a guest and that is deliberate, not an oversight: the column is
    // nullable, the ENTITY is what partitions this ledger, and money that moved is recorded
    // whether or not we know who moved it.
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

    if (isGuest && guestEmail) {
      // THE TICKET ITSELF. Nothing else tells this person they have one: no account, no "my
      // events", no bell. Best-effort and swallowed inside the module, which also quarantines the
      // elevated read the message needs. Sent exactly once because this loop runs exactly once.
      await sendGuestTicketReceipt({
        eventId: row.event_id,
        guestEmail,
        qty: row.qty,
        // Gross, straight off the session Stripe signed. The ticket row carries the same number,
        // but the settle RPC does not return it and reading it back would be a round trip for a
        // value already in hand.
        amountCents: session.amount_total ?? null,
        currency: row.currency ?? session.currency ?? null,
      }).catch(() => {})
      // THE LEAD, BESIDE THE TICKET. See recordGuestBuyerAsLead.
      await recordGuestBuyerAsLead(guestEmail, row.event_id).catch(() => {})
    }

    if (row.buyer_profile_id) {
      // THE MEMBER'S RECEIPT (LIVE-316). The member half of the same message: event, when, tier,
      // amount, and the calendar links a guest is not offered. Best-effort and swallowed inside the
      // module, which quarantines the elevated reads (event, tier, profile, account address) and
      // runs the transactional send gate. Sent exactly once because this loop runs exactly once.
      await sendMemberTicketReceipt({
        eventId: row.event_id,
        profileId: row.buyer_profile_id,
        ticketTypeId: row.ticket_type_id,
        qty: row.qty,
        // Gross off the signed session, for the same reason the guest leg reads it there.
        amountCents: session.amount_total ?? null,
        currency: row.currency ?? session.currency ?? null,
      }).catch(() => {})
    }

    // ── THE TIER WENT PAST ITS LIMIT (LIVE-343) ────────────────────────────────────────────────
    // `settle_ticket_atomic` re-measured the tier under the same per-tier advisory lock
    // `reserve_ticket_atomic` takes, and this ticket did not fit. It was HONOURED anyway: the buyer
    // was already charged, an auto-refund is the only irreversible answer, and a human can undo an
    // oversell. See the migration header for the full reasoning and the owner ruling it is flagged
    // for. What this file owes is that the overage is never silent, in both directions:
    //   * the OPERATOR gets it here, at error level, with the session id to paste into Stripe;
    //   * the HOST gets it on the sale notice below, in words, with the same numbers.
    if (row.over_capacity === true) {
      console.error('[tickets] SETTLED A TICKET THAT NO LONGER FITS ITS TIER; the tier is over capacity', {
        ticketId: row.id,
        eventId: row.event_id,
        ticketTypeId: row.ticket_type_id,
        sessionId: session.id,
        qty: row.qty,
        tierQuantity: row.tier_quantity,
        committedBefore: row.tier_committed,
      })
    }

    // ── THE HOST FINDS OUT THEY SOLD SOMETHING (LIVE-345) ──────────────────────────────────────
    // Beside the buyer's receipts, never instead of one: the two sides of a sale are two messages.
    // Until this call the seller was told nothing by anything, on any channel, and their Stripe
    // payout was the only signal. Best-effort and swallowed inside the module, which quarantines
    // the elevated reads (event, host space, buyer, tier, account address) the webhook does not
    // otherwise need. Sent exactly once because this loop runs exactly once.
    await notifyTicketSaleHost({
      id: row.id,
      event_id: row.event_id,
      ticket_type_id: row.ticket_type_id,
      qty: row.qty,
      // Gross off the signed session, for the same reason both receipt legs read it there.
      amount_cents: session.amount_total ?? null,
      platform_fee_cents: row.platform_fee_cents ?? 0,
      currency: row.currency ?? session.currency ?? 'usd',
      buyer_profile_id: row.buyer_profile_id,
      guest_email: isGuest ? guestEmail : null,
      over_capacity: row.over_capacity === true,
      tier_quantity: row.tier_quantity ?? null,
      tier_committed: row.tier_committed ?? null,
    }).catch(() => {})
  }
}

/** Start the delayed-notification clock on a ticket whose Checkout session completed UNPAID.
 *
 *  The whole of the reasoning is at the call site. Best-effort on the write and loud on the miss,
 *  the same split `persistGuestEmail` makes: this runs inside a Stripe webhook whose money work has
 *  not happened yet, so a throw here would make Stripe redeliver an event that can only re-stamp,
 *  but a row that never gets stamped is a seat that can be resold under a buyer who is paying for
 *  it, so every way of missing is logged.
 *
 *  Only ever stamps a `pending` row, and only the FIRST time: `payment_processing_at is null` keeps
 *  a redelivered `completed` event from sliding the clock forward on a payment that has been
 *  processing for six days, which would turn a bounded hold into an unbounded one.
 *
 *  Untyped reach (ADR-246): `payment_processing_at` arrives with migration 20270345004700 and
 *  lib/database.types.ts has not been regenerated for it, and `.update()` is typed off that same
 *  generated file. Same shape as `persistGuestEmail` used for `guest_email`. */
async function markTicketPaymentProcessing(session: Stripe.Checkout.Session): Promise<void> {
  // 'unpaid' is the delayed-notification state. 'no_payment_required' is a zero-total session,
  // which a ticket checkout never creates (a free tier returns before Stripe), so it is left alone
  // rather than given a clock it could never finish.
  if (session.payment_status !== 'unpaid') return
  try {
    const { error } = await (db() as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              is: (c: string, v: null) => Promise<{ error: { message: string } | null }>
            }
          }
        }
      }
    })
      .from('event_tickets')
      .update({ payment_processing_at: new Date().toISOString() })
      .eq('stripe_checkout_session_id', session.id)
      .eq('status', 'pending')
      .is('payment_processing_at', null)
    if (error) {
      console.error('[tickets] could not start the settlement clock on a submitted payment; the seat may be resold', {
        sessionId: session.id,
        error: error.message,
      })
    }
  } catch (e) {
    console.error('[tickets] starting the settlement clock threw; the seat may be resold', {
      sessionId: session.id,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Give the ticket holder the seat they paid for (owner report 2026-09-16).
 *
 * 🔴 WHY A PAID TICKET NEEDED THIS AT ALL. A seat was two rows in two tables (LIVE-317): an
 * `event_rsvps` row, or a succeeded `event_tickets` row for someone who paid and therefore had NO
 * RSVP row. Every roster-shaped reader learned the union; the PUBLIC event page never did, so an
 * owner who bought a ticket, got the receipt and saw "Ticket confirmed" was still told to "Be the
 * first to RSVP" on the page they were standing on. The free-tier claim has recorded itself as a
 * going RSVP since ADR-410; a paid ticket now lands on the same row, and the union readers already
 * dedupe a person holding both (manage/load.ts lists them once, on the RSVP row).
 *
 * ⚠️ IT SENDS NOTHING AND AWARDS NOTHING, and that is the reason it is an RPC rather than a call
 * into `setRsvpStatus`. That action sends an RSVP confirmation and awards the first-RSVP gem; this
 * loop has ALREADY sent the buyer their receipt (LIVE-316 / LIVE-320) and told the host (LIVE-345).
 * Routing the seat through it would send two emails for one act. The receipt is the confirmation.
 *
 * Best-effort on the WRITE, loud on the MISS -- the same split `persistGuestEmail` makes and for
 * the same reason: the ticket is already `succeeded` when this runs, so throwing would fail a
 * webhook whose money work is done, while a paid seat that never appears is the defect this
 * function exists to close, so every way of missing one is logged.
 *
 * Untyped reach (ADR-246): `record_ticket_seat` arrives with migration 20270345005100 and
 * lib/database.types.ts has not been regenerated for it. Same shape `markTicketPaymentProcessing`
 * uses for `payment_processing_at`.
 */
async function seatTicketHolder(ticketId: string, sessionId: string): Promise<void> {
  try {
    const { data, error } = await (db() as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    }).rpc('record_ticket_seat', { _ticket_id: ticketId })
    if (error) {
      console.error('[tickets] could not seat a settled ticket holder; they hold a ticket and no seat', {
        ticketId,
        sessionId,
        error: error.message,
      })
      return
    }
    const rows = (Array.isArray(data) ? data : []) as { seat_status?: string | null }[]
    if (rows.length === 0) {
      // The RPC returns no rows for a ticket that is not live, or one carrying neither identity.
      // Reaching here from the settle loop means the row WAS just flipped to succeeded, so this is
      // the identity-less case `persistGuestEmail` also reports -- said again from the seat's side
      // because the consequence is different: there, unclaimable; here, uncounted.
      console.error('[tickets] a settled ticket seated nobody; it carries neither a buyer nor an address', {
        ticketId,
        sessionId,
      })
      return
    }
    // THE ONE OUTCOME THAT WOULD BE A LIE. The capacity trigger coerces a `going` insert to
    // `waitlist` on a full event, and 20270345005100 exempts a ticket-backed seat precisely so a
    // person who paid is never put on a waitlist. If that exemption is ever lost, this is where it
    // shows -- and it must never be silent, because the buyer is being told they are in.
    const seat = rows[0]?.seat_status ?? null
    if (seat !== 'going') {
      console.error('[tickets] A PAID SEAT DID NOT LAND ON going; the buyer paid for a seat they do not hold', {
        ticketId,
        sessionId,
        seatStatus: seat,
      })
    }
  } catch (e) {
    console.error('[tickets] seating a settled ticket holder threw; they hold a ticket and no seat', {
      ticketId,
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/** Write the guest's address onto the ticket that just settled.
 *
 *  Best-effort on the WRITE and loud on the MISS, which are two different things. The ticket is
 *  already `succeeded` when this runs, so throwing would fail a webhook whose money work is done
 *  and make Stripe redeliver an event that can only no-op. But a guest ticket with no address is
 *  unclaimable forever, so every way of ending up with one is logged at error level.
 *
 *  Untyped reach (ADR-246): `guest_email` is a live column that lib/database.types.ts has not been
 *  regenerated for, and `.update()` is typed from that same generated file. */
async function persistGuestEmail(ticketId: string, guestEmail: string | null, sessionId: string): Promise<void> {
  if (!guestEmail) {
    // Neither identity. `event_tickets` carries exactly one of buyer_profile_id / guest_email, so a
    // settled row with neither is a ticket nobody can ever hold or claim. Nothing here can invent
    // the address, so the only honest response is to say so where an operator will find it.
    console.error(
      '[tickets] SETTLED TICKET HAS NEITHER A BUYER NOR A GUEST EMAIL; it cannot be claimed or emailed',
      { ticketId, sessionId },
    )
    return
  }
  try {
    const { error } = await (db() as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>
        }
      }
    })
      .from('event_tickets')
      .update({ guest_email: guestEmail })
      .eq('id', ticketId)
    if (error) {
      console.error('[tickets] could not stamp guest_email on a settled ticket; it is UNCLAIMABLE', {
        ticketId,
        sessionId,
        error: error.message,
      })
    }
  } catch (e) {
    console.error('[tickets] stamping guest_email on a settled ticket threw; it is UNCLAIMABLE', {
      ticketId,
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/** A paid Checkout session that flipped no ticket: say which of the two reasons it was.
 *
 *  A redelivery is normal and silent. A session with NO ticket row at all is a payment that bought
 *  nothing, which is the worst state this build can reach, so it is logged at error level with the
 *  session id an operator can paste straight into Stripe. Read-only, best-effort, and it never
 *  changes what the caller returns: this is a smoke alarm, not a recovery. */
async function warnOnPaymentWithoutTicket(sessionId: string, guestEmail: string | null): Promise<void> {
  try {
    const { data, error } = await db()
      .from('event_tickets')
      .select('id, status')
      .eq('stripe_checkout_session_id', sessionId)
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('[tickets] settle flipped nothing and the read-back failed; cannot tell a redelivery from a lost ticket', {
        sessionId,
        error: error.message,
      })
      return
    }
    const ticket = data as { id: string; status: string } | null
    if (!ticket) {
      console.error(
        '[tickets] PAID CHECKOUT SESSION WITH NO TICKET ROW. Money moved and no ticket exists. Reconcile by hand.',
        { sessionId, guest: !!guestEmail },
      )
    }
    // A row that exists and is already `succeeded` (or `refunded`) is the ordinary Stripe
    // redelivery. Nothing to say.
  } catch (e) {
    console.error('[tickets] settle flipped nothing and the read-back threw', {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Record a guest BUYER as a `signup_leads` row: the guest half of recordBuyerAsContact.
 *
 * A guest who paid is the strongest pre-account signal this platform gets. The RSVP door already
 * captures a lead beside the seat (app/(main)/events/guest-rsvp-actions.ts) at `p_step: 0`; this one
 * uses the SAME source so the two land in one funnel, and a HIGHER step, because saying yes and
 * paying are not the same commitment and the funnel should be able to tell them apart. The source
 * stays 'event_rsvp' rather than a new value on purpose: `capture_signup_lead` folds any unknown
 * source back to 'beta_induction', so inventing one here would file every paying guest under
 * induction.
 *
 * Best-effort and fully swallowed. The ticket is already settled and the email already sent by the
 * time this runs; a CRM row is never worth a 500 that makes Stripe redeliver a settled payment.
 * Idempotent enough by construction: the function upserts on the address, so a second call raises
 * `step_reached` to the same value and changes nothing else.
 *
 * ADMIN client here, unlike the guest RSVP door's SESSION client, and for a reason rather than
 * convenience: a webhook has no session. `capture_signup_lead` is granted to service_role
 * (20270345000610), and the function's own validation runs regardless of who calls it.
 * The returned `claim_token` is DISCARDED, like at the RSVP door: nothing in this process is the
 * guest's browser, so a token minted here could never be presented by the person it belongs to.
 */
const GUEST_TICKET_LEAD_STEP = 2

async function recordGuestBuyerAsLead(guestEmail: string, eventId: string): Promise<void> {
  try {
    // The name is a LITERAL at the call site so check:schema-contract can resolve it against the
    // generated types (ADR-1207). The name/handle arguments are omitted rather than passed as null:
    // the SQL defaults them, and a guest checkout collected none of them.
    const { error } = await db().rpc('capture_signup_lead', {
      p_email: guestEmail,
      p_source: 'event_rsvp',
      p_step: GUEST_TICKET_LEAD_STEP,
      // Deliberately minimal, the same restraint the RSVP door shows: the payload is schemaless and
      // is the easiest place in the repo to accumulate things nobody asked for.
      p_payload: { eventId, paid: true },
      p_attribution: {},
    })
    if (error) {
      // Logged, never branched on. A swallowed failure with no trace is an invisible regression.
      console.error('[tickets] capture_signup_lead failed for a guest ticket buyer', {
        eventId,
        error: error.message,
      })
    }
  } catch (e) {
    console.error('[tickets] capture_signup_lead threw for a guest ticket buyer', {
      eventId,
      error: e instanceof Error ? e.message : String(e),
    })
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
  // 🔴 Root EXCLUDED. This writes the buyer into a Space's CRM, and every event inherits the root
  // tenant, so before the guard EVERY buyer of EVERY personal event was filed as a contact of the
  // platform's own Space. A personal event has no Space CRM to write into, so there is nothing to
  // record and this returns.
  const spaceId = await resolveHostingSpaceIdFromRow(row)
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
  // succeeded → refunded and the seat goes back to the tier in ONE statement (LIVE-161), so a
  // refunded ticket can never leave `sold` overstated because the second request never ran.
  const refundArgs = { _payment_intent_id: paymentIntentId }
  const rows = flippedRows('refund_ticket_atomic', refundArgs, await db().rpc('refund_ticket_atomic', refundArgs))
  for (const row of rows) {
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
