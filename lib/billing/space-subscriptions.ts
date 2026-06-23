// SPACE SUBSCRIPTION RECONCILIATION (Pricing P2, ADR-363). The webhook entry points that route a
// Stripe subscription event by its `metadata.kind` to the right Space entitlement write:
//
//   kind:'space_plan'        → setSpacePlan(space_id, plan|free) + persist spaces.stripe_subscription_id
//                              / stripe_customer_id + payment_status (active|past_due|canceled).
//   kind:'space_membership'  → upsert space_memberships.stripe_subscription_id + payment_status.
//
// The member Crew/Supporter path stays in app/api/stripe/webhook/route.ts UNTOUCHED. All writes are
// idempotent (the webhook claims the event id first; these set fixed values keyed by id) and FAIL-SAFE
// (a missing space/tier no-ops). Server-only.
//
// The PURE routing decisions (which kind, which payment_status, which plan) live in the helpers below
// so they're unit-testable without Stripe; the IO wrappers apply them.

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { setSpacePlan } from '@/lib/pricing/space-plan'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'

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

/** Reconcile a `space_plan` subscription event: set the Space's plan (active → the plan, canceled →
 *  free) via the gated setSpacePlan, and persist the subscription/customer ids + payment_status.
 *  No-ops on a missing space_id. Idempotent (writes fixed values keyed by id).
 *  authz-delegated: a Stripe-signed webhook event drives this; the write is bound to the space_id
 *  stamped in the subscription metadata at the gated checkout. */
export async function reconcileSpacePlanSubscription(sub: Stripe.Subscription): Promise<void> {
  const spaceId = sub.metadata?.space_id
  if (!spaceId) return
  const status = sub.status
  const plan = planForSubscription(sub.metadata?.plan, status)
  const payment = paymentStatusForSubscription(status)
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null

  // Expand/contract entitlements via the gated writer (a no-op if billing somehow went OFF mid-flight).
  await setSpacePlan(spaceId, plan)

  // Persist the subscription identifiers + payment status regardless (audit/reference). The columns
  // aren't in the generated types yet (ADR-246) — reach untyped, scope the write to the space id.
  const db = createAdminClient()
  await (db as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  })
    .from('spaces')
    .update({
      stripe_subscription_id: payment === 'canceled' ? null : sub.id,
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
      ...(payment === 'canceled' ? { status: 'cancelled' } : {}),
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
