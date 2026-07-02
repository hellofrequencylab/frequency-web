import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// Wiring for the Stripe member webhook's ordering guard. The guard MATH (strict >, atomic
// compare-and-set) lives in apply_membership_event_atomic and is covered by the pgTAP test
// supabase/tests/membership_event_ordering_guard.test.sql. These lock the app-side wiring:
// every member entitlement transition routes through the RPC carrying event.created, a stale
// result is acked 200 without releasing the idempotency claim, and a DB error 500s + releases it.

const H = vi.hoisted(() => ({
  event: undefined as unknown as Stripe.Event,
  rpcResult: { data: { applied: true } as Record<string, unknown> | null, error: null as { message: string } | null },
  claimError: null as { code?: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deleteCalls: [] as string[],
}))

vi.mock('@/lib/billing/stripe', () => ({
  stripe: { webhooks: { constructEvent: () => H.event } },
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  tierForPrice: () => 'crew',
}))
vi.mock('@/lib/billing/space-subscriptions', () => ({
  routeSpaceSubscription: async () => false, // member path runs
  subscriptionKind: () => undefined,
}))
vi.mock('@/lib/billing/founders', () => ({ grantFounderFromSession: async () => {} }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async () => ({ error: H.claimError }), // idempotency claim
      delete: () => ({
        eq: async (_c: string, v: string) => {
          H.deleteCalls.push(v)
          return { error: null }
        },
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      H.rpcCalls.push({ name, args })
      return H.rpcResult
    },
  }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function post() {
  return POST(
    new Request('http://t/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: 'raw',
    }),
  )
}

function subEvent(
  type: string,
  opts: { status?: string; created: number; metadata?: Record<string, string> },
): Stripe.Event {
  return {
    id: `evt_${opts.created}`,
    type,
    created: opts.created,
    data: {
      object: {
        id: 'sub_1',
        status: opts.status,
        metadata: { profile_id: 'p1', ...(opts.metadata ?? {}) },
        items: { data: [{ price: { id: 'price_1' } }] },
        customer: 'cus_1',
      },
    },
  } as unknown as Stripe.Event
}

const iso = (created: number) => new Date(created * 1000).toISOString()

beforeEach(() => {
  H.event = undefined as unknown as Stripe.Event
  H.rpcResult = { data: { applied: true }, error: null }
  H.claimError = null
  H.rpcCalls = []
  H.deleteCalls = []
})

describe('stripe member webhook — ordering guard wiring', () => {
  it('routes an active subscription.updated through the RPC with event.created', async () => {
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 2000, metadata: { tier: 'crew' } })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(1)
    expect(H.rpcCalls[0].name).toBe('apply_membership_event_atomic')
    expect(H.rpcCalls[0].args).toMatchObject({
      _profile: 'p1',
      _tier: 'crew',
      _payment_status: 'active',
      _event_at: iso(2000),
    })
  })

  it('maps a canceled/deleted subscription to free with the event timestamp', async () => {
    H.event = subEvent('customer.subscription.deleted', { created: 3000, metadata: { tier: 'crew' } })
    await post()
    expect(H.rpcCalls[0].args).toMatchObject({ _tier: 'free', _payment_status: 'canceled', _event_at: iso(3000) })
  })

  it('maps a supporter tier to crew + the is_supporter badge', async () => {
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 2000, metadata: { tier: 'supporter' } })
    await post()
    expect(H.rpcCalls[0].args).toMatchObject({ _tier: 'crew', _is_supporter: true })
  })

  it('acks 200 and keeps the idempotency claim when the event is stale', async () => {
    H.rpcResult = { data: { applied: false, reason: 'stale' }, error: null }
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 1000, metadata: { tier: 'crew' } })
    const res = await post()
    expect(res.status).toBe(200)
    expect((await res.json()).received).toBe(true)
    expect(H.deleteCalls).toHaveLength(0) // correct state preserved — do not redeliver
  })

  it('500s and releases the claim on a real DB error so Stripe retries', async () => {
    H.rpcResult = { data: null, error: { message: 'boom' } }
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 1000, metadata: { tier: 'crew' } })
    const res = await post()
    expect(res.status).toBe(500)
    expect(H.deleteCalls).toContain('evt_1000') // claim released for redelivery
  })
})
