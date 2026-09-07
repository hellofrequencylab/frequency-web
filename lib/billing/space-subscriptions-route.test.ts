import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type Stripe from 'stripe'

// TWO defects in one guard, tested together because they share the watermark.
//
// scan2 L6-02 (2026-09-05): routeSpaceSubscription claims the Stripe event's `created` into
// spaces.last_plan_event_at BEFORE it reconciles. If the reconcile throws, the webhook 500s and Stripe
// retries the SAME event; without a rollback the retry reads as stale and is acked without ever
// applying the plan change.
//
// LIVE-159 (2026-09-07, ADR-1214): `created` is unix SECONDS, and one checkout emits
// `customer.subscription.created` and `.updated` inside the same second. The strictly-newer test kept
// whichever arrived first and DROPPED the other — usually the `.updated` carrying the settled state.
// The fix is a LIFECYCLE RANK (created < updated < deleted) as the same-second tiebreaker, plus the
// event id as the identity of the mark, so a rollback only ever restores its own claim.
//
// The `rpc` stub below re-implements the migration's conditional UPDATE, including its argument
// DEFAULTS (rank 0, id null), so a caller that sends neither behaves exactly as the SQL would.

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
const space: {
  last_plan_event_at: string | null
  last_plan_event_rank: number | null
  last_plan_event_id: string | null
  stripe_subscription_id: string | null
} = {
  last_plan_event_at: null,
  last_plan_event_rank: null,
  last_plan_event_id: null,
  stripe_subscription_id: null,
}
let rpcCalls = 0

function updateChain(patch: Record<string, unknown>) {
  const filters: Array<[string, unknown]> = []
  const matches = () =>
    filters.every(([c, v]) => {
      if (c === 'id') return v === 'space-1'
      if (c === 'last_plan_event_at') return space.last_plan_event_at === v
      if (c === 'last_plan_event_id') return space.last_plan_event_id === v
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
    rpc: (fn: string, args: { _event_created: string; _event_rank?: number; _event_id?: string | null }) => {
      rpcCalls++
      if (fn !== 'claim_space_plan_event') return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
      // The migration's conditional UPDATE, with its SQL argument defaults (rank 0, id null).
      const curAt = space.last_plan_event_at ? Date.parse(space.last_plan_event_at) : null
      const nextAt = Date.parse(args._event_created)
      const curRank = space.last_plan_event_rank ?? 0
      const nextRank = args._event_rank ?? 0
      const claimed =
        curAt === null ||
        curAt < nextAt ||
        // Same second: either side unranked admits; otherwise a not-earlier lifecycle stage admits.
        (curAt === nextAt && (curRank === 0 || nextRank === 0 || nextRank >= curRank))
      if (!claimed) return Promise.resolve({ data: null, error: null })
      space.last_plan_event_at = new Date(nextAt).toISOString()
      space.last_plan_event_rank = nextRank
      space.last_plan_event_id = args._event_id ?? null
      return Promise.resolve({ data: true, error: null })
    },
  }),
}))

import { routeSpaceSubscription, spacePlanEventRank } from './space-subscriptions'

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
/** A Stripe event reference: `created` orders across seconds, `type` breaks a same-second tie. */
const ev = (created: number, type: string, id: string) => ({ created, type, id })
const CREATED = 'customer.subscription.created'
const UPDATED = 'customer.subscription.updated'
const DELETED = 'customer.subscription.deleted'

beforeEach(() => {
  failReconcileOnce = false
  onFail = null
  planCalls = []
  rpcCalls = 0
  space.last_plan_event_at = null
  space.last_plan_event_rank = null
  space.last_plan_event_id = null
  space.stripe_subscription_id = null
})

describe('routeSpaceSubscription — watermark rollback when the reconcile throws (scan2 L6-02)', () => {
  it('a failed reconcile rolls the watermark back so the SAME event reconciles on retry', async () => {
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))).rejects.toThrow(/unreachable/)
    expect(planCalls).toHaveLength(0)
    expect(space.last_plan_event_at).toBeNull() // rolled back, not left at T0

    // Stripe's retry: same event id, same `created`.
    await expect(routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))).resolves.toBe(true)
    expect(planCalls).toEqual([{ spaceId: 'space-1', plan: 'business' }])
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it('rolls back to the PREVIOUS mark (not null) when an earlier event had already been applied', async () => {
    space.last_plan_event_at = iso(T0 - 100)
    space.last_plan_event_rank = 2
    space.last_plan_event_id = 'evt_0'
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))).rejects.toThrow()
    expect(space.last_plan_event_at).toBe(iso(T0 - 100))
    expect(space.last_plan_event_id).toBe('evt_0')
    expect(space.last_plan_event_rank).toBe(2)
    await expect(routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))).resolves.toBe(true)
    expect(planCalls).toHaveLength(1)
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it('still skips a genuinely older event as stale (the guard the rollback must not weaken)', async () => {
    await routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))
    expect(planCalls).toHaveLength(1)
    await expect(routeSpaceSubscription(planSub('free'), ev(T0 - 60, UPDATED, 'evt_2'))).resolves.toBe(true)
    expect(planCalls).toHaveLength(1) // not reconciled
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it("does NOT roll back a NEWER event's mark that landed while this reconcile was failing", async () => {
    // This event claims T0; a newer event (T0+30) claims on top while the reconcile is in flight; then
    // the reconcile throws. The conditional rollback must leave the newer mark alone.
    failReconcileOnce = true
    onFail = () => {
      space.last_plan_event_at = iso(T0 + 30)
      space.last_plan_event_rank = 2
      space.last_plan_event_id = 'evt_newer'
    }
    await expect(routeSpaceSubscription(planSub(), ev(T0, UPDATED, 'evt_1'))).rejects.toThrow()
    expect(space.last_plan_event_at).toBe(iso(T0 + 30)) // conditional rollback was a no-op
    expect(rpcCalls).toBe(1)
  })

  it('an event without a `created` is unguarded: reconciles, stamps nothing, and a throw has nothing to roll back', async () => {
    failReconcileOnce = true
    await expect(routeSpaceSubscription(planSub())).rejects.toThrow()
    expect(space.last_plan_event_at).toBeNull()
    expect(rpcCalls).toBe(0)
  })

  it('does NOT roll back a SAME-SECOND sibling that claimed on top (the mark is identified by event id)', async () => {
    // LIVE-159's rollback half. Before the id existed the rollback matched on `last_plan_event_at`
    // alone — and a same-second sibling's mark carries the SAME timestamp, so the rollback clobbered
    // a claim that was not its own and handed the Space back to a watermark nobody had reconciled.
    failReconcileOnce = true
    onFail = () => {
      space.last_plan_event_at = iso(T0) // same SECOND, different event
      space.last_plan_event_rank = 2
      space.last_plan_event_id = 'evt_sibling'
    }
    await expect(routeSpaceSubscription(planSub(), ev(T0, CREATED, 'evt_mine'))).rejects.toThrow()
    expect(space.last_plan_event_id).toBe('evt_sibling')
    expect(space.last_plan_event_rank).toBe(2)
    expect(space.last_plan_event_at).toBe(iso(T0))
  })
})

describe('routeSpaceSubscription — same-second lifecycle tiebreaker (LIVE-159, ADR-1214)', () => {
  it('applies the `.updated` that shares its second with the `.created`, instead of dropping it', async () => {
    await routeSpaceSubscription(planSub('business'), ev(T0, CREATED, 'evt_a'))
    await routeSpaceSubscription(planSub('collective'), ev(T0, UPDATED, 'evt_b'))
    expect(planCalls).toEqual([
      { spaceId: 'space-1', plan: 'business' },
      { spaceId: 'space-1', plan: 'collective' },
    ])
    expect(space.last_plan_event_rank).toBe(2)
    expect(space.last_plan_event_id).toBe('evt_b')
  })

  it('still skips a same-second `.created` delivered AFTER its `.updated` (out-of-order gets BETTER, not worse)', async () => {
    await routeSpaceSubscription(planSub('collective'), ev(T0, UPDATED, 'evt_b'))
    await expect(routeSpaceSubscription(planSub('business'), ev(T0, CREATED, 'evt_a'))).resolves.toBe(true)
    expect(planCalls).toEqual([{ spaceId: 'space-1', plan: 'collective' }]) // the `.created` never applied
    expect(space.last_plan_event_id).toBe('evt_b')
  })

  it('never lets a same-second `.updated` revert a `.deleted`', async () => {
    await routeSpaceSubscription(planSub('free'), ev(T0, DELETED, 'evt_d'))
    await expect(routeSpaceSubscription(planSub('business'), ev(T0, UPDATED, 'evt_u'))).resolves.toBe(true)
    expect(planCalls).toEqual([{ spaceId: 'space-1', plan: 'free' }])
  })

  it('admits two same-second `.updated` events in arrival order rather than dropping one', async () => {
    // The stated residue: nothing in the payload can order two events of the same type in one second,
    // so the guard takes arrival order over silently discarding a plan change.
    await routeSpaceSubscription(planSub('business'), ev(T0, UPDATED, 'evt_b1'))
    await routeSpaceSubscription(planSub('collective'), ev(T0, UPDATED, 'evt_b2'))
    expect(planCalls).toHaveLength(2)
    expect(space.last_plan_event_id).toBe('evt_b2')
  })

  it('the rank never outranks the SECOND: an older event with a later lifecycle stage is still stale', async () => {
    await routeSpaceSubscription(planSub('business'), ev(T0, CREATED, 'evt_a'))
    await expect(routeSpaceSubscription(planSub('free'), ev(T0 - 60, DELETED, 'evt_d'))).resolves.toBe(true)
    expect(planCalls).toEqual([{ spaceId: 'space-1', plan: 'business' }])
    expect(space.last_plan_event_at).toBe(iso(T0))
  })

  it('an UNRANKED type never loses a same-second tie (it is admitted, not dropped)', async () => {
    await routeSpaceSubscription(planSub('business'), ev(T0, DELETED, 'evt_d'))
    await expect(routeSpaceSubscription(planSub('collective'), ev(T0, 'customer.subscription.paused', 'evt_p'))).resolves.toBe(
      true,
    )
    expect(planCalls).toHaveLength(2)
  })
})

describe('spacePlanEventRank', () => {
  it('ranks the subscription lifecycle and nothing else', () => {
    expect(spacePlanEventRank(CREATED)).toBe(1)
    expect(spacePlanEventRank(UPDATED)).toBe(2)
    expect(spacePlanEventRank(DELETED)).toBe(3)
    expect(spacePlanEventRank('invoice.paid')).toBe(0)
    expect(spacePlanEventRank(undefined)).toBe(0)
    expect(spacePlanEventRank(null)).toBe(0)
  })
})

describe('the migration behind the guard', () => {
  // The rpc stub above is a re-implementation, so it can drift from the SQL that actually runs. This
  // pins the shape the stub assumes: the 4-argument signature and the same-second branch.
  const sql = readFileSync(
    join('supabase', 'migrations', '20270345001500_space_plan_event_lifecycle_tiebreaker.sql'),
    'utf8',
  )

  it('drops the 2-argument claim and declares the ranked one', () => {
    expect(sql).toMatch(/drop function if exists public\.claim_space_plan_event\(uuid, timestamptz\)/)
    expect(sql).toMatch(/_event_rank smallint default 0/)
    expect(sql).toMatch(/_event_id text default null/)
  })

  it('compares the same second by rank, and keeps the strictly-newer test for different seconds', () => {
    expect(sql).toMatch(/last_plan_event_at < _event_created/)
    expect(sql).toMatch(/last_plan_event_at = _event_created/)
    expect(sql).toMatch(/_event_rank >= last_plan_event_rank/)
  })

  it('keeps the service-role-only lockdown on the new signature', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.claim_space_plan_event\(uuid, timestamptz, smallint, text\) from public, anon, authenticated;/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.claim_space_plan_event\(uuid, timestamptz, smallint, text\) to service_role;/,
    )
  })
})
