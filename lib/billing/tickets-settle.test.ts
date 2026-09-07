import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// TICKET SETTLE + REFUND (lib/billing/tickets.ts). MONEY CODE.
//
// L6-15 (2026-09-05) found that the settle was TWO round trips: an `update event_tickets ... where
// status = 'pending'` and then a separate `adjust_ticket_sold(tier, +qty)` RPC. It could only lock
// the half that needed no migration — the bump's result was checked, retried and logged — and its
// own comment named the real fix.
//
// LIVE-161 (2026-09-06) is that fix. settle_ticket_atomic / refund_ticket_atomic (migration
// 20270345001700) flip the ticket and move `event_ticket_types.sold` in ONE statement and return
// the rows they flipped. So the property under test changed shape: it is no longer "the second
// request is retried and its failure is visible", it is "THERE IS NO SECOND REQUEST". A settled
// ticket whose tier did not count it is now unrepresentable rather than merely logged.
//
// What these tests own is the CALL: one RPC, the right arguments, no table traffic of its own, and
// the ledger/CRM writes still keyed on the rows the RPC actually flipped. What the SQL does with
// those arguments (the flip predicate, the summed bump, the greatest(0, ...) floor) is proven in
// the migration against a real Postgres, not here — a fake client cannot prove a transaction.
//
// Sibling of ./tickets.test.ts (pure helpers); mocks the admin client + ledger like
// lib/commerce/orders.test.ts does.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  let rpcRows: unknown[] = []
  let rpcError: { message: string } | null = null
  return {
    calls,
    /** The rows settle_ticket_atomic / refund_ticket_atomic report having flipped. */
    setRpcRows(rows: unknown[]) {
      rpcRows = rows
    },
    setRpcError(err: { message: string } | null) {
      rpcError = err
    },
    run(call: Call) {
      calls.push(call)
      if (call.op === 'rpc') return rpcError ? { data: null, error: rpcError } : { data: rpcRows, error: null }
      return { data: null, error: null }
    },
    reset() {
      calls.length = 0
      rpcRows = []
      rpcError = null
    },
  }
})

const ledger = vi.hoisted(() => ({ recordFinancialTransaction: vi.fn(async () => {}) }))

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
        eq: (k: string, v: unknown) => {
          call.filters.push(['eq', k, v])
          return b
        },
        in: () => b,
        limit: () => b,
        maybeSingle: () => b,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(state.run(call)).then(resolve, reject),
      }
      return b
    },
    rpc: (name: string, args: unknown) => Promise.resolve(state.run({ table: `rpc:${name}`, op: 'rpc', payload: args, filters: [] })),
  }),
}))
vi.mock('@/lib/finance/record', () => ledger)

import { recordTicketFromSession, recordTicketRefund } from './tickets'

const TICKET = {
  id: 't1',
  event_id: 'ev1',
  ticket_type_id: 'tier1',
  qty: 2,
  entity_id: 'ent-1',
  platform_fee_cents: 150,
  buyer_profile_id: null, // no CRM contact write, keeps the fake small
  currency: 'usd',
}

function paidSession(): Stripe.Checkout.Session {
  return { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { kind: 'ticket' } } as unknown as Stripe.Checkout.Session
}

const rpcCalls = () => state.calls.filter((c) => c.op === 'rpc')
const ticketWrites = () => state.calls.filter((c) => c.table === 'event_tickets' && c.op === 'update')

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordTicketFromSession — the flip and the sold bump are ONE statement (LIVE-161)', () => {
  it('settles through a single RPC carrying the session and the PaymentIntent', async () => {
    state.setRpcRows([TICKET])
    await recordTicketFromSession(paidSession())
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0]).toMatchObject({
      table: 'rpc:settle_ticket_atomic',
      payload: { _session_id: 'cs_1', _payment_intent_id: 'pi_1' },
    })
    expect(console.error).not.toHaveBeenCalled()
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })

  it('makes NO second round trip: no app-side ticket update and no adjust_ticket_sold', async () => {
    state.setRpcRows([TICKET])
    await recordTicketFromSession(paidSession())
    // The gap this row closed. Either of these coming back re-opens the window in which a ticket
    // is succeeded and its tier has not counted it.
    expect(ticketWrites()).toHaveLength(0)
    expect(rpcCalls().map((c) => c.table)).toEqual(['rpc:settle_ticket_atomic'])
  })

  it('a redelivered event flips nothing, so nothing is counted and nothing is recorded', async () => {
    state.setRpcRows([])
    await recordTicketFromSession(paidSession())
    expect(rpcCalls()).toHaveLength(1)
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a failed settle is logged, never thrown, NOT retried, and records no ledger row', async () => {
    state.setRpcRows([TICKET])
    state.setRpcError({ message: 'function unavailable' })
    await expect(recordTicketFromSession(paidSession())).resolves.toBeUndefined()
    // Not retried on purpose: a call that commits and loses its response would return zero rows on
    // a retry, and zero rows is how this path says "somebody else settled it".
    expect(rpcCalls()).toHaveLength(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('settle_ticket_atomic failed'),
      expect.objectContaining({ error: 'function unavailable' }),
    )
    // One transaction: nothing flipped, so there is no settled ticket to write a ledger row for.
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a session that is not a paid ticket touches nothing at all', async () => {
    await recordTicketFromSession({ id: 'cs_2', payment_status: 'unpaid', metadata: { kind: 'ticket' } } as unknown as Stripe.Checkout.Session)
    await recordTicketFromSession({ id: 'cs_3', payment_status: 'paid', metadata: { kind: 'tip' } } as unknown as Stripe.Checkout.Session)
    expect(state.calls).toHaveLength(0)
  })
})

describe('recordTicketRefund — the mirror image gives the seat back in the same statement (LIVE-161)', () => {
  it('unwinds through a single RPC keyed on the PaymentIntent, with no second bump', async () => {
    state.setRpcRows([TICKET])
    await recordTicketRefund('pi_1')
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0]).toMatchObject({
      table: 'rpc:refund_ticket_atomic',
      payload: { _payment_intent_id: 'pi_1' },
    })
    expect(ticketWrites()).toHaveLength(0)
    // The reversal is negative and keyed on the row the RPC flipped.
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ revenueType: 'refund', amountCents: -150, sourceId: 't1' }),
    )
  })

  it('a redelivered charge.refunded flips nothing and reverses nothing', async () => {
    state.setRpcRows([])
    await recordTicketRefund('pi_1')
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a failed refund RPC is logged and never throws', async () => {
    state.setRpcError({ message: 'deadlock detected' })
    await expect(recordTicketRefund('pi_1')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('refund_ticket_atomic failed'),
      expect.objectContaining({ error: 'deadlock detected' }),
    )
  })

  it('no PaymentIntent means no call', async () => {
    await recordTicketRefund(null)
    expect(state.calls).toHaveLength(0)
  })
})
