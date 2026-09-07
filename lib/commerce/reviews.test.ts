import { describe, it, expect, vi, beforeEach } from 'vitest'

// SCAN-539 — upsertProductReview's PRIOR-STATUS read (lib/commerce/reviews.ts).
//
// A PostgREST failure arrives in `error`, not as a throw, so the read that decides whether this
// member's review is already `hidden` used to answer "no prior row" on an outage and write status
// 'visible' — un-hiding a review an operator had moderated, at the author's own request. The direction
// chosen is FAIL CLOSED ON THE WRITE: an unreadable prior status refuses the upsert (returns false, the
// caller's "Could not save your review. Try again." arm) rather than guessing either way.
//
// The admin client is a scripted fake: the `select` result is per-test, and every `upsert` payload is
// recorded so the assertions read the WRITE, not the return value.

interface UpsertCall {
  table: string
  payload: Record<string, unknown>
}

const state = vi.hoisted(() => {
  const upserts: { table: string; payload: Record<string, unknown> }[] = []
  let selectResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }
  return {
    upserts,
    get selectResult() {
      return selectResult
    },
    setSelectResult(r: { data: unknown; error: { message: string } | null }) {
      selectResult = r
    },
    reset() {
      upserts.length = 0
      selectResult = { data: null, error: null }
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
        maybeSingle: () => Promise.resolve(state.selectResult),
        upsert: (payload: Record<string, unknown>) => {
          state.upserts.push({ table, payload })
          return Promise.resolve({ error: null })
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
    expect(state.upserts).toHaveLength(0)
  })

  it('never writes status visible on an unreadable read, whatever else changes', async () => {
    state.setSelectResult({ data: null, error: { message: '57014 statement timeout' } })
    await upsertProductReview(input)
    const wroteVisible = state.upserts.some((c: UpsertCall) => c.payload.status === 'visible')
    expect(wroteVisible).toBe(false)
  })

  it('still preserves an existing hidden status on a clean read (moderation stays durable)', async () => {
    state.setSelectResult({ data: { status: 'hidden' }, error: null })
    const saved = await upsertProductReview(input)
    expect(saved).toBe(true)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0].payload.status).toBe('hidden')
  })

  it('still defaults a genuinely new review to visible (no row, no error)', async () => {
    state.setSelectResult({ data: null, error: null })
    const saved = await upsertProductReview(input)
    expect(saved).toBe(true)
    expect(state.upserts[0].payload.status).toBe('visible')
  })
})
