import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// scan2 L6-02 (2026-09-05): routeSpaceSubscription claims the Stripe event's `created` into
// spaces.last_plan_event_at BEFORE it reconciles. If the reconcile throws, the webhook 500s and Stripe
// retries the SAME event with the SAME `created`; the claim RPC only accepts a STRICTLY newer mark, so
// without a rollback the retry reads as stale and is acked without ever applying the plan change. These
// tests drive the router over an in-memory space row whose `rpc('claim_space_plan_event')` reproduces the
// migration's strictly-newer conditional update, and make the reconcile throw on demand.

let failReconcileOnce = false
let onFail: (() => void) | null = null // runs INSIDE the failing reconcile (to plant a concurrent mark)
let planCalls: { spaceId: string; plan: string }[] = []

vi.mock('@/lib/pricing/space-plan', () => ({
  setSpaceAddons: () => Promise.resolve({ ok: true }),
  setSpacePlan: (spaceId: string, plan: string) => {
    if (failReconcileOnce) {
      failReconcileOnce = false
      onFail?.()
      return Promise.reject(new Error('space_subscription_items unreachable'))
    }
    planCalls.push({ spaceId, plan })
    return Promise.resolve({ ok: true, plan })
  },
}))
vi.mock('./space-subscription-items', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./space-subscription-items')>()
  return { ...actual, persistSpaceSubscriptionItems: () => Promise.resolve() }
})
vi.mock('@/lib/spaces/seats', () => ({ setSpaceSeatQuantity: () => Promise.resolve() }))
vi.mock('@/lib/spaces/tier-circle', () => ({ syncTierCircleAccess: () => Promise.resolve() }))
vi.mock('./beta-founding', () => ({ grantBetaFounding: () => Promise.resolve({ granted: false }) }))
vi.mock('@/lib/founding/status', () => ({ lapseFoundingStatus: () => Promise.resolve({ ok: true }) }))

// The one space row the watermark lives on. `last_plan_event_at` is stored as an ISO string.
const space: { last_plan_event_at: string | null; stripe_subscription_id: string | null } = {
  last_plan_event_at: null,
  stripe_subscription_id: null,
}
let rpcCalls = 0

function updateChain(patch: Record<string, unknown>) {
  const filters: Array<[string, unknown]> = []
  const matches = () =>
    filters.every(([c, v]) => {
      if (c === 'id') return v === 'space-1'
      if (c === 'last_plan_event_at') return space.last_plan_event_at === v
      return true
    })
  const chain = {
    eq(c: string, v: unknown) {
      filters.push([c, v])
      return chain
    },
    then(resolve: (v: unknown) => unknown) {
      if (matches()) Object.assign(space, patch)
      return Promise.resolve({ error: null }).then(resolve)
    },
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...space } }) }) }),
      update: (patch: Record<string, unknown>) => updateChain(patch),
    }),
    rpc: (fn: string, args: { _event_created: string }) => {
      rpcCalls++
      if (fn !== 'claim_space_plan_event') return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
      // The migration's `last_plan_event_at is null or last_plan_event_at < _event_created`.
      const cur = space.last_plan_event_at ? Date.parse(space.last_plan_event_at) : null
      const next = Date.parse(args._event_created)
      if (cur === null || cur < next) {
        space.last_plan_event_at = new Date(next).toISOString()
        return Promise.resolve({ data: true, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }),
}))

import { routeSpaceSubscription } from './space-subscriptions'

function planSub(plan = 'business'): Stripe.Subscription {
  return {
    id: 'sub_1',
    status: 'active',
    created: 1_700_000_000,
    customer: 'cus_1',
    items: { data: [] }, // no catalog items → the setSpacePlan fallback path (the throwing stub)
    metadata: { kind: 'space_plan', space_id: 'space-1', plan },
  } as unknown as Stripe.Subscription
}

const T0 = 1_756_000_000 // an event `created`, unix seconds
const iso = (sec: number) => new Date(sec * 1000).toISOString()

beforeEach(() => {
  failReconcileOnce = false
  onFail = null
  planCalls = []
  rpcCalls = 0
  space.last_plan_event_at = null
  space.stripe_subscription_id = null
})

describe('routeSpaceSubscription — watermark rollback when the reconcile throws (scan2 L6-02)', () => {
  it('a failed reconcile rolls the watermark back so the SAME event reconciles on retry', async () => {
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub(), T0)).rejects.toThrow(/unreachable/)
    expect(planCalls).toHaveLength(0)
    expect(space.last_plan_event_at).toBeNull() // rolled back, not left at T0

    // Stripe's retry: same event id, same `created`.
    await expect(routeSpaceSubscription(planSub(), T0)).resolves.toBe(true)
    expect(planCalls).toEqual([{ spaceId: 'space-1', plan: 'business' }])
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it('rolls back to the PREVIOUS mark (not null) when an earlier event had already been applied', async () => {
    space.last_plan_event_at = iso(T0 - 100)
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub(), T0)).rejects.toThrow()
    expect(space.last_plan_event_at).toBe(iso(T0 - 100))
    await expect(routeSpaceSubscription(planSub(), T0)).resolves.toBe(true)
    expect(planCalls).toHaveLength(1)
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it('still skips a genuinely older event as stale (the guard the rollback must not weaken)', async () => {
    await routeSpaceSubscription(planSub(), T0)
    expect(planCalls).toHaveLength(1)
    await expect(routeSpaceSubscription(planSub('free'), T0 - 60)).resolves.toBe(true)
    expect(planCalls).toHaveLength(1) // not reconciled
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it("does NOT roll back a NEWER event's mark that landed while this reconcile was failing", async () => {
    // This event claims T0; a newer event (T0+30) claims on top while the reconcile is in flight; then
    // the reconcile throws. The conditional rollback must leave the newer mark alone.
    failReconcileOnce = true
    onFail = () => {
      space.last_plan_event_at = iso(T0 + 30)
    }
    await expect(routeSpaceSubscription(planSub(), T0)).rejects.toThrow()
    expect(space.last_plan_event_at).toBe(iso(T0 + 30)) // conditional rollback was a no-op
    expect(rpcCalls).toBe(1)
  })

  it('an event without a `created` is unguarded: reconciles, stamps nothing, and a throw has nothing to roll back', async () => {
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub())).rejects.toThrow()
    expect(space.last_plan_event_at).toBeNull()
    expect(rpcCalls).toBe(0)
  })
})
