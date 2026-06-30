import { describe, it, expect } from 'vitest'

// Pricing P2 (ADR-363) — the PURE webhook-routing logic (no IO / no Stripe / no Supabase): how a
// subscription's metadata.kind + Stripe status map to a payment_status and a Space plan. The IO
// reconcilers (reconcileSpacePlanSubscription / reconcileSpaceMembershipSubscription) write through
// the admin client and are exercised behind the signed webhook.

import {
  paymentStatusForSubscription,
  subscriptionKind,
  planForSubscription,
} from './space-subscriptions'

describe('paymentStatusForSubscription', () => {
  it('active/trialing → active', () => {
    expect(paymentStatusForSubscription('active')).toBe('active')
    expect(paymentStatusForSubscription('trialing')).toBe('active')
  })

  it('past_due/unpaid → past_due', () => {
    expect(paymentStatusForSubscription('past_due')).toBe('past_due')
    expect(paymentStatusForSubscription('unpaid')).toBe('past_due')
  })

  it('canceled/incomplete_expired → canceled', () => {
    expect(paymentStatusForSubscription('canceled')).toBe('canceled')
    expect(paymentStatusForSubscription('incomplete_expired')).toBe('canceled')
  })

  it('anything else (incomplete / null / unknown) → pending', () => {
    expect(paymentStatusForSubscription('incomplete')).toBe('pending')
    expect(paymentStatusForSubscription(null)).toBe('pending')
    expect(paymentStatusForSubscription(undefined)).toBe('pending')
    expect(paymentStatusForSubscription('nonsense')).toBe('pending')
  })
})

describe('subscriptionKind', () => {
  it('narrows to the two known Space kinds, else null', () => {
    expect(subscriptionKind({ kind: 'space_plan' })).toBe('space_plan')
    expect(subscriptionKind({ kind: 'space_membership' })).toBe('space_membership')
    // the member Crew/Supporter checkout has NO kind → null (left to the member path)
    expect(subscriptionKind({ profile_id: 'p1', tier: 'crew' })).toBeNull()
    expect(subscriptionKind({ kind: 'tip' })).toBeNull()
    expect(subscriptionKind(null)).toBeNull()
    expect(subscriptionKind(undefined)).toBeNull()
  })
})

describe('planForSubscription', () => {
  it('an active sub sets the metadata tier (narrowed through asSpacePlan · ADR-472)', () => {
    expect(planForSubscription('pro', 'active')).toBe('pro')
    expect(planForSubscription('nonprofit', 'trialing')).toBe('nonprofit')
    // 'business' is a first-class tier now (passes through unchanged).
    expect(planForSubscription('business', 'active')).toBe('business')
    // Retired legacy labels narrow forward: practitioner -> pro; whitelabel -> business.
    expect(planForSubscription('practitioner', 'trialing')).toBe('pro')
    expect(planForSubscription('whitelabel', 'active')).toBe('business')
  })

  it('a past-due sub keeps the tier (still entitled until canceled)', () => {
    expect(planForSubscription('pro', 'past_due')).toBe('pro')
    expect(planForSubscription('business', 'past_due')).toBe('business')
  })

  it('a canceled / incomplete sub reverts to free', () => {
    expect(planForSubscription('pro', 'canceled')).toBe('free')
    expect(planForSubscription('pro', 'incomplete')).toBe('free')
    expect(planForSubscription('pro', null)).toBe('free')
  })

  it('an unknown plan label narrows to free (default-deny)', () => {
    expect(planForSubscription('nonsense', 'active')).toBe('free')
    expect(planForSubscription(null, 'active')).toBe('free')
  })
})
