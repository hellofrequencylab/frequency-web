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
// The member Crew/Supporter path stays in app/api/webhooks/stripe/route.ts UNTOUCHED. All writes are
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
import { setSpaceSeatQuantity } from '@/lib/spaces/seats'

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

  if (items.length > 0) {
    // Multi-item Phase B path: the live items ARE the plan. Set-to-target the billing namespace from
    // the base plan + active add-on set the items imply.
    const itemKeys = items.map((i) => i.itemKey)
    const plan = planForItemKeys(itemKeys)
    const addons = addonsForItemKeys(itemKeys)
    await setSpaceAddons(spaceId, { plan, addons })
    await persistSpaceSubscriptionItems(spaceId, items, itemStatusForSubscription(status))
    // Persist the LICENSED operator-seat count onto spaces.seat_quantity, the column the seat wall reads
    // (seats.ts licensedSeats / checkSeatForOperatorInvite). It was previously NEVER written — the
    // purchased quantity only landed in space_subscription_items — so a Space that bought N seats kept
    // seat_quantity=0 and could not use any of them once billing goes live. Set-to-target from the items.
    await setSpaceSeatQuantity(spaceId, seatQuantityFromItems(items))
  } else {
    // Fallback: a canceled sub, or a legacy single-price sub with no recognized catalog items. Use the
    // metadata.plan (canceled -> free) via the base-plan writer, and cancel any persisted item rows.
    const plan = planForSubscription(sub.metadata?.plan, status)
    await setSpacePlan(spaceId, plan)
    await persistSpaceSubscriptionItems(spaceId, [], 'canceled')
    // No live seat items (canceled, or a legacy seat-less sub) -> clear the licensed seats to the base.
    await setSpaceSeatQuantity(spaceId, 0)
  }

  // Persist the subscription identifiers (audit/reference); a canceled sub clears the id. The columns
  // aren't in the generated types yet (ADR-246) — reach untyped, scope the write to the space id.
  const db = createAdminClient()
  await (db as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  })
    .from('spaces')
    .update({
      stripe_subscription_id: isCanceled ? null : sub.id,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq('id', spaceId)
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
            eq: (c: string, v: string) => { limit: (n: number) => Promise<{ data: { id: string }[] | null }> }
          }
        }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: WriteError }> }
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: WriteError }>
    }
  }

  // Find the member's CURRENT active membership in this Space (the partial one-active index means there is
  // at most one). Scope to status='active' + limit(1) so a cancelled-history row can never make this throw.
  const { data: activeRows } = await db
    .from('space_memberships')
    .select('id')
    .eq('space_id', spaceId)
    .eq('member_profile_id', memberId)
    .eq('status', 'active')
    .limit(1)
  const activeId = activeRows?.[0]?.id ?? null

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
}

/** The shape of a supabase-js write error (subset). */
type WriteError = { code?: string; message?: string } | null
function writeErrorMessage(error: WriteError): string {
  return error?.message ?? String(error)
}

/** Route a subscription event to the right reconciler by its kind. Returns true if handled (so the
 *  caller knows the member Crew/Supporter path should be skipped). No-ops for an unknown kind. */
export async function routeSpaceSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const kind = subscriptionKind(sub.metadata)
  if (kind === 'space_plan') {
    await reconcileSpacePlanSubscription(sub)
    return true
  }
  if (kind === 'space_membership') {
    await reconcileSpaceMembershipSubscription(sub)
    return true
  }
  return false
}
