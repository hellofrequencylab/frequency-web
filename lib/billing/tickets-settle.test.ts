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
  // The seat RPC answers SEPARATELY (owner report 2026-09-16). It has to: one shared answer would
  // hand record_ticket_seat the settle's ticket rows, which carry no seat_status, and the seat
  // helper would log "a paid seat did not land on going" in every test that settles anything --
  // a fake shaped so the code under test cannot pass.
  let seatRows: unknown[] = [{ rsvp_id: 'r-1', minted: true, seat_status: 'going' }]
  let seatError: { message: string } | null = null
  return {
    calls,
    /** The rows settle_ticket_atomic / refund_ticket_atomic report having flipped. */
    setRpcRows(rows: unknown[]) {
      rpcRows = rows
    },
    setRpcError(err: { message: string } | null) {
      rpcError = err
    },
    /** What record_ticket_seat reports having seated. */
    setSeatRows(rows: unknown[]) {
      seatRows = rows
    },
    setSeatError(err: { message: string } | null) {
      seatError = err
    },
    run(call: Call) {
      calls.push(call)
      if (call.table === 'rpc:record_ticket_seat') {
        return seatError ? { data: null, error: seatError } : { data: seatRows, error: null }
      }
      if (call.op === 'rpc') return rpcError ? { data: null, error: rpcError } : { data: rpcRows, error: null }
      return { data: null, error: null }
    },
    reset() {
      calls.length = 0
      rpcRows = []
      rpcError = null
      seatRows = [{ rsvp_id: 'r-1', minted: true, seat_status: 'going' }]
      seatError = null
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
// The member receipt (LIVE-316) is owned by ./guest-ticket-settle.test.ts, which holds the identity
// contract. Here it is stubbed so the fake client's null reads do not read as a settle error.
vi.mock('@/lib/events/member-ticket-email', () => ({ sendMemberTicketReceipt: async () => {} }))
// The HOST's sale notice (LIVE-345) is owned by ./ticket-sale-notify.test.ts and its wiring by
// ./tickets-settle-capacity.test.ts. Stubbed here for the same reason as the member receipt: it
// opens its own reads, and the fake client's null answers would read as a settle error.
vi.mock('./ticket-sale-notify', () => ({ notifyTicketSaleHost: async () => {} }))

import { recordTicketFromSession, recordTicketRefund } from './tickets'

const TICKET = {
  id: 't1',
  event_id: 'ev1',
  ticket_type_id: 'tier1',
  qty: 2,
  entity_id: 'ent-1',
  platform_fee_cents: 150,
  // A MEMBER buyer. It was null here to keep the fake small, and that stopped being a harmless
  // simplification when the guest door landed: `event_tickets` carries exactly one of
  // buyer_profile_id / guest_email, so a row with neither is now an impossible row and the settle
  // says so out loud (see ./guest-ticket-settle.test.ts, which owns the identity contract). The
  // contact write this re-enables still no-ops, because the fake's `events` read answers null.
  buyer_profile_id: 'p-1',
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
    // ⚠️ RE-POINTED 2026-09-16. This read `expect(rpcCalls()).toHaveLength(1)` — "exactly one RPC
    // is ever made" — which is a SHAPE, not this row's consequence. LIVE-161's property is that the
    // FLIP and the SOLD BUMP are one statement, so there is no window in which a ticket is
    // succeeded and its tier has not counted it. Seating the buyer afterwards
    // (record_ticket_seat, owner report 2026-09-16) opens no such window: it touches neither the
    // ticket nor the tier. Counting calls would have failed that change while the guarantee held,
    // which is a test measuring its own past implementation. The settle itself is still pinned to
    // ONE call, below and in the sibling test.
    expect(rpcCalls().filter((c) => c.table === 'rpc:settle_ticket_atomic')).toHaveLength(1)
    expect(rpcCalls()[0]).toMatchObject({
      table: 'rpc:settle_ticket_atomic',
      payload: { _session_id: 'cs_1', _payment_intent_id: 'pi_1' },
    })
    expect(console.error).not.toHaveBeenCalled()
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })

  it('makes NO second round trip for the flip or the bump: no ticket update, no adjust_ticket_sold', async () => {
    state.setRpcRows([TICKET])
    await recordTicketFromSession(paidSession())
    // The gap this row closed. Either of these coming back re-opens the window in which a ticket
    // is succeeded and its tier has not counted it. Named individually rather than by an equality
    // on the whole call list, for the reason in the test above: the list may legitimately grow
    // with calls that touch neither table, and it now has.
    expect(ticketWrites()).toHaveLength(0)
    expect(rpcCalls().map((c) => c.table)).not.toContain('rpc:adjust_ticket_sold')
    expect(rpcCalls().filter((c) => c.table === 'rpc:settle_ticket_atomic')).toHaveLength(1)
  })

  // ── THE SEAT (owner report 2026-09-16) ──────────────────────────────────────────────────────
  // The owner bought a ticket, got the receipt, and the event page went on saying "Be the first to
  // RSVP." A seat was two rows in two tables (LIVE-317) and the public page only ever read one of
  // them. A settled ticket now takes the same going RSVP a free claim has taken since ADR-410.

  it('seats the buyer, naming the row the settle actually flipped', async () => {
    state.setRpcRows([TICKET])
    await recordTicketFromSession(paidSession())
    const seat = rpcCalls().find((c) => c.table === 'rpc:record_ticket_seat')
    expect(seat).toBeDefined()
    // The TICKET id, not the session: one session can only ever have flipped the rows the RPC
    // returned, and the seat belongs to a row, not to a checkout.
    expect(seat!.payload).toEqual({ _ticket_id: 't1' })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('seats nobody when the settle flipped nothing, so a redelivery cannot re-seat', async () => {
    state.setRpcRows([])
    await recordTicketFromSession(paidSession())
    expect(rpcCalls().map((c) => c.table)).not.toContain('rpc:record_ticket_seat')
  })

  it('a seat that lands anywhere but going is reported: the buyer paid for a seat they do not hold', async () => {
    state.setRpcRows([TICKET])
    // What a lost capacity-trigger exemption would look like (migration 20270345005100): the RSVP
    // trigger coerces the paid seat onto the waitlist. It must never be silent.
    state.setSeatRows([{ rsvp_id: 'r-1', minted: true, seat_status: 'waitlist' }])
    await expect(recordTicketFromSession(paidSession())).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('A PAID SEAT DID NOT LAND ON going'),
      expect.objectContaining({ ticketId: 't1', seatStatus: 'waitlist' }),
    )
  })

  it('a failed seat is logged and NEVER thrown — the money work is already done', async () => {
    state.setRpcRows([TICKET])
    state.setSeatError({ message: 'function unavailable' })
    await expect(recordTicketFromSession(paidSession())).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('could not seat a settled ticket holder'),
      expect.objectContaining({ ticketId: 't1', error: 'function unavailable' }),
    )
    // The sale still stands: the ledger row is written whatever the seat did.
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })

  it('a settled ticket that seats nobody at all is reported, not swallowed', async () => {
    state.setRpcRows([TICKET])
    // The RPC returns zero rows for a ticket carrying neither a buyer nor an address.
    state.setSeatRows([])
    await recordTicketFromSession(paidSession())
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('seated nobody'),
      expect.objectContaining({ ticketId: 't1' }),
    )
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
