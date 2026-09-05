// SPACE SUBSCRIPTION RECONCILIATION (Pricing P2 ADR-363; Phase B multi-item ADR-460). The webhook
// entry points that route a Stripe subscription event by its `metadata.kind` to the right Space write:
//
//   kind:'space_plan'        → read ALL of the subscription's items, map each item_key to the base plan
//                              + active add-on set, and setSpaceAddons (set-to-target the billing
//                              namespace, ADR-460); persist each item row (locked_price_id, interval,
//                              quantity) into space_subscription_items + spaces.stripe_subscription_id /
//                              stripe_customer_id. A canceled sub targets the empty set (revert to free).
//                              A legacy single-price sub falls back to setSpacePlan(metadata.plan). There
//                              is no spaces.payment_status column: the space's plan is the payment
//                              state-of-record.
//   kind:'space_membership'  → upsert space_memberships.stripe_subscription_id + payment_status + status.
//
// The member Crew path stays in app/api/webhooks/stripe/route.ts UNTOUCHED. All writes are
// idempotent (the webhook claims the event id first; these set fixed values keyed by id) and FAIL-SAFE
// (a missing space/tier no-ops). Server-only.
//
// The PURE routing decisions (which kind, which payment_status, which plan) live in the helpers below
// so they're unit-testable without Stripe; the IO wrappers apply them.

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { setSpaceAddons, setSpacePlan } from '@/lib/pricing/space-plan'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'
import {
  reconciledItemsFromSubscription,
  planForItemKeys,
  addonsForItemKeys,
  persistSpaceSubscriptionItems,
  seatQuantityFromItems,
} from './space-subscription-items'
import { grantBetaFounding } from './beta-founding'
import { foundingPaymentSignal } from './founding-payment'
import { lapseFoundingStatus } from '@/lib/founding/status'
import { setSpaceSeatQuantity } from '@/lib/spaces/seats'
import { syncTierCircleAccess } from '@/lib/spaces/tier-circle'

/** The metadata kinds the space subscription webhook handles. */
export type SubscriptionKind = 'space_plan' | 'space_membership'

/** The reconciled payment_status (space_memberships.payment_status / a space plan's status) for a
 *  Stripe subscription status. PURE. active/trialing → 'active'; past_due/unpaid → 'past_due';
 *  canceled/incomplete_expired → 'canceled'; anything else (incomplete) → 'pending'. */
export function paymentStatusForSubscription(
  status: Stripe.Subscription.Status | string | null | undefined,
): 'pending' | 'active' | 'past_due' | 'canceled' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'pending'
  }
}

/** Read the kind from a subscription's (or session's) metadata, narrowed to a known kind or null. PURE. */
export function subscriptionKind(metadata: Stripe.Metadata | null | undefined): SubscriptionKind | null {
  const k = metadata?.kind
  return k === 'space_plan' || k === 'space_membership' ? k : null
}

/** The plan to set for a `space_plan` subscription given its Stripe status. PURE. An active/trialing
 *  sub sets the metadata plan; a canceled/past-due-to-canceled sub reverts the space to 'free'. */
export function planForSubscription(
  metadataPlan: string | null | undefined,
  status: Stripe.Subscription.Status | string | null | undefined,
): SpacePlan {
  const payment = paymentStatusForSubscription(status)
  if (payment === 'active' || payment === 'past_due') return asSpacePlan(metadataPlan)
  return 'free' // canceled / pending → no paid plan
}

/** The reconciled per-item status for a space_subscription_items row, from the Stripe subscription
 *  status. PURE. active/trialing keep their own labels (a trial is recorded as 'trialing' so the
 *  surface can show the trial); past_due/unpaid -> past_due; canceled/expired -> canceled; else
 *  pending. */
export function itemStatusForSubscription(
  status: Stripe.Subscription.Status | string | null | undefined,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending' {
  if (status === 'trialing') return 'trialing'
  const payment = paymentStatusForSubscription(status)
  return payment
}

/** Reconcile a `space_plan` subscription event the MULTI-ITEM way (Phase B, ADR-460). Read ALL of the
 *  subscription's items, map each item_key -> the base plan + active add-on set, and SET-TO-TARGET the
 *  Space's billing-managed entitlement namespace via the gated setSpaceAddons. Persist each item row
 *  (incl. the grandfathered locked_price_id, interval, quantity) into space_subscription_items, and
 *  persist the subscription/customer ids on the Space.
 *
 *  Backward-compatible: a LEGACY single-price space_plan sub (no recognized catalog items) falls back
 *  to the metadata.plan path (planForSubscription + setSpacePlan), so a grandfathered Phase A
 *  subscription still reconciles. No-ops on a missing space_id. Idempotent (writes fixed values keyed
 *  by id + set-to-target). authz-delegated: a Stripe-signed webhook event drives this; the write is
 *  bound to the space_id stamped in the subscription metadata at the gated checkout. */
export async function reconcileSpacePlanSubscription(sub: Stripe.Subscription): Promise<void> {
  const spaceId = sub.metadata?.space_id
  if (!spaceId) return
  const status = sub.status
  const isCanceled = paymentStatusForSubscription(status) === 'canceled'
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null

  // Read the live item set. A canceled subscription targets the empty set (every item removed -> the
  // space reverts to free + the billing namespace clears); otherwise map the present items to the plan.
  const items = isCanceled ? [] : reconciledItemsFromSubscription(sub)

  // The plan this reconcile settles on, for the founding hook at the bottom. Deliberately left
  // UNINITIALIZED: both branches below assign it, so a placeholder would be dead (CodeQL) and would
  // quietly become the value if a future branch forgot to. Definite assignment is the guard.
  let settledPlan: SpacePlan

  if (items.length > 0) {
    // Multi-item Phase B path: the live items ARE the plan. Set-to-target the billing namespace from
    // the base plan + active add-on set the items imply.
    const itemKeys = items.map((i) => i.itemKey)
    const plan = planForItemKeys(itemKeys)
    settledPlan = plan
    const addons = addonsForItemKeys(itemKeys)
    await setSpaceAddons(spaceId, { plan, addons })
    await persistSpaceSubscriptionItems(spaceId, items, itemStatusForSubscription(status))
    // Persist the LICENSED operator-seat count onto spaces.seat_quantity from the real per-seat
    // `operator_seat` item's quantity (ADR-799). Only that item counts — the flat plan items must not be
    // read as seats (the reverted ADR-465 bug). The seat wall (seats.ts) reads this column.
    await setSpaceSeatQuantity(spaceId, seatQuantityFromItems(items))
  } else {
    // Fallback: a canceled sub, or a legacy single-price sub with no recognized catalog items. Use the
    // metadata.plan (canceled -> free) via the base-plan writer, and cancel any persisted item rows.
    const plan = planForSubscription(sub.metadata?.plan, status)
    settledPlan = plan
    await setSpacePlan(spaceId, plan)
    await persistSpaceSubscriptionItems(spaceId, [], 'canceled')
    // No live plan (canceled / legacy) -> no purchased operator seats; clear to the base owner seat.
    await setSpaceSeatQuantity(spaceId, 0)
  }

  // Persist the subscription identifiers (audit/reference); a canceled sub clears the id. The columns
  // aren't in the generated types yet (ADR-246) — reach untyped, scope the write to the space id.
  // The PREVIOUS id is read first: it is the evidence that decides whether a cancel may lapse a
  // founder (see below), and this update is about to overwrite it.
  const db = createAdminClient()
  const spaceWriter = db as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, val: string) => { maybeSingle: () => Promise<{ data: { stripe_subscription_id?: string | null } | null }> }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { data: priorSpace } = await spaceWriter
    .from('spaces')
    .select('stripe_subscription_id')
    .eq('id', spaceId)
    .maybeSingle()
  const priorSubscriptionId = priorSpace?.stripe_subscription_id ?? null

  await spaceWriter
    .from('spaces')
    .update({
      stripe_subscription_id: isCanceled ? null : sub.id,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq('id', spaceId)

  // BETA FOUNDER PUSH (ADR-875, tightened by ADR-880). A Space becomes a Founding Business only when
  // ALL THREE hold: money MOVED, it bought the YEAR, and it happened before memberships start. Granted
  // HERE (the reconciliation point, the same truth the plan itself is written from) rather than on the
  // checkout success page a browser may never load.
  //
  // WHAT CHANGED: the old test was `settledPlan !== 'free'`, i.e. "a subscription exists". A 14-day
  // trial, a past_due card, an `incomplete` sub, and a 100%-off promo code all passed it and minted a
  // permanent, publicly visible founder with a lifetime locked rate. foundingPaymentSignal is the money
  // test (pure, unit-tested); the cutoff still reads `sub.created`, fixed at purchase, so every renewal
  // event re-decides identically and the grant stays idempotent. Never throws.
  //
  // The LOCKED RATE comes from the item whose price is the settled BASE plan (never items.data[0]: a
  // loadout carries the AI add-on and seat lines too, in no guaranteed order) and is normalized to a
  // MONTHLY figure, which is what the column documents even for a yearly purchase.
  const payment = foundingPaymentSignal(sub)
  if (settledPlan !== 'free' && payment.earnsFounding) {
    await grantBetaFounding({
      kind: 'business',
      spaceId,
      atMs: sub.created * 1000,
      lockedRateCents: payment.monthlyRateCents,
    })
  }

  // THE OTHER HALF OF THE LIFECYCLE (ADR-880). "The rate holds as long as the subscription is
  // maintained" only means something if stopping ends it. A subscription reconciling to canceled (or
  // Stripe-terminal `unpaid`) lapses the Space's founding row.
  //
  // GUARDED on the Space actually being ON this subscription: a founding row recorded by hand for a
  // cash-paying Space has NO Stripe subscription behind it, and must never be lapsed by an unrelated
  // subscription event. `priorSubscriptionId === sub.id` is that evidence.
  const lapses = status === 'canceled' || status === 'incomplete_expired' || status === 'unpaid'
  if (lapses && priorSubscriptionId === sub.id) {
    await lapseFoundingStatus({ spaceId })
  }
}

/** Reconcile a `space_membership` subscription event: upsert the membership's subscription id +
 *  payment_status onto the member's row in this space. No-ops on missing ids. Idempotent.
 *  authz-delegated: a Stripe-signed webhook event drives this; the write is bound to the
 *  (space_id, member_id) stamped in the subscription metadata at the gated checkout. */
export async function reconcileSpaceMembershipSubscription(sub: Stripe.Subscription): Promise<void> {
  const spaceId = sub.metadata?.space_id
  const memberId = sub.metadata?.member_id
  const tierId = sub.metadata?.tier_id
  if (!spaceId || !memberId) return
  const payment = paymentStatusForSubscription(sub.status)
  // status column is CHECK-constrained to active/cancelled; payment_status carries the finer Stripe state.
  const status: 'active' | 'cancelled' = payment === 'canceled' ? 'cancelled' : 'active'

  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              limit: (n: number) => Promise<{ data: { id: string; tier_id?: string | null }[] | null }>
            }
          }
        }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: WriteError }> }
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: WriteError }>
    }
  }

  // Find the member's CURRENT active membership in this Space (the partial one-active index means there is
  // at most one). Scope to status='active' + limit(1) so a cancelled-history row can never make this throw.
  // tier_id rides along so a metadata tier that DIFFERS from the row is recognized as a TIER SWITCH below.
  const { data: activeRows } = await db
    .from('space_memberships')
    .select('id, tier_id')
    .eq('space_id', spaceId)
    .eq('member_profile_id', memberId)
    .eq('status', 'active')
    .limit(1)
  const activeId = activeRows?.[0]?.id ?? null
  const previousTierId = activeRows?.[0]?.tier_id ?? null

  if (activeId) {
    // Update the existing active membership: payment-state change, reactivation, or a cancel (status flips
    // to 'cancelled', releasing the one-active guard so a later re-subscribe can re-create it).
    const { error } = await db
      .from('space_memberships')
      .update({
        stripe_subscription_id: sub.id,
        payment_status: payment,
        status,
        ...(tierId ? { tier_id: tierId } : {}),
      })
      .eq('id', activeId)
    // A failed write must NOT ack the webhook 200 — throw so the route releases its event claim and Stripe
    // retries (the member-tier path's contract). A silent swallow would lose a paid member's state forever.
    if (error) throw new Error(`space_membership update failed: ${writeErrorMessage(error)}`)
    // TIER→CIRCLE ACCESS (ADR-859), after the membership write stands. Contractually non-throwing
    // (fail-soft inside), so a circle hiccup can never make the webhook retry a settled payment.
    // A cancelled transition revokes; anything still 'active' (incl. past_due — deliberately kept a
    // member) grants, with the overwritten tier_id treated as a switch (revoke old + grant new).
    const effectiveTierId = tierId ?? previousTierId
    if (effectiveTierId) {
      await syncTierCircleAccess({
        spaceId,
        profileId: memberId,
        tierId: effectiveTierId,
        previousTierId:
          previousTierId && previousTierId !== effectiveTierId ? previousTierId : undefined,
        action: status === 'cancelled' ? 'revoke' : 'grant',
      })
      // A cancel must also clear a grant left under the PREVIOUS tier when the final event switched
      // tiers at the same time (rare, but a revoke keyed only to the new tier would strand it).
      if (status === 'cancelled' && previousTierId && previousTierId !== effectiveTierId) {
        await syncTierCircleAccess({
          spaceId,
          profileId: memberId,
          tierId: previousTierId,
          action: 'revoke',
        })
      }
    }
    return
  }

  // No active membership yet: this is the FIRST-PAYMENT case. createSpaceMembershipCheckout does NOT
  // pre-create a row (unlike the free joinTier path), so before this the UPDATE matched zero rows and a
  // paying member got nothing recorded. INSERT the membership now, keyed by the Stripe-signed metadata.
  // Only on a CONFIRMED-active payment: an `incomplete`/`past_due`/`canceled` first state must NOT grant an
  // active membership before payment settles (every consumer gates on status='active' and ignores
  // payment_status). A subscription that later becomes active fires an `.updated` event that re-runs this
  // and inserts then, so skipping loses nothing. Also skip if the tier is unknown.
  if (payment !== 'active' || !tierId) return
  const { error } = await db.from('space_memberships').insert([
    {
      space_id: spaceId,
      member_profile_id: memberId,
      tier_id: tierId,
      status: 'active',
      payment_status: payment,
      stripe_subscription_id: sub.id,
    },
  ])
  // Swallow ONLY the benign unique-violation (23505): the `.created` and `.updated` events are different
  // event ids, so both run this; the partial one-active index serializes the two inserts and the loser's
  // 23505 simply means the membership already exists (success). Surface any OTHER error by throwing, so the
  // webhook retries instead of silently dropping a paid membership.
  if (error && error.code !== '23505') {
    throw new Error(`space_membership insert failed: ${writeErrorMessage(error)}`)
  }
  // TIER→CIRCLE ACCESS (ADR-859): the first payment just created the membership (or the 23505 race
  // confirmed it exists) — grant the tier's linked circle. Non-throwing by contract; a full circle
  // or write hiccup is logged, never bounced back into the webhook as a retry.
  await syncTierCircleAccess({ spaceId, profileId: memberId, tierId, action: 'grant' })
}

/** The shape of a supabase-js write error (subset). */
type WriteError = { code?: string; message?: string } | null
function writeErrorMessage(error: WriteError): string {
  return error?.message ?? String(error)
}

/** EVENT-ORDERING GUARD (meta-scan 2026-07-25, mirrors the member path's
 *  apply_membership_event_atomic): claim the event's `created` against the space's watermark
 *  (spaces.last_plan_event_at) in ONE conditional UPDATE. Returns false for a STALE event (an older
 *  event delivered after a newer one already applied), which the caller must skip — otherwise the
 *  set-to-target reconcile would revert plan/add-ons/seats to stale values. FAIL-OPEN on any RPC
 *  error (e.g. the migration not applied yet): proceeding is exactly today's unguarded behavior.
 *
 *  2026-09-05 correction (scan2 L6-02): the sentence "returns false" above is now a three-way result.
 *  The claim used to be a bare boolean, and the watermark it stamped could never be un-stamped: if the
 *  reconcile that FOLLOWED the claim threw, the webhook returned 500, Stripe retried the SAME event
 *  with the SAME `created`, and the RPC's strictly-newer test read that retry as stale — the plan
 *  change was dropped forever while Stripe showed it applied. The claim now also carries the
 *  watermark it replaced (`previous`), read just before the RPC, so the router can roll the stamp back
 *  (releaseSpacePlanEvent) when the reconcile fails and the retry claims cleanly. */
type SpacePlanClaim =
  | { kind: 'claimed'; eventIso: string; previousIso: string | null }
  | { kind: 'stale' }
  | { kind: 'unguarded' } // RPC unavailable / errored: fail-open, nothing was stamped, nothing to roll back

type SpacesWatermarkClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  from: (table: 'spaces') => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { last_plan_event_at: string | null } | null }> }
    }
    update: (v: { last_plan_event_at: string | null }) => {
      eq: (col: string, v: string) => { eq: (col: string, v: string) => Promise<{ error: unknown }> }
    }
  }
}

async function claimSpacePlanEvent(spaceId: string, eventCreatedSec: number): Promise<SpacePlanClaim> {
  const eventIso = new Date(eventCreatedSec * 1000).toISOString()
  try {
    const db = createAdminClient() as unknown as SpacesWatermarkClient
    // The watermark this claim will replace. Read BEFORE the RPC (the RPC returns only a boolean), so a
    // failed reconcile can restore it. A read hiccup leaves it unknown (null): the rollback then clears
    // the watermark rather than leaving it advanced — a cleared mark re-admits a late OLDER event once
    // (rare, and only after a reconcile already failed), an advanced mark drops Stripe's retry forever.
    let previousIso: string | null = null
    try {
      const { data } = await db.from('spaces').select('last_plan_event_at').eq('id', spaceId).maybeSingle()
      previousIso = data?.last_plan_event_at ? new Date(data.last_plan_event_at).toISOString() : null
    } catch (err) {
      console.warn('[space-subscriptions] last_plan_event_at read failed before claim (rollback would clear it):', err)
    }
    const { data, error } = await db.rpc('claim_space_plan_event', {
      _space_id: spaceId,
      _event_created: eventIso,
    })
    if (error) return { kind: 'unguarded' } // fail-open: guard unavailable -> today's behavior
    return data === true ? { kind: 'claimed', eventIso, previousIso } : { kind: 'stale' }
  } catch {
    return { kind: 'unguarded' }
  }
}

/** Roll a claimed watermark back after the reconcile it guarded threw (scan2 L6-02, 2026-09-05), so
 *  Stripe's retry of the SAME event (same `created`) claims again instead of reading as stale.
 *  CONDITIONAL on the mark still being ours (`last_plan_event_at = eventIso`): if a NEWER event claimed
 *  in between, its mark stands and this is a no-op — that newer event's reconcile owns the state now,
 *  and the retry of this one is then genuinely stale. Best-effort; a failure here is logged loudly
 *  because it recreates the dropped-retry defect for this one event. */
async function releaseSpacePlanEvent(spaceId: string, eventIso: string, previousIso: string | null): Promise<void> {
  try {
    const db = createAdminClient() as unknown as SpacesWatermarkClient
    const { error } = await db
      .from('spaces')
      .update({ last_plan_event_at: previousIso })
      .eq('id', spaceId)
      .eq('last_plan_event_at', eventIso)
    if (error) throw error
  } catch (err) {
    console.error(
      `[space-subscriptions] could not roll back last_plan_event_at for space ${spaceId} (event ${eventIso}); Stripe's retry of this event will be skipped as stale:`,
      err,
    )
  }
}

/** Route a subscription event to the right reconciler by its kind. Returns true if handled (so the
 *  caller knows the member Crew path should be skipped). No-ops for an unknown kind.
 *  `eventCreatedSec` (Stripe event.created, unix seconds) drives the space_plan ordering guard: a
 *  stale event is claimed-and-skipped but still reported handled (it IS a space event; the member
 *  path must not run). space_membership events are per-member and deliberately not gated on the
 *  per-space watermark. */
export async function routeSpaceSubscription(sub: Stripe.Subscription, eventCreatedSec?: number): Promise<boolean> {
  const kind = subscriptionKind(sub.metadata)
  if (kind === 'space_plan') {
    const spaceId = sub.metadata?.space_id
    const claim: SpacePlanClaim =
      spaceId && typeof eventCreatedSec === 'number'
        ? await claimSpacePlanEvent(spaceId, eventCreatedSec)
        : { kind: 'unguarded' }
    if (claim.kind === 'stale') {
      return true // stale event: skip the reconcile, keep the newer applied state
    }
    try {
      await reconcileSpacePlanSubscription(sub)
    } catch (err) {
      // scan2 L6-02 (2026-09-05): the claim advanced the watermark BEFORE the reconcile; without this
      // rollback the 500 → Stripe retry (same `created`) would be claimed-as-stale and acked, dropping
      // the plan change for good. Restore the mark, then rethrow so the webhook still 500s and retries.
      if (claim.kind === 'claimed' && spaceId) await releaseSpacePlanEvent(spaceId, claim.eventIso, claim.previousIso)
      throw err
    }
    return true
  }
  if (kind === 'space_membership') {
    await reconcileSpaceMembershipSubscription(sub)
    return true
  }
  return false
}
