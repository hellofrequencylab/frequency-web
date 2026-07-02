import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// Wiring for THE consolidated Stripe webhook (ADR-501). Two concerns are locked here:
//  1. The member ordering guard — every member entitlement transition routes through
//     apply_membership_event_atomic carrying event.created; a stale result is acked 200
//     without releasing the idempotency claim; a DB error 500s + releases it. (The guard
//     MATH lives in the RPC and is covered by supabase/tests/membership_event_ordering_guard.test.sql.)
//  2. Consolidation — one endpoint now dispatches BOTH the membership/subscription path and
//     the payout-channel recorders (tips/tickets/supporter/commerce/dues/refunds/Connect),
//     so those recorders fire for the right event types through this single route.

const H = vi.hoisted(() => ({
  event: undefined as unknown as Stripe.Event,
  rpcResult: { data: { applied: true } as Record<string, unknown> | null, error: null as { message: string } | null },
  claimError: null as { code?: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  deleteCalls: [] as string[],
  calls: [] as string[], // recorder / connect handlers invoked, in order
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
vi.mock('@/lib/billing/founders', () => ({
  grantFounderFromSession: async () => { H.calls.push('founder') },
}))
vi.mock('@/lib/billing/connect', () => ({
  persistAccount: async () => { H.calls.push('account') },
}))
vi.mock('@/lib/billing/tips', () => ({
  recordTipFromSession: async () => { H.calls.push('tip') },
}))
vi.mock('@/lib/billing/tickets', () => ({
  recordTicketFromSession: async () => { H.calls.push('ticket') },
  recordTicketRefundFromCharge: async () => { H.calls.push('ticketRefund') },
}))
vi.mock('@/lib/billing/checkout', () => ({
  recordMembershipDuesFromInvoice: async () => { H.calls.push('dues') },
}))
vi.mock('@/lib/billing/supporter', () => ({
  recordSupporterContributionFromSession: async () => { H.calls.push('supporter') },
}))
vi.mock('@/lib/commerce/checkout', () => ({
  recordCommerceOrderFromSession: async () => { H.calls.push('order') },
  recordCommerceRefundFromCharge: async () => { H.calls.push('orderRefund') },
}))
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

import { POST } from '@/app/api/webhooks/stripe/route'

function post() {
  return POST(
    new Request('http://t/api/webhooks/stripe', {
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

function plainEvent(type: string, object: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: `evt_${type}`,
    type,
    created: 1000,
    data: { object: { metadata: {}, ...object } },
  } as unknown as Stripe.Event
}

const iso = (created: number) => new Date(created * 1000).toISOString()

beforeEach(() => {
  H.event = undefined as unknown as Stripe.Event
  H.rpcResult = { data: { applied: true }, error: null }
  H.claimError = null
  H.rpcCalls = []
  H.deleteCalls = []
  H.calls = []
})

describe('stripe webhook — member ordering guard wiring', () => {
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

  it('short-circuits a duplicate event on a 23505 claim violation', async () => {
    H.claimError = { code: '23505' }
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 1000, metadata: { tier: 'crew' } })
    const res = await post()
    expect(res.status).toBe(200)
    expect((await res.json()).duplicate).toBe(true)
    expect(H.rpcCalls).toHaveLength(0) // handler never ran
  })
})

describe('stripe webhook — consolidated payout-channel dispatch', () => {
  it('runs the member tier write AND all recorders on a plain member checkout', async () => {
    H.event = plainEvent('checkout.session.completed', { metadata: { profile_id: 'p1', tier: 'crew' }, customer: 'cus_1' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(1) // member tier set
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order']) // every recorder fired
  })

  it('grants a founders checkout without a subscription tier write', async () => {
    H.event = plainEvent('checkout.session.completed', { metadata: { kind: 'founders', profile_id: 'p1' } })
    await post()
    expect(H.rpcCalls).toHaveLength(0) // NOT a membership-tier transition
    expect(H.calls[0]).toBe('founder')
    expect(H.calls).toContain('order') // recorders still run (they no-op on a founders session)
  })

  it('dispatches account.updated to the Connect sync', async () => {
    H.event = plainEvent('account.updated')
    await post()
    expect(H.calls).toEqual(['account'])
    expect(H.rpcCalls).toHaveLength(0)
  })

  it('records membership dues on invoice.paid', async () => {
    H.event = plainEvent('invoice.paid')
    await post()
    expect(H.calls).toEqual(['dues'])
  })

  it('routes charge.refunded to both ticket and commerce refund recorders', async () => {
    H.event = plainEvent('charge.refunded')
    await post()
    expect(H.calls).toEqual(['ticketRefund', 'orderRefund'])
  })

  it('acks an unhandled event type with 200', async () => {
    H.event = plainEvent('customer.updated')
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.calls).toHaveLength(0)
  })
})
