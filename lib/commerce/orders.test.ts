import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 5 (ADR-811 §A): spaceEarningsSummary splits settled earnings into the slice the NETWORK sourced
// (source='network') vs the operator's own bookings. The contract that carries the promise: an order that
// is NOT explicitly 'network' (null / 'self' / anything else) NEVER counts toward the network figure, so
// the receipt can never overstate what we earned on. We mock the admin client's query chain with an
// in-memory row set.

let rows: Record<string, unknown>[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    // Every builder method returns the same thenable chain; awaiting it resolves to the seeded rows.
    const chain: Record<string, unknown> = {
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: rows, error: null })),
    }
    return chain
  },
}))

import { spaceEarningsSummary } from './orders'

beforeEach(() => {
  rows = []
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
