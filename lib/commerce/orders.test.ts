import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 5 (ADR-811 §A): spaceEarningsSummary splits settled earnings into the slice the NETWORK sourced
// (source='network') vs the operator's own bookings. The contract that carries the promise: an order that
// is NOT explicitly 'network' (null / 'self' / anything else) NEVER counts toward the network figure, so
// the receipt can never overstate what we earned on. We mock the admin client's query chain with an
// in-memory row set.

let rows: Record<string, unknown>[] = []
/** Ticket rows, and the events they hang off, for the LIVE-375 arm. Empty by default so every test
 *  written before tickets existed reads exactly as it did. */
let ticketRows: Record<string, unknown>[] = []
let eventRows: Record<string, unknown>[] = []
/** Gift rows for the LIVE-431 arm. Empty by default so every test written before donations
 *  folded in still reads as it did. */
let donationRows: Record<string, unknown>[] = []

// 🔴 THE MOCK IS TABLE-AWARE, and it has to be. It used to return the SAME seeded rows to every
// query, which was harmless while this module read one table and silently wrong the moment it read
// three: the events lookup and the ticket read would each have been handed the commerce_orders rows,
// and the assertions would have passed on numbers that came from the wrong place entirely.
// LIVE-431 adds a fourth table. Same rule.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    let table = ''
    const chain: Record<string, unknown> = {
      from: (t: string) => {
        table = t
        return chain
      },
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      or: () => chain,
      in: () => chain,
      not: () => chain,
      then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        const data =
          table === 'event_tickets'
            ? ticketRows
            : table === 'events'
              ? eventRows
              : table === 'space_donations'
                ? donationRows
                : rows
        return Promise.resolve(resolve({ data, error: null }))
      },
    }
    return chain
  },
}))

import { spaceEarningsSummary } from './orders'

beforeEach(() => {
  rows = []
  ticketRows = []
  donationRows = []
  // One event, so the ticket arm gets past its "no events, nothing to sum" early return whenever a
  // test seeds tickets. Tests that seed none are unaffected either way.
  eventRows = [{ id: 'event-1' }]
})

describe('spaceEarningsSummary — network-sourced split', () => {
  it('splits settled gross + fee into the network-sourced slice, self orders excluded', async () => {
    rows = [
      // A self booking: counts toward gross, NOT toward network.
      { amount_cents: 10000, platform_fee_cents: 0, status: 'paid', source: 'self' },
      // A network-sourced sale: counts toward gross AND the network slice.
      { amount_cents: 5000, platform_fee_cents: 500, status: 'fulfilled', source: 'network' },
      // A second network-sourced sale.
      { amount_cents: 2000, platform_fee_cents: 200, status: 'paid', source: 'network' },
      // A refund: refunded total only, never gross/network.
      { amount_cents: 3000, platform_fee_cents: 0, status: 'refunded', source: 'network' },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(17000) // 10000 + 5000 + 2000
    expect(e.feeCents).toBe(700) // 0 + 500 + 200
    expect(e.netCents).toBe(16300)
    expect(e.refundedCents).toBe(3000)
    expect(e.orderCount).toBe(4)
    // The network slice: only the two source='network' settled orders.
    expect(e.networkGrossCents).toBe(7000)
    expect(e.networkFeeCents).toBe(700)
    expect(e.networkOrderCount).toBe(2)
  })

  it('a null / missing / unrecognized source never counts as network (default-safe to self)', async () => {
    rows = [
      { amount_cents: 4000, platform_fee_cents: 0, status: 'paid', source: null },
      { amount_cents: 4000, platform_fee_cents: 0, status: 'paid' }, // no source key
      { amount_cents: 4000, platform_fee_cents: 0, status: 'paid', source: 'nonsense' },
    ]
    const e = await spaceEarningsSummary('space-1')
    expect(e.grossCents).toBe(12000)
    expect(e.networkGrossCents).toBe(0)
    expect(e.networkOrderCount).toBe(0)
  })

  it('no space id → all zeros (fail-safe)', async () => {
    const e = await spaceEarningsSummary('')
    expect(e).toEqual({
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
      refundedCents: 0,
      orderCount: 0,
      networkGrossCents: 0,
      networkFeeCents: 0,
      networkOrderCount: 0,
    })
  })
})

// LIVE-160 — a PARTIAL refund (SCAN-572) keeps the order's settled status and records the amounts in
// commerce_orders.metadata.refund, so a summary that reads `status` alone counts a half-refunded order
// at FULL gross. The fee is netted by the same share Stripe refunds the application fee at, which is
// the same share recordPartialCommerceRefund reverses in the ledger — so the widget and the ledger
// agree instead of drifting by the refunded slice.
describe('spaceEarningsSummary — partially refunded orders (LIVE-160)', () => {
  const partial = (refundedCents: number) => ({
    refund: { kind: 'partial', refunded_cents: refundedCents, retained_cents: 0, revenue_reversed_cents: 0 },
  })

  it('nets the refunded share out of gross, fee and net, and counts it as refunded', async () => {
    rows = [
      // A $100 sale at a 10% fee, half refunded: $50 of gross stands and $5 of fee with it.
      { amount_cents: 10000, platform_fee_cents: 1000, status: 'paid', source: 'self', metadata: partial(5000) },
    ]
    const e = await spaceEarningsSummary('space-1')
    expect(e.grossCents).toBe(5000)
    expect(e.feeCents).toBe(500)
    expect(e.netCents).toBe(4500)
    expect(e.refundedCents).toBe(5000)
    // The sale still happened: it stays one order in the count.
    expect(e.orderCount).toBe(1)
  })

  it('nets the network slice too, so the honest receipt is not overstated either', async () => {
    rows = [
      { amount_cents: 10000, platform_fee_cents: 1000, status: 'fulfilled', source: 'network', metadata: partial(2500) },
    ]
    const e = await spaceEarningsSummary('space-1')
    expect(e.networkGrossCents).toBe(7500)
    expect(e.networkFeeCents).toBe(750)
    expect(e.networkOrderCount).toBe(1)
    expect(e.grossCents).toBe(7500)
  })

  it('adds partial refunds to the same refunded total as fully refunded orders', async () => {
    rows = [
      { amount_cents: 10000, platform_fee_cents: 0, status: 'paid', source: 'self', metadata: partial(2000) },
      { amount_cents: 3000, platform_fee_cents: 0, status: 'refunded', source: 'self' },
    ]
    const e = await spaceEarningsSummary('space-1')
    expect(e.refundedCents).toBe(5000)
    expect(e.grossCents).toBe(8000)
  })

  it('ignores metadata that is not a well-formed partial record', async () => {
    rows = [
      { amount_cents: 10000, platform_fee_cents: 0, status: 'paid', source: 'self', metadata: null },
      { amount_cents: 10000, platform_fee_cents: 0, status: 'paid', source: 'self', metadata: {} },
      { amount_cents: 10000, platform_fee_cents: 0, status: 'paid', source: 'self', metadata: { refund: { kind: 'full' } } },
      {
        amount_cents: 10000,
        platform_fee_cents: 0,
        status: 'paid',
        source: 'self',
        metadata: { refund: { kind: 'partial', refunded_cents: 'oops' } },
      },
    ]
    const e = await spaceEarningsSummary('space-1')
    expect(e.grossCents).toBe(40000)
    expect(e.refundedCents).toBe(0)
  })

  it('never lets a malformed over-refund drive gross negative', async () => {
    rows = [{ amount_cents: 10000, platform_fee_cents: 1000, status: 'paid', source: 'self', metadata: partial(99999) }]
    const e = await spaceEarningsSummary('space-1')
    expect(e.grossCents).toBe(0)
    expect(e.feeCents).toBe(0)
    expect(e.refundedCents).toBe(10000)
  })
})

// ── LIVE-375: ticket sales are earnings too ──────────────────────────────────────────────────────
//
// The defect this pins: spaceEarningsSummary read `commerce_orders` and nothing else, while an event
// ticket sale writes `event_tickets`. A Space that had sold tickets read $0.00 under a line that
// said "No sales yet" — measured against production, where commerce_orders held zero rows platform
// wide and a Space had a succeeded $44.00 ticket.
describe('spaceEarningsSummary — event ticket sales (LIVE-375)', () => {
  it('🔴 counts a succeeded ticket when there is no commerce order at all', async () => {
    // Exactly the production shape that produced the report.
    rows = []
    ticketRows = [{ amount_cents: 4400, platform_fee_cents: 132, status: 'succeeded', refunded_at: null }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents, 'the sale must reach gross; this is the $0.00 the owner saw').toBe(4400)
    expect(e.feeCents).toBe(132)
    expect(e.netCents).toBe(4268)
    expect(e.orderCount).toBe(1)
  })

  it('adds ticket earnings to commerce earnings rather than replacing them', async () => {
    rows = [{ amount_cents: 10000, platform_fee_cents: 1000, status: 'paid', source: 'self' }]
    ticketRows = [{ amount_cents: 4400, platform_fee_cents: 132, status: 'succeeded', refunded_at: null }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(14400)
    expect(e.feeCents).toBe(1132)
    expect(e.netCents).toBe(13268)
    expect(e.orderCount).toBe(2)
  })

  it('a refunded ticket moves to refunded and never to gross', async () => {
    ticketRows = [
      { amount_cents: 4400, platform_fee_cents: 132, status: 'succeeded', refunded_at: null },
      { amount_cents: 2200, platform_fee_cents: 66, status: 'refunded', refunded_at: '2026-09-16T00:00:00Z' },
      // A hand-repaired row: the stamp alone is enough, so it cannot be counted as revenue.
      { amount_cents: 1100, platform_fee_cents: 33, status: 'succeeded', refunded_at: '2026-09-16T00:00:00Z' },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(4400)
    expect(e.refundedCents).toBe(3300)
    expect(e.orderCount).toBe(3)
  })

  it('🔴 never adds a ticket to the NETWORK slice, because event_tickets has no source column', async () => {
    // Brand promise #4 is only provable while this number cannot be overstated. A ticket sale has no
    // honest claim to being network-sourced, so it must land in gross and in neither network figure.
    ticketRows = [{ amount_cents: 9900, platform_fee_cents: 990, status: 'succeeded', refunded_at: null }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(9900)
    expect(e.networkGrossCents).toBe(0)
    expect(e.networkFeeCents).toBe(0)
    expect(e.networkOrderCount).toBe(0)
  })

  it('a Space with no events reads zero tickets without touching event_tickets', async () => {
    eventRows = []
    // Seeded, and must not be reached: with no events there is nothing to attribute them to.
    ticketRows = [{ amount_cents: 5000, platform_fee_cents: 500, status: 'succeeded', refunded_at: null }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(0)
    expect(e.orderCount).toBe(0)
  })

  it('a pending or failed ticket is not revenue', async () => {
    ticketRows = [
      { amount_cents: 4400, platform_fee_cents: 132, status: 'pending', refunded_at: null },
      { amount_cents: 4400, platform_fee_cents: 132, status: 'failed', refunded_at: null },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(0)
    expect(e.orderCount).toBe(0)
  })
})

// ── LIVE-431: gifts to the Space fund are earnings too ───────────────────────────────────────────
//
// The leftover LIVE-375 left: spaceEarningsSummary grew a ticket arm and still did not read
// space_donations. A gift never writes commerce_orders. A Space whose only money was the fund
// still read $0.00 under "No sales yet".
describe('spaceEarningsSummary — Space fund gifts (LIVE-431)', () => {
  it('counts a succeeded gift when there is no commerce order and no ticket', async () => {
    donationRows = [{ amount_cents: 2500, platform_fee_cents: 0, status: 'succeeded', refunded_at: null, source: 'self' }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents, 'the gift must reach gross; this is the $0.00 the leftover named').toBe(2500)
    expect(e.feeCents).toBe(0)
    expect(e.netCents).toBe(2500)
    expect(e.orderCount).toBe(1)
    expect(e.networkGrossCents).toBe(0)
  })

  it('adds gifts to commerce and ticket earnings rather than replacing them', async () => {
    rows = [{ amount_cents: 10000, platform_fee_cents: 1000, status: 'paid', source: 'self' }]
    ticketRows = [{ amount_cents: 4400, platform_fee_cents: 132, status: 'succeeded', refunded_at: null }]
    donationRows = [{ amount_cents: 2500, platform_fee_cents: 0, status: 'succeeded', refunded_at: null, source: 'self' }]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(16900)
    expect(e.feeCents).toBe(1132)
    expect(e.netCents).toBe(15768)
    expect(e.orderCount).toBe(3)
  })

  it('a refunded gift moves to refunded and never to gross', async () => {
    donationRows = [
      { amount_cents: 2500, platform_fee_cents: 0, status: 'succeeded', refunded_at: null, source: 'self' },
      { amount_cents: 1500, platform_fee_cents: 0, status: 'refunded', refunded_at: '2026-09-20T00:00:00Z', source: 'self' },
      { amount_cents: 800, platform_fee_cents: 0, status: 'succeeded', refunded_at: '2026-09-20T00:00:00Z', source: 'self' },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(2500)
    expect(e.refundedCents).toBe(2300)
    expect(e.orderCount).toBe(3)
  })

  it('a network-sourced gift lands in the network slice, because space_donations stores source', async () => {
    donationRows = [
      { amount_cents: 2500, platform_fee_cents: 0, status: 'succeeded', refunded_at: null, source: 'self' },
      { amount_cents: 4000, platform_fee_cents: 400, status: 'succeeded', refunded_at: null, source: 'network' },
      { amount_cents: 1000, platform_fee_cents: 100, status: 'succeeded', refunded_at: null, source: null },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(7500)
    expect(e.networkGrossCents).toBe(4000)
    expect(e.networkFeeCents).toBe(400)
    expect(e.networkOrderCount).toBe(1)
  })

  it('a pending or abandoned gift is not revenue', async () => {
    donationRows = [
      { amount_cents: 2500, platform_fee_cents: 0, status: 'pending', refunded_at: null, source: 'self' },
      { amount_cents: 2500, platform_fee_cents: 0, status: 'abandoned', refunded_at: null, source: 'self' },
    ]
    const e = await spaceEarningsSummary('space-1', 30)
    expect(e.grossCents).toBe(0)
    expect(e.orderCount).toBe(0)
    expect(e.networkGrossCents).toBe(0)
  })
})
