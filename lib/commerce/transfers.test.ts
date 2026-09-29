import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// THE TRANSFER LEDGER (LIVE-622, ADR-1636). MONEY CODE.
//
// Pins the invariants a paid split order has to keep:
//   1. the sum of planned nets plus the platform fee equals the order amount;
//   2. a destination order never gets a row;
//   3. a created row is never sent again;
//   4. a failed row keeps its error, and a retry uses the same idempotency key;
//   5. a reversal made outside the product stamps the matching row.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  filters: [string, string, unknown][]
  single?: boolean
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  let handler: (call: Call) => { data?: unknown; error?: { code?: string; message: string } | null } = () => ({})
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
  paymentIntents: { retrieve: vi.fn() },
  transfers: { create: vi.fn() },
}))

const ledger = vi.hoisted(() => ({
  recordFinancialTransaction: vi.fn(async () => ({ recorded: true })),
  ENTITY_ID: { labs: '1ab50000-0000-4000-a000-000000000002', foundation: 'f0000000-0000-4000-a000-000000000001' },
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
        lt: (k: string, v: unknown) => {
          call.filters.push(['lt', k, v])
          return b
        },
        gte: (k: string, v: unknown) => {
          call.filters.push(['gte', k, v])
          return b
        },
        is: (k: string, v: unknown) => {
          call.filters.push(['is', k, v])
          return b
        },
        neq: () => b,
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
  }),
}))
vi.mock('@/lib/billing/stripe', () => ({ stripe: stripeFake }))
vi.mock('@/lib/finance/record', () => ledger)
vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import {
  netCentsForShare,
  plannedSumMatchesOrder,
  sharesFromSplitMetadata,
  planTransfersForOrder,
  executePlannedTransfers,
  reconcileTransfers,
  recordTransferReversed,
  MAX_TRANSFER_ATTEMPTS,
} from './transfers'

const SPLIT = {
  id: 'o-split',
  funds_flow: 'separate',
  status: 'paid',
  amount_cents: 3000,
  platform_fee_cents: 150,
  currency: 'usd',
  metadata: {
    split: [
      {
        owner_kind: 'space',
        owner_profile_id: null,
        owner_space_id: 'sp-a',
        stripe_account_id: 'acct_a',
        gross_cents: 1000,
        platform_fee_cents: 50,
      },
      {
        owner_kind: 'space',
        owner_profile_id: null,
        owner_space_id: 'sp-b',
        stripe_account_id: 'acct_b',
        gross_cents: 2000,
        platform_fee_cents: 100,
      },
    ],
  },
}

const DEST = {
  id: 'o-dest',
  funds_flow: 'destination',
  status: 'paid',
  amount_cents: 2000,
  platform_fee_cents: 100,
  currency: 'usd',
  metadata: {},
}

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
})

describe('shares and sums (pure)', () => {
  it('the sum of planned nets plus the platform fee equals the order amount', () => {
    const shares = sharesFromSplitMetadata(SPLIT.metadata)!
    expect(shares).toHaveLength(2)
    expect(netCentsForShare(shares[0])).toBe(950)
    expect(netCentsForShare(shares[1])).toBe(1900)
    expect(plannedSumMatchesOrder(shares, SPLIT)).toBe(true)
  })

  it('refuses a share with no destination account or a zero net', () => {
    expect(sharesFromSplitMetadata({ split: [{ ...SPLIT.metadata.split[0], stripe_account_id: '' }] })).toBeNull()
    expect(
      sharesFromSplitMetadata({
        split: [{ ...SPLIT.metadata.split[0], gross_cents: 50, platform_fee_cents: 50 }],
      }),
    ).toBeNull()
  })
})

describe('planTransfersForOrder', () => {
  it('writes one planned row per seller of a split order, net of the fee', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') return { data: SPLIT }
      if (c.table === 'commerce_order_transfers' && c.op === 'select') return { data: [] }
      if (c.table === 'commerce_order_transfers' && c.op === 'insert') return { data: [] }
      return {}
    })
    expect(await planTransfersForOrder('o-split')).toBe('planned')
    const insert = state.calls.find((c) => c.table === 'commerce_order_transfers' && c.op === 'insert')
    expect(insert?.payload).toEqual([
      expect.objectContaining({
        order_id: 'o-split',
        stripe_account_id: 'acct_a',
        amount_cents: 950,
        platform_fee_cents: 50,
        status: 'planned',
      }),
      expect.objectContaining({
        order_id: 'o-split',
        stripe_account_id: 'acct_b',
        amount_cents: 1900,
        platform_fee_cents: 100,
        status: 'planned',
      }),
    ])
  })

  it('a destination order never gets a row', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') return { data: DEST }
      return {}
    })
    expect(await planTransfersForOrder('o-dest')).toBe('skipped')
    expect(state.calls.some((c) => c.table === 'commerce_order_transfers' && c.op === 'insert')).toBe(false)
  })

  it('a second plan of the same order writes nothing', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') return { data: SPLIT }
      if (c.table === 'commerce_order_transfers' && c.op === 'select') return { data: [{ id: 't1' }] }
      return {}
    })
    expect(await planTransfersForOrder('o-split')).toBe('already')
    expect(state.calls.some((c) => c.op === 'insert')).toBe(false)
  })
})

describe('executePlannedTransfers', () => {
  const planned = {
    id: 't1',
    order_id: 'o-split',
    owner_kind: 'space' as const,
    owner_profile_id: null,
    owner_space_id: 'sp-a',
    stripe_account_id: 'acct_a',
    amount_cents: 950,
    platform_fee_cents: 50,
    currency: 'usd',
    status: 'planned' as const,
    stripe_transfer_id: null,
    reversed_cents: 0,
    attempts: 0,
    last_error: null,
  }

  it('creates a transfer under an idempotency key and flips the row to created', async () => {
    stripeFake.paymentIntents.retrieve.mockResolvedValue({ latest_charge: 'ch_1' })
    stripeFake.transfers.create.mockResolvedValue({ id: 'tr_1' })
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') {
        return {
          data: {
            id: 'o-split',
            funds_flow: 'separate',
            stripe_payment_intent_id: 'pi_1',
            entity_id: 'ent-1',
            currency: 'usd',
          },
        }
      }
      if (c.table === 'commerce_order_transfers' && c.op === 'select') return { data: [planned] }
      if (c.table === 'commerce_order_transfers' && c.op === 'update') return { data: [{ id: 't1' }] }
      return {}
    })
    const result = await executePlannedTransfers('o-split')
    expect(result.created).toBe(1)
    expect(stripeFake.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 950,
        destination: 'acct_a',
        transfer_group: 'o-split',
        source_transaction: 'ch_1',
      }),
      { idempotencyKey: 'transfer:t1' },
    )
    const flip = state.calls.find((c) => c.table === 'commerce_order_transfers' && c.op === 'update')
    expect(flip?.payload).toEqual(
      expect.objectContaining({ status: 'created', stripe_transfer_id: 'tr_1' }),
    )
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        revenueType: 'payout',
        amountCents: -950,
        idempotencyKey: 'commerce_transfer:tr_1',
      }),
    )
  })

  it('a created row is never sent again', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') {
        return {
          data: {
            id: 'o-split',
            funds_flow: 'separate',
            stripe_payment_intent_id: 'pi_1',
            entity_id: 'ent-1',
            currency: 'usd',
          },
        }
      }
      if (c.table === 'commerce_order_transfers' && c.op === 'select') {
        return { data: [{ ...planned, status: 'created', stripe_transfer_id: 'tr_1' }] }
      }
      return {}
    })
    const result = await executePlannedTransfers('o-split')
    expect(result.created).toBe(0)
    expect(stripeFake.transfers.create).not.toHaveBeenCalled()
  })

  it('a failed row keeps its error and is retried under the same idempotency key', async () => {
    stripeFake.paymentIntents.retrieve.mockResolvedValue({ latest_charge: 'ch_1' })
    stripeFake.transfers.create.mockRejectedValue(new Error('account restricted'))
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') {
        return {
          data: {
            id: 'o-split',
            funds_flow: 'separate',
            stripe_payment_intent_id: 'pi_1',
            entity_id: 'ent-1',
            currency: 'usd',
          },
        }
      }
      if (c.table === 'commerce_order_transfers' && c.op === 'select') return { data: [planned] }
      if (c.table === 'commerce_order_transfers' && c.op === 'update') return { data: [{ id: 't1' }] }
      return {}
    })
    const result = await executePlannedTransfers('o-split')
    expect(result.failed).toBe(1)
    expect(stripeFake.transfers.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'transfer:t1' })
    const flip = state.calls.find((c) => c.table === 'commerce_order_transfers' && c.op === 'update')
    expect(flip?.payload).toEqual(
      expect.objectContaining({ status: 'failed', last_error: 'account restricted', attempts: 1 }),
    )
  })

  it('the due query stays under the attempts ceiling', async () => {
    stripeFake.paymentIntents.retrieve.mockResolvedValue({ latest_charge: 'ch_1' })
    state.setHandler((c) => {
      if (c.table === 'commerce_orders' && c.op === 'select') {
        return {
          data: {
            id: 'o-split',
            funds_flow: 'separate',
            stripe_payment_intent_id: 'pi_1',
            entity_id: 'ent-1',
            currency: 'usd',
          },
        }
      }
      return {}
    })
    await executePlannedTransfers('o-split')
    const due = state.calls.find((c) => c.table === 'commerce_order_transfers' && c.op === 'select')
    expect(due?.filters).toEqual(
      expect.arrayContaining([
        ['in', 'status', ['planned', 'failed']],
        ['lt', 'attempts', MAX_TRANSFER_ATTEMPTS],
      ]),
    )
  })
})

describe('reconcileTransfers', () => {
  it('retries due planned and failed rows, not every paid split order', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_order_transfers' && c.op === 'select') return { data: [] }
      if (c.table === 'commerce_orders' && c.op === 'select') return { data: [] }
      return {}
    })
    await reconcileTransfers({ limit: 40 })
    const due = state.calls.find(
      (c) =>
        c.table === 'commerce_order_transfers' &&
        c.op === 'select' &&
        c.filters.some((f) => f[0] === 'lt' && f[1] === 'attempts'),
    )
    expect(due?.filters).toEqual(
      expect.arrayContaining([
        ['in', 'status', ['planned', 'failed']],
        ['lt', 'attempts', MAX_TRANSFER_ATTEMPTS],
      ]),
    )
    const stuck = state.calls.find(
      (c) =>
        c.table === 'commerce_order_transfers' &&
        c.op === 'select' &&
        c.filters.some((f) => f[0] === 'gte' && f[1] === 'attempts'),
    )
    expect(stuck?.filters).toEqual(
      expect.arrayContaining([
        ['in', 'status', ['planned', 'failed']],
        ['gte', 'attempts', MAX_TRANSFER_ATTEMPTS],
      ]),
    )
  })

  it('logs each row over the attempts ceiling as stuck, one line each', async () => {
    const { log } = await import('@/lib/log')
    state.setHandler((c) => {
      if (
        c.table === 'commerce_order_transfers' &&
        c.op === 'select' &&
        c.filters.some((f) => f[0] === 'gte')
      ) {
        return {
          data: [
            {
              id: 't-stuck',
              order_id: 'o-split',
              stripe_account_id: 'acct_a',
              attempts: MAX_TRANSFER_ATTEMPTS,
              last_error: 'account restricted',
              status: 'failed',
            },
          ],
        }
      }
      return { data: [] }
    })
    const result = await reconcileTransfers({ limit: 40 })
    expect(result.stuck).toBe(1)
    expect(log.error).toHaveBeenCalledWith(
      'commerce.transfers.stuck',
      expect.objectContaining({ transfer_id: 't-stuck', attempts: MAX_TRANSFER_ATTEMPTS }),
    )
  })
})

describe('recordTransferReversed', () => {
  it('stamps reversed_cents and status reversed on the matching row', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_order_transfers' && c.op === 'select') {
        return { data: { id: 't1', amount_cents: 950, reversed_cents: 0, status: 'created' } }
      }
      if (c.table === 'commerce_order_transfers' && c.op === 'update') return { data: [{ id: 't1' }] }
      return {}
    })
    await recordTransferReversed({ id: 'tr_1', amount_reversed: 950, reversed: true } as Stripe.Transfer)
    const flip = state.calls.find((c) => c.op === 'update')
    expect(flip?.payload).toEqual(expect.objectContaining({ status: 'reversed', reversed_cents: 950 }))
    expect(flip?.filters).toEqual(expect.arrayContaining([['eq', 'id', 't1']]))
  })

  it('a redelivered reversal of an already-reversed row writes nothing', async () => {
    state.setHandler((c) => {
      if (c.table === 'commerce_order_transfers' && c.op === 'select') {
        return { data: { id: 't1', amount_cents: 950, reversed_cents: 950, status: 'reversed' } }
      }
      return {}
    })
    await recordTransferReversed({ id: 'tr_1', amount_reversed: 950, reversed: true } as Stripe.Transfer)
    expect(state.calls.some((c) => c.op === 'update')).toBe(false)
  })
})
