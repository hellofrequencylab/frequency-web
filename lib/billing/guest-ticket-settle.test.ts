import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Stripe from 'stripe'

// GUEST TICKET SETTLE (lib/billing/tickets.ts). MONEY CODE, and the one place in this build where a
// payment can exist and a ticket may not.
//
// A guest buys with a card and an address: the Checkout Session carries `metadata.guest_email` and
// no buyer profile, so the settled `event_tickets` row has `buyer_profile_id` NULL. Four properties
// are worth a test, and each of them is a way real money goes missing if it breaks:
//
//   1. THE ADDRESS LANDS ON THE ROW. `claim_guest_tickets()` matches event_tickets.guest_email
//      against a PROVEN auth.users address, so a settled guest ticket with no address on it can
//      never be attached to anybody. It is a payment with no owner, permanently.
//   2. THE BUYER STAYS NULL. A guest has no profile. A settle that invented one, or that pushed a
//      null into a filter (`.eq('id', null)` matches nothing, `.in('id', [null])` is worse), is the
//      exact class of defect this repo has been bitten by before.
//   3. A REDELIVERY CHANGES NOTHING. Stripe delivers twice as a matter of course. The settle RPC
//      flips only `pending` rows and returns what it flipped, so the second delivery must mint no
//      second ticket, stamp no second address and send no second email.
//   4. A MEMBER SETTLE IS UNTOUCHED. The guest legs are taken on `!buyer_profile_id` before any
//      query is built, so a member purchase must behave exactly as it did before the guest door.
//
// Plus the loud one: a paid session whose ticket row does not exist AT ALL must say so. That is
// indistinguishable from a redelivery in the RPC's answer (both flip zero rows) and is the worst
// outcome this file can produce, so the two are told apart by a read-back and only the real loss
// is logged.
//
// Sibling of ./tickets-settle.test.ts, which owns the flip/bump contract; this one owns identity.

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'rpc'
  payload?: unknown
  filters: [string, string, unknown][]
}

const state = vi.hoisted(() => {
  const calls: Call[] = []
  /** Rows the settle RPC reports flipping, one entry per call (a redelivery flips none). */
  let settleQueue: unknown[][] = []
  /** What a read-back of event_tickets by session id finds. */
  let ticketLookup: unknown = null
  return {
    calls,
    setSettleQueue(q: unknown[][]) {
      settleQueue = q
    },
    setTicketLookup(row: unknown) {
      ticketLookup = row
    },
    run(call: Call) {
      calls.push(call)
      if (call.op === 'rpc') {
        if (call.table === 'rpc:settle_ticket_atomic') {
          return { data: settleQueue.length ? settleQueue.shift() : [], error: null }
        }
        return { data: null, error: null }
      }
      if (call.table === 'event_tickets' && call.op === 'select') return { data: ticketLookup, error: null }
      return { data: null, error: null }
    },
    reset() {
      calls.length = 0
      settleQueue = []
      ticketLookup = null
    },
  }
})

const ledger = vi.hoisted(() => ({
  recordFinancialTransaction: vi.fn(async (_input: Record<string, unknown>) => ({ recorded: true })),
}))
const mail = vi.hoisted(() => ({
  sendGuestTicketReceipt: vi.fn(async (_opts: Record<string, unknown>) => {}),
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
        in: (k: string, v: unknown) => {
          call.filters.push(['in', k, v])
          return b
        },
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
vi.mock('@/lib/events/guest-ticket-email', () => mail)

import { recordTicketFromSession } from './tickets'

const GUEST_ROW = {
  id: 't-guest',
  event_id: 'ev1',
  ticket_type_id: 'tier1',
  qty: 2,
  entity_id: 'ent-1',
  platform_fee_cents: 150,
  buyer_profile_id: null,
  currency: 'usd',
}

const MEMBER_ROW = { ...GUEST_ROW, id: 't-member', buyer_profile_id: 'p-1' }

function guestSession(): Stripe.Checkout.Session {
  return {
    id: 'cs_guest',
    payment_status: 'paid',
    payment_intent: 'pi_guest',
    amount_total: 4000,
    currency: 'usd',
    metadata: { kind: 'ticket', guest_email: '  Jo@Example.COM ' },
  } as unknown as Stripe.Checkout.Session
}

function memberSession(): Stripe.Checkout.Session {
  return {
    id: 'cs_member',
    payment_status: 'paid',
    payment_intent: 'pi_member',
    amount_total: 4000,
    currency: 'usd',
    metadata: { kind: 'ticket' },
  } as unknown as Stripe.Checkout.Session
}

const ticketUpdates = () => state.calls.filter((c) => c.table === 'event_tickets' && c.op === 'update')
const leadCalls = () => state.calls.filter((c) => c.table === 'rpc:capture_signup_lead')
const errors = () => (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a GUEST settle', () => {
  it('stamps the normalised guest_email on the flipped ticket and leaves the buyer null', async () => {
    state.setSettleQueue([[GUEST_ROW]])
    await recordTicketFromSession(guestSession())

    expect(ticketUpdates()).toHaveLength(1)
    const write = ticketUpdates()[0]
    // The value stored is the one claim_guest_tickets() will compare against auth.users: trimmed
    // and lowercased, not whatever casing the card form produced.
    expect(write.payload).toEqual({ guest_email: 'jo@example.com' })
    expect(write.filters).toEqual([['eq', 'id', 't-guest']])
    // Nothing invented a buyer, and nothing put a null into a filter.
    expect(write.payload).not.toHaveProperty('buyer_profile_id')
    for (const call of state.calls) {
      for (const [, , value] of call.filters) {
        expect(value).not.toBeNull()
        if (Array.isArray(value)) expect(value).not.toContain(null)
      }
    }
  })

  it('records the revenue with a NULL profile rather than dropping the row', async () => {
    state.setSettleQueue([[GUEST_ROW]])
    await recordTicketFromSession(guestSession())

    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(ledger.recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      entityId: 'ent-1',
      profileId: null,
      amountCents: 150,
      idempotencyKey: 'ticket:t-guest',
    })
  })

  it('writes no CRM contact (there is no profile to key one on) and captures a lead instead', async () => {
    state.setSettleQueue([[GUEST_ROW]])
    await recordTicketFromSession(guestSession())

    expect(state.calls.filter((c) => c.table === 'contacts')).toHaveLength(0)
    expect(leadCalls()).toHaveLength(1)
    expect(leadCalls()[0].payload).toMatchObject({
      p_email: 'jo@example.com',
      p_source: 'event_rsvp',
      p_payload: { eventId: 'ev1', paid: true },
    })
    // Strictly stronger than the RSVP door, which captures at step 0.
    expect((leadCalls()[0].payload as { p_step: number }).p_step).toBeGreaterThan(0)
  })

  it('emails the ticket once, with the qty and the gross off the signed session', async () => {
    state.setSettleQueue([[GUEST_ROW]])
    await recordTicketFromSession(guestSession())

    expect(mail.sendGuestTicketReceipt).toHaveBeenCalledTimes(1)
    expect(mail.sendGuestTicketReceipt.mock.calls[0][0]).toEqual({
      eventId: 'ev1',
      guestEmail: 'jo@example.com',
      qty: 2,
      amountCents: 4000,
      currency: 'usd',
    })
  })

  it('says so LOUDLY when a settled ticket has neither a buyer nor a guest email', async () => {
    state.setSettleQueue([[GUEST_ROW]])
    await recordTicketFromSession({
      id: 'cs_orphan',
      payment_status: 'paid',
      metadata: { kind: 'ticket' },
    } as unknown as Stripe.Checkout.Session)

    expect(ticketUpdates()).toHaveLength(0)
    expect(mail.sendGuestTicketReceipt).not.toHaveBeenCalled()
    expect(errors().join('\n')).toContain('NEITHER A BUYER NOR A GUEST EMAIL')
  })
})

describe('a redelivered webhook', () => {
  it('mints one ticket, one address stamp, one lead and ONE email across two deliveries', async () => {
    // The second delivery flips nothing, exactly as settle_ticket_atomic does for a row that is
    // already `succeeded`, and the read-back then finds that row.
    state.setSettleQueue([[GUEST_ROW], []])
    state.setTicketLookup({ id: 't-guest', status: 'succeeded' })

    await recordTicketFromSession(guestSession())
    await recordTicketFromSession(guestSession())

    expect(ticketUpdates()).toHaveLength(1)
    expect(mail.sendGuestTicketReceipt).toHaveBeenCalledTimes(1)
    expect(leadCalls()).toHaveLength(1)
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    // A redelivery is ordinary. It must not cry wolf, or the real alarm below stops being read.
    expect(errors().join('\n')).not.toContain('NO TICKET ROW')
  })

  it('logs LOUDLY when a paid session has no ticket row at all', async () => {
    state.setSettleQueue([[]])
    state.setTicketLookup(null)

    await recordTicketFromSession(guestSession())

    expect(mail.sendGuestTicketReceipt).not.toHaveBeenCalled()
    expect(errors().join('\n')).toContain('PAID CHECKOUT SESSION WITH NO TICKET ROW')
  })
})

describe('a MEMBER settle is unchanged (regression)', () => {
  it('stamps no guest_email, sends no guest email, captures no lead, and keeps the buyer on the ledger', async () => {
    state.setSettleQueue([[MEMBER_ROW]])
    await recordTicketFromSession(memberSession())

    expect(ticketUpdates()).toHaveLength(0)
    expect(mail.sendGuestTicketReceipt).not.toHaveBeenCalled()
    expect(leadCalls()).toHaveLength(0)
    expect(ledger.recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(ledger.recordFinancialTransaction.mock.calls[0][0]).toMatchObject({ profileId: 'p-1' })
    // Exactly one RPC: the settle. No extra traffic was added to the member path.
    expect(state.calls.filter((c) => c.op === 'rpc').map((c) => c.table)).toEqual(['rpc:settle_ticket_atomic'])
  })

  it('ignores a guest_email that arrives on a session whose ticket HAS a buyer', async () => {
    // Defence in depth: the contract says a guest session carries no buyer, but if both ever
    // arrived the row's own identity wins and nothing overwrites it.
    state.setSettleQueue([[MEMBER_ROW]])
    await recordTicketFromSession(guestSession())

    expect(ticketUpdates()).toHaveLength(0)
    expect(mail.sendGuestTicketReceipt).not.toHaveBeenCalled()
  })
})
