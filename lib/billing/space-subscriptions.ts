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
} from './space-subscription-items'

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
  } else {
    // Fallback: a canceled sub, or a legacy single-price sub with no recognized catalog items. Use the
    // metadata.plan (canceled -> free) via the base-plan writer, and cancel any persisted item rows.
    const plan = planForSubscription(sub.metadata?.plan, status)
    await setSpacePlan(spaceId, plan)
    await persistSpaceSubscriptionItems(spaceId, [], 'canceled')
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
  if (!spaceId || !memberId) return
  const payment = paymentStatusForSubscription(sub.status)

  const db = createAdminClient()
  // Bind the write to (space_id, member_profile_id) — the active membership row this checkout created.
  await (db as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: string) => { eq: (c2: string, val2: string) => Promise<{ error: unknown }> }
      }
    }
  })
    .from('space_memberships')
    .update({
      stripe_subscription_id: sub.id,
      payment_status: payment,
      // Keep status symmetric with payment_status: a reactivated member must flip back to
      // 'active' (not stay 'cancelled'), or memberships gated on .eq('status','active')
      // would keep excluding a paying member.
      status: payment === 'canceled' ? 'cancelled' : 'active',
    })
    .eq('space_id', spaceId)
    .eq('member_profile_id', memberId)
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
