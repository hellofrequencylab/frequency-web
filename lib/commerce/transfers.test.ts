import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// THE TRANSFER LEDGER (LIVE-622, ADR-1614). MONEY CODE.
//
// What this file pins, against an in-memory table and an in-memory Stripe that both keep state, so
// "idempotent" is measured as the number of transfers that EXIST, not the number of calls made:
//   1. a paid split order gets one transfer per seller, each for its gross minus its fee, drawn on
//      the order's charge, grouped under the order id, under the key transfer:<row id>;
//   2. running the settle again, the reconciler again, or the webhook again pays nobody twice;
//   3. a transfer that fails is recorded (failed, last_error, attempts) and stops no other seller;
//      the retry uses the same key, and a retry after a create that DID land (the response was lost)
//      adopts the transfer Stripe already holds instead of making a second one;
//   4. a destination-flow order never gets a row or a transfer;
//   5. a fully refunded order's unpaid rows are cancelled (LIVE-623), a row over the ceiling is logged as stuck and never retried, and a
//      reversal from the webhook converges on Stripe's cumulative amount.

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
  last_error: null,
  stripe_transfer_id: null,
  source_charge_id: null,
  platform_fee_cents: 0,
  currency: 'usd',
  created_at: new Date(db.now()).toISOString(),
  updated_at: new Date(db.now()).toISOString(),
})

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
        const all = db.rows(table)
        if (op === 'upsert') {
          const keys = (upsertOpts.onConflict ?? '').split(',')
          const inserted: Row[] = []
          for (const r of payload as Row[]) {
            if (all.some((x) => keys.every((k) => x[k] === r[k]))) {
              if (upsertOpts.ignoreDuplicates) continue
            }
            const row = { ...TRANSFER_DEFAULTS(), id: db.nextId(), ...r }
            all.push(row)
            inserted.push({ ...row })
          }
          return { data: inserted, error: null }
        }
        let hits = all.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          const p = payload as Row
          if (hits.length && typeof p.stripe_transfer_id === 'string' && all.some((x) => x.stripe_transfer_id === p.stripe_transfer_id && !hits.includes(x))) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          }
          for (const r of hits) Object.assign(r, p)
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

// Stripe, with memory: a transfer made under a key is returned again for that key (inside the 24 hour
// window, which `forgetKeys` closes), and `list` sees every transfer made. `failNext` refuses the next
// create; `landThenFail` makes it and then loses the response, the case a key alone cannot cover once
// the window has passed.
const stripeState = vi.hoisted(() => {
  const transfers: Record<string, unknown>[] = []
  const byKey = new Map<string, Record<string, unknown>>()
  const plan = { failNext: 0, landThenFail: 0, listFails: false }
  return { transfers, byKey, plan }
})

const stripeFake = vi.hoisted(() => ({
  transfers: {
    create: vi.fn(async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
      if (stripeState.plan.failNext > 0) {
        stripeState.plan.failNext -= 1
        throw new Error('Your destination account needs to have at least one of the following capabilities enabled: transfers')
      }
      const seen = stripeState.byKey.get(opts.idempotencyKey)
      if (seen) return seen
      const t = { id: `tr_${stripeState.transfers.length + 1}`, amount_reversed: 0, ...params }
      stripeState.transfers.push(t)
      stripeState.byKey.set(opts.idempotencyKey, t)
      if (stripeState.plan.landThenFail > 0) {
        stripeState.plan.landThenFail -= 1
        throw new Error('Request timed out')
      }
      return t
    }),
    list: vi.fn(async (q: { transfer_group: string }) => {
      if (stripeState.plan.listFails) throw new Error('Stripe is unreachable')
      return { data: stripeState.transfers.filter((t) => t.transfer_group === q.transfer_group) }
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

import {
  planTransferShares,
  settleSplitOrderTransfers,
  reconcileTransfers,
  recordTransferReversed,
  recordTransferCreated,
  listOrderTransfers,
  transferIdempotencyKey,
  MAX_TRANSFER_ATTEMPTS,
  RECONCILE_STALE_MS,
} from './transfers'

// Two Spaces in one cart: $10 at 5% and $20 at 5%. The order is $30 with a $1.50 fee.
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

const ledger = () => db.rows('commerce_order_transfers')
const bySpace = (space: string) => ledger().find((r) => r.owner_space_id === space)!
const transfersTo = (acct: string) => stripeState.transfers.filter((t) => t.destination === acct)
/** The reconciler takes only rows untouched for ten minutes; step past that. */
const later = () => db.advance(RECONCILE_STALE_MS + 60_000)
const reconcile = () => reconcileTransfers({ limit: 100, now: db.now() })

beforeEach(() => {
  db.reset()
  stripeState.transfers.length = 0
  stripeState.byKey.clear()
  stripeState.plan.failNext = 0
  stripeState.plan.landThenFail = 0
  stripeState.plan.listFails = false
  logs.lines.length = 0
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(db.now())
})

// Keep Date in step with the table clock, so updated_at and the reconciler's cutoff agree.
const tick = () => vi.setSystemTime(db.now())

describe('planTransferShares (pure)', () => {
  const order = { id: 'o', funds_flow: 'separate', amount_cents: 3000, platform_fee_cents: 150, currency: 'usd', metadata: { split: SPLIT } }

  it('one share per seller, each its gross minus its fee, and the shares plus the fee are the order', () => {
    const plan = planTransferShares(order)
    if (!('shares' in plan)) throw new Error('refused')
    expect(plan.shares.map((s) => [s.ownerSpaceId, s.stripeAccountId, s.amountCents, s.platformFeeCents])).toEqual([
      ['sp-a', 'acct_a', 950, 50],
      ['sp-b', 'acct_b', 1900, 100],
    ])
    expect(plan.shares.reduce((n, s) => n + s.amountCents, 0) + order.platform_fee_cents).toBe(order.amount_cents)
    expect(plan.shares[0].sellerKey).toBe('space::sp-a')
  })

  it('a destination order owes no transfer', () => {
    expect(planTransferShares({ ...order, funds_flow: 'destination' })).toEqual({ refused: 'destination' })
  })

  it('refuses shares that do not add up to what was charged, rather than pay on them', () => {
    expect(planTransferShares({ ...order, amount_cents: 2999 })).toEqual({ refused: 'sum_mismatch' })
    expect(planTransferShares({ ...order, platform_fee_cents: 149 })).toEqual({ refused: 'sum_mismatch' })
    expect(planTransferShares({ ...order, metadata: {} })).toEqual({ refused: 'no_split' })
    expect(planTransferShares({ ...order, metadata: { split: [{ ...SPLIT[0], owner_kind: 'platform' }, SPLIT[1]] } })).toEqual({ refused: 'bad_share' })
    expect(planTransferShares({ ...order, metadata: { split: [{ ...SPLIT[0], stripe_account_id: '' }, SPLIT[1]] } })).toEqual({ refused: 'bad_share' })
  })

  it('a share whose fee is its whole gross gets no row, and its fee still counts', () => {
    const plan = planTransferShares({
      ...order,
      platform_fee_cents: 1100,
      metadata: { split: [{ ...SPLIT[0], platform_fee_cents: 1000 }, SPLIT[1]] },
    })
    if (!('shares' in plan)) throw new Error('refused')
    expect(plan.shares.map((s) => s.ownerSpaceId)).toEqual(['sp-b'])
  })
})

describe('a paid split order pays each seller once', () => {
  it('one transfer per seller: its share, to its account, grouped by the order, drawn on the charge, under its row key', async () => {
    seedOrder()
    await settleSplitOrderTransfers('o-split')

    expect(ledger()).toHaveLength(2)
    expect(stripeFake.transfers.create).toHaveBeenCalledTimes(2)
    for (const [space, acct, amount] of [['sp-a', 'acct_a', 950], ['sp-b', 'acct_b', 1900]] as const) {
      const row = bySpace(space)
      expect(row.status).toBe('created')
      expect(row.attempts).toBe(1)
      expect(row.source_charge_id).toBe('ch_1')
      const call = stripeFake.transfers.create.mock.calls.find((c) => c[0].destination === acct)!
      expect(call[0]).toMatchObject({ amount, currency: 'usd', destination: acct, transfer_group: 'o-split', source_transaction: 'ch_1' })
      expect(call[0].metadata).toMatchObject({ order_id: 'o-split', commerce_order_transfer_id: row.id })
      expect(call[1]).toEqual({ idempotencyKey: transferIdempotencyKey(row.id as string) })
      expect(row.stripe_transfer_id).toBe(transfersTo(acct)[0].id)
    }
  })

  it('is idempotent on replay: a second settle, a reconciler run and a transfer.created redelivery pay nobody again', async () => {
    seedOrder()
    await settleSplitOrderTransfers('o-split')
    await settleSplitOrderTransfers('o-split')
    later()
    tick()
    await reconcile()
    for (const t of stripeState.transfers) await recordTransferCreated(t as unknown as Stripe.Transfer)

    expect(ledger()).toHaveLength(2)
    expect(stripeFake.transfers.create).toHaveBeenCalledTimes(2)
    expect(transfersTo('acct_a')).toHaveLength(1)
    expect(transfersTo('acct_b')).toHaveLength(1)
    expect(ledger().every((r) => r.status === 'created' && r.attempts === 1)).toBe(true)
  })

  it('two workers on the same order at once make one transfer per seller: the claim lets one through', async () => {
    seedOrder()
    await Promise.all([settleSplitOrderTransfers('o-split'), settleSplitOrderTransfers('o-split')])
    expect(transfersTo('acct_a')).toHaveLength(1)
    expect(transfersTo('acct_b')).toHaveLength(1)
    expect(stripeFake.transfers.create).toHaveBeenCalledTimes(2)
  })

  it('listOrderTransfers reads the rows a refund and a seller view build on', async () => {
    seedOrder()
    await settleSplitOrderTransfers('o-split')
    const rows = await listOrderTransfers('o-split')
    expect(rows.map((r) => [r.ownerSpaceId, r.amountCents, r.status])).toEqual([
      ['sp-a', 950, 'created'],
      ['sp-b', 1900, 'created'],
    ])
  })
})

describe('a failed transfer is recorded and retried without a second transfer', () => {
  it('records the failure on its own row and pays the other seller anyway', async () => {
    seedOrder()
    stripeState.plan.failNext = 1 // the first create (seller A) is refused
    await settleSplitOrderTransfers('o-split')

    const a = bySpace('sp-a')
    expect(a.status).toBe('failed')
    expect(a.attempts).toBe(1)
    expect(a.last_error).toMatch(/capabilities/)
    expect(a.stripe_transfer_id).toBeNull()
    expect(bySpace('sp-b').status).toBe('created')
    expect(transfersTo('acct_a')).toHaveLength(0)
  })

  it('the reconciler retries it under the same key and it lands once', async () => {
    seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    later()
    tick()
    const run = await reconcile()

    const a = bySpace('sp-a')
    expect(run.created).toBe(1)
    expect(a.status).toBe('created')
    expect(a.attempts).toBe(2)
    expect(a.last_error).toBeNull()
    const keys = stripeFake.transfers.create.mock.calls.filter((c) => c[0].destination === 'acct_a').map((c) => c[1].idempotencyKey)
    expect(keys).toEqual([transferIdempotencyKey(a.id as string), transferIdempotencyKey(a.id as string)])
    expect(transfersTo('acct_a')).toHaveLength(1)
    // Seller B was already paid and is never touched again.
    expect(transfersTo('acct_b')).toHaveLength(1)
  })

  it('a create that landed but whose answer was lost is adopted on retry, even after the key window closed', async () => {
    seedOrder()
    stripeState.plan.landThenFail = 1 // seller A's transfer is made, then the response is lost
    await settleSplitOrderTransfers('o-split')
    expect(bySpace('sp-a').status).toBe('failed')
    expect(transfersTo('acct_a')).toHaveLength(1)

    stripeState.byKey.clear() // 24 hours on: Stripe no longer remembers the key
    later()
    tick()
    const run = await reconcile()

    expect(run.adopted).toBe(1)
    expect(bySpace('sp-a').status).toBe('created')
    expect(bySpace('sp-a').stripe_transfer_id).toBe(transfersTo('acct_a')[0].id)
    expect(transfersTo('acct_a')).toHaveLength(1)
    expect(stripeFake.transfers.create.mock.calls.filter((c) => c[0].destination === 'acct_a')).toHaveLength(1)
  })

  it('when Stripe cannot be asked whether an earlier attempt landed, the retry fails rather than risk a second transfer', async () => {
    seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    stripeState.plan.listFails = true
    later()
    tick()
    await reconcile()
    expect(bySpace('sp-a').status).toBe('failed')
    expect(bySpace('sp-a').last_error).toMatch(/earlier transfer/)
    expect(stripeFake.transfers.create.mock.calls.filter((c) => c[0].destination === 'acct_a')).toHaveLength(1)
  })

  it('the transfer.created webhook adopts a transfer whose write here was lost', async () => {
    seedOrder()
    stripeState.plan.landThenFail = 1
    await settleSplitOrderTransfers('o-split')
    const made = transfersTo('acct_a')[0]
    expect(await recordTransferCreated(made as unknown as Stripe.Transfer)).toBe(true)
    expect(bySpace('sp-a')).toMatchObject({ status: 'created', stripe_transfer_id: made.id })
    expect(await recordTransferCreated(made as unknown as Stripe.Transfer)).toBe(false)
  })

  it('a row over the attempt ceiling is logged as stuck every run and never retried', async () => {
    seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    bySpace('sp-a').attempts = MAX_TRANSFER_ATTEMPTS
    later()
    tick()
    const run = await reconcile()
    expect(run.stuck).toBe(1)
    expect(logs.lines.filter((l) => l.event === 'commerce.transfer.stuck')).toHaveLength(1)
    expect(logs.lines.find((l) => l.event === 'commerce.transfer.stuck')!.fields).toMatchObject({ orderId: 'o-split', account: 'acct_a' })
    expect(transfersTo('acct_a')).toHaveLength(0)
  })

  it('a failed row on an order refunded in full since is cancelled, and its seller is not paid (LIVE-623)', async () => {
    const order = seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    order.status = 'refunded'
    order.refunded_at = new Date(db.now()).toISOString()
    later()
    tick()
    const run = await reconcile()
    expect(run.cancelled).toBe(1)
    expect(bySpace('sp-a')).toMatchObject({ status: 'cancelled', refund_reversal_cents: 950 })
    expect(transfersTo('acct_a')).toHaveLength(0)
  })

  it('a failed row on an order PARTIALLY refunded since is still paid: the order is paid, and the refund share is reversed after (LIVE-623)', async () => {
    const order = seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    order.refunded_at = new Date(db.now()).toISOString()
    later()
    tick()
    const run = await reconcile()
    expect(run.created).toBe(1)
    expect(bySpace('sp-a').status).toBe('created')
    expect(transfersTo('acct_a')).toHaveLength(1)
  })

  it('a paid order in any other unpayable state is held, not cancelled', async () => {
    const order = seedOrder()
    stripeState.plan.failNext = 1
    await settleSplitOrderTransfers('o-split')
    order.status = 'cancelled'
    later()
    tick()
    const run = await reconcile()
    expect(run.held).toBe(1)
    expect(bySpace('sp-a').status).toBe('failed')
  })
})

describe('the reconciler finds a paid split order the settle never planned', () => {
  it('plans and pays it once it has sat untouched', async () => {
    seedOrder()
    later()
    tick()
    const run = await reconcile()
    expect(run.plannedOrders).toBe(1)
    later()
    tick()
    await reconcile()
    expect(transfersTo('acct_a')).toHaveLength(1)
    expect(transfersTo('acct_b')).toHaveLength(1)
  })
})

describe('a destination-flow order creates no transfers', () => {
  it('writes no row and calls Stripe for nothing, at settle or in the reconciler', async () => {
    seedOrder({ id: 'o-dest', funds_flow: 'destination', metadata: {}, platform_fee_cents: 150 })
    await settleSplitOrderTransfers('o-dest')
    later()
    tick()
    await reconcile()
    expect(ledger()).toHaveLength(0)
    expect(stripeFake.transfers.create).not.toHaveBeenCalled()
    expect(stripeFake.paymentIntents.retrieve).not.toHaveBeenCalled()
  })
})

describe('transfer.reversed', () => {
  it('records the cumulative reversed cents, marks the row reversed once it is all back, and converges on replay', async () => {
    seedOrder()
    await settleSplitOrderTransfers('o-split')
    const a = bySpace('sp-a')
    const tr = { id: a.stripe_transfer_id, amount: 950 }

    expect(await recordTransferReversed({ ...tr, amount_reversed: 400 } as unknown as Stripe.Transfer)).toBe(true)
    expect(bySpace('sp-a')).toMatchObject({ status: 'created', reversed_cents: 400 })
    // A redelivery of the same event, and an older one arriving late, change nothing.
    expect(await recordTransferReversed({ ...tr, amount_reversed: 400 } as unknown as Stripe.Transfer)).toBe(false)
    expect(await recordTransferReversed({ ...tr, amount_reversed: 100 } as unknown as Stripe.Transfer)).toBe(false)
    expect(bySpace('sp-a').reversed_cents).toBe(400)

    expect(await recordTransferReversed({ ...tr, amount_reversed: 950 } as unknown as Stripe.Transfer)).toBe(true)
    expect(bySpace('sp-a')).toMatchObject({ status: 'reversed', reversed_cents: 950 })
    expect(bySpace('sp-b')).toMatchObject({ status: 'created', reversed_cents: 0 })
  })

  it('ignores a transfer that is not one of ours', async () => {
    expect(await recordTransferReversed({ id: 'tr_elsewhere', amount_reversed: 100 } as unknown as Stripe.Transfer)).toBe(false)
  })

  it('throws on a database error, so the webhook releases its claim and Stripe redelivers', async () => {
    seedOrder()
    await settleSplitOrderTransfers('o-split')
    db.failures.push({ table: 'commerce_order_transfers', op: 'select', message: 'connection reset' })
    await expect(
      recordTransferReversed({ id: bySpace('sp-a').stripe_transfer_id, amount_reversed: 950 } as unknown as Stripe.Transfer),
    ).rejects.toThrow(/connection reset/)
  })
})
