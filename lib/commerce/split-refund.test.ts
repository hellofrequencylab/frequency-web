import { describe, it, expect, vi, beforeEach } from 'vitest'

// A SPLIT REFUND (LIVE-623, ADR-1615). MONEY CODE.
//
// What this file pins, against an in-memory ledger and an in-memory Stripe that both keep state, so
// "once" is measured as the reversals that EXIST and the cents they move, not the calls made:
//   1. proportionRefund: the shares sum exactly to the refund, the rounding is largest remainder,
//      a reversal never exceeds its transfer, and a full refund returns each transfer exactly;
//   2. a full refund reverses each seller's whole transfer;
//   3. a partial refund reverses each seller's pro rata part, and a later top-up only the rest;
//   4. a replayed refund (webhook redelivery, the action and its own webhook, a replay after the key
//      window) reverses once;
//   5. a refund before the transfers were made cancels them and reverses nothing, and a transfer
//      already at Stripe when the cancel ran is taken back after it lands;
//   6. a reversal that fails is owed, stops no other seller, is retried by the reconciler once, and
//      is logged as stuck past the ceiling;
//   7. a destination-flow order is never touched;
//   8. a partial refund that writes a split order's first plan tells each seller it planned of the
//      sale, once, and a notice that fails is logged and holds up nothing (LIVE-739).

type Row = Record<string, unknown>

const db = vi.hoisted(() => {
  const tables = new Map<string, Row[]>()
  let seq = 0
  let clock = Date.parse('2026-09-29T12:00:00Z')
  const failures: { table: string; op: string; message: string }[] = []
  return {
    tables,
    failures,
    now: () => clock,
    advance(ms: number) {
      clock += ms
    },
    nextId: () => `row-${++seq}`,
    reset() {
      tables.clear()
      failures.length = 0
      seq = 0
      clock = Date.parse('2026-09-29T12:00:00Z')
    },
    rows(table: string): Row[] {
      if (!tables.has(table)) tables.set(table, [])
      return tables.get(table)!
    },
  }
})

const TRANSFER_DEFAULTS = (): Row => ({
  status: 'planned',
  attempts: 0,
  reversed_cents: 0,
  refund_reversal_cents: 0,
  reversal_attempts: 0,
  reversal_refusals: 0,
  reversal_attempt_floor: 0,
  reversal_lease_until: '1970-01-01T00:00:00.000Z',
  last_error: null,
  stripe_transfer_id: null,
  source_charge_id: null,
  platform_fee_cents: 0,
  currency: 'usd',
  created_at: new Date(db.now()).toISOString(),
  updated_at: new Date(db.now()).toISOString(),
})

/** The generated columns, as Postgres keeps them. */
function regenerate(table: string) {
  if (table !== 'commerce_order_transfers') return
  for (const r of db.rows(table)) {
    r.reversal_owed_cents = Math.max(Number(r.refund_reversal_cents) - Number(r.reversed_cents), 0)
    r.reversal_attempts_since_target = Number(r.reversal_attempts) - Number(r.reversal_attempt_floor ?? 0)
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'update' | 'upsert' = 'select'
      let payload: unknown
      let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
      let cols = ''
      let single = false
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      const run = () => {
        const fail = db.failures.findIndex((f) => f.table === table && f.op === op)
        if (fail >= 0) {
          const [f] = db.failures.splice(fail, 1)
          return { data: null, error: { message: f.message } }
        }
        regenerate(table)
        const all = db.rows(table)
        if (op === 'upsert') {
          const keys = (upsertOpts.onConflict ?? '').split(',')
          const inserted: Row[] = []
          for (const r of payload as Row[]) {
            if (all.some((x) => keys.every((k) => x[k] === r[k])) && upsertOpts.ignoreDuplicates) continue
            const row = { ...TRANSFER_DEFAULTS(), id: db.nextId(), ...r }
            all.push(row)
            inserted.push({ ...row })
          }
          regenerate(table)
          return { data: inserted, error: null }
        }
        let hits = all.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          for (const r of hits) Object.assign(r, payload as Row)
          regenerate(table)
          return { data: hits.map((r) => ({ ...r })), error: null }
        }
        if (order) {
          const { col, asc } = order
          hits = [...hits].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
        }
        hits = hits.slice(0, limit)
        let out = hits.map((r) => ({ ...r }))
        if (cols.includes('commerce_order_transfers(')) {
          out = out.map((o) => ({ ...o, commerce_order_transfers: db.rows('commerce_order_transfers').filter((t) => t.order_id === o.id).map((t) => ({ id: t.id })) }))
        }
        if (single) return { data: out[0] ?? null, error: null }
        return { data: out, error: null }
      }
      const where = (f: (r: Row) => boolean) => {
        filters.push(f)
        return b
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: (c = '') => {
          cols = c
          return b
        },
        update: (v: unknown) => {
          op = 'update'
          payload = v
          return b
        },
        upsert: (v: unknown, o: typeof upsertOpts = {}) => {
          op = 'upsert'
          payload = v
          upsertOpts = o
          return b
        },
        eq: (k: string, v: unknown) => where((r) => r[k] === v),
        in: (k: string, v: unknown[]) => where((r) => v.includes(r[k])),
        is: (k: string, v: unknown) => where((r) => (r[k] ?? null) === v),
        lt: (k: string, v: number | string) => where((r) => (r[k] as number | string) < v),
        lte: (k: string, v: number | string) => where((r) => (r[k] as number | string) <= v),
        gt: (k: string, v: number | string) => where((r) => (r[k] as number | string) > v),
        gte: (k: string, v: number | string) => where((r) => (r[k] as number | string) >= v),
        order: (col: string, o: { ascending?: boolean } = {}) => {
          order = { col, asc: o.ascending !== false }
          return b
        },
        limit: (n: number) => {
          limit = n
          return b
        },
        maybeSingle: () => {
          single = true
          return b
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve().then(run).then(resolve, reject),
      }
      return b
    },
  }),
}))

// Stripe, with memory. A transfer keeps its cumulative amount_reversed, as Stripe does; a request
// made under a key is answered again for that key until `byKey` is cleared (the 24 hour window),
// AND SO IS A REFUSAL: Stripe stores the error a request ended in under its key too (SCAN-649), so
// a retry under the same key gets the stored refusal back whatever the balance is now.
// Stripe refuses a reversal of more than is left on the transfer.
const stripeState = vi.hoisted(() => {
  const transfers: Record<string, unknown>[] = []
  const reversals: { id: string; transfer: string; amount: number; key: string }[] = []
  const byKey = new Map<string, unknown>()
  const plan = {
    failReversalFor: new Set<string>(),
    retrieveFails: false,
    /** Runs inside transfers.create, after the claim and before the transfer exists. */
    duringCreate: null as null | (() => Promise<void>),
    /** Runs inside transfers.createReversal, after the claim and the amount_reversed read, before
     *  the reversal exists: the window a second refund used to slip into. */
    duringReversal: null as null | (() => Promise<void>),
  }
  return { transfers, reversals, byKey, plan }
})

/** A refusal as stripe-node raises it: it ran, Stripe said no. */
function stripeRefusal(message: string, code: string) {
  return Object.assign(new Error(message), { type: 'StripeInvalidRequestError', rawType: 'invalid_request_error', code })
}

const stripeFake = vi.hoisted(() => ({
  transfers: {
    create: vi.fn(async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
      const hook = stripeState.plan.duringCreate
      stripeState.plan.duringCreate = null
      if (hook) await hook()
      const seen = stripeState.byKey.get(opts.idempotencyKey)
      if (seen) return seen
      const t = { id: `tr_${stripeState.transfers.length + 1}`, amount_reversed: 0, ...params }
      stripeState.transfers.push(t)
      stripeState.byKey.set(opts.idempotencyKey, t)
      return t
    }),
    list: vi.fn(async (q: { transfer_group: string }) => ({
      data: stripeState.transfers.filter((t) => t.transfer_group === q.transfer_group),
    })),
    retrieve: vi.fn(async (id: string) => {
      if (stripeState.plan.retrieveFails) throw new Error('Stripe is unreachable')
      const t = stripeState.transfers.find((x) => x.id === id)
      if (!t) throw new Error(`No such transfer: ${id}`)
      return { ...t }
    }),
    createReversal: vi.fn(async (id: string, params: { amount: number }, opts: { idempotencyKey: string }) => {
      const seen = stripeState.byKey.get(opts.idempotencyKey)
      if (seen instanceof Error) throw seen
      if (seen) return seen
      const hook = stripeState.plan.duringReversal
      stripeState.plan.duringReversal = null
      if (hook) await hook()
      const t = stripeState.transfers.find((x) => x.id === id)
      if (!t) throw new Error(`No such transfer: ${id}`)
      const refuse = (err: Error) => {
        stripeState.byKey.set(opts.idempotencyKey, err)
        throw err
      }
      if (stripeState.plan.failReversalFor.has(t.destination as string)) {
        refuse(stripeRefusal('Insufficient funds in the connected account to reverse this transfer', 'balance_insufficient'))
      }
      if ((t.amount_reversed as number) + params.amount > (t.amount as number)) {
        refuse(stripeRefusal('Amount exceeds the transfer amount that can be reversed', 'amount_too_large'))
      }
      t.amount_reversed = (t.amount_reversed as number) + params.amount
      const r = { id: `trr_${stripeState.reversals.length + 1}`, transfer: id, amount: params.amount, key: opts.idempotencyKey }
      stripeState.reversals.push(r)
      stripeState.byKey.set(opts.idempotencyKey, r)
      return r
    }),
  },
  paymentIntents: { retrieve: vi.fn(async () => ({ id: 'pi_1', latest_charge: 'ch_1' })) },
}))

vi.mock('@/lib/billing/stripe', () => ({ stripe: stripeFake }))

const logs = vi.hoisted(() => ({ lines: [] as { level: string; event: string; fields?: Record<string, unknown> }[] }))
vi.mock('@/lib/log', () => ({
  log: {
    info: (event: string, fields?: Record<string, unknown>) => logs.lines.push({ level: 'info', event, fields }),
    warn: (event: string, fields?: Record<string, unknown>) => logs.lines.push({ level: 'warn', event, fields }),
    error: (event: string, fields?: Record<string, unknown>) => logs.lines.push({ level: 'error', event, fields }),
  },
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

// The seller sale notices live in ./order-receipt (LIVE-706); a late plan reaches them through
// noticeRecoveredSellers (LIVE-733, LIVE-739). Recorded here, so "once" is the calls made per row id.
const notices = vi.hoisted(() => ({
  send: vi.fn(async (_orderId: string, ids: string[]) => ids.length),
}))
vi.mock('./order-receipt', () => ({
  sendRecoveredSplitSaleNotices: (orderId: string, ids: string[]) => notices.send(orderId, ids),
}))

import {
  proportionRefund,
  reverseSplitTransfers,
  reverseSplitRefundForPaymentIntent,
  reconcileSplitReversals,
  reversalIdempotencyKey,
  isDeterministicStripeRefusal,
} from './split-refund'
import {
  settleSplitOrderTransfers,
  planTransfersForOrder,
  reconcileTransfers,
  MAX_TRANSFER_ATTEMPTS,
  RECONCILE_STALE_MS,
} from './transfers'

// Two Spaces in one cart: $10 at 5% and $20 at 5%. The order is $30 with a $1.50 fee, so seller A is
// sent $9.50 and seller B $19.00.
const SPLIT = [
  { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-a', stripe_account_id: 'acct_a', gross_cents: 1000, platform_fee_cents: 50 },
  { owner_kind: 'space', owner_profile_id: null, owner_space_id: 'sp-b', stripe_account_id: 'acct_b', gross_cents: 2000, platform_fee_cents: 100 },
]

function seedOrder(over: Row = {}): Row {
  const order: Row = {
    id: 'o-split',
    funds_flow: 'separate',
    status: 'paid',
    amount_cents: 3000,
    platform_fee_cents: 150,
    currency: 'usd',
    metadata: { split: SPLIT },
    stripe_payment_intent_id: 'pi_1',
    refunded_at: null,
    paid_at: new Date(db.now()).toISOString(),
    ...over,
  }
  db.rows('commerce_orders').push(order)
  return order
}

const bySpace = (space: string) => db.rows('commerce_order_transfers').find((r) => r.owner_space_id === space)!
const transferTo = (acct: string) => stripeState.transfers.find((t) => t.destination === acct)!
const reversedAt = (acct: string) => (stripeState.transfers.find((t) => t.destination === acct)?.amount_reversed as number) ?? 0
const reversalsOf = (acct: string) => stripeState.reversals.filter((r) => r.transfer === transferTo(acct)?.id)
const later = () => {
  db.advance(RECONCILE_STALE_MS + 60_000)
  vi.setSystemTime(db.now())
}
const reconcile = async () => ({
  transfers: await reconcileTransfers({ limit: 100, now: db.now() }),
  reversals: await reconcileSplitReversals({ limit: 100, now: db.now() }),
})

/** What the refund recorder in ./checkout.ts does to the order before the reversal runs. */
function refundInFull(order: Row) {
  order.status = 'refunded'
  order.refunded_at = new Date(db.now()).toISOString()
}
function refundInPart(order: Row) {
  order.refunded_at ??= new Date(db.now()).toISOString()
}

beforeEach(() => {
  db.reset()
  stripeState.transfers.length = 0
  stripeState.reversals.length = 0
  stripeState.byKey.clear()
  stripeState.plan.failReversalFor.clear()
  stripeState.plan.retrieveFails = false
  stripeState.plan.duringCreate = null
  stripeState.plan.duringReversal = null
  logs.lines.length = 0
  vi.clearAllMocks()
  notices.send.mockImplementation(async (_orderId: string, ids: string[]) => ids.length)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(db.now())
})

describe('proportionRefund (pure)', () => {
  const splits = [
    { key: 'a', grossCents: 1000, transferCents: 950 },
    { key: 'b', grossCents: 2000, transferCents: 1900 },
  ]
  const sum = (parts: { refundCents: number }[]) => parts.reduce((n, p) => n + p.refundCents, 0)

  it('a full refund returns each transfer exactly, and each fee to the buyer', () => {
    expect(proportionRefund(3000, splits)).toEqual([
      { key: 'a', refundCents: 1000, reversalCents: 950, platformCents: 50 },
      { key: 'b', refundCents: 2000, reversalCents: 1900, platformCents: 100 },
    ])
  })

  it('a partial refund is shared by gross, largest remainder, and the shares sum exactly to it', () => {
    // $10 of $30: exactly 333.33 and 666.67. The floors are 333 and 666; the one cent left goes to
    // the larger remainder (B). Each share then splits transfer:gross, floored, the cent to the platform.
    expect(proportionRefund(1000, splits)).toEqual([
      { key: 'a', refundCents: 333, reversalCents: 316, platformCents: 17 },
      { key: 'b', refundCents: 667, reversalCents: 633, platformCents: 34 },
    ])
  })

  it('pins the exact sum across awkward amounts, and never reverses more than a transfer', () => {
    const three = [
      { key: 'x', grossCents: 999, transferCents: 949 },
      { key: 'y', grossCents: 1, transferCents: 0 },
      { key: 'z', grossCents: 1333, transferCents: 1200 },
    ]
    for (let refund = 0; refund <= 2333; refund += 7) {
      const parts = proportionRefund(refund, three)
      expect(sum(parts)).toBe(refund)
      for (const p of parts) {
        const s = three.find((t) => t.key === p.key)!
        expect(p.reversalCents).toBeLessThanOrEqual(s.transferCents)
        expect(p.reversalCents + p.platformCents).toBe(p.refundCents)
        expect(p.reversalCents).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('three equal sellers and a refund that does not divide: the leftover cent goes to the first in list order', () => {
    const equal = ['p', 'q', 'r'].map((key) => ({ key, grossCents: 1000, transferCents: 1000 }))
    expect(proportionRefund(1000, equal).map((p) => p.refundCents)).toEqual([334, 333, 333])
    expect(proportionRefund(2, equal).map((p) => p.refundCents)).toEqual([1, 1, 0])
  })

  it('the zero case, and a refund above the gross is clamped to it', () => {
    expect(proportionRefund(0, splits).map((p) => p.refundCents + p.reversalCents)).toEqual([0, 0])
    expect(proportionRefund(-50, splits).map((p) => p.refundCents)).toEqual([0, 0])
    expect(proportionRefund(1000, [])).toEqual([])
    expect(proportionRefund(1000, [{ key: 'n', grossCents: 0, transferCents: 0 }])).toEqual([
      { key: 'n', refundCents: 0, reversalCents: 0, platformCents: 0 },
    ])
    expect(sum(proportionRefund(99_999, splits))).toBe(3000)
  })

  it('stays exact on an order large enough that cents times cents passes 2^53', () => {
    const big = [
      { key: 'a', grossCents: 123_456_789, transferCents: 117_283_950 },
      { key: 'b', grossCents: 987_654_321, transferCents: 938_271_605 },
    ]
    const parts = proportionRefund(555_555_555, big)
    expect(sum(parts)).toBe(555_555_555)
    expect(proportionRefund(1_111_111_110, big).map((p) => p.reversalCents)).toEqual([117_283_950, 938_271_605])
  })
})

describe('a full refund reverses each seller whole', () => {
  it('both transfers come back in full, under keys fixed to the row and the refund, and the rows read reversed', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    const run = await reverseSplitRefundForPaymentIntent('pi_1', 3000)

    expect(run).toMatchObject({ targeted: 2, reversed: 2, failed: 0, cancelled: 0 })
    expect(reversedAt('acct_a')).toBe(950)
    expect(reversedAt('acct_b')).toBe(1900)
    const a = bySpace('sp-a')
    expect(a).toMatchObject({ status: 'reversed', reversed_cents: 950, refund_reversal_cents: 950, reversal_owed_cents: 0 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'reversed', reversed_cents: 1900 })
    const call = stripeFake.transfers.createReversal.mock.calls.find((c) => c[0] === a.stripe_transfer_id)!
    expect(call[1]).toMatchObject({ amount: 950, metadata: { order_id: 'o-split', commerce_order_transfer_id: a.id } })
    expect(call[2]).toEqual({ idempotencyKey: reversalIdempotencyKey(a.id as string, 0, 950) })
  })
})

describe('a partial refund reverses each seller pro rata', () => {
  it('$10 of $30 takes $3.16 from A and $6.33 from B; the platform gives up the rest of its fee share', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    await reverseSplitRefundForPaymentIntent('pi_1', 1000)

    expect(reversedAt('acct_a')).toBe(316)
    expect(reversedAt('acct_b')).toBe(633)
    expect(bySpace('sp-a')).toMatchObject({ status: 'created', reversed_cents: 316, refund_reversal_cents: 316, reversal_owed_cents: 0 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'created', reversed_cents: 633 })
  })

  it('a later top-up to a full refund reverses only the rest, and each transfer ends whole', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    await reverseSplitRefundForPaymentIntent('pi_1', 1000)
    refundInFull(order)
    await reverseSplitRefundForPaymentIntent('pi_1', 3000)

    expect(reversalsOf('acct_a').map((r) => r.amount)).toEqual([316, 634])
    expect(reversalsOf('acct_b').map((r) => r.amount)).toEqual([633, 1267])
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', reversed_cents: 950 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'reversed', reversed_cents: 1900 })
  })

  it('counts a reversal already made in the dashboard, and never asks for more than the transfer', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    transferTo('acct_a').amount_reversed = 500 // by hand, before the refund
    refundInFull(order)
    await reverseSplitRefundForPaymentIntent('pi_1', 3000)

    expect(reversalsOf('acct_a').map((r) => r.amount)).toEqual([450])
    expect(reversedAt('acct_a')).toBe(950)
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', reversed_cents: 950 })
  })
})

describe('a replayed refund reverses once', () => {
  it('the webhook redelivered, the action and its own charge.refunded, and a replay after the key window', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    await reverseSplitTransfers('o-split', 1000) // the refund action
    await reverseSplitRefundForPaymentIntent('pi_1', 1000) // its charge.refunded
    await reverseSplitRefundForPaymentIntent('pi_1', 1000) // redelivered
    stripeState.byKey.clear() // a day on: Stripe no longer remembers any key
    await reverseSplitRefundForPaymentIntent('pi_1', 1000)
    later()
    await reconcile()

    expect(stripeState.reversals).toHaveLength(2)
    expect(reversedAt('acct_a')).toBe(316)
    expect(reversedAt('acct_b')).toBe(633)
  })

  it('an older, smaller refund arriving late lowers nothing and reverses nothing', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    await reverseSplitRefundForPaymentIntent('pi_1', 1500)
    await reverseSplitRefundForPaymentIntent('pi_1', 1000)
    expect(bySpace('sp-a').refund_reversal_cents).toBe(475)
    expect(stripeState.reversals).toHaveLength(2)
  })

  it('two refund paths at once make one reversal per seller (the claim, and behind it the key both paths share)', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    await Promise.all([reverseSplitTransfers('o-split', 3000), reverseSplitRefundForPaymentIntent('pi_1', 3000)])
    expect(reversalsOf('acct_a')).toHaveLength(1)
    expect(reversalsOf('acct_b')).toHaveLength(1)
    expect(reversedAt('acct_a')).toBe(950)
  })
})

describe('a refund before the transfers were made', () => {
  it('a full refund cancels the planned rows, reverses nothing and pays nobody, now or on any reconciler run', async () => {
    const order = seedOrder()
    await planTransfersForOrder('o-split') // planned, never paid (the settle died after the plan)
    refundInFull(order)
    const run = await reverseSplitTransfers('o-split', 3000)

    expect(run).toMatchObject({ cancelled: 2, reversed: 0 })
    expect(bySpace('sp-a')).toMatchObject({ status: 'cancelled', stripe_transfer_id: null })
    expect(bySpace('sp-b')).toMatchObject({ status: 'cancelled', stripe_transfer_id: null })
    later()
    await reconcile()
    later()
    await reconcile()
    expect(stripeFake.transfers.create).not.toHaveBeenCalled()
    expect(stripeFake.transfers.createReversal).not.toHaveBeenCalled()
  })

  it('a transfer already at Stripe when the full refund cancelled its row is adopted when it lands and then taken back', async () => {
    const order = seedOrder()
    stripeState.plan.duringCreate = async () => {
      refundInFull(order)
      await reverseSplitTransfers('o-split', 3000)
    }
    await settleSplitOrderTransfers('o-split')

    // A's create was in flight when the refund ran: its row was cancelled, then the transfer landed.
    expect(bySpace('sp-a')).toMatchObject({ status: 'created', refund_reversal_cents: 950, reversal_owed_cents: 950 })
    // B had not been claimed yet. The executor is mid-loop and does not re-read the order, but B's
    // row is cancelled now, so its claim matches nothing and B is never paid.
    expect(bySpace('sp-b').status).toBe('cancelled')
    expect(stripeState.transfers.filter((t) => t.destination === 'acct_b')).toHaveLength(0)

    later()
    const run = await reconcile()
    expect(run.reversals.reversed).toBe(1)
    expect(reversedAt('acct_a')).toBe(950)
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', reversed_cents: 950 })
  })

  it('a partial refund before a transfer landed: the seller is paid their share, then the refund part is reversed', async () => {
    const order = seedOrder()
    await planTransfersForOrder('o-split')
    refundInPart(order)
    await reverseSplitTransfers('o-split', 1000)
    expect(bySpace('sp-a')).toMatchObject({ status: 'planned', refund_reversal_cents: 316 })
    expect(stripeFake.transfers.createReversal).not.toHaveBeenCalled()

    later()
    await reconcile() // pays both sellers
    expect(transferTo('acct_a').amount).toBe(950)
    later()
    await reconcile() // takes back their parts of the refund
    expect(reversedAt('acct_a')).toBe(316)
    expect(reversedAt('acct_b')).toBe(633)
  })

  it('a partial refund of a split order the settle never planned plans it first, so the share is still owed back', async () => {
    const order = seedOrder()
    refundInPart(order)
    await reverseSplitTransfers('o-split', 1000)
    expect(bySpace('sp-a')).toMatchObject({ status: 'planned', refund_reversal_cents: 316 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'planned', refund_reversal_cents: 633 })
  })
})

describe('a reversal that fails is owed and retried', () => {
  it('records the failure on its own row, reverses the other seller anyway, and the reconciler lands it once', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeState.plan.failReversalFor.add('acct_a')
    const run = await reverseSplitTransfers('o-split', 3000)

    expect(run).toMatchObject({ reversed: 1, failed: 1 })
    expect(bySpace('sp-a')).toMatchObject({ status: 'created', reversal_owed_cents: 950, reversal_attempts: 1 })
    expect(bySpace('sp-a').last_error).toMatch(/^reversal: Insufficient funds/)
    expect(bySpace('sp-b').status).toBe('reversed')

    stripeState.plan.failReversalFor.clear()
    later()
    const again = await reconcile()
    expect(again.reversals).toMatchObject({ orders: 1, reversed: 1 })
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', last_error: null, reversal_owed_cents: 0 })
    expect(reversalsOf('acct_a')).toHaveLength(1)
    expect(reversalsOf('acct_b')).toHaveLength(1)
  })

  it('when Stripe cannot say what is already reversed, it reverses nothing rather than risk too much', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeState.plan.retrieveFails = true
    const run = await reverseSplitTransfers('o-split', 3000)
    expect(run).toMatchObject({ failed: 2, reversed: 0 })
    expect(stripeFake.transfers.createReversal).not.toHaveBeenCalled()
    expect(bySpace('sp-a').last_error).toMatch(/could not read the transfer/)
  })

  it('a row over the ceiling is logged as stuck every run and not retried', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeState.plan.failReversalFor.add('acct_a')
    await reverseSplitTransfers('o-split', 3000)
    bySpace('sp-a').reversal_attempts = MAX_TRANSFER_ATTEMPTS
    stripeState.plan.failReversalFor.clear()
    later()
    const run = await reconcile()
    expect(run.reversals).toMatchObject({ stuck: 1, reversed: 0 })
    const line = logs.lines.find((l) => l.event === 'commerce.transfer.reversal_stuck')!
    expect(line.fields).toMatchObject({ orderId: 'o-split', account: 'acct_a', owedCents: 950 })
    expect(reversalsOf('acct_a')).toHaveLength(0)
  })

  it('throws on a database error, so the webhook redelivers', async () => {
    seedOrder()
    db.failures.push({ table: 'commerce_orders', op: 'select', message: 'connection reset' })
    await expect(reverseSplitRefundForPaymentIntent('pi_1', 3000)).rejects.toThrow(/connection reset/)
  })
})

describe('a refusal Stripe saved under the key is not the answer forever (SCAN-649)', () => {
  it('the retry after an empty-balance refusal is a NEW request, so it lands once the balance is back', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeState.plan.failReversalFor.add('acct_a')
    await reverseSplitTransfers('o-split', 3000)
    const a = bySpace('sp-a')
    expect(a).toMatchObject({ reversal_refusals: 1, reversal_attempts: 1, reversal_owed_cents: 950 })
    expect(a.last_error).toMatch(/Insufficient funds/)

    // The balance is back, but Stripe still answers the first key with the stored refusal, and does
    // for 24 hours: nothing was cleared from byKey. Under the old fixed key this row was stuck.
    stripeState.plan.failReversalFor.clear()
    later()
    const run = await reconcile()
    expect(run.reversals).toMatchObject({ reversed: 1, failed: 0, stuck: 0 })
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', reversal_owed_cents: 0, last_error: null })
    const keys = stripeFake.transfers.createReversal.mock.calls.filter((c) => c[0] === a.stripe_transfer_id).map((c) => c[2].idempotencyKey)
    expect(keys).toEqual([reversalIdempotencyKey(a.id as string, 0, 950), reversalIdempotencyKey(a.id as string, 0, 950, 1)])
    expect(reversalsOf('acct_a')).toHaveLength(1)
    expect(reversedAt('acct_a')).toBe(950)
  })

  it('a failure that is not a refusal (the network) keeps the key, so a request that went through is deduped', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeFake.transfers.createReversal.mockImplementationOnce(async () => {
      throw Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' })
    })
    await reverseSplitTransfers('o-split', 3000)
    const a = bySpace('sp-a')
    expect(a).toMatchObject({ reversal_refusals: 0, reversal_attempts: 1 })
    later()
    await reconcile()
    const keys = stripeFake.transfers.createReversal.mock.calls.filter((c) => c[0] === a.stripe_transfer_id).map((c) => c[2].idempotencyKey)
    expect(new Set(keys).size).toBe(1)
    expect(reversedAt('acct_a')).toBe(950)
  })

  it('classifies stripe-node errors: refusals vary the key, everything unreadable keeps it', () => {
    expect(isDeterministicStripeRefusal(stripeRefusal('x', 'balance_insufficient'))).toBe(true)
    expect(isDeterministicStripeRefusal({ type: 'StripeIdempotencyError' })).toBe(true)
    expect(isDeterministicStripeRefusal({ type: 'StripeConnectionError' })).toBe(false)
    expect(isDeterministicStripeRefusal({ type: 'StripeAPIError', rawType: 'api_error' })).toBe(false)
    expect(isDeterministicStripeRefusal({ type: 'StripeRateLimitError' })).toBe(false)
    expect(isDeterministicStripeRefusal(new Error('plain'))).toBe(false)
    expect(isDeterministicStripeRefusal(null)).toBe(false)
  })

  it('the stuck ceiling counts attempts since the target last rose, and a bigger refund gets fresh budget without the counter going back', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    stripeState.plan.failReversalFor.add('acct_a')
    await reverseSplitTransfers('o-split', 1000)
    bySpace('sp-a').reversal_attempts = MAX_TRANSFER_ATTEMPTS
    later()
    expect((await reconcile()).reversals).toMatchObject({ stuck: 1, reversed: 0 })

    stripeState.plan.failReversalFor.clear()
    refundInFull(order)
    await reverseSplitTransfers('o-split', 3000)
    const a = bySpace('sp-a')
    // The counter never went back; the floor moved under it.
    expect(Number(a.reversal_attempts)).toBeGreaterThanOrEqual(MAX_TRANSFER_ATTEMPTS)
    expect(a.reversal_attempt_floor).toBe(MAX_TRANSFER_ATTEMPTS)
    expect(a).toMatchObject({ status: 'reversed', reversal_owed_cents: 0 })
    expect(reversedAt('acct_a')).toBe(950)
  })
})

describe('two refunds in flight reverse one seller once (SCAN-649)', () => {
  it('a second refund that arrives while the first is at Stripe skips the leased row, and the reconciler reverses only the rest', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(order)
    // Refund #1 ($10 of $30: $3.16 from A) is inside createReversal when refund #2 ($20: $6.33 from A)
    // arrives. Before the fix the raise zeroed reversal_attempts, #2 claimed the row, read
    // amount_reversed 0 and reversed 0 -> 633 under its own key: 316 + 633 left seller A.
    let second: Awaited<ReturnType<typeof reverseSplitTransfers>> | null = null
    stripeState.plan.duringReversal = async () => {
      second = await reverseSplitTransfers('o-split', 2000)
    }
    const first = await reverseSplitTransfers('o-split', 1000)
    // #2 raised both targets, skipped A (leased by #1) and reversed B to ITS target. #1's list of B
    // is now stale (the counter moved under it), so its claim on B matches nothing: skipped, and B
    // is reversed exactly once, to the larger target.
    expect(second).toMatchObject({ targeted: 2, reversed: 1, skipped: 1 })
    expect(first).toMatchObject({ reversed: 1, skipped: 1 })
    expect(reversedAt('acct_a')).toBe(316)
    expect(reversalsOf('acct_a')).toHaveLength(1)
    expect(reversedAt('acct_b')).toBe(1266)
    expect(reversalsOf('acct_b')).toHaveLength(1)
    const a = bySpace('sp-a')
    expect(a).toMatchObject({ refund_reversal_cents: 633, reversed_cents: 316, reversal_owed_cents: 317, status: 'created' })

    // The lease is released when #1 lands, so the rest is owed and the reconciler takes exactly it.
    later()
    const run = await reconcile()
    expect(run.reversals).toMatchObject({ reversed: 1 })
    expect(reversedAt('acct_a')).toBe(633)
    expect(reversalsOf('acct_a')).toHaveLength(2)
    expect(bySpace('sp-a')).toMatchObject({ reversal_owed_cents: 0 })
  })

  it('a worker that died mid-flight frees the row by time: the lease expires and the reconciler proceeds', async () => {
    const order = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInFull(order)
    stripeState.plan.retrieveFails = true
    await reverseSplitTransfers('o-split', 3000)
    stripeState.plan.retrieveFails = false
    // Simulate a claim whose worker never came back: the lease is still in the future.
    bySpace('sp-a').reversal_lease_until = new Date(db.now() + 60_000).toISOString()
    later()
    // RECONCILE_STALE_MS is ten minutes, past the five-minute lease: the row is free again.
    const run = await reconcile()
    expect(run.reversals).toMatchObject({ reversed: 2, skipped: 0 })
    expect(reversedAt('acct_a')).toBe(950)
  })
})

describe('a partial refund that writes the first plan tells the sellers of the sale (LIVE-739)', () => {
  const noticedIds = () => notices.send.mock.calls.flatMap((c) => c[1])

  it('each seller it planned is told once, and no replay, top-up or reconciler run tells anyone again', async () => {
    const order = seedOrder()
    refundInPart(order)
    const run = await reverseSplitTransfers('o-split', 1000)

    expect(run).toMatchObject({ targeted: 2, noticedSellers: 2 })
    expect(notices.send).toHaveBeenCalledTimes(1)
    expect(notices.send.mock.calls[0][0]).toBe('o-split')
    expect(noticedIds().sort()).toEqual([bySpace('sp-a').id, bySpace('sp-b').id].sort())

    // Its own charge.refunded, a redelivery, a top-up, and the cron that pays and reverses.
    const replay = await reverseSplitRefundForPaymentIntent('pi_1', 1000)
    await reverseSplitRefundForPaymentIntent('pi_1', 1000)
    await reverseSplitRefundForPaymentIntent('pi_1', 1500)
    later()
    const first = await reconcile()
    later()
    await reconcile()
    expect(replay).toMatchObject({ noticedSellers: 0 })
    expect(first.transfers).toMatchObject({ plannedOrders: 0, noticedSellers: 0 })
    expect(notices.send).toHaveBeenCalledTimes(1)
    // And the money still moves as before: both paid, then each part of $15 taken back.
    expect(transferTo('acct_a').amount).toBe(950)
    expect(reversedAt('acct_a')).toBe(475)
    expect(reversedAt('acct_b')).toBe(950)
  })

  it('an order the settle or the reconciler already planned: the refund inserts nothing and tells nobody', async () => {
    const settled = seedOrder()
    await settleSplitOrderTransfers('o-split')
    refundInPart(settled)
    expect(await reverseSplitTransfers('o-split', 1000)).toMatchObject({ noticedSellers: 0 })

    const recovered = seedOrder({ id: 'o-late', stripe_payment_intent_id: 'pi_late' })
    later()
    await reconcileTransfers({ limit: 100, now: db.now() }) // plans o-late and tells its sellers
    expect(notices.send).toHaveBeenCalledTimes(1)
    refundInPart(recovered)
    expect(await reverseSplitTransfers('o-late', 1000)).toMatchObject({ targeted: 2, noticedSellers: 0 })
    expect(notices.send).toHaveBeenCalledTimes(1)
    expect(notices.send.mock.calls[0][0]).toBe('o-late')
  })

  it('a refund in full writes no plan, pays nobody and tells nobody', async () => {
    const order = seedOrder()
    refundInFull(order)
    expect(await reverseSplitTransfers('o-split', 3000)).toMatchObject({ noticedSellers: 0, cancelled: 0 })
    expect(db.rows('commerce_order_transfers')).toHaveLength(0)
    expect(notices.send).not.toHaveBeenCalled()
  })

  it('a notice that throws is logged, the refund still writes its targets, and the sellers are paid and reversed', async () => {
    notices.send.mockRejectedValueOnce(new Error('mail is down'))
    const order = seedOrder()
    refundInPart(order)
    const run = await reverseSplitTransfers('o-split', 1000)

    expect(run).toMatchObject({ targeted: 2, noticedSellers: 0 })
    expect(bySpace('sp-a')).toMatchObject({ status: 'planned', refund_reversal_cents: 316 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'planned', refund_reversal_cents: 633 })
    expect(logs.lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'commerce.transfer.recovered_notice_failed',
        fields: expect.objectContaining({ orderId: 'o-split', error: 'mail is down', via: 'split_refund' }),
      }),
    )
    later()
    await reconcile()
    later()
    await reconcile()
    expect(reversedAt('acct_a')).toBe(316)
    expect(reversedAt('acct_b')).toBe(633)
    // Nothing retries the notice into a second one.
    expect(notices.send).toHaveBeenCalledTimes(1)
  })

  it('a seller the notices could not reach is said out loud, never counted as told', async () => {
    notices.send.mockResolvedValueOnce(1)
    const order = seedOrder()
    refundInPart(order)
    expect(await reverseSplitTransfers('o-split', 1000)).toMatchObject({ noticedSellers: 1 })
    expect(logs.lines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'commerce.transfer.recovered_notice_missed',
        fields: { orderId: 'o-split', planned: 2, noticed: 1, via: 'split_refund' },
      }),
    )
  })
})

describe('a destination-flow order is untouched', () => {
  it('its refund reverses nothing here, reads no ledger and calls Stripe for nothing', async () => {
    seedOrder({ id: 'o-dest', funds_flow: 'destination', stripe_payment_intent_id: 'pi_dest', metadata: {} })
    expect(await reverseSplitRefundForPaymentIntent('pi_dest', 3000)).toBeNull()
    expect(await reverseSplitTransfers('o-dest', 3000)).toEqual({ refused: 'destination' })
    expect(db.rows('commerce_order_transfers')).toHaveLength(0)
    expect(stripeFake.transfers.retrieve).not.toHaveBeenCalled()
    expect(stripeFake.transfers.createReversal).not.toHaveBeenCalled()
  })

  it('a charge that is no commerce order at all does nothing', async () => {
    expect(await reverseSplitRefundForPaymentIntent('pi_ticket', 500)).toBeNull()
    expect(await reverseSplitRefundForPaymentIntent(null, 500)).toBeNull()
  })
})
