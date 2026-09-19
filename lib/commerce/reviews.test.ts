import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — upsertProductReview's PRIOR-STATUS read (lib/commerce/reviews.ts).
//
// A PostgREST failure arrives in `error`, not as a throw, so the read that decides whether this
// member's review is already `hidden` used to answer "no prior row" on an outage and write status
// 'visible' — un-hiding a review an operator had moderated, at the author's own request. The direction
// chosen is FAIL CLOSED ON THE WRITE: an unreadable prior status refuses the upsert (returns false, the
// caller's "Could not save your review. Try again." arm) rather than guessing either way.
//
// The admin client is a scripted fake: the `select` result is per-test, and every `upsert`/`update`
// payload is recorded so the assertions read the WRITE, not the return value.

interface WriteCall {
  table: string
  payload: Record<string, unknown>
  kind: 'upsert' | 'update'
}

const state = vi.hoisted(() => {
  const writes: WriteCall[] = []
  let selectResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
  let productRow: { id: string; journey_plan_id: string | null } = { id: 'p1', journey_plan_id: null }
  return {
    writes,
    get selectResult() {
      return selectResult
    },
    get productRow() {
      return productRow
    },
    setSelectResult(r: { data: unknown; error: { message: string } | null }) {
      selectResult = r
    },
    setProductRow(r: { id: string; journey_plan_id: string | null }) {
      productRow = r
    },
    reset() {
      writes.length = 0
      selectResult = { data: null, error: null }
      productRow = { id: 'p1', journey_plan_id: null }
    },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () =>
          Promise.resolve(
            table === 'commerce_products'
              ? { data: state.productRow, error: null }
              : state.selectResult,
          ),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          if (table === 'commerce_products') {
            return Promise.resolve({ data: [{ id: state.productRow.id }], error: null }).then(
              resolve,
              reject,
            )
          }
          const raw = state.selectResult
          const data =
            raw.error || raw.data == null || Array.isArray(raw.data) ? raw.data : [raw.data]
          return Promise.resolve({ data, error: raw.error }).then(resolve, reject)
        },
        upsert: (payload: Record<string, unknown>) => {
          state.writes.push({ table, payload, kind: 'upsert' })
          return Promise.resolve({ error: null })
        },
        update: (payload: Record<string, unknown>) => {
          state.writes.push({ table, payload, kind: 'update' })
          const eq = () => ({ eq: () => Promise.resolve({ error: null }) })
          return { eq }
        },
      }
      return b
    },
  }),
}))

import { upsertProductReview } from './reviews'

const input = {
  productId: 'p1',
  reviewerProfileId: 'm1',
  rating: 5,
  body: 'Loved it.',
  verifiedPurchase: true,
}

beforeEach(() => {
  state.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('upsertProductReview — the prior moderation status read (SCAN-539)', () => {
  it('REFUSES the write when the prior status is unreadable, rather than defaulting to visible', async () => {
    // The old code destructured `data` only: this error was invisible, `existing` came back null, and
    // the upsert went out with status 'visible' — reversing an operator's hide.
    state.setSelectResult({ data: null, error: { message: 'timeout' } })

    const saved = await upsertProductReview(input)

    expect(saved).toBe(false)
    expect(state.writes).toHaveLength(0)
  })

  it('never writes status visible on an unreadable read, whatever else changes', async () => {
    state.setSelectResult({ data: null, error: { message: '57014 statement timeout' } })
    await upsertProductReview(input)
    const wroteVisible = state.writes.some((c: WriteCall) => c.payload.status === 'visible')
    expect(wroteVisible).toBe(false)
  })

  it('still preserves an existing hidden status on a clean read (moderation stays durable)', async () => {
    state.setSelectResult({ data: { status: 'hidden', product_id: 'p1' }, error: null })
    const saved = await upsertProductReview(input)
    expect(saved).toBe(true)
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0].kind).toBe('update')
    expect(state.writes[0].payload.status).toBe('hidden')
  })

  it('still defaults a genuinely new review to visible (no row, no error)', async () => {
    state.setSelectResult({ data: null, error: null })
    const saved = await upsertProductReview(input)
    expect(saved).toBe(true)
    expect(state.writes[0].kind).toBe('upsert')
    expect(state.writes[0].payload.status).toBe('visible')
  })

  it('edits the archived product row instead of inserting on the live uuid after a re-price', async () => {
    state.setProductRow({ id: 'p-live', journey_plan_id: 'plan-1' })
    state.setSelectResult({ data: { status: 'visible', product_id: 'p-old' }, error: null })
    const saved = await upsertProductReview({ ...input, productId: 'p-live' })
    expect(saved).toBe(true)
    expect(state.writes[0].kind).toBe('update')
    expect(state.writes[0].payload.product_id).toBe('p-old')
  })
})
