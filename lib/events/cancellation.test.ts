import { describe, it, expect, beforeEach, vi } from 'vitest'

// Ticket refunds on a cancelled event are QUEUED, not inline (lib/events/cancellation.ts, scan2
// L6-04, LIVE-158). MONEY CODE. Locks:
//   1. refundAndNotifyForCancelledEvent enqueues ONE `ticket_refund` outbox job per succeeded
//      ticket, carrying { ticketId, eventId }, and calls Stripe ZERO times itself; the buyer
//      email is still enqueued per buyer as before.
//   2. runTicketRefund (the drain's handler) runs the REAL refundTicket: an already-refunded
//      ticket is a no-op that never reaches Stripe, a succeeded ticket is refunded exactly once,
//      and a processor refusal THROWS so the outbox retries instead of marking it done.
// The DB, Stripe and the outbox are mocked; lib/billing/tickets.ts is real.

const m = vi.hoisted(() => ({
  enqueue: vi.fn(async (_kind: string, _payload: Record<string, unknown>) => {}),
  refundsCreate: vi.fn(async (_args: Record<string, unknown>) => ({ id: 're_1' })),
  sendEventCancelledEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  sendGuestEventCancelledEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  ticketsUpdate: vi.fn(async (_patch: Record<string, unknown>) => {}),
  tickets: [] as Record<string, unknown>[],
  ticketById: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@/lib/queue/outbox', () => ({ enqueue: (k: string, p: Record<string, unknown>) => m.enqueue(k, p) }))
vi.mock('@/lib/email', () => ({
  sendEventCancelledEmail: (p: Record<string, unknown>) => m.sendEventCancelledEmail(p),
  sendGuestEventCancelledEmail: (p: Record<string, unknown>) => m.sendGuestEventCancelledEmail(p),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/time/zone', () => ({ formatEventWhen: () => 'Fri, Sep 5, 7:00 PM MDT' }))
vi.mock('@/lib/billing/stripe', () => ({
  stripe: { refunds: { create: (args: Record<string, unknown>) => m.refundsCreate(args) } },
  appUrl: () => 'http://t',
  billingEnabled: () => true,
}))
vi.mock('@/lib/billing/connect', () => ({
  payoutsLive: async () => true,
  getConnectStatus: async () => ({ accountId: 'acct_1', ready: true }),
}))
vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction: async () => ({ recorded: true }),
  ENTITY_ID: { foundation: 'f', labs: 'l' },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }) } },
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { title: 'Sound bath', slug: 'sound-bath', starts_at: '2026-09-05T19:00:00Z', time_zone: 'America/Denver', is_cancelled: true },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'event_tickets') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
            eq: (c1: string, v1: unknown) => ({
              // The refund loop awaits the second eq (a list by event + status); refundTicket
              // chains .maybeSingle() onto it (one ticket by id + event). One thenable serves both.
              eq: (_c2: string, v2: unknown) => {
                const resolve = () => {
                  if (opts?.head) return { count: m.tickets.filter((t) => t.status === v2).length, error: null }
                  return { data: m.tickets.filter((t) => t.status === v2), error: null }
                }
                return {
                  then: (onOk: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onOk),
                  maybeSingle: async () => {
                    const row = c1 === 'id' ? m.ticketById.get(String(v1)) : undefined
                    return { data: row && row.event_id === v2 ? row : null, error: null }
                  },
                }
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_c1: string, pi: string) => ({
              eq: (_c2: string, status: string) => ({
                select: async () => {
                  const rows = [...m.ticketById.values()].filter(
                    (t) => t.stripe_payment_intent_id === pi && t.status === status,
                  )
                  for (const r of rows) Object.assign(r, patch)
                  await m.ticketsUpdate(patch)
                  return { data: rows, error: null }
                },
              }),
            }),
          }),
        }
      }
      if (table === 'event_rsvps') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: { display_name: `Buyer ${id}`, auth_user_id: `u-${id}` }, error: null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { refundAndNotifyForCancelledEvent, runTicketRefund, countRefundsOwed, TICKET_REFUND_KIND } from './cancellation'

const EVENT = 'ev-1'

function ticket(id: string, status: string, buyer: string, pi: string) {
  return {
    id,
    event_id: EVENT,
    status,
    buyer_profile_id: buyer,
    stripe_payment_intent_id: pi,
    amount_cents: 2500,
    ticket_type_id: null,
    qty: 1,
    entity_id: 'l',
    platform_fee_cents: 0,
    currency: 'usd',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.tickets = [ticket('t1', 'succeeded', 'b1', 'pi_1'), ticket('t2', 'succeeded', 'b2', 'pi_2'), ticket('t3', 'succeeded', 'b1', 'pi_3')]
  m.ticketById = new Map(m.tickets.map((t) => [String(t.id), t]))
})

describe('refundAndNotifyForCancelledEvent', () => {
  it('enqueues one ticket_refund job per succeeded ticket and issues NO refund inline', async () => {
    await refundAndNotifyForCancelledEvent(EVENT)
    const refundJobs = m.enqueue.mock.calls.filter(([kind]) => kind === TICKET_REFUND_KIND)
    expect(refundJobs).toHaveLength(3)
    expect(refundJobs.map(([, p]) => p)).toEqual([
      { ticketId: 't1', eventId: EVENT },
      { ticketId: 't2', eventId: EVENT },
      { ticketId: 't3', eventId: EVENT },
    ])
    expect(m.refundsCreate).not.toHaveBeenCalled()
    expect(m.ticketsUpdate).not.toHaveBeenCalled()
    // The buyer email still goes out, once per buyer (b1 bought twice), as before.
    expect(m.sendEventCancelledEmail).toHaveBeenCalledTimes(2)
    expect(m.sendEventCancelledEmail.mock.calls.map(([p]) => p.refunded)).toEqual([true, true])
  })

  it('a refused enqueue skips that buyer\'s email and leaves the ticket owed, but queues the rest', async () => {
    m.enqueue.mockRejectedValueOnce(new Error('enqueue(ticket_refund) failed: rls'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await refundAndNotifyForCancelledEvent(EVENT)
    expect(m.enqueue).toHaveBeenCalledTimes(3)
    // b1 still gets one email via t3; b2 via t2. t1's refusal is logged, not swallowed.
    expect(m.sendEventCancelledEmail).toHaveBeenCalledTimes(2)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('runTicketRefund (the outbox handler)', () => {
  it('refunds a succeeded ticket exactly once through Stripe and flips the row', async () => {
    await runTicketRefund({ ticketId: 't1', eventId: EVENT })
    expect(m.refundsCreate).toHaveBeenCalledTimes(1)
    expect(m.refundsCreate.mock.calls[0][0]).toMatchObject({ payment_intent: 'pi_1', reverse_transfer: true, refund_application_fee: true })
    expect(m.ticketById.get('t1')?.status).toBe('refunded')
  })

  it('is idempotent: an already-refunded ticket never reaches Stripe and does not throw', async () => {
    m.ticketById.get('t1')!.status = 'refunded'
    await expect(runTicketRefund({ ticketId: 't1', eventId: EVENT })).resolves.toBeUndefined()
    expect(m.refundsCreate).not.toHaveBeenCalled()
    expect(m.ticketsUpdate).not.toHaveBeenCalled()
  })

  it('THROWS on a processor refusal so the outbox retries instead of marking the job done', async () => {
    m.refundsCreate.mockRejectedValueOnce(new Error('insufficient_funds'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(runTicketRefund({ ticketId: 't1', eventId: EVENT })).rejects.toThrow(/ticket_refund/)
    expect(m.ticketById.get('t1')?.status).toBe('succeeded')
    errSpy.mockRestore()
  })

  it('throws on a malformed payload rather than marking it done', async () => {
    await expect(runTicketRefund({ ticketId: 't1' })).rejects.toThrow(/missing/)
  })
})

describe('countRefundsOwed', () => {
  it('counts the succeeded tickets a cancelled event still holds', async () => {
    expect(await countRefundsOwed(EVENT)).toBe(3)
    m.tickets[0].status = 'refunded'
    expect(await countRefundsOwed(EVENT)).toBe(2)
  })
})
