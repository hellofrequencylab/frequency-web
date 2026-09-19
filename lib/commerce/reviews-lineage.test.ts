import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-392: a re-price archives the product row. Reviews hang off that uuid. The reader has to
// ask for every product that shares the Journey plan, then show them against the live listing.

type ReviewRow = {
  id: string
  product_id: string
  rating: number
  body: string
  verified_purchase: boolean
  created_at: string
  reviewer_profile_id: string
  reviewer: { display_name: string; avatar_url: string | null }
  status?: string
}

const state = vi.hoisted(() => {
  const products: { id: string; journey_plan_id: string | null }[] = []
  const reviews: ReviewRow[] = []
  const inFilters: { table: string; column: string; values: unknown[] }[] = []
  return {
    products,
    reviews,
    inFilters,
    reset() {
      products.length = 0
      reviews.length = 0
      inFilters.length = 0
    },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let selected: string[] = []
      let statusEq: string | null = null
      let idEq: string | null = null
      let inCol: string | null = null
      let inVals: unknown[] = []
      let planEq: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: (cols: string) => {
          selected = cols.split(',').map((c) => c.trim())
          return b
        },
        eq: (col: string, val: unknown) => {
          if (col === 'id') idEq = String(val)
          if (col === 'status') statusEq = String(val)
          if (col === 'journey_plan_id') planEq = String(val)
          return b
        },
        in: (col: string, vals: unknown[]) => {
          inCol = col
          inVals = vals
          state.inFilters.push({ table, column: col, values: vals })
          return b
        },
        order: () => b,
        limit: () => b,
        maybeSingle: () => {
          if (table === 'commerce_products') {
            const row = state.products.find((p) => p.id === idEq) ?? null
            return Promise.resolve({ data: row, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (table === 'commerce_products') {
            let rows = state.products
            if (planEq) rows = rows.filter((p) => p.journey_plan_id === planEq)
            if (inCol === 'id') rows = rows.filter((p) => inVals.includes(p.id))
            if (inCol === 'journey_plan_id') {
              rows = rows.filter((p) => p.journey_plan_id && inVals.includes(p.journey_plan_id))
            }
            const data = selected.includes('journey_plan_id')
              ? rows.map((p) => ({ id: p.id, journey_plan_id: p.journey_plan_id }))
              : rows.map((p) => ({ id: p.id }))
            return Promise.resolve({ data, error: null }).then(resolve, reject)
          }
          if (table === 'commerce_reviews') {
            let rows = state.reviews
            if (inCol === 'product_id') rows = rows.filter((r) => inVals.includes(r.product_id))
            if (statusEq) rows = rows.filter((r) => (r.status ?? 'visible') === statusEq)
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }),
}))

import { getProductReviews, productRatingsFor } from './reviews'

beforeEach(() => {
  state.reset()
})

describe('reviews resolve through the Journey plan (LIVE-392)', () => {
  it('shows a review left on the archived product against the live listing', async () => {
    state.products.push(
      { id: 'live', journey_plan_id: 'plan-1' },
      { id: 'archived', journey_plan_id: 'plan-1' },
    )
    state.reviews.push({
      id: 'rev-1',
      product_id: 'archived',
      rating: 5,
      body: 'Changed my mornings.',
      verified_purchase: true,
      created_at: '2026-09-01T00:00:00Z',
      reviewer_profile_id: 'm1',
      reviewer: { display_name: 'Sam', avatar_url: null },
    })

    const wall = await getProductReviews('live')

    expect(state.inFilters.some((f) => f.table === 'commerce_reviews' && f.values.includes('archived'))).toBe(
      true,
    )
    expect(wall.count).toBe(1)
    expect(wall.average).toBe(5)
    expect(wall.latest[0].body).toBe('Changed my mornings.')
  })

  it('attributes archived-row stars to the live Market card', async () => {
    state.products.push(
      { id: 'live', journey_plan_id: 'plan-1' },
      { id: 'archived', journey_plan_id: 'plan-1' },
      { id: 'other', journey_plan_id: null },
    )
    state.reviews.push({
      id: 'rev-1',
      product_id: 'archived',
      rating: 4,
      body: 'Good.',
      verified_purchase: false,
      created_at: '2026-09-01T00:00:00Z',
      reviewer_profile_id: 'm1',
      reviewer: { display_name: 'Sam', avatar_url: null },
    })

    const map = await productRatingsFor(['live', 'other'])
    expect(map.get('live')).toEqual({ average: 4, count: 1 })
    expect(map.has('other')).toBe(false)
  })
})
