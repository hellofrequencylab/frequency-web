// HOUSEHOLD / CIRCLE BUNDLE SEATING (ADR-370, REMAINING-WORK #6). The webhook half of the multi-seat
// bundle: the branch that turns a PAID bundle subscription into actual seats. Its partner is the
// checkout half, lib/billing/bundle-checkout.ts. Neither ships without the other, because a checkout
// with no seating branch takes money and seats nobody.
//
// THE DATA MODEL, all of it:
//   * ONE Stripe subscription, held by the bundle OWNER (the payer, metadata.owner_id).
//   * A SEAT is a public.profiles row whose household_bundle_id points at the owner (the self-FK from
//     migration 20260727000000). The owner counts as a seat and points at themselves, which is what
//     makes `where household_bundle_id = <owner>` the whole roster.
//   * HOW MANY seats, and WHICH member tier a seat is granted, come from the operator config
//     (pricing_settings 'household_bundle', default 4 seats / crew) and are STAMPED INTO THE
//     SUBSCRIPTION METADATA at checkout, so editing the config never re-sizes a bundle already sold.
//
// EVERY WRITE GOES THROUGH ONE RPC, apply_bundle_seating_atomic (migration 20270225000000). Seating is
// a multi-row change (unseat who left, seat who joined, re-assert the tier, advance the ordering
// stamp); done as separate round trips a mid-way failure would leave a paying buyer half seated. In
// the RPC it is one transaction: all of it, or none of it, and the webhook releases its idempotency
// claim so Stripe redelivers. Mirrors apply_membership_event_atomic on the member path.
//
// IDEMPOTENCY, in three layers, because this one is money:
//   1. app/api/webhooks/stripe/route.ts claims event.id in stripe_webhook_events first; a Stripe retry
//      of the SAME event never reaches this module.
//   2. The RPC drops any event whose created is <= profiles.household_bundle_event_at (strict >), so a
//      redelivered or out-of-order event cannot re-seat a bundle that has since been canceled.
//   3. Every write inside the RPC is SET-TO-TARGET keyed by profile id, and the roster below is a pure
//      deterministic function of the event, so even if both guards were bypassed a second run lands on
//      the identical rows.
//
// The PURE decisions (which kind, which action, which roster) live here so they are unit-testable
// without Stripe or a database; the IO wrapper applies them. Server-only.

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHouseholdBundle } from '@/lib/pricing/settings'
import { HOUSEHOLD_BUNDLE_DEFAULT } from '@/lib/pricing/bundle'
import type { EntitlementTier } from '@/lib/core/entitlement'

/** The metadata.kind every bundle checkout / subscription carries. The ONE string that routes a Stripe
 *  event to this module, stamped by createBundleCheckout and by nothing else. */
export const BUNDLE_KIND = 'household_bundle'

/** The metadata key holding the comma-separated seat profile ids stamped at checkout. */
export const BUNDLE_SEAT_IDS_KEY = 'seat_ids'

/** Is this a Household / Circle bundle checkout session or subscription? PURE. Mirrors
 *  subscriptionKind() on the Space path: the webhook asks this BEFORE the member tier path, so a
 *  bundle purchase never falls through and flips the buyer's personal membership instead of seating. */
export function isBundleMetadata(metadata: Stripe.Metadata | null | undefined): boolean {
  return metadata?.kind === BUNDLE_KIND
}

/** What a Stripe subscription status means for a bundle. PURE.
 *  'seat'  — active/trialing/past_due: the bundle stands. past_due keeps its seats on purpose (dunning
 *            grace, ADR-370): a failed renewal must not strip a household's access while Stripe retries.
 *  'unseat'— canceled/unpaid/incomplete_expired: terminal, the bundle empties.
 *  'skip'  — incomplete/paused: no confirmed change, so seating is left exactly as it is. */
export function bundleSeatingAction(
  status: Stripe.Subscription.Status | string | null | undefined,
): 'seat' | 'unseat' | 'skip' {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'seat'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'unseat'
    default:
      return 'skip'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parse the seat profile ids out of subscription metadata. PURE. FAIL-SAFE: anything that is not a
 *  uuid is dropped rather than passed to the database, and a missing key reads as "no extra seats"
 *  (the owner alone), which is the correct state for a bundle bought before its seats were filled. */
export function bundleSeatIdsFromMetadata(metadata: Stripe.Metadata | null | undefined): string[] {
  const raw = metadata?.[BUNDLE_SEAT_IDS_KEY]
  if (typeof raw !== 'string' || raw.length === 0) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
}

/** The exact set of profiles this bundle seats: the OWNER first, then the stamped seat ids, first
 *  occurrence of each kept, capped at the seat count the bundle was bought with. PURE and
 *  DETERMINISTIC, which is what makes a replay seat nothing extra: the same event always computes the
 *  same roster, and every write against it is set-to-target. */
export function bundleRoster(ownerId: string, seatIds: readonly string[], seats: number): string[] {
  const cap = Math.max(1, Math.floor(Number.isFinite(seats) ? seats : 1))
  const out: string[] = []
  for (const id of [ownerId, ...seatIds]) {
    if (!id || out.includes(id)) continue
    out.push(id)
    if (out.length >= cap) break
  }
  return out
}

/** The seat count + granted tier for a subscription: the values STAMPED at checkout win, so a later
 *  operator edit to the bundle config can never re-size or re-tier a bundle somebody already bought.
 *  Falls back to the live config (then to the seeded default) for a bundle sold before the stamp
 *  existed. */
export function bundleTermsFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): { seats: number | null; tier: EntitlementTier | null } {
  const rawSeats = Number(metadata?.bundle_seats)
  const seats = Number.isFinite(rawSeats) && rawSeats > 0 ? Math.floor(rawSeats) : null
  const rawTier = metadata?.bundle_tier
  const tier = rawTier === 'crew' || rawTier === 'supporter' ? rawTier : null
  return { seats, tier }
}

/** The RPC shape. Not yet in the generated Database types (the migration is applied separately), so it
 *  is called through a localized method cast, the repo convention for a not-yet-typed RPC (ADR-246,
 *  same as apply_membership_event_atomic in the webhook route). */
type BundleSeatingRpc = (
  name: 'apply_bundle_seating_atomic',
  args: {
    _owner: string
    _event_at: string
    _seat_ids: string[]
    _tier: string
    _seats: number
    _active: boolean
    _customer_id: string | null
  },
) => Promise<{
  data: { applied?: boolean; reason?: string; seated?: number; unseated?: number } | null
  error: { message: string } | null
}>

/** The outcome of one reconcile, for the webhook's log line and for tests. */
export interface BundleSeatingResult {
  /** Was this a bundle subscription at all? `false` means the caller should keep routing. */
  handled: boolean
  /** Did the RPC apply, i.e. did seating actually change state? `false` for stale / skipped / no-op. */
  applied?: boolean
  reason?: string
  seated?: number
  unseated?: number
}

// authz-delegated: a Stripe-SIGNED webhook event drives this, and every write is bound to the owner
// profile id stamped into the subscription metadata by the gated checkout (which resolved it from the
// authenticated buyer). There is no caller-supplied id to authorize here.
/** Reconcile a Household / Circle bundle subscription event into seats. Returns `{ handled: false }`
 *  for a subscription that is not a bundle, so the webhook can fall through to the member path exactly
 *  like routeSpaceSubscription does. THROWS on a database error, which is deliberate: the webhook then
 *  releases its idempotency claim and returns 500 so Stripe redelivers, rather than acking a payment
 *  that seated nobody. */
export async function reconcileBundleSubscription(
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<BundleSeatingResult> {
  if (!isBundleMetadata(sub.metadata)) return { handled: false }

  const ownerId = sub.metadata?.owner_id
  // A bundle subscription with no owner cannot seat anyone, but it is still OURS: falling through to
  // the member path would flip some unrelated profile's tier off a bundle payment.
  if (!ownerId || !UUID.test(ownerId)) {
    console.error('[bundle-seats] bundle subscription with no usable owner_id:', sub.id)
    return { handled: true, applied: false, reason: 'no_owner_id' }
  }

  const action = bundleSeatingAction(sub.status)
  // incomplete / paused: no confirmed entitlement change. Leave the seats exactly as they are, and do
  // NOT advance the ordering stamp (that would make the real event that follows look stale).
  if (action === 'skip') return { handled: true, applied: false, reason: 'skipped' }

  const stamped = bundleTermsFromMetadata(sub.metadata)
  let seats = stamped.seats
  let tier = stamped.tier
  if (seats === null || tier === null) {
    // Pre-stamp bundle (or a hand-made subscription): fall back to the live operator config, then to
    // the seeded default. getHouseholdBundle is already FAIL-SAFE to that default.
    const config = await getHouseholdBundle().catch(() => HOUSEHOLD_BUNDLE_DEFAULT)
    seats = seats ?? config.seats
    tier = tier ?? config.tier
  }

  const roster = bundleRoster(ownerId, bundleSeatIdsFromMetadata(sub.metadata), seats)
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null

  const rpc = createAdminClient().rpc as unknown as BundleSeatingRpc
  const { data, error } = await rpc('apply_bundle_seating_atomic', {
    _owner: ownerId,
    _event_at: new Date(eventCreated * 1000).toISOString(),
    // The owner leads the roster and is seated by the RPC itself, so only the OTHER seats travel here.
    _seat_ids: roster.slice(1),
    _tier: tier,
    _seats: seats,
    _active: action === 'seat',
    _customer_id: customerId,
  })
  if (error) throw new Error(`bundle seating (owner=${ownerId}) failed: ${error.message}`)

  return {
    handled: true,
    applied: data?.applied === true,
    reason: data?.reason,
    seated: data?.seated,
    unseated: data?.unseated,
  }
}
