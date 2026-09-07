import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// COMMERCE CHECKOUT + REFUND (lib/commerce/checkout.ts). MONEY CODE. Three locks from scan L6
// (2026-09-05), each written against the fake-client pattern of ./orders.test.ts:
//   L6-03  createCommerceCheckout writes the pending order + items BEFORE the Stripe session, checks
//          every write, and never hands out a URL for an order that does not exist.
//   L6-08  a policy PARTIAL refund is recorded as partial: status kept, refunded_at stamped once,
//          ledger reversal pro-rated; the charge.refunded webhook understands partials too.
//   L6-16  a FULL refund restores tracked stock once per order. LIVE-161 (2026-09-06) moved that
//          restore into restore_commerce_stock_atomic: one RPC, one transaction, no app-side
//          compare-and-swap loop and no separate marker write to race.
// The admin client is a scripted fake: every builder call is recorded (table, op, payload, filters)
// and resolved by a per-test handler, so the assertions read the WRITES, not the return values.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
  single?: boolean
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  const events: string[] = []
  let handler: (call: Call) => { data?: unknown; error?: { message: string } | null } = () => ({})
  return {
    calls,
    events,
    setHandler(h: typeof handler) {
      handler = h
    },
    run(call: Call) {
      calls.push(call)
      events.push(`${call.op}:${call.table}`)
      const out = handler(call)
      return { data: out.data === undefined ? (call.single ? null : []) : out.data, error: out.error ?? null }
    },
    reset() {
      calls.length = 0
      events.length = 0
      handler = () => ({})
    },
  }
})

const stripeFake = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn(),
      expire: vi.fn(),
    },
  },
  refunds: { create: vi.fn() },
}))

const ledger = vi.hoisted(() => ({ recordFinancialTransaction: vi.fn(async (_row: Record<string, unknown>) => {}) }))
const booking = vi.hoisted(() => ({
  confirmBookingByOrder: vi.fn(async () => {}),
  cancelBookingByOrder: vi.fn(async () => {}),
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
  getConnectStatus: vi.fn(async () => ({ accountId: 'acct_1', ready: true })),
  payoutsLive: vi.fn(async () => true),
}))
vi.mock('@/lib/billing/fees', () => ({
  spaceTakeRateCents: vi.fn(async () => 0),
  memberTakeRateCents: vi.fn(async () => 0),
}))
vi.mock('./order-source', () => ({ classifyOrderSource: vi.fn(async () => ({ source: 'self', attributionRef: null })) }))
vi.mock('@/lib/pricing/network-world', () => ({ effectiveOrderSource: (s: string) => s }))
vi.mock('@/lib/spaces/booking', () => booking)
vi.mock('@/lib/finance/record', () => ledger)
// The role gate. Default = production truth (space / platform only). The SCAN-539 block below flips
// `allowProfile` so the individual-seller branch of resolveCharge — which canTakePayments currently
// keeps unreachable from this entry point — can still be exercised.
const selling = vi.hoisted(() => ({ allowProfile: false }))
vi.mock('./selling', () => ({
  canTakePayments: (k: string) => k === 'space' || k === 'platform' || (selling.allowProfile && k === 'profile'),
}))
vi.mock('./variants', () => ({ getVariantsByIds: vi.fn(async () => new Map()) }))

import {
  createCommerceCheckout,
  refundCommerceOrder,
  recordCommerceRefund,
  recordCommerceRefundFromCharge,
} from './checkout'

const PRODUCT = {
  id: 'p1',
  owner_kind: 'platform',
  owner_profile_id: null,
  owner_space_id: null,
  entity_id: 'ent-1',
  title: 'Tee',
  price_cents: 1000,
  currency: 'usd',
  stock: 5,
  status: 'active',
}

function firstCall(pred: (c: Call) => boolean): Call | undefined {
  return state.calls.find(pred)
}
function hasFilter(c: Call, op: string, k: string, v?: unknown): boolean {
  return c.filters.some((f) => f[0] === op && f[1] === k && (v === undefined || JSON.stringify(f[2]) === JSON.stringify(v)))
}

beforeEach(() => {
  state.reset()
  selling.allowProfile = false
  vi.clearAllMocks()
  stripeFake.checkout.sessions.create.mockImplementation(async () => ({ id: 'cs_1', url: 'https://stripe.test/cs_1' }))
  stripeFake.checkout.sessions.expire.mockImplementation(async () => ({}))
  stripeFake.refunds.create.mockImplementation(async () => ({ id: 're_1' }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── L6-03 ────────────────────────────────────────────────────────────────────────────────────────

describe('createCommerceCheckout — the order exists before Stripe can take money (L6-03)', () => {
  const input = { items: [{ productId: 'p1', qty: 2 }], buyerProfileId: 'buyer-1' }

  function happyHandler(overrides: Partial<Record<string, (c: Call) => { data?: unknown; error?: { message: string } | null }>> = {}) {
    state.setHandler((c) => {
      if (c.table === 'commerce_products' && c.op === 'select') return { data: [PRODUCT] }
      if (c.table === 'commerce_orders' && c.op === 'insert') return overrides.orderInsert?.(c) ?? { data: { id: 'o1' } }
      if (c.table === 'commerce_order_items' && c.op === 'insert') return overrides.itemsInsert?.(c) ?? { data: [] }
      if (c.table === 'commerce_orders' && c.op === 'update') {
        const patch = c.payload as Record<string, unknown>
        if ('stripe_checkout_session_id' in patch) return overrides.link?.(c) ?? { data: [{ id: 'o1' }] }
        return { data: [{ id: 'o1' }] }
      }
      return {}
    })
  }

  it('inserts the pending order + items FIRST, then creates the session carrying order_id, then links it', async () => {
    happyHandler()
    const res = await createCommerceCheckout(input)
    expect(res).toEqual({ url: 'https://stripe.test/cs_1', orderId: 'o1' })

    // Order of operations, by the recorded event stream: order insert → items insert → (Stripe) → link.
    const orderIdx = state.events.indexOf('insert:commerce_orders')
    const itemsIdx = state.events.indexOf('insert:commerce_order_items')
    const linkIdx = state.events.indexOf('update:commerce_orders')
    expect(orderIdx).toBeGreaterThanOrEqual(0)
    expect(itemsIdx).toBeGreaterThan(orderIdx)
    expect(linkIdx).toBeGreaterThan(itemsIdx)
    // The pending row is written WITHOUT a session id (there is none yet), status pending.
    const orderInsert = firstCall((c) => c.table === 'commerce_orders' && c.op === 'insert')!
    const row = orderInsert.payload as Record<string, unknown>
    expect(row.status).toBe('pending')
    expect(row.amount_cents).toBe(2000)
    expect('stripe_checkout_session_id' in row).toBe(false)
    // The session was created AFTER the items insert and carries the order id in both metadata slots.
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
    const args = stripeFake.checkout.sessions.create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams
    expect(args.metadata).toEqual({ kind: 'commerce_order', buyer_profile_id: 'buyer-1', order_id: 'o1' })
    // The link is a CHECKED conditional update on the pending row, and it is what the webhook keys on.
    const link = firstCall((c) => c.table === 'commerce_orders' && c.op === 'update')!
    expect(link.payload).toEqual({ stripe_checkout_session_id: 'cs_1' })
    expect(hasFilter(link, 'eq', 'id', 'o1')).toBe(true)
    expect(hasFilter(link, 'eq', 'status', 'pending')).toBe(true)
    expect(stripeFake.checkout.sessions.expire).not.toHaveBeenCalled()
  })

  it('a failed order insert returns the error shape and NEVER creates a Stripe session', async () => {
    happyHandler({ orderInsert: () => ({ data: null, error: { message: 'rls' } }) })
    const res = await createCommerceCheckout(input)
    expect(res.url).toBeUndefined()
    expect(res.error).toMatch(/Could not start checkout/)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    expect(firstCall((c) => c.table === 'commerce_order_items')).toBeUndefined()
  })

  it('a failed items insert marks the order failed (guarded on pending) and creates no session', async () => {
    happyHandler({ itemsInsert: () => ({ error: { message: 'fk' } }) })
    const res = await createCommerceCheckout(input)
    expect(res.error).toMatch(/Could not start checkout/)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    const failed = firstCall((c) => c.table === 'commerce_orders' && c.op === 'update')!
    expect(failed.payload).toEqual({ status: 'failed', metadata: { checkout_failure: 'items_insert_failed' } })
    expect(hasFilter(failed, 'eq', 'id', 'o1')).toBe(true)
    expect(hasFilter(failed, 'eq', 'status', 'pending')).toBe(true)
  })

  it('a Stripe failure marks the order failed and returns an error (no dangling pending row)', async () => {
    happyHandler()
    stripeFake.checkout.sessions.create.mockRejectedValueOnce(new Error('stripe down'))
    const res = await createCommerceCheckout(input)
    expect(res.error).toMatch(/Could not start checkout/)
    const failed = firstCall((c) => c.table === 'commerce_orders' && c.op === 'update')!
    expect((failed.payload as { status: string }).status).toBe('failed')
    expect((failed.payload as { metadata: { checkout_failure: string } }).metadata.checkout_failure).toBe('stripe_session_failed')
  })

  it('a failed session link expires the session (so it can never be paid into a void) and marks the order failed', async () => {
    happyHandler({ link: () => ({ data: [], error: { message: 'timeout' } }) })
    const res = await createCommerceCheckout(input)
    expect(res.error).toMatch(/Could not start checkout/)
    expect(stripeFake.checkout.sessions.expire).toHaveBeenCalledWith('cs_1')
    const updates = state.calls.filter((c) => c.table === 'commerce_orders' && c.op === 'update')
    expect(updates.map((u) => (u.payload as { status?: string }).status)).toEqual([undefined, 'failed'])
  })
})

// ── L6-08 ────────────────────────────────────────────────────────────────────────────────────────

const PAID_ORDER = {
  id: 'o1',
  owner_kind: 'platform',
  status: 'paid',
  amount_cents: 1000,
  stripe_payment_intent_id: 'pi_1',
  refunded_at: null,
}
const REFUND_ROW = {
  id: 'o1',
  owner_kind: 'platform',
  entity_id: 'ent-1',
  amount_cents: 1000,
  platform_fee_cents: 0,
  buyer_profile_id: 'buyer-1',
  currency: 'usd',
  metadata: {},
}

describe('refundCommerceOrder — a policy PARTIAL refund is recorded as partial (L6-08)', () => {
  function bookingHandler(opts: { stampRows?: unknown[]; refundedAt?: string | null } = {}) {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select' && hasFilter(c, 'eq', 'id', 'o1')) {
        return { data: { ...PAID_ORDER, ...REFUND_ROW, refunded_at: opts.refundedAt ?? null } }
      }
      if (c.table === 'commerce_orders' && c.op === 'select' && hasFilter(c, 'eq', 'stripe_payment_intent_id', 'pi_1')) {
        return { data: { id: 'o1', amount_cents: 1000 } }
      }
      // A booking one hour out, on a service with a 50% fee inside a 24h window → refund 50%.
      if (c.table === 'space_bookings') {
        return { data: { starts_at: new Date(Date.now() + 3_600_000).toISOString(), product_id: 'svc-1' } }
      }
      if (c.table === 'commerce_products') {
        return { data: { product_kind: 'service', metadata: { service: { noShowFeePct: 50, cancellationWindowHours: 24 } } } }
      }
      if (c.table === 'commerce_orders' && c.op === 'update') return { data: opts.stampRows ?? [{ id: 'o1' }] }
      return {}
    })
  }

  it('sends the partial amount to Stripe, keeps the status, stamps refunded_at once, reverses only the refunded share', async () => {
    bookingHandler()
    const res = await refundCommerceOrder('o1')
    expect(res).toEqual({ ok: true })
    expect(stripeFake.refunds.create).toHaveBeenCalledTimes(1)
    expect((stripeFake.refunds.create.mock.calls[0][0] as { amount?: number }).amount).toBe(500)

    const updates = state.calls.filter((c) => c.table === 'commerce_orders' && c.op === 'update')
    expect(updates).toHaveLength(1)
    const stamp = updates[0]
    const patch = stamp.payload as { status?: string; refunded_at: string; metadata: { refund: Record<string, unknown> } }
    // NOT flipped to 'refunded': the schema has no partial state, so the settled status stands.
    expect(patch.status).toBeUndefined()
    expect(typeof patch.refunded_at).toBe('string')
    expect(patch.metadata.refund).toMatchObject({ kind: 'partial', refunded_cents: 500, retained_cents: 500, revenue_reversed_cents: 500 })
    // The once-only guard: status still settled AND refunded_at still null.
    expect(hasFilter(stamp, 'in', 'status', ['paid', 'fulfilled'])).toBe(true)
    expect(hasFilter(stamp, 'is', 'refunded_at', null)).toBe(true)
    // Ledger: the refunded share only, on its own idempotency key.
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(ledger.recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      revenueType: 'refund',
      amountCents: -500,
      idempotencyKey: 'commerce_order-refund:o1:partial',
    })
    // The policy cancel releases the slot.
    expect(booking.cancelBookingByOrder).toHaveBeenCalledWith('o1')
  })

  it('a second call on the partially refunded order is a no-op (refunded_at is the guard), never a second Stripe refund', async () => {
    bookingHandler({ refundedAt: '2026-09-05T00:00:00.000Z' })
    const res = await refundCommerceOrder('o1')
    expect(res).toEqual({ ok: true })
    expect(stripeFake.refunds.create).not.toHaveBeenCalled()
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('the charge.refunded webhook for that same partial refund records nothing twice', async () => {
    bookingHandler({ stampRows: [] }) // the guard finds refunded_at already set → zero rows stamped
    await recordCommerceRefundFromCharge({ amount: 1000, amount_refunded: 500, payment_intent: 'pi_1' } as unknown as Stripe.Charge)
    // It took the partial path (no status flip was even attempted)...
    const flips = state.calls.filter(
      (c) => c.table === 'commerce_orders' && c.op === 'update' && (c.payload as { status?: string }).status === 'refunded',
    )
    expect(flips).toHaveLength(0)
    // ...and with zero rows stamped, no ledger row and no booking release.
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
    expect(booking.cancelBookingByOrder).not.toHaveBeenCalled()
  })

  it('a later FULL refund reverses only the revenue the partial did not already reverse', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'update' && (c.payload as { status?: string }).status === 'refunded') {
        return {
          data: [
            {
              ...REFUND_ROW,
              metadata: { refund: { kind: 'partial', refunded_cents: 500, retained_cents: 500, revenue_reversed_cents: 500 } },
            },
          ],
        }
      }
      return {}
    })
    await recordCommerceRefundFromCharge({ amount: 1000, amount_refunded: 1000, payment_intent: 'pi_1' } as unknown as Stripe.Charge)
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(ledger.recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      amountCents: -500,
      idempotencyKey: 'commerce_order-refund:o1',
    })
  })
})

// ── L6-16 ────────────────────────────────────────────────────────────────────────────────────────

describe('recordCommerceRefund — a full refund puts tracked stock back on the shelf, atomically (L6-16 / LIVE-161)', () => {
  // LIVE-161 (2026-09-06): the restore used to be, per item, a stock read + a compare-and-swap
  // write retried five times, then a fourth request stamping metadata.inventory_restored. That is
  // four round trips over a money path, and it could exhaust its retries and drop the units.
  // It is now ONE call to restore_commerce_stock_atomic (migration 20270345001600), which owns the
  // idempotency check, both increments and the marker inside one transaction under a for-update
  // lock on the order. These tests assert the CALL and the absence of the old table traffic —
  // whether the SQL restores the right rows is proven in the migration, against Postgres.
  function handler(opts: { rpcError?: { message: string } } = {}) {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'update' && (c.payload as { status?: string }).status === 'refunded') {
        return { data: [{ ...REFUND_ROW, metadata: { inventory_decremented: true } }] }
      }
      if (c.table === 'rpc:restore_commerce_stock_atomic' && opts.rpcError) return { error: opts.rpcError }
      return {}
    })
  }

  it('hands the whole restore to ONE atomic RPC, keyed on the order it just flipped', async () => {
    handler()
    await recordCommerceRefund('pi_1')
    const flip = firstCall((c) => c.table === 'commerce_orders' && (c.payload as { status?: string })?.status === 'refunded')
    expect(flip).toBeDefined()
    const rpc = firstCall((c) => c.table === 'rpc:restore_commerce_stock_atomic')!
    expect(rpc.payload).toEqual({ _order: 'o1' })
    // The ledger reversal and the booking release still happen.
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(booking.cancelBookingByOrder).toHaveBeenCalledWith('o1')
  })

  it('no longer reads or writes stock from the app at all — no item walk, no compare-and-swap, no marker write', async () => {
    handler()
    await recordCommerceRefund('pi_1')
    // The four round trips the RPC replaced. Any of these coming back means the race came back.
    expect(firstCall((c) => c.table === 'commerce_order_items')).toBeUndefined()
    expect(firstCall((c) => c.table === 'commerce_products')).toBeUndefined()
    expect(firstCall((c) => c.table === 'commerce_variants')).toBeUndefined()
    expect(
      firstCall((c) => c.table === 'commerce_orders' && c.op === 'update' && 'metadata' in (c.payload as object)),
    ).toBeUndefined()
  })

  it('a failed restore is logged loudly and never throws (the refund itself still stands)', async () => {
    handler({ rpcError: { message: 'deadlock detected' } })
    await expect(recordCommerceRefund('pi_1')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('stock restore failed'),
      expect.objectContaining({ orderId: 'o1', error: 'deadlock detected' }),
    )
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })

  it('a redelivered charge.refunded flips nothing and therefore restores nothing (exactly once)', async () => {
    state.setHandler(() => ({})) // the flip finds no paid/fulfilled row
    await recordCommerceRefund('pi_1')
    expect(firstCall((c) => c.table === 'rpc:restore_commerce_stock_atomic')).toBeUndefined()
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })
})

// ── SCAN-539 ─────────────────────────────────────────────────────────────────────────────────────
// resolveCharge reads the seller's REAL `profiles.membership_tier` to pick the take-rate rung (free
// Member 10%, Crew 8%). A PostgREST failure arrives in `error`, not as a throw, so the unchecked read
// fell through as `sellerTier = null` and billed a Crew seller the free rung's 10% on a rate they had
// paid to buy down to 8%. DIRECTION: fail CLOSED on the TRANSACTION — refuse rather than take real
// money at a rate we could not verify. A genuinely absent row (no error) still prices at the free rung.

describe('createCommerceCheckout — an unreadable seller tier never charges an unverified rate (SCAN-539)', () => {
  const PROFILE_PRODUCT = {
    ...PRODUCT,
    owner_kind: 'profile',
    owner_profile_id: 'seller-1',
    owner_space_id: null,
  }
  const input = { items: [{ productId: 'p1', qty: 2 }], buyerProfileId: 'buyer-1' }

  function handler(profilesResult: { data?: unknown; error?: { message: string } | null }) {
    state.setHandler((c) => {
      if (c.table === 'commerce_products' && c.op === 'select') return { data: [PROFILE_PRODUCT] }
      if (c.table === 'profiles' && c.op === 'select') return profilesResult
      if (c.table === 'commerce_orders' && c.op === 'insert') return { data: { id: 'o1' } }
      if (c.table === 'commerce_order_items' && c.op === 'insert') return { data: [] }
      if (c.table === 'commerce_orders' && c.op === 'update') return { data: [{ id: 'o1' }] }
      return {}
    })
  }

  it('refuses the checkout, writes no order and opens no session', async () => {
    selling.allowProfile = true
    handler({ data: null, error: { message: '57014 statement timeout' } })

    const res = await createCommerceCheckout(input)

    expect(res.url).toBeUndefined()
    expect(res.error).toMatch(/Could not start checkout/)
    expect(stripeFake.checkout.sessions.create).not.toHaveBeenCalled()
    // The refusal happens in fee resolution, BEFORE the pending order is written.
    expect(state.events).not.toContain('insert:commerce_orders')
  })

  it('still sells on a clean read (the guard bites only on an unreadable tier)', async () => {
    selling.allowProfile = true
    handler({ data: { membership_tier: 'crew' } })

    const res = await createCommerceCheckout(input)

    expect(res.url).toBe('https://stripe.test/cs_1')
    expect(stripeFake.checkout.sessions.create).toHaveBeenCalledTimes(1)
  })
})
