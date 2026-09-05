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
  // Every Checkout Session a payout-channel recorder was handed, with the payment_status it
  // carried (L2-06): the real recorders no-op on anything but 'paid', so "records once" at the
  // route level means "exactly one PAID delivery per recorder".
  sessions: [] as Array<{ recorder: string; id: string; paymentStatus: string | undefined }>,
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
vi.mock('@/lib/billing/connect', () => ({
  persistAccount: async () => { H.calls.push('account') },
}))
const seen = (recorder: string, s: Stripe.Checkout.Session) => {
  H.calls.push(recorder)
  H.sessions.push({ recorder, id: s.id, paymentStatus: s.payment_status })
}
vi.mock('@/lib/billing/tips', () => ({
  recordTipFromSession: async (s: Stripe.Checkout.Session) => { seen('tip', s) },
  recordTipRefundFromCharge: async () => { H.calls.push('tipRefund') },
}))
vi.mock('@/lib/billing/tickets', () => ({
  recordTicketFromSession: async (s: Stripe.Checkout.Session) => { seen('ticket', s) },
  recordTicketRefundFromCharge: async () => { H.calls.push('ticketRefund') },
}))
vi.mock('@/lib/billing/checkout', () => ({
  recordMembershipDuesFromInvoice: async () => { H.calls.push('dues') },
}))
vi.mock('@/lib/billing/supporter', () => ({
  recordSupporterContributionFromSession: async (s: Stripe.Checkout.Session) => { seen('supporter', s) },
  recordSupporterContributionRefundFromCharge: async () => { H.calls.push('supporterRefund') },
}))
vi.mock('@/lib/commerce/checkout', () => ({
  recordCommerceOrderFromSession: async (s: Stripe.Checkout.Session) => { seen('order', s) },
  recordCommerceRefundFromCharge: async () => { H.calls.push('orderRefund') },
  abandonCommerceOrderFromSession: async () => { H.calls.push('abandon') },
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
  H.sessions = []
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
    H.event = plainEvent('checkout.session.completed', { mode: 'subscription', metadata: { profile_id: 'p1', tier: 'crew' }, customer: 'cus_1' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(1) // member tier set
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order']) // every recorder fired
  })

  // 🔴 POSITIVE CONTROLS for the entitlement allowlist. Before the guard was `mode === 'subscription'
  // && !metadata.kind`, a ONE-TIME Shop/Market checkout (mode:'payment', kind:'commerce_order',
  // client_reference_id:<buyer>) matched none of the three named exclusions and granted the buyer the
  // paid tier permanently — with no subscription that could ever cancel it. These two fixtures are
  // the exact sessions lib/commerce/checkout.ts:182 and app/(main)/upgrade/actions.ts:201 create;
  // both must run every recorder and must NEVER touch the member tier.
  it('a one-time Shop/Market order (mode:payment, kind:commerce_order) never grants a membership tier', async () => {
    H.event = plainEvent('checkout.session.completed', {
      mode: 'payment',
      client_reference_id: 'p1',
      metadata: { kind: 'commerce_order', buyer_profile_id: 'p1' },
      customer: 'cus_1',
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(0) // no setTier — this is the hole
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order']) // the order still records
  })

  it('a one-time Supporter contribution (mode:payment, its own kind) never grants a membership tier', async () => {
    H.event = plainEvent('checkout.session.completed', {
      mode: 'payment',
      client_reference_id: 'p1',
      metadata: { kind: 'supporter_contribution', profile_id: 'p1' },
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(0)
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order'])
  })

  it('a subscription session that carries ANY kind (a Space plan) is routed by the subscription events, not here', async () => {
    H.event = plainEvent('checkout.session.completed', {
      mode: 'subscription',
      client_reference_id: 'space_1',
      metadata: { kind: 'space_plan', space_id: 'space_1', plan: 'business' },
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(0)
  })

  it('IGNORES a legacy founders checkout: no grant, no tier write', async () => {
    // The Founders Round one-time purchase is gone (owner directive, 2026-07-30). Nothing opens such a
    // session any more, and the branch that granted a LIFETIME founding membership off a
    // `kind: 'founders'` metadata string is deleted rather than left dormant. A stray legacy session
    // must therefore change nothing about the member: no membership tier, no founding grant.
    H.event = plainEvent('checkout.session.completed', { metadata: { kind: 'founders', profile_id: 'p1' } })
    await post()
    expect(H.rpcCalls).toHaveLength(0) // NOT a membership-tier transition
    expect(H.calls).not.toContain('founder')
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

  it('routes charge.refunded to the ticket, commerce, tip AND supporter refund recorders', async () => {
    // L2-07 (2026-09-05): this assertion read ['ticketRefund', 'orderRefund'] — a tip or a
    // Supporter contribution refunded from the Stripe dashboard reached no recorder at all.
    H.event = plainEvent('charge.refunded')
    await post()
    expect(H.calls).toEqual(['ticketRefund', 'orderRefund', 'tipRefund', 'supporterRefund'])
  })

  it('acks an unhandled event type with 200', async () => {
    H.event = plainEvent('customer.updated')
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.calls).toHaveLength(0)
  })
})

// DELAYED-NOTIFICATION PAYMENTS (L2-06, 2026-09-05). ACH debit / Cash App Pay / bank redirects
// complete the Checkout Session 'unpaid' and only settle later, on async_payment_succeeded. The
// route used to handle the failure half (async_payment_failed) and not the success half, so the
// buyer was charged and the order / ticket / tip / contribution stayed `pending` forever.
describe('stripe webhook — checkout.session.async_payment_succeeded', () => {
  const paidDeliveries = (recorder: string) =>
    H.sessions.filter((x) => x.recorder === recorder && x.paymentStatus === 'paid')

  it('routes a paid async session through every payout-channel recorder, exactly once each', async () => {
    H.event = plainEvent('checkout.session.async_payment_succeeded', {
      id: 'cs_async_1',
      mode: 'payment',
      payment_status: 'paid',
      metadata: { kind: 'commerce_order', buyer_profile_id: 'p1' },
    })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order']) // the SAME list `completed` runs
    for (const r of ['tip', 'ticket', 'supporter', 'order']) {
      expect(paidDeliveries(r)).toEqual([{ recorder: r, id: 'cs_async_1', paymentStatus: 'paid' }])
    }
    expect(H.rpcCalls).toHaveLength(0) // never a member-tier write from this event
    expect(H.calls).not.toContain('abandon') // and never the failure branch
  })

  it('completed (unpaid) followed by async_payment_succeeded (paid) is ONE paid delivery per recorder', async () => {
    // The recorders' own `payment_status !== 'paid'` guards (pinned in lib/billing/tips.test.ts
    // and lib/billing/supporter.test.ts) make the unpaid delivery a no-op; what THIS route owns is
    // handing the same session to the same recorders on both events, so the paid one is counted
    // once and the pending row is flipped once, keyed on the session id.
    H.event = plainEvent('checkout.session.completed', {
      id: 'cs_async_2',
      mode: 'payment',
      payment_status: 'unpaid',
      metadata: { kind: 'tip', from_profile_id: 'p1', to_profile_id: 'p2' },
    })
    expect((await post()).status).toBe(200)
    H.event = plainEvent('checkout.session.async_payment_succeeded', {
      id: 'cs_async_2',
      mode: 'payment',
      payment_status: 'paid',
      metadata: { kind: 'tip', from_profile_id: 'p1', to_profile_id: 'p2' },
    })
    expect((await post()).status).toBe(200)
    for (const r of ['tip', 'ticket', 'supporter', 'order']) {
      expect(H.sessions.filter((x) => x.recorder === r)).toHaveLength(2) // handed both events
      expect(paidDeliveries(r)).toHaveLength(1) // recorded once
    }
    expect(H.rpcCalls).toHaveLength(0)
  })

  it('async_payment_failed still routes ONLY to the abandon path (the success half does not leak in)', async () => {
    H.event = plainEvent('checkout.session.async_payment_failed', { id: 'cs_async_3', payment_status: 'unpaid' })
    expect((await post()).status).toBe(200)
    expect(H.calls).toEqual(['abandon'])
    expect(H.sessions).toHaveLength(0)
  })
})

// IDEMPOTENCY CLAIM (L2-10, 2026-09-05). Only sqlstate 23505 is the "already processed" signal.
// Any OTHER claim error used to fall through and process the event unclaimed, so the Stripe
// retry that follows a transient outage processed the same event twice, silently.
describe('stripe webhook — idempotency claim failures', () => {
  it('returns 500 and runs NO handler on a non-duplicate claim error, so Stripe retries', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      H.claimError = { code: '57014' } // statement timeout — not a duplicate
      H.event = subEvent('customer.subscription.updated', { status: 'active', created: 5000, metadata: { tier: 'crew' } })
      const res = await post()
      expect(res.status).toBe(500)
      expect((await res.json()).duplicate).toBeUndefined() // not mistaken for a replay
      expect(H.rpcCalls).toHaveLength(0) // handler never ran unclaimed
      expect(H.calls).toHaveLength(0)
      expect(H.deleteCalls).toHaveLength(0) // nothing was claimed, nothing to release
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(String(errorSpy.mock.calls[0][0])).toContain('claim failed')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a claim error WITHOUT a code (grant revoked, connection reset) is also a 500, never a fall-through', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      H.claimError = { message: 'permission denied for table stripe_webhook_events' } as { code?: string }
      H.event = plainEvent('checkout.session.completed', { mode: 'payment', metadata: { kind: 'tip' } })
      const res = await post()
      expect(res.status).toBe(500)
      expect(H.calls).toHaveLength(0)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// HOUSEHOLD / CIRCLE BUNDLE (ADR-370). lib/billing/bundle-seats.ts is deliberately NOT mocked here:
// it runs for real against the same admin-client stub, so these cases pin the actual routing and the
// actual RPC arguments. The seating semantics themselves live in lib/billing/bundle-seats.test.ts and
// supabase/tests/household_bundle_seating.test.sql.
describe('stripe webhook — household bundle seating', () => {
  const OWNER = '11111111-1111-4111-8111-111111111111'
  const SEAT = '22222222-2222-4222-8222-222222222222'
  const bundleMeta = {
    kind: 'household_bundle',
    owner_id: OWNER,
    bundle_seats: '4',
    bundle_tier: 'crew',
    seat_ids: SEAT,
  }

  it('does NOT flip the buyer personal membership on a bundle checkout (they bought seats)', async () => {
    H.event = plainEvent('checkout.session.completed', { metadata: bundleMeta, customer: 'cus_1' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(0) // no apply_membership_event_atomic off a bundle payment
    expect(H.calls).toEqual(['tip', 'ticket', 'supporter', 'order']) // recorders still no-op through
  })

  it('routes an active bundle subscription to the seating RPC instead of the member path', async () => {
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 2000, metadata: bundleMeta })
    const res = await post()
    expect(res.status).toBe(200)
    expect(H.rpcCalls).toHaveLength(1)
    expect(H.rpcCalls[0].name).toBe('apply_bundle_seating_atomic')
    expect(H.rpcCalls[0].args).toMatchObject({
      _owner: OWNER,
      _seat_ids: [SEAT],
      _tier: 'crew',
      _seats: 4,
      _active: true,
      _event_at: iso(2000),
    })
  })

  it('empties the bundle on subscription.deleted', async () => {
    H.event = subEvent('customer.subscription.deleted', { created: 3000, metadata: bundleMeta })
    await post()
    expect(H.rpcCalls[0].name).toBe('apply_bundle_seating_atomic')
    expect(H.rpcCalls[0].args).toMatchObject({ _owner: OWNER, _active: false, _event_at: iso(3000) })
  })

  it('500s and releases the claim when seating fails, so the buyer is never left unseated on a 200', async () => {
    H.rpcResult = { data: null, error: { message: 'boom' } }
    H.event = subEvent('customer.subscription.updated', { status: 'active', created: 4000, metadata: bundleMeta })
    const res = await post()
    expect(res.status).toBe(500)
    expect(H.deleteCalls).toContain('evt_4000')
  })
})
