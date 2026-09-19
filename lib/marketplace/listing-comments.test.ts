import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => {
  const products: { id: string; journey_plan_id: string | null }[] = []
  const comments: { id: string; target_id: string; body: string; image_url: null; created_at: string; author: null }[] =
    []
  const inFilters: unknown[][] = []
  return {
    products,
    comments,
    inFilters,
    reset() {
      products.length = 0
      comments.length = 0
      inFilters.length = 0
    },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let idEq: string | null = null
      let planEq: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          if (col === 'id') idEq = String(val)
          if (col === 'journey_plan_id') planEq = String(val)
          if (col === 'target_kind') return b
          return b
        },
        in: (_col: string, vals: unknown[]) => {
          if (table === 'listing_comments') state.inFilters.push(vals)
          return b
        },
        order: () => b,
        limit: () => b,
        maybeSingle: () => {
          const row = state.products.find((p) => p.id === idEq) ?? null
          return Promise.resolve({ data: row, error: null })
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (table === 'commerce_products') {
            const rows = planEq
              ? state.products.filter((p) => p.journey_plan_id === planEq)
              : state.products
            return Promise.resolve({ data: rows.map((p) => ({ id: p.id })), error: null }).then(
              resolve,
              reject,
            )
          }
          const asked = state.inFilters.at(-1) ?? []
          const rows = state.comments.filter((c) => asked.includes(c.target_id))
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }),
}))

import { getListingComments } from './listing-comments'

beforeEach(() => {
  state.reset()
})

describe('listing Q&A resolves through the Journey plan (LIVE-392)', () => {
  it('returns a question left on the archived product uuid', async () => {
    state.products.push(
      { id: 'live', journey_plan_id: 'plan-1' },
      { id: 'archived', journey_plan_id: 'plan-1' },
    )
    state.comments.push({
      id: 'c1',
      target_id: 'archived',
      body: 'Does this include the Tuesday session?',
      image_url: null,
      created_at: '2026-09-01T00:00:00Z',
      author: null,
    })

    const rows = await getListingComments('product', 'live')
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toBe('Does this include the Tuesday session?')
  })
})
