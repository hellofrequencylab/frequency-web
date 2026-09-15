import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// THE OVERSELL (LIVE-343). MONEY CODE, and the one race in this build where two people can walk up
// to the same seat holding a real ticket each.
//
// THE SEQUENCE, which is worth restating because every assertion below is one step of it:
//   1. A buyer picks ACH debit / Cash App Pay / a bank redirect. They do not PAY at Checkout, they
//      SUBMIT. Stripe completes the session at once with payment_status 'unpaid'.
//   2. Nothing expires it, because nothing can: the buyer has abandoned nothing.
//   3. `reserve_ticket_atomic` used to release the pending seat 30 minutes after `created_at`,
//      which is the Checkout SESSION expiry and the right clock for an abandoned CARD checkout.
//      At minute 31 the tier read a free seat and sold it to somebody else.
//   4. Days later `async_payment_succeeded` arrives and the settle flipped the first ticket on a
//      bare `where session = ? and status = 'pending'`: no lock, no re-read of quantity, no
//      capacity branch. Two buyers, one seat, and nobody told.
//
// This file owns the APP half of the fix, which is three obligations:
//   A. an UNPAID ticket session starts the second clock (`payment_processing_at`) so the seat is
//      never released under a buyer who is paying for it, and settles nothing;
//   B. a settle that comes back `over_capacity` is HONOURED and made loud, because the buyer was
//      already charged and an automatic refund is the only irreversible answer (the reasoning lives
//      in migration 20270345004700's header, and it is flagged for an owner ruling);
//   C. the numbers the lock measured reach the HOST, who is the only party that can act on them.
//
// The SQL half -- that the lock is taken, that the count excludes the settling ticket, that reserve
// carries both clocks -- is owned by ../../supabase/migrations/settle-ticket-capacity.test.ts,
// because a fake Supabase client cannot prove a transaction.
//
// Sibling of ./tickets-settle.test.ts (the flip/bump contract) and ./guest-ticket-settle.test.ts
// (identity). Same fake client, on purpose.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  let settleRows: unknown[] = []
  let writeError: { message: string } | null = null
  return {
    calls,
    setSettleRows(rows: unknown[]) {
      settleRows = rows
    },
    /** What every `event_tickets` write answers, so a failing stamp can be tested without
     *  reaching for the admin-client module (which a tenancy ratchet watches). */
    setWriteError(err: { message: string } | null) {
      writeError = err
    },
    run(call: Call) {
      calls.push(call)
      if (call.op === 'rpc') return { data: settleRows, error: null }
      if (call.op === 'update') return { data: null, error: writeError }
      return { data: null, error: null }
    },
    reset() {
      calls.length = 0
      settleRows = []
      writeError = null
    },
  }
})

const ledger = vi.hoisted(() => ({ recordFinancialTransaction: vi.fn(async () => {}) }))
const saleNotice = vi.hoisted(() => ({
  notifyTicketSaleHost: vi.fn(async (_sale: Record<string, unknown>) => {}),
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
        eq: (k: string, v: unknown) => {
          call.filters.push(['eq', k, v])
          return b
        },
        is: (k: string, v: unknown) => {
          call.filters.push(['is', k, v])
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
    rpc: (name: string, args: unknown) =>
      Promise.resolve(state.run({ table: `rpc:${name}`, op: 'rpc', payload: args, filters: [] })),
  }),
}))
vi.mock('@/lib/finance/record', () => ledger)
vi.mock('@/lib/events/member-ticket-email', () => ({ sendMemberTicketReceipt: async () => {} }))
vi.mock('@/lib/events/guest-ticket-email', () => ({ sendGuestTicketReceipt: async () => {} }))
vi.mock('./ticket-sale-notify', () => saleNotice)

import { recordTicketFromSession } from './tickets'

const ROW = {
  id: 't1',
  event_id: 'ev1',
  ticket_type_id: 'tier1',
  qty: 2,
  entity_id: 'ent-1',
  platform_fee_cents: 150,
  buyer_profile_id: 'p-1',
  currency: 'usd',
}

/** What the fixed `settle_ticket_atomic` reports when the tier no longer has room: the ticket was
 *  flipped anyway, and here is what the lock saw. */
const OVER_CAPACITY_ROW = { ...ROW, over_capacity: true, tier_quantity: 12, tier_committed: 11 }
const IN_CAPACITY_ROW = { ...ROW, over_capacity: false, tier_quantity: 12, tier_committed: 4 }

function session(over: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    amount_total: 4000,
    currency: 'usd',
    metadata: { kind: 'ticket' },
    ...over,
  } as unknown as Stripe.Checkout.Session
}

const rpcCalls = () => state.calls.filter((c) => c.op === 'rpc')
const ticketWrites = () => state.calls.filter((c) => c.table === 'event_tickets' && c.op === 'update')
const errors = () => (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── A. The second clock ────────────────────────────────────────────────────────────────────────

describe('a ticket session that completes UNPAID starts the settlement clock (LIVE-343)', () => {
  it('stamps payment_processing_at on the pending row and settles nothing', async () => {
    await recordTicketFromSession(session({ payment_status: 'unpaid' }))

    // Nothing is flipped: the money has not moved.
    expect(rpcCalls()).toHaveLength(0)
    expect(ledger.recordFinancialTransaction).not.toHaveBeenCalled()

    expect(ticketWrites()).toHaveLength(1)
    const write = ticketWrites()[0]
    expect(Object.keys(write.payload as object)).toEqual(['payment_processing_at'])
    expect(typeof (write.payload as { payment_processing_at: unknown }).payment_processing_at).toBe('string')
  })

  it('scopes the stamp to THIS session, to a PENDING row, and to a row not already stamped', async () => {
    await recordTicketFromSession(session({ payment_status: 'unpaid' }))

    // Each filter is load-bearing and each one is a different way to get this wrong:
    //   session id  -- a stamp on another buyer's ticket holds a seat that is not theirs;
    //   pending     -- a succeeded or refunded row must never grow a processing clock;
    //   is null     -- a REDELIVERED `completed` event must not slide the clock forward on a
    //                  payment that has been settling for six days, which would turn a bounded
    //                  7 day hold into an unbounded one.
    expect(ticketWrites()[0].filters).toEqual([
      ['eq', 'stripe_checkout_session_id', 'cs_1'],
      ['eq', 'status', 'pending'],
      ['is', 'payment_processing_at', null],
    ])
  })

  it('leaves a no_payment_required session alone: it has no payment to wait for', async () => {
    await recordTicketFromSession(session({ payment_status: 'no_payment_required' }))
    expect(state.calls).toHaveLength(0)
  })

  it('never touches a session that is not a ticket', async () => {
    await recordTicketFromSession(session({ payment_status: 'unpaid', metadata: { kind: 'tip' } }))
    expect(state.calls).toHaveLength(0)
  })

  it('is loud when the stamp fails, because the seat can then be resold under a paying buyer', async () => {
    // A swallowed fail-safe is an invisible regression (AGENTS.md). Nothing here can recover the
    // stamp, so the only honest response is to say so where an operator will find it.
    state.setWriteError({ message: 'permission denied for table event_tickets' })
    await expect(recordTicketFromSession(session({ payment_status: 'unpaid' }))).resolves.toBeUndefined()
    const logged = errors().map((c) => String(c[0])).join('\n')
    expect(logged).toContain('could not start the settlement clock')
    // The message has to say the CONSEQUENCE, not just name the failed write: an operator reading
    // this at 2am needs to know a seat can be resold under somebody who is paying for it.
    expect(logged).toContain('the seat may be resold')
  })
})

// ── B + C. The re-check's verdict ──────────────────────────────────────────────────────────────

describe('a settle that no longer fits its tier is HONOURED and made loud (LIVE-343)', () => {
  it('still flips, still records the revenue, and still notifies: the buyer was charged', async () => {
    state.setSettleRows([OVER_CAPACITY_ROW])
    await recordTicketFromSession(session())

    // The decision, asserted rather than described: over capacity does not drop the purchase.
    // Refunding is the only irreversible option and a machine must not take it unattended.
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledTimes(1)
  })

  it('logs the overage with the numbers the lock measured and the session id to paste into Stripe', async () => {
    state.setSettleRows([OVER_CAPACITY_ROW])
    await recordTicketFromSession(session())

    const capacityLog = errors().find((c) => String(c[0]).includes('NO LONGER FITS ITS TIER'))
    expect(capacityLog).toBeTruthy()
    expect(capacityLog?.[1]).toMatchObject({
      ticketId: 't1',
      eventId: 'ev1',
      ticketTypeId: 'tier1',
      sessionId: 'cs_1',
      qty: 2,
      tierQuantity: 12,
      committedBefore: 11,
    })
  })

  it('hands the overage and both numbers to the host notice, not just a boolean', async () => {
    state.setSettleRows([OVER_CAPACITY_ROW])
    await recordTicketFromSession(session())

    // The host is the only party who can add a chair, move the room, or refund on purpose, and
    // "you are over" without a count is not something anyone can act on.
    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledWith(
      expect.objectContaining({ over_capacity: true, tier_quantity: 12, tier_committed: 11 }),
    )
  })

  it('says nothing about capacity on an ordinary in-capacity sale', async () => {
    state.setSettleRows([IN_CAPACITY_ROW])
    await recordTicketFromSession(session())

    expect(errors().map((c) => String(c[0])).join('\n')).not.toContain('NO LONGER FITS')
    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledWith(
      expect.objectContaining({ over_capacity: false, tier_quantity: 12, tier_committed: 4 }),
    )
  })

  it('treats a row with NO verdict as no verdict, never as an overage', async () => {
    // The window between this file merging and migration 20270345004700 being applied: the live
    // function still returns eight columns. That must read as "not measured" and stay silent,
    // rather than alarming a host about a tier that is fine.
    state.setSettleRows([ROW])
    await recordTicketFromSession(session())

    expect(errors().map((c) => String(c[0])).join('\n')).not.toContain('NO LONGER FITS')
    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledWith(
      expect.objectContaining({ over_capacity: false, tier_quantity: null, tier_committed: null }),
    )
  })
})

// ── C. The sale reaches the host with the right identity ───────────────────────────────────────

describe('the host notice carries the sale the settle actually flipped (LIVE-345)', () => {
  it('passes the member buyer, the gross off the SIGNED session and the fee off the ROW', async () => {
    state.setSettleRows([IN_CAPACITY_ROW])
    await recordTicketFromSession(session())

    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 't1',
        event_id: 'ev1',
        ticket_type_id: 'tier1',
        qty: 2,
        // Gross off the session Stripe signed; the fee off the ticket row, never recomputed
        // (ADR-914: the fee that was CHARGED is the fee that gets reported).
        amount_cents: 4000,
        platform_fee_cents: 150,
        currency: 'usd',
        buyer_profile_id: 'p-1',
        guest_email: null,
      }),
    )
  })

  it('passes the guest address and a null buyer on a guest sale', async () => {
    state.setSettleRows([{ ...IN_CAPACITY_ROW, buyer_profile_id: null }])
    await recordTicketFromSession(
      session({ id: 'cs_guest', metadata: { kind: 'ticket', guest_email: '  Jo@Example.COM ' } }),
    )

    expect(saleNotice.notifyTicketSaleHost).toHaveBeenCalledWith(
      expect.objectContaining({ buyer_profile_id: null, guest_email: 'jo@example.com' }),
    )
  })

  it('never lets a failed notice fail the settle: the money work is already done', async () => {
    state.setSettleRows([IN_CAPACITY_ROW])
    saleNotice.notifyTicketSaleHost.mockRejectedValueOnce(new Error('outbox down'))
    await expect(recordTicketFromSession(session())).resolves.toBeUndefined()
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
  })
})
