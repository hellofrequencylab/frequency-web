import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// THE FEE / CURRENCY INVARIANT (HYG-107, ADR-1500). MONEY CODE.
//
// Stripe reads `application_fee_amount` as an absolute integer in the PaymentIntent's currency. With
// Adaptive Pricing on, the buyer may be SHOWN and CHARGED in another currency, but the Checkout
// Session and its PaymentIntent stay in the integration currency (the currency of the line items),
// and the platform receives the fee in the connected account's settlement currency without a second
// conversion (docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing,
// docs.stripe.com/connect/currencies/adaptive-pricing). So the platform's cut is right EXACTLY WHEN
// the fee is computed from the same cents, in the same currency, that the line items carry.
//
// This file pins that relationship so a future change cannot let the three drift apart:
//   1. every Stripe line item carries the cart's currency, not a default;
//   2. the gross the take-rate helper prices is the SUM of those line items, cent for cent;
//   3. `application_fee_amount` is what the helper returned for that gross, unchanged;
//   4. the order row records the same currency and the same gross;
//   5. a cart that mixes currencies is refused BEFORE an order is written or Stripe is called,
//      because a gross summed across currencies is a number in no currency at all.
//
// The admin client is the scripted fake from ./checkout.test.ts, reused deliberately: it records
// every write, so the assertions read what was SENT, not what came back.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
  single?: boolean
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  let handler: (call: Call) => { data?: unknown; error?: { message: string } | null } = () => ({})
  return {
    calls,
    setHandler(h: typeof handler) {
      handler = h
    },
    run(call: Call) {
      calls.push(call)
      const out = handler(call)
      return { data: out.data === undefined ? (call.single ? null : []) : out.data, error: out.error ?? null }
    },
    reset() {
      calls.length = 0
      handler = () => ({})
    },
  }
})

const stripeFake = vi.hoisted(() => ({
  checkout: { sessions: { create: vi.fn(), expire: vi.fn() } },
  refunds: { create: vi.fn() },
}))

/** The take-rate helpers, as recording fakes: each prices 10% of WHATEVER GROSS IT IS HANDED, so the
 *  assertions can tie the fee Stripe receives back to the cents the line items carry. */
const fees = vi.hoisted(() => ({
  spaceTakeRateCents: vi.fn(async (gross: number) => Math.floor(gross * 0.1)),
  memberTakeRateCents: vi.fn(async (gross: number) => Math.floor(gross * 0.1)),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        insert: (v: unknown) => {
          call.op = 'insert'
          call.payload = v
          return b
        },
        update: (v: unknown) => {
          call.op = 'update'
          call.payload = v
          return b
        },
        delete: () => {
          call.op = 'delete'
          return b
        },
        eq: (k: string, v: unknown) => {
          call.filters.push(['eq', k, v])
          return b
        },
        in: (k: string, v: unknown) => {
          call.filters.push(['in', k, v])
          return b
        },
        is: (k: string, v: unknown) => {
          call.filters.push(['is', k, v])
          return b
        },
        neq: () => b,
        gte: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => {
          call.single = true
          return b
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(state.run(call)).then(resolve, reject),
      }
      return b
    },
    rpc: (name: string, args: unknown) => {
      const call: Call = { table: `rpc:${name}`, op: 'rpc', payload: args, filters: [] }
      return Promise.resolve(state.run(call))
    },
  }),
}))
vi.mock('@/lib/billing/stripe', () => ({ stripe: stripeFake, appUrl: () => 'https://app.test' }))
vi.mock('@/lib/billing/connect', () => ({
  getConnectStatus: vi.fn(async () => ({ accountId: 'acct_seller', ready: true })),
  payoutsLive: vi.fn(async () => true),
}))
vi.mock('@/lib/billing/fees', () => fees)
// A NETWORK-sourced sale, so the take-rate is non-zero and the fee has something to be wrong about.
vi.mock('./order-source', () => ({ classifyOrderSource: vi.fn(async () => ({ source: 'network', attributionRef: null })) }))
vi.mock('@/lib/pricing/network-world', () => ({ effectiveOrderSource: (s: string) => s }))
vi.mock('@/lib/spaces/booking', () => ({ confirmBookingByOrder: vi.fn(async () => {}), cancelBookingByOrder: vi.fn(async () => {}) }))
vi.mock('@/lib/finance/record', () => ({ recordFinancialTransaction: vi.fn(async () => {}) }))
vi.mock('./selling', () => ({ canTakePayments: (k: string) => k === 'space' || k === 'platform' || k === 'profile' }))
vi.mock('./variants', () => ({ getVariantsByIds: vi.fn(async () => new Map()) }))
vi.mock('./journey-fulfilment', () => ({ enrolByOrder: vi.fn(async () => {}), revokeJourneyByOrder: vi.fn(async () => {}) }))
vi.mock('@/lib/journeys/tier-gate', () => ({ checkJourneyTier: vi.fn(async () => ({ ok: true })) }))
vi.mock('./order-receipt', () => ({ sendOrderReceipts: vi.fn(async () => {}) }))

import { createCommerceCheckout } from './checkout'

/** A Space shop product priced in CANADIAN DOLLARS: the first non-USD row the tree has ever priced. */
const CAD_TEE = {
  id: 'p-cad',
  owner_kind: 'space',
  owner_profile_id: null,
  owner_space_id: 'space-1',
  entity_id: 'ent-1',
  title: 'Tee',
  price_cents: 1250,
  currency: 'CAD',
  stock: 5,
  status: 'active',
  product_kind: 'physical',
  journey_plan_id: null,
}
const CAD_HAT = { ...CAD_TEE, id: 'p-cad-hat', title: 'Hat', price_cents: 3300, currency: 'cad' }
const USD_MUG = { ...CAD_TEE, id: 'p-usd', title: 'Mug', price_cents: 900, currency: 'usd' }

function shop(products: unknown[]) {
  state.setHandler((c) => {
    if (c.table === 'commerce_products' && c.op === 'select') return { data: products }
    if (c.table === 'spaces' && c.op === 'select') return { data: { owner_profile_id: 'owner-1', plan: 'business', network_connected: true } }
    if (c.table === 'commerce_orders' && c.op === 'insert') return { data: { id: 'o1' } }
    if (c.table === 'commerce_orders' && c.op === 'update') return { data: [{ id: 'o1' }] }
    return {}
  })
}

const created = () => stripeFake.checkout.sessions.create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams
const orderInsert = () => state.calls.find((c) => c.table === 'commerce_orders' && c.op === 'insert')?.payload as Record<string, unknown> | undefined

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  stripeFake.checkout.sessions.create.mockImplementation(async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the platform fee is computed in the currency the line items carry (HYG-107)', () => {
  it('prices the fee on the SUM of the Stripe line items, in their currency, and sends exactly that integer', async () => {
    shop([CAD_TEE, CAD_HAT])
    const res = await createCommerceCheckout({
      items: [
        { productId: 'p-cad', qty: 2 },
        { productId: 'p-cad-hat', qty: 1 },
      ],
      buyerProfileId: 'buyer-1',
    })
    expect(res.error).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)

    const args = created()
    const lines = (args.line_items ?? []) as { quantity: number; price_data: { currency: string; unit_amount: number } }[]
    expect(lines).toHaveLength(2)
    // 1. Every line item is in the cart's currency: lower-cased for Stripe, never a 'usd' default.
    for (const l of lines) expect(l.price_data.currency).toBe('cad')
    // 2. The gross the take-rate helper priced IS the sum of those line items, cent for cent.
    const lineGross = lines.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0)
    expect(lineGross).toBe(2 * 1250 + 3300)
    expect(fees.spaceTakeRateCents).toHaveBeenCalledTimes(1)
    expect(fees.spaceTakeRateCents.mock.calls[0][0]).toBe(lineGross)
    // 3. The application fee Stripe receives is the helper's answer for that gross, unchanged: an
    //    integer in the same currency as the line items, on a destination charge the seller settles.
    const pid = args.payment_intent_data as { application_fee_amount: number; on_behalf_of: string; transfer_data: { destination: string } }
    expect(pid.application_fee_amount).toBe(Math.floor(lineGross * 0.1))
    expect(pid.application_fee_amount).toBe(await fees.spaceTakeRateCents.mock.results[0].value)
    expect(pid.on_behalf_of).toBe('acct_seller')
    expect(pid.transfer_data.destination).toBe('acct_seller')
    // 4. The order row agrees with the session on both the currency and the gross the fee was cut from.
    const row = orderInsert()!
    expect(row.currency).toBe('cad')
    expect(row.amount_cents).toBe(lineGross)
    expect(row.platform_fee_cents).toBe(pid.application_fee_amount)
  })

  it('refuses a cart that mixes currencies BEFORE any order is written or Stripe is asked', async () => {
    shop([CAD_TEE, USD_MUG])
    const res = await createCommerceCheckout({
      items: [
        { productId: 'p-cad', qty: 1 },
        { productId: 'p-usd', qty: 1 },
      ],
      buyerProfileId: 'buyer-1',
    })
    expect(res.error).toBe('Please check out items in one currency at a time.')
    expect(res.url).toBeUndefined()
    expect(orderInsert()).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    // No fee was ever computed on a gross that spans two currencies.
    expect(fees.spaceTakeRateCents).not.toHaveBeenCalled()
    expect(fees.memberTakeRateCents).not.toHaveBeenCalled()
  })

  it('treats currency case as spelling, not as a second currency', async () => {
    // 'CAD' and 'cad' are one currency; the guard must not refuse a cart over case.
    shop([CAD_TEE, CAD_HAT])
    const res = await createCommerceCheckout({
      items: [
        { productId: 'p-cad', qty: 1 },
        { productId: 'p-cad-hat', qty: 1 },
      ],
      buyerProfileId: 'buyer-1',
    })
    expect(res.error).toBeUndefined()
    expect(orderInsert()?.currency).toBe('cad')
  })
})
