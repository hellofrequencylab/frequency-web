// DID MONEY ACTUALLY MOVE, FOR THE YEAR? (ADR-880) — the PURE test a Stripe subscription has to pass
// before it can earn a lifetime entitlement (the Founding badge + the grandfathered rate, ADR-875).
//
// THE BUG THIS EXISTS TO KILL. The founding grant used to hang off "the reconcile settled on a paid
// plan", which is true for a subscription that merely EXISTS:
//   • `trialing` — every Space checkout sets trial_period_days, so DAY ONE of a free trial, before a
//     single cent is captured, minted a permanent founder.
//   • `past_due` / `incomplete` — a card that never cleared still resolved to a non-free plan.
//   • a 100%-off promotion code (both Space checkouts set allow_promotion_codes) — an `active`
//     subscription for $0.
// Nothing in the repo ever wrote founding status back to 'lapsed', so each of those was permanent and
// publicly visible. An entitlement is earned by MONEY MOVING, never by a row existing.
//
// THE RULE (owner, 2026-07): a founder is somebody who backed the year, early, with real money. All
// three, ANDed:
//   1. MONEY MOVED — the tests below.
//   2. IT WAS THE YEAR — the settled base item bills ANNUALLY. A monthly subscriber earns no badge,
//      however promptly they pay.
//   3. IT WAS BEFORE THE CUTOFF — `sub.created` against the grace window, which lives in
//      beta-founding.ts and is unchanged (replay-safe: a renewal re-decides identically).
//
// WHAT COUNTS AS MONEY MOVING, in order of authority:
//   1. `status === 'active'`. Nothing else qualifies. `trialing` is explicitly NOT a payment (that is
//      the whole point of a trial), `past_due` / `unpaid` mean a payment FAILED, `incomplete` means it
//      never started, and the terminal states are the opposite of a purchase.
//   2. A BASE plan item with a non-zero amount. The base item is found by its catalog key, never by
//      `items.data[0]` — a loadout is base + Vera AI + operator seats, in no guaranteed order.
//   3. Nothing zeroed the bill: a fully-discounting coupon (100% off, or an amount_off that covers the
//      whole base item) means the subscription is active and free, which is not a purchase. When the
//      latest invoice happens to be expanded on the event, its `amount_paid` is the last word.
//
// PURE + framework-free (no Stripe SDK calls, no Supabase, no clock), so every branch above is a unit
// test rather than a webhook replay. The IO wrappers (space-subscriptions.ts, the Stripe webhook route)
// apply it.

import type Stripe from 'stripe'
import { monthlyFromYearly } from './pricing-keys'
import { itemKeyForCatalogKey, stripItemPortion, type ItemKey } from './space-subscription-items'

/** Why a subscription did or did not earn founding status. Returned, never thrown: a badge decision
 *  must not bounce a settled payment. */
export type FoundingPaymentReason =
  | 'earned'
  /** Any status other than `active`: trialing, past_due, unpaid, incomplete, canceled, paused. */
  | 'not_active'
  /** No line item resolved to a base plan (a stray/unknown item set). */
  | 'no_base_item'
  /** The base item bills nothing: a $0 price, a fully-discounting coupon, or an invoice that
   *  collected nothing. */
  | 'zero_amount'
  /** Real money, but for a month. The badge comes with the YEAR (owner rule, 2026-07). */
  | 'not_annual'

export interface FoundingPaymentSignal {
  /** Money moved for the base plan (interval-blind). */
  paid: boolean
  /** The settled base item bills ANNUALLY. */
  annual: boolean
  /** paid AND annual: the ONE boolean a founding grant may read. */
  earnsFounding: boolean
  reason: FoundingPaymentReason
  /** The base plan's rate normalized to a MONTHLY figure, in cents, or null when unknown. This is what
   *  `founding_members.locked_rate_cents` records (the column is documented per-MONTH), even for an
   *  annual purchase. */
  monthlyRateCents: number | null
  /** The base item's own charged amount, in cents, as billed (the year's price on an annual plan).
   *  null when the price carries no amount. */
  chargedCents: number | null
}

/** The catalog item keys that are a BASE PLAN (the thing being bought), highest tier first. The AI
 *  add-on and operator seats are deliberately absent: they ride a plan, they are not one. The retired
 *  keys stay listed so a grandfathered legacy subscription still resolves its base. PURE. */
const BASE_CATALOG_KEYS_BY_RANK: readonly string[] = [
  'independent_base',
  'organization', // retired, legacy rows only
  'nonprofit_seat',
  'collective_base',
  'business_base',
  'pro_base', // retired, legacy rows only
]

/** The catalog item key a subscription line item was priced from ('business_base_month' ->
 *  'business_base'), or null when the price carries no synced catalog key. PURE. */
export function catalogKeyForItem(item: Stripe.SubscriptionItem | null | undefined): string | null {
  const raw = item?.price?.metadata?.frequency_pricing_key
  return stripItemPortion(typeof raw === 'string' ? raw : null)
}

/**
 * The subscription item carrying the SETTLED BASE PLAN. NEVER `items.data[0]`.
 *
 * A Phase B loadout is one subscription with several items (base + Vera AI + operator seats) in
 * whatever order Stripe returns them, so reading index 0 can hand back the $20 add-on or a seat line.
 * This picks the item whose catalog key is a base plan, highest tier first when a subscription somehow
 * carries two. FALLBACK: a subscription with exactly ONE item and no recognized catalog key (a member
 * Crew subscription, or a legacy single-price Space sub) IS that item. PURE.
 */
export function baseSubscriptionItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | null {
  const items = sub.items?.data ?? []
  if (items.length === 0) return null
  let best: { item: Stripe.SubscriptionItem; rank: number } | null = null
  for (const item of items) {
    const rank = BASE_CATALOG_KEYS_BY_RANK.indexOf(catalogKeyForItem(item) ?? '')
    if (rank < 0) continue
    if (!best || rank < best.rank) best = { item, rank }
  }
  if (best) return best.item
  // No catalog-keyed base: a single-item subscription is unambiguous, a multi-item one is not.
  return items.length === 1 ? items[0]! : null
}

/** The DB item_key of a subscription's base item, or null. PURE. Used to line the locked rate up with
 *  the plan the reconcile settled on. */
export function baseItemKey(sub: Stripe.Subscription): ItemKey | null {
  return itemKeyForCatalogKey(catalogKeyForItem(baseSubscriptionItem(sub)))
}

/** Does the settled base item bill for the YEAR? PURE. Read from the price's own recurring interval,
 *  never from checkout metadata: the price is what Stripe actually charges on. */
export function isAnnualBaseItem(item: Stripe.SubscriptionItem | null | undefined): boolean {
  return item?.price?.recurring?.interval === 'year'
}

/** A line item's rate normalized to a MONTHLY figure in cents, or null when the price carries no
 *  amount. A yearly price is converted through monthlyFromYearly (two months free), so the recorded
 *  rate is the one the plan is locked at. Quantity is deliberately IGNORED: the locked rate is a rate,
 *  not a bill. PURE. */
export function monthlyRateCentsForItem(item: Stripe.SubscriptionItem | null | undefined): number | null {
  const amount = item?.price?.unit_amount
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  if (amount <= 0) return 0
  return isAnnualBaseItem(item) ? monthlyFromYearly(amount) : amount
}

/** The shape of a coupon we care about (percent_off / amount_off), read defensively: a webhook payload
 *  may carry discounts as plain ids rather than expanded objects. */
type LooseDiscount = { coupon?: { percent_off?: number | null; amount_off?: number | null } | null }

/** Does a discount reduce this base amount to nothing? A 100%-off promotion code (both Space checkouts
 *  set `allow_promotion_codes: true`) yields an ACTIVE $0 subscription, which is not a purchase. PURE. */
export function fullyDiscounted(sub: Stripe.Subscription, baseAmountCents: number): boolean {
  const raw = sub as unknown as { discounts?: unknown; discount?: unknown }
  const list: unknown[] = Array.isArray(raw.discounts) ? [...raw.discounts] : []
  if (raw.discount) list.push(raw.discount)
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue // an un-expanded discount id tells us nothing
    const coupon = (entry as LooseDiscount).coupon
    if (!coupon) continue
    if (typeof coupon.percent_off === 'number' && coupon.percent_off >= 100) return true
    if (typeof coupon.amount_off === 'number' && baseAmountCents > 0 && coupon.amount_off >= baseAmountCents) {
      return true
    }
  }
  return false
}

/** The amount the subscription's latest invoice actually COLLECTED, when the event carries it expanded.
 *  null when it is an un-expanded id / absent (the common webhook shape), which is not evidence either
 *  way. PURE. */
export function invoiceAmountPaidCents(sub: Stripe.Subscription): number | null {
  const invoice = sub.latest_invoice
  if (!invoice || typeof invoice !== 'object') return null
  const paid = (invoice as { amount_paid?: unknown }).amount_paid
  return typeof paid === 'number' && Number.isFinite(paid) ? paid : null
}

/**
 * Did this subscription TAKE MONEY, FOR THE YEAR, for its base plan? The one gate a founding grant
 * reads (the third condition, the cutoff, stays in beta-founding.ts).
 *
 * FAIL-SAFE toward NOT granting (the opposite of the feature gates, and deliberately so): withholding a
 * badge is a one-line operator grant away, while a wrongly-issued lifetime rate is permanent. Anything
 * we cannot prove is a paid year reads as not earned.
 */
export function foundingPaymentSignal(sub: Stripe.Subscription): FoundingPaymentSignal {
  const item = baseSubscriptionItem(sub)
  const monthlyRateCents = monthlyRateCentsForItem(item)
  const chargedCents = typeof item?.price?.unit_amount === 'number' ? item.price.unit_amount : null
  const annual = isAnnualBaseItem(item)
  const no = (reason: FoundingPaymentReason, paid = false): FoundingPaymentSignal => ({
    paid,
    annual,
    earnsFounding: false,
    reason,
    monthlyRateCents,
    chargedCents,
  })

  // 1. Only an ACTIVE subscription. A trial is not a payment; past_due / unpaid are failed ones;
  //    incomplete never started. Every one of those used to mint a permanent founder.
  if (sub.status !== 'active') return no('not_active')
  // 2. A base plan we can actually name.
  if (!item) return { ...no('no_base_item'), monthlyRateCents: null, chargedCents: null }
  // 3. A non-zero bill, after coupons, and after the invoice when we can see it.
  if (monthlyRateCents == null || monthlyRateCents <= 0) return no('zero_amount')
  const collected = invoiceAmountPaidCents(sub)
  if (collected != null && collected <= 0) return no('zero_amount')
  if (fullyDiscounted(sub, chargedCents ?? 0)) return no('zero_amount')
  // 4. Money moved. The badge still only comes with the YEAR.
  if (!annual) return no('not_annual', true)
  return { paid: true, annual: true, earnsFounding: true, reason: 'earned', monthlyRateCents, chargedCents }
}
