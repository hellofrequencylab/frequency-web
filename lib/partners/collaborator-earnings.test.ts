import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

// LIVE-708: a collaborator's Journey earnings are what the sale lines settled, on the Orders tab's
// money rules applied per line.

import { foldJourneyEarnings, type JourneySaleLine } from './collaborator-earnings'

const PLANS = new Map([
  ['p1', { title: 'Morning reset', slug: 'morning-reset' }],
  ['p2', { title: 'Sleep well', slug: null }],
])

const line = (over: Partial<Omit<JourneySaleLine, 'order'>> & { order?: Partial<JourneySaleLine['order']> }): JourneySaleLine => ({
  planId: 'p1',
  subtotalCents: 2000,
  orderItemsCents: 2000,
  ...over,
  order: { status: 'paid', amountCents: 2000, platformFeeCents: 200, metadata: null, ...(over.order ?? {}) },
})

describe('foldJourneyEarnings', () => {
  it('counts a settled sale net of the platform fee', () => {
    const e = foldJourneyEarnings([line({})], PLANS)
    expect(e).toMatchObject({ grossCents: 2000, feeCents: 200, netCents: 1800, refundedCents: 0, sales: 1 })
    expect(e.journeys[0]).toMatchObject({ title: 'Morning reset', slug: 'morning-reset', netCents: 1800 })
  })

  it('shares the fee by subtotal when the Journey rode with other things', () => {
    const e = foldJourneyEarnings([line({ orderItemsCents: 4000, order: { amountCents: 4500, platformFeeCents: 400 } })], PLANS)
    expect(e).toMatchObject({ grossCents: 2000, feeCents: 200, netCents: 1800 })
  })

  it('takes a partial refund off the line and gives the fee back pro-rata', () => {
    const e = foldJourneyEarnings(
      [line({ order: { metadata: { refund: { kind: 'partial', refunded_cents: 500 } } } })],
      PLANS,
    )
    expect(e).toMatchObject({ grossCents: 1500, feeCents: 150, netCents: 1350, refundedCents: 500, sales: 1 })
  })

  it('counts a refunded order as refunded and ignores unsettled ones', () => {
    const e = foldJourneyEarnings(
      [
        line({ order: { status: 'refunded' } }),
        line({ planId: 'p2', order: { status: 'pending' } }),
        line({ planId: 'p2', order: { status: 'failed' } }),
      ],
      PLANS,
    )
    expect(e).toMatchObject({ grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 2000, sales: 1 })
    expect(e.journeys.map((j) => j.planId)).toEqual(['p1'])
  })

  it('orders Journeys by what they earned', () => {
    const e = foldJourneyEarnings([line({}), line({ planId: 'p2', subtotalCents: 5000, orderItemsCents: 5000, order: { amountCents: 5000, platformFeeCents: 500 } })], PLANS)
    expect(e.journeys.map((j) => j.title)).toEqual(['Sleep well', 'Morning reset'])
    expect(e.netCents).toBe(1800 + 4500)
  })
})
