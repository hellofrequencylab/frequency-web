import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pricing P2 (ADR-363) — the PURE webhook-routing logic (no IO / no Stripe / no Supabase): how a
// subscription's metadata.kind + Stripe status map to a payment_status and a Space plan. Plus an IO test
// for reconcileSpaceMembershipSubscription's insert-if-absent path (the paid-membership money fix), over
// a recording mock of the admin client.

// A minimal recording mock: `activeRows` seeds the select() result (the member's current active row, or
// none); `ops` records every update/insert so a test can assert what was written.
const { state } = vi.hoisted(() => ({
  state: { activeRows: [] as { id: string }[], ops: [] as Array<Record<string, unknown>> },
}))
vi.mock('@/lib/supabase/admin', () => {
  const makeSelect = () => {
    const chain: Record<string, unknown> = {}
    chain.eq = () => chain
    chain.limit = () => Promise.resolve({ data: state.activeRows })
    return chain
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => makeSelect(),
        update: (v: Record<string, unknown>) => {
          state.ops.push({ op: 'update', table, v })
          return { eq: () => Promise.resolve({ error: null }) }
        },
        insert: (rows: Record<string, unknown>[]) => {
          state.ops.push({ op: 'insert', table, rows })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }
})

import {
  paymentStatusForSubscription,
  subscriptionKind,
  planForSubscription,
  reconcileSpaceMembershipSubscription,
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
  it('an active sub sets the metadata tier (narrowed through asSpacePlan · ADR-552)', () => {
    expect(planForSubscription('business', 'active')).toBe('business')
    expect(planForSubscription('nonprofit', 'trialing')).toBe('nonprofit')
    // Retired legacy labels narrow forward: pro/practitioner/whitelabel -> business; organization -> nonprofit.
    expect(planForSubscription('pro', 'active')).toBe('business')
    expect(planForSubscription('practitioner', 'trialing')).toBe('business')
    expect(planForSubscription('whitelabel', 'active')).toBe('business')
    expect(planForSubscription('organization', 'active')).toBe('nonprofit')
  })

  it('a past-due sub keeps the tier (still entitled until canceled)', () => {
    expect(planForSubscription('business', 'past_due')).toBe('business')
    expect(planForSubscription('nonprofit', 'past_due')).toBe('nonprofit')
  })

  it('a canceled / incomplete sub reverts to free', () => {
    expect(planForSubscription('business', 'canceled')).toBe('free')
    expect(planForSubscription('business', 'incomplete')).toBe('free')
    expect(planForSubscription('business', null)).toBe('free')
  })

  it('an unknown plan label narrows to free (default-deny)', () => {
    expect(planForSubscription('nonsense', 'active')).toBe('free')
    expect(planForSubscription(null, 'active')).toBe('free')
  })
})

// ── IO: reconcileSpaceMembershipSubscription records a PAID membership (ADR-363 money fix) ─────────────
// createSpaceMembershipCheckout does not pre-create a space_memberships row, so before this fix the
// reconcile's UPDATE matched zero rows and a paying member got nothing. The reconcile now inserts on the
// first-payment case and updates an existing active row otherwise.
function membershipSub(status: string, meta: Record<string, string>) {
  return { id: 'sub_1', status, metadata: meta } as unknown as import('stripe').Stripe.Subscription
}

describe('reconcileSpaceMembershipSubscription (records a paid membership)', () => {
  beforeEach(() => {
    state.activeRows = []
    state.ops = []
  })

  it('INSERTS the membership on first payment when none exists yet', async () => {
    state.activeRows = []
    await reconcileSpaceMembershipSubscription(membershipSub('active', { space_id: 's1', member_id: 'm1', tier_id: 't1' }))
    const ins = state.ops.find((o) => o.op === 'insert') as { rows: Record<string, unknown>[] } | undefined
    expect(ins, 'should insert a membership row on first payment').toBeTruthy()
    expect(ins!.rows[0]).toMatchObject({
      space_id: 's1',
      member_profile_id: 'm1',
      tier_id: 't1',
      status: 'active',
      payment_status: 'active',
      stripe_subscription_id: 'sub_1',
    })
    expect(state.ops.find((o) => o.op === 'update')).toBeFalsy()
  })

  it('UPDATES the existing active membership instead of inserting', async () => {
    state.activeRows = [{ id: 'mem1' }]
    await reconcileSpaceMembershipSubscription(membershipSub('past_due', { space_id: 's1', member_id: 'm1', tier_id: 't1' }))
    const upd = state.ops.find((o) => o.op === 'update') as { v: Record<string, unknown> } | undefined
    expect(upd).toBeTruthy()
    expect(upd!.v).toMatchObject({ payment_status: 'past_due', status: 'active', stripe_subscription_id: 'sub_1' })
    expect(state.ops.find((o) => o.op === 'insert')).toBeFalsy()
  })

  it('does NOT create a membership from a cancel event for a member who never had one', async () => {
    state.activeRows = []
    await reconcileSpaceMembershipSubscription(membershipSub('canceled', { space_id: 's1', member_id: 'm1', tier_id: 't1' }))
    expect(state.ops.length).toBe(0)
  })

  it('cancels the existing active membership on a canceled event', async () => {
    state.activeRows = [{ id: 'mem1' }]
    await reconcileSpaceMembershipSubscription(membershipSub('canceled', { space_id: 's1', member_id: 'm1', tier_id: 't1' }))
    const upd = state.ops.find((o) => o.op === 'update') as { v: Record<string, unknown> } | undefined
    expect(upd!.v).toMatchObject({ status: 'cancelled', payment_status: 'canceled' })
  })

  it('no-ops on missing space_id / member_id metadata', async () => {
    await reconcileSpaceMembershipSubscription(membershipSub('active', {}))
    expect(state.ops.length).toBe(0)
  })
})
