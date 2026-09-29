import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// THE FUNDS FLOW REACHES STRIPE AND THE ROW (LIVE-621, ADR-1576). MONEY CODE.
//
// ./funds-flow.test.ts pins the pure decision. This file pins what the checkout builder DOES with it:
//   1. a cart from two Spaces is no longer refused; it writes ONE order (owner_kind 'split',
//      funds_flow 'separate', no owner ids, no seller account, the fee the SUM of the two sellers'
//      fees, each share recorded) and ONE session whose PaymentIntent carries `transfer_group` = the
//      order id and none of the destination-charge fields;
//   2. a cart from one Space is the destination charge it always was, byte for byte on the Connect
//      fields, and its row says so;
//   3. the Store beside a Space is refused before any write or any Stripe call;
//   4. a second seller who cannot be paid refuses the whole cart before any write;
//   5. a refund of a separate order sends no `reverse_transfer`, because there is none on the charge.
//
// The admin client is the scripted fake from ./checkout.test.ts: every builder call is recorded, so
// the assertions read what was SENT, not what came back.

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

const connect = vi.hoisted(() => ({
  getConnectStatus: vi.fn(async (profileId: string) => ({ accountId: `acct_${profileId}`, ready: true })),
  payoutsLive: vi.fn(async () => true),
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
vi.mock('@/lib/billing/connect', () => connect)
// Each Space prices at its own rung: 5% of WHATEVER GROSS IT IS HANDED, so a fee summed per seller and a
// fee on the total happen to agree on the number (both 5% of the total). The per-share assertion below
// therefore reads the shares, not only the sum.
vi.mock('@/lib/billing/fees', () => ({
  spaceTakeRateCents: vi.fn(async (gross: number) => Math.round(gross * 0.05)),
  memberTakeRateCents: vi.fn(async (gross: number) => Math.round(gross * 0.1)),
}))
vi.mock('./order-source', () => ({ classifyOrderSource: vi.fn(async () => ({ source: 'self', attributionRef: null })) }))
vi.mock('@/lib/pricing/network-world', () => ({ effectiveOrderSource: (s: string) => s }))
vi.mock('@/lib/spaces/booking', () => ({
  confirmBookingByOrder: vi.fn(async () => {}),
  cancelBookingByOrder: vi.fn(async () => {}),
}))
vi.mock('@/lib/finance/record', () => ({ recordFinancialTransaction: vi.fn(async () => {}) }))
vi.mock('./selling', () => ({
  canTakePayments: (k: string) => k === 'space' || k === 'platform' || k === 'profile',
}))
vi.mock('./variants', () => ({ getVariantsByIds: vi.fn(async () => new Map()) }))
vi.mock('./journey-fulfilment', () => ({
  enrolByOrder: vi.fn(async () => {}),
  revokeJourneyByOrder: vi.fn(async () => {}),
}))
vi.mock('@/lib/journeys/tier-gate', () => ({ checkJourneyTier: vi.fn(async () => ({ ok: true })) }))
vi.mock('./order-receipt', () => ({ sendOrderReceipts: vi.fn(async () => {}) }))

import { createCommerceCheckout, refundCommerceOrder } from './checkout'
import { STORE_CHECKS_OUT_ALONE } from './funds-flow'

const BASE = {
  entity_id: 'ent-1',
  currency: 'usd',
  stock: 5,
  status: 'active',
  product_kind: 'physical',
  journey_plan_id: null,
}
const MUG_A = { ...BASE, id: 'p-a', owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-a', title: 'Mug', price_cents: 1000 }
const PRINT_B = { ...BASE, id: 'p-b', owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-b', title: 'Print', price_cents: 2000 }
const STORE_TEE = { ...BASE, id: 'p-s', owner_kind: 'platform', owner_profile_id: null, owner_space_id: null, title: 'Tee', price_cents: 500 }
const SPACES: Record<string, { owner_profile_id: string; plan: string; network_connected: boolean }> = {
  'sp-a': { owner_profile_id: 'owner-a', plan: 'business', network_connected: true },
  'sp-b': { owner_profile_id: 'owner-b', plan: 'business', network_connected: true },
}

function sellsHandler(products: Record<string, unknown>[]) {
  state.setHandler((c) => {
    if (c.table === 'commerce_products' && c.op === 'select') return { data: products }
    if (c.table === 'spaces' && c.op === 'select') {
      const id = c.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string
      return { data: SPACES[id] ?? null }
    }
    if (c.table === 'commerce_orders' && c.op === 'insert') return { data: { id: 'o1' } }
    if (c.table === 'commerce_order_items' && c.op === 'insert') return { data: [] }
    if (c.table === 'commerce_orders' && c.op === 'update') return { data: [{ id: 'o1' }] }
    return {}
  })
}

const orderInsert = () => state.calls.find((c) => c.table === 'commerce_orders' && c.op === 'insert')
const sessionArgs = () => stripeFake.checkout.sessions.create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  connect.getConnectStatus.mockImplementation(async (profileId: string) => ({ accountId: `acct_${profileId}`, ready: true }))
  connect.payoutsLive.mockResolvedValue(true)
  stripeFake.checkout.sessions.create.mockImplementation(async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' }))
  stripeFake.checkout.sessions.expire.mockImplementation(async () => ({}))
  stripeFake.refunds.create.mockImplementation(async () => ({ id: 're_1' }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a cart from two sellers is one order and one charge on the platform (separate)', () => {
  const input = { items: [{ productId: 'p-a', qty: 1 }, { productId: 'p-b', qty: 1 }], buyerProfileId: 'buyer-1' }

  it('is no longer refused at the door: the checkout starts and hands back the session', async () => {
    sellsHandler([MUG_A, PRINT_B])
    const res = await createCommerceCheckout(input)
    expect(res).toEqual({ url: 'https://stripe.test/cs_1', orderId: 'o1' })
  })

  it('writes ONE split order: funds_flow separate, no owner ids, no seller account, the fee the SUM of the shares', async () => {
    sellsHandler([MUG_A, PRINT_B])
    await createCommerceCheckout(input)
    const row = orderInsert()!.payload as Record<string, unknown>
    expect(row.owner_kind).toBe('split')
    expect(row.funds_flow).toBe('separate')
    expect(row.owner_profile_id).toBeNull()
    expect(row.owner_space_id).toBeNull()
    expect(row.seller_stripe_account_id).toBeNull()
    expect(row.amount_cents).toBe(3000)
    expect(row.currency).toBe('usd')
    // 5% of 1000 plus 5% of 2000: each seller priced on ITS gross, then summed.
    expect(row.platform_fee_cents).toBe(50 + 100)
    expect(row.status).toBe('pending')
    // Each share as priced at this checkout, so the ledger (LIVE-622) can pay it without re-deriving a rung.
    expect(row.metadata).toEqual({
      split: [
        { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-a', stripe_account_id: 'acct_owner-a', gross_cents: 1000, platform_fee_cents: 50 },
        { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-b', stripe_account_id: 'acct_owner-b', gross_cents: 2000, platform_fee_cents: 100 },
      ],
    })
    // Both sellers were asked, each at their own account.
    expect(connect.getConnectStatus).toHaveBeenCalledWith('owner-a')
    expect(connect.getConnectStatus).toHaveBeenCalledWith('owner-b')
  })

  it('the PaymentIntent carries transfer_group = the order id and NONE of the destination-charge fields', async () => {
    sellsHandler([MUG_A, PRINT_B])
    await createCommerceCheckout(input)
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
    const pid = sessionArgs().payment_intent_data as Record<string, unknown>
    expect(pid.transfer_group).toBe('o1')
    expect('transfer_data' in pid).toBe(false)
    expect('on_behalf_of' in pid).toBe(false)
    expect('application_fee_amount' in pid).toBe(false)
    expect(pid.metadata).toEqual({ kind: 'commerce_order', buyer_profile_id: 'buyer-1', order_id: 'o1' })
    // Every line still reaches Stripe, in the cart's currency, so the charge is the whole cart.
    const lines = sessionArgs().line_items as { quantity: number; price_data: { currency: string; unit_amount: number } }[]
    expect(lines.map((l) => l.price_data.unit_amount)).toEqual([1000, 2000])
    expect(lines.every((l) => l.price_data.currency === 'usd')).toBe(true)
    // A split cart is never the Store, so cancel goes back to the Market.
    expect(sessionArgs().cancel_url).toBe('https://app.test/market')
  })

  it('a second seller who cannot be paid refuses the WHOLE cart before any write or any Stripe call', async () => {
    sellsHandler([MUG_A, PRINT_B])
    connect.getConnectStatus.mockImplementation(async (profileId: string) =>
      profileId === 'owner-b' ? { accountId: null, ready: false } : { accountId: `acct_${profileId}`, ready: true },
    )
    const res = await createCommerceCheckout(input)
    expect(res.error).toBe('This storefront can’t take payment yet.')
    expect(orderInsert()).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('the Frequency Store beside another seller is refused before any write or any Stripe call', async () => {
    sellsHandler([MUG_A, STORE_TEE])
    const res = await createCommerceCheckout({ items: [{ productId: 'p-a', qty: 1 }, { productId: 'p-s', qty: 1 }], buyerProfileId: 'buyer-1' })
    expect(res.error).toBe(STORE_CHECKS_OUT_ALONE)
    expect(orderInsert()).toBeUndefined()
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
  })
})

describe('a cart from one seller is the destination charge it always was', () => {
  it('writes funds_flow destination with the seller named, and the Connect fields on the PaymentIntent', async () => {
    sellsHandler([MUG_A])
    const res = await createCommerceCheckout({ items: [{ productId: 'p-a', qty: 2 }], buyerProfileId: 'buyer-1' })
    expect(res).toEqual({ url: 'https://stripe.test/cs_1', orderId: 'o1' })
    const row = orderInsert()!.payload as Record<string, unknown>
    expect(row.owner_kind).toBe('space')
    expect(row.owner_space_id).toBe('sp-a')
    expect(row.funds_flow).toBe('destination')
    expect(row.seller_stripe_account_id).toBe('acct_owner-a')
    expect(row.amount_cents).toBe(2000)
    expect(row.platform_fee_cents).toBe(100)
    expect('metadata' in row).toBe(false)
    const pid = sessionArgs().payment_intent_data as Record<string, unknown>
    expect(pid.application_fee_amount).toBe(100)
    expect(pid.transfer_data).toEqual({ destination: 'acct_owner-a' })
    expect(pid.on_behalf_of).toBe('acct_owner-a')
    expect('transfer_group' in pid).toBe(false)
  })

  it('the Store on its own is a plain platform charge: destination flow, no Connect fields, no transfer_group', async () => {
    sellsHandler([STORE_TEE])
    await createCommerceCheckout({ items: [{ productId: 'p-s', qty: 1 }], buyerProfileId: 'buyer-1' })
    const row = orderInsert()!.payload as Record<string, unknown>
    expect(row.owner_kind).toBe('platform')
    expect(row.funds_flow).toBe('destination')
    const pid = sessionArgs().payment_intent_data as Record<string, unknown>
    expect('transfer_data' in pid).toBe(false)
    expect('transfer_group' in pid).toBe(false)
    expect(sessionArgs().cancel_url).toBe('https://app.test/store')
  })
})

describe('refunding a separate order reverses no transfer on the charge (there is none)', () => {
  it('sends a plain refund, where a destination order still reverses its transfer and fee', async () => {
    const orders: Record<string, Record<string, unknown>> = {
      split: { id: 'o-split', owner_kind: 'split', funds_flow: 'separate', status: 'paid', amount_cents: 3000, stripe_payment_intent_id: 'pi_split', refunded_at: null },
      dest: { id: 'o-dest', owner_kind: 'space', funds_flow: 'destination', status: 'paid', amount_cents: 2000, stripe_payment_intent_id: 'pi_dest', refunded_at: null },
    }
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select' && c.single) {
        const id = c.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2] as string
        return { data: Object.values(orders).find((o) => o.id === id) ?? null }
      }
      return {}
    })
    expect(await refundCommerceOrder('o-split')).toEqual({ ok: true })
    expect(await refundCommerceOrder('o-dest')).toEqual({ ok: true })
    const [splitRefund, destRefund] = stripeFake.refunds.create.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(splitRefund.payment_intent).toBe('pi_split')
    expect('reverse_transfer' in splitRefund).toBe(false)
    expect('refund_application_fee' in splitRefund).toBe(false)
    expect(destRefund).toMatchObject({ payment_intent: 'pi_dest', reverse_transfer: true, refund_application_fee: true })
  })
})
