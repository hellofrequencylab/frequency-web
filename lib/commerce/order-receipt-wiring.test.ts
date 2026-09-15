import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// COMMERCE, THE SETTLE SIDE OF LIVE-344. `recordCommerceOrderFromSession` now tells the buyer and the
// seller. Stripe redelivers, so the thing to pin is that it tells them EXACTLY ONCE: the settle sends
// only for a row THIS delivery flipped `pending` -> `paid`, and a redelivery flips none.
//
// It also pins the fact the receipts depend on: the flip's `.select()` carries owner_profile_id and
// owner_space_id, so the seller is resolvable without a second read. Drop those columns and the
// seller silently stops being notified, which is the exact shape of the defect this row names.

type Result = { data?: unknown; error?: unknown }

const state = vi.hoisted(() => {
  const updates: Result[] = []
  const selects: string[] = []
  return {
    updates,
    selects,
    reset() {
      updates.length = 0
      selects.length = 0
    },
  }
})

vi.mock('@/lib/supabase/admin', () => {
  const build = () => {
    const b: Record<string, unknown> = {}
    for (const k of ['eq', 'in', 'update', 'insert', 'maybeSingle', 'order', 'limit']) b[k] = () => b
    b.select = (cols?: string) => {
      if (cols) state.selects.push(cols)
      return b
    }
    b.then = (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(state.updates.shift() ?? { data: [], error: null }).then(res, rej)
    return b
  }
  return {
    createAdminClient: () => ({ from: () => build(), rpc: async () => ({ data: null, error: null }) }),
  }
})

const receipts = vi.hoisted(() => ({ order: vi.fn(async (_a: Record<string, unknown>) => {}) }))
vi.mock('./order-receipt', () => ({ sendOrderReceipts: receipts.order, ORDER_SOLD_NOTIFICATION_TYPE: 'x' }))

vi.mock('@/lib/finance/record', () => ({ recordFinancialTransaction: vi.fn(async () => ({ recorded: true })) }))
vi.mock('@/lib/spaces/booking', () => ({
  confirmBookingByOrder: vi.fn(async () => {}),
  cancelBookingByOrder: vi.fn(async () => {}),
}))
vi.mock('@/lib/billing/stripe', () => ({ stripe: null, appUrl: () => 'https://freq.test' }))
vi.mock('@/lib/billing/connect', () => ({
  getConnectStatus: async () => ({ accountId: null, ready: false }),
  payoutsLive: async () => false,
}))
vi.mock('@/lib/billing/receipt-address', () => ({ receiptEmailFor: async () => undefined }))

import { recordCommerceOrderFromSession } from './checkout'

const paidRow = {
  id: 'order-1',
  owner_kind: 'space',
  owner_profile_id: null,
  owner_space_id: 'space-1',
  entity_id: 'e-1',
  amount_cents: 2400,
  platform_fee_cents: 120,
  buyer_profile_id: 'buyer-1',
  currency: 'usd',
}

function session(): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    metadata: { kind: 'commerce_order' },
    customer_details: { email: 'buyer@example.test' },
  } as unknown as Stripe.Checkout.Session
}

beforeEach(() => {
  vi.clearAllMocks()
  state.reset()
})

describe('recordCommerceOrderFromSession', () => {
  it('sends the receipts once for the row it flipped, and nothing on the redelivery', async () => {
    state.updates.push({ data: [paidRow], error: null }, { data: [], error: null })
    await recordCommerceOrderFromSession(session())
    await recordCommerceOrderFromSession(session())
    expect(receipts.order).toHaveBeenCalledTimes(1)
  })

  it('hands the receipts the seller, the buyer and the address Stripe collected', async () => {
    state.updates.push({ data: [paidRow], error: null })
    await recordCommerceOrderFromSession(session())
    expect(receipts.order.mock.calls[0][0]).toEqual({
      id: 'order-1',
      ownerKind: 'space',
      ownerProfileId: null,
      ownerSpaceId: 'space-1',
      buyerProfileId: 'buyer-1',
      amountCents: 2400,
      currency: 'usd',
      buyerEmail: 'buyer@example.test',
    })
  })

  it('the flip reads back the owner columns the seller notice needs', async () => {
    state.updates.push({ data: [paidRow], error: null })
    await recordCommerceOrderFromSession(session())
    const cols = state.selects.join(' ')
    expect(cols).toContain('owner_profile_id')
    expect(cols).toContain('owner_space_id')
  })

  it('an unpaid session flips nothing and sends nothing', async () => {
    const unpaid = { ...session(), payment_status: 'unpaid' } as unknown as Stripe.Checkout.Session
    await recordCommerceOrderFromSession(unpaid)
    expect(receipts.order).not.toHaveBeenCalled()
  })

  it('a session that is not an order is not ours and sends nothing', async () => {
    const other = { ...session(), metadata: { kind: 'tip' } } as unknown as Stripe.Checkout.Session
    await recordCommerceOrderFromSession(other)
    expect(receipts.order).not.toHaveBeenCalled()
  })
})
