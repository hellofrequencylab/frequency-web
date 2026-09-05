import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// TICKET SETTLE + REFUND `sold` bump (lib/billing/tickets.ts). L6-15 (2026-09-05): the bump after the
// pending -> succeeded flip is a second statement (no settle RPC exists; see the comment on
// adjustTierSold), so the lock here is the part that CAN be held without a migration: the bump's
// result is checked and retried, its failure is logged with the tier + delta + ticket, it never
// throws (the ledger row still lands), and a redelivered event that flips nothing bumps nothing.
// Sibling of ./tickets.test.ts (pure helpers); this file mocks the admin client + ledger the way
// lib/commerce/orders.test.ts does.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  let flipRows: unknown[] = []
  let rpcErrors: ({ message: string } | null)[] = []
  return {
    calls,
    setFlipRows(rows: unknown[]) {
      flipRows = rows
    },
    setRpcErrors(errs: ({ message: string } | null)[]) {
      rpcErrors = errs
    },
    run(call: Call) {
      calls.push(call)
      if (call.op === 'update' && call.table === 'event_tickets') return { data: flipRows, error: null }
      if (call.op === 'rpc') return { data: null, error: rpcErrors.shift() ?? null }
      return { data: null, error: null }
    },
    reset() {
      calls.length = 0
      flipRows = []
      rpcErrors = []
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

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordTicketFromSession — the sold bump is checked, retried, and keyed on the flip (L6-15)', () => {
  it('bumps sold by the ticket qty exactly once when this call is the one that flipped the row', async () => {
    state.setFlipRows([TICKET])
    await recordTicketFromSession(paidSession())
    const flip = state.calls.find((c) => c.op === 'update' && c.table === 'event_tickets')!
    expect(flip.filters).toContainEqual(['eq', 'stripe_checkout_session_id', 'cs_1'])
    expect(flip.filters).toContainEqual(['eq', 'status', 'pending'])
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0]).toMatchObject({ table: 'rpc:adjust_ticket_sold', payload: { p_tier_id: 'tier1', p_delta: 2 } })
    expect(console.error).not.toHaveBeenCalled()
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })

  it('a redelivered event flips nothing and so bumps nothing', async () => {
    state.setFlipRows([])
    await recordTicketFromSession(paidSession())
    expect(rpcCalls()).toHaveLength(0)
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a bump that fails once is retried and succeeds silently', async () => {
    state.setFlipRows([TICKET])
    state.setRpcErrors([{ message: 'connection reset' }, null])
    await recordTicketFromSession(paidSession())
    expect(rpcCalls()).toHaveLength(2)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('a bump that keeps failing is LOGGED with the tier, delta and ticket, never thrown, and the ledger still lands', async () => {
    state.setFlipRows([TICKET])
    state.setRpcErrors([{ message: 'function unavailable' }, { message: 'function unavailable' }])
    await expect(recordTicketFromSession(paidSession())).resolves.toBeUndefined()
    expect(rpcCalls()).toHaveLength(2)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('adjust_ticket_sold failed'),
      expect.objectContaining({ ticketTypeId: 'tier1', delta: 2, ticketId: 't1', error: 'function unavailable' }),
    )
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('recordTicketRefund — the mirror image frees the tier by the same qty (L6-15)', () => {
  it('decrements sold by the refunded qty, keyed on the succeeded -> refunded flip', async () => {
    state.setFlipRows([TICKET])
    await recordTicketRefund('pi_1')
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0]).toMatchObject({ payload: { p_tier_id: 'tier1', p_delta: -2 } })
  })
})
