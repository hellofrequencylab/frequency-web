import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LOCAL_DELETE_PLAN,
  UNKNOWN_DELETE_PLAN,
  deleteReachesOtherDates,
  deleteRefusal,
  deleteSeriesButtonLabel,
  deleteWarning,
  type EventDeletePlan,
} from './delete-plan'

// LIVE-535. Deleting the ANCHOR of a materialised event series cascades to every other date and the
// RSVPs, tickets and check-ins under each of them, because `events.parent_event_id` is
// `ON DELETE CASCADE`. Two halves are pinned here:
//
//   1. THE PREDICATE — deleteReachesOtherDates, which BOTH the surfaces and the server action branch
//      on, so a warning can never disagree with what the delete does. Its fail-closed direction on an
//      unreadable plan is the case that matters most and the easiest one to "simplify" away.
//   2. THE SENTENCES — every one of them, because on this surface the copy IS the safety feature. The
//      host Manage confirm used to read "If this event is part of a series, only this date is
//      deleted", which was the exact opposite of what the press did to an anchor.

const anchor = (over: Partial<EventDeletePlan> = {}): EventDeletePlan => ({
  isAnchor: true,
  otherDates: 13,
  pastDates: 4,
  futureDates: 9,
  rsvpsAtRisk: 2,
  truncated: false,
  unknown: false,
  ...over,
})

describe('deleteReachesOtherDates: the one predicate both the UI and the action branch on', () => {
  it('is false for a one-off, so an ordinary delete is never blocked', () => {
    expect(deleteReachesOtherDates(LOCAL_DELETE_PLAN)).toBe(false)
  })

  it('is false for a child occurrence, which is the local delete the operator asked for', () => {
    // A child carries parent_event_id and nothing points at it, so the loader hands back the local
    // plan. Deleting one date of a series from its own page must keep working in one press.
    expect(deleteReachesOtherDates({ ...LOCAL_DELETE_PLAN, isAnchor: false, otherDates: 0 })).toBe(false)
  })

  it('is true for a series anchor', () => {
    expect(deleteReachesOtherDates(anchor())).toBe(true)
  })

  it('🔴 is true for an UNREADABLE plan, so a failed read refuses instead of waving the cascade through', () => {
    // The dangerous row looks exactly like an ordinary one, so "we could not check" has to mean
    // "assume it is the dangerous one". Flipping this to `isAnchor && otherDates > 0` is the mutation
    // that turns a fail-safe into a fail-open.
    expect(UNKNOWN_DELETE_PLAN.unknown).toBe(true)
    expect(UNKNOWN_DELETE_PLAN.isAnchor).toBe(false)
    expect(deleteReachesOtherDates(UNKNOWN_DELETE_PLAN)).toBe(true)
  })

  it('is false for an anchor row whose series has no other dates left', () => {
    // Every child already deleted: the cascade has nothing to take, so this is a one-row delete and
    // must not be gated behind a scope the caller has no reason to pass.
    expect(deleteReachesOtherDates(anchor({ otherDates: 0, pastDates: 0, futureDates: 0 }))).toBe(false)
  })
})

describe('deleteWarning: what the operator reads before the confirm', () => {
  it('names the count, the RSVPs, the past dates, and that it cannot be undone', () => {
    const w = deleteWarning(anchor())
    expect(w).toContain('13 other dates')
    expect(w).toContain('RSVP')
    expect(w).toContain('4 of those dates have already happened')
    expect(w).toMatch(/cannot be undone/i)
  })

  it('points at Cancel, which is reversible and refunds, rather than leaving delete as the only verb', () => {
    expect(deleteWarning(anchor())).toContain('Cancel the rest of this series')
  })

  it('says "1 other date" rather than "1 other dates"', () => {
    expect(deleteWarning(anchor({ otherDates: 1, pastDates: 0, futureDates: 1 }))).toContain('1 other date and')
  })

  it('says "has already happened" for one past date', () => {
    expect(deleteWarning(anchor({ otherDates: 1, pastDates: 1, futureDates: 0 }))).toContain(
      '1 of those dates has already happened',
    )
  })

  it('leaves the past-dates sentence out when every other date is still to come', () => {
    expect(deleteWarning(anchor({ pastDates: 0, futureDates: 13 }))).not.toMatch(/already happened/)
  })

  it('leaves the bookings sentence out when nobody has RSVPd', () => {
    expect(deleteWarning(anchor({ rsvpsAtRisk: 0 }))).not.toMatch(/lose a booking/)
  })

  it('🔴 says "at least" when the count was truncated, so the warning never understates the cascade', () => {
    const w = deleteWarning(anchor({ otherDates: 400, truncated: true }))
    expect(w).toContain('at least 400 other dates')
  })

  it('🔴 for an unreadable plan says the check did not happen, and never claims the delete is local', () => {
    const w = deleteWarning(UNKNOWN_DELETE_PLAN)
    expect(w).toMatch(/could not check/i)
    expect(w).not.toMatch(/only this date/i)
  })

  it('🔴 never tells a reader that only this date goes without qualifying it on the series', () => {
    // The regression guard for the sentence that cost a series. The local warning may say "only this
    // date goes", but only inside the clause that makes it conditional on being one date OF a series.
    const local = deleteWarning(LOCAL_DELETE_PLAN)
    expect(local).toContain('If it is one date of a series, only this date goes')
    expect(deleteWarning(anchor())).not.toMatch(/only this date/i)
  })

  it('carries no em dash, per docs/CONTENT-VOICE.md', () => {
    for (const p of [LOCAL_DELETE_PLAN, UNKNOWN_DELETE_PLAN, anchor()]) {
      expect(deleteWarning(p)).not.toContain('—')
      expect(deleteRefusal(p)).not.toContain('—')
    }
  })
})

describe('deleteSeriesButtonLabel: the destructive button says the number too', () => {
  it('names the count rather than a bare verb', () => {
    expect(deleteSeriesButtonLabel(anchor())).toBe('Delete this date and 13 other dates')
  })

  it('carries the "at least" through to the button', () => {
    expect(deleteSeriesButtonLabel(anchor({ otherDates: 400, truncated: true }))).toBe(
      'Delete this date and at least 400 other dates',
    )
  })
})

describe('deleteRefusal: what the two surfaces that show no count say instead', () => {
  it('names the count and says nothing was deleted', () => {
    const r = deleteRefusal(anchor())
    expect(r).toContain('13 other dates')
    expect(r).toMatch(/nothing has changed/i)
  })

  it('points at the reversible route and at where the real series delete lives', () => {
    const r = deleteRefusal(anchor())
    expect(r).toContain('Cancel the rest of this series')
    expect(r).toMatch(/settings/i)
  })

  it('🔴 for an unreadable plan says so plainly rather than inventing a count', () => {
    const r = deleteRefusal(UNKNOWN_DELETE_PLAN)
    expect(r).toMatch(/could not check/i)
    expect(r).not.toMatch(/\d+ other date/)
    expect(r).toMatch(/nothing has changed/i)
  })
})

// ── THE LOADER'S FAIL-CLOSED DIRECTION ───────────────────────────────────────────────────────────
// loadEventDeletePlan never throws, and a failure must never look like "safe to delete". These run it
// against a fake PostgREST rather than a database.

const state: {
  self: { data: unknown; error: { message: string } | null }
  kids: { data: unknown; error: { message: string } | null }
  rsvps: { count: number | null; error: { message: string } | null }
  throwOnClient: boolean
} = {
  self: { data: null, error: null },
  kids: { data: [], error: null },
  rsvps: { count: 0, error: null },
  throwOnClient: false,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (state.throwOnClient) throw new Error('no service role key')
    const builder = (table: string) => {
      let counting = false
      const api: Record<string, unknown> = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count) counting = true
          return api
        },
        eq: () => api,
        order: () => api,
        in: () => (counting ? Promise.resolve(state.rsvps) : Promise.resolve(state.kids)),
        limit: () => Promise.resolve(state.kids),
        maybeSingle: () => Promise.resolve(state.self),
      }
      if (table === 'event_rsvps') counting = true
      return api
    }
    return { from: (t: string) => builder(t) }
  },
}))

vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const ANCHOR_ID = 'aaaaaaaa-0000-4000-a000-00000000000a'

describe('loadEventDeletePlan: never throws, never reports a failed read as safe', () => {
  beforeEach(() => {
    state.self = { data: { id: ANCHOR_ID, parent_event_id: null }, error: null }
    state.kids = { data: [], error: null }
    state.rsvps = { count: 0, error: null }
    state.throwOnClient = false
  })

  it('an empty id is unknown, not local', async () => {
    const { loadEventDeletePlan } = await import('./deletion')
    expect((await loadEventDeletePlan('')).unknown).toBe(true)
  })

  it('a child occurrence is local and never counts anything', async () => {
    state.self = { data: { id: 'child', parent_event_id: ANCHOR_ID }, error: null }
    const { loadEventDeletePlan } = await import('./deletion')
    const plan = await loadEventDeletePlan('child')
    expect(plan).toEqual(LOCAL_DELETE_PLAN)
    expect(deleteReachesOtherDates(plan)).toBe(false)
  })

  it('an anchor with no children is local', async () => {
    const { loadEventDeletePlan } = await import('./deletion')
    expect(await loadEventDeletePlan(ANCHOR_ID)).toEqual(LOCAL_DELETE_PLAN)
  })

  it('a missing row is local rather than unknown, because there is nothing to cascade', async () => {
    state.self = { data: null, error: null }
    const { loadEventDeletePlan } = await import('./deletion')
    expect(await loadEventDeletePlan(ANCHOR_ID)).toEqual(LOCAL_DELETE_PLAN)
  })

  it('🔴 a failed row read is unknown, so the delete is refused rather than allowed', async () => {
    state.self = { data: null, error: { message: 'connection reset' } }
    const { loadEventDeletePlan } = await import('./deletion')
    const plan = await loadEventDeletePlan(ANCHOR_ID)
    expect(plan.unknown).toBe(true)
    expect(deleteReachesOtherDates(plan)).toBe(true)
  })

  it('🔴 a failed children read is unknown, not an anchor with zero other dates', async () => {
    state.kids = { data: null, error: { message: 'statement timeout' } }
    const { loadEventDeletePlan } = await import('./deletion')
    const plan = await loadEventDeletePlan(ANCHOR_ID)
    expect(plan.unknown).toBe(true)
    expect(plan.otherDates).toBe(0)
    expect(deleteReachesOtherDates(plan)).toBe(true)
  })

  it('🔴 a thrown client is unknown rather than an exception out of a confirm dialog', async () => {
    state.throwOnClient = true
    const { loadEventDeletePlan } = await import('./deletion')
    await expect(loadEventDeletePlan(ANCHOR_ID)).resolves.toMatchObject({ unknown: true })
  })

  it('splits past and future by starts_at and keeps the RSVP count', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    state.kids = { data: [{ id: 'k1', starts_at: past }, { id: 'k2', starts_at: future }], error: null }
    state.rsvps = { count: 7, error: null }
    const { loadEventDeletePlan } = await import('./deletion')
    const plan = await loadEventDeletePlan(ANCHOR_ID)
    expect(plan).toMatchObject({
      isAnchor: true,
      otherDates: 2,
      pastDates: 1,
      futureDates: 1,
      rsvpsAtRisk: 7,
      truncated: false,
      unknown: false,
    })
  })

  it('🔴 a failed RSVP count still reports the DATE count, which is the headline', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    state.kids = { data: [{ id: 'k1', starts_at: future }], error: null }
    state.rsvps = { count: null, error: { message: 'nope' } }
    const { loadEventDeletePlan } = await import('./deletion')
    const plan = await loadEventDeletePlan(ANCHOR_ID)
    expect(plan.isAnchor).toBe(true)
    expect(plan.otherDates).toBe(1)
    expect(plan.rsvpsAtRisk).toBe(0)
    expect(deleteReachesOtherDates(plan)).toBe(true)
  })

  it('🔴 marks the plan truncated past the ceiling, so the warning says "at least"', async () => {
    const { MAX_DELETE_PLAN_DATES, loadEventDeletePlan } = await import('./deletion')
    const future = new Date(Date.now() + 86_400_000).toISOString()
    state.kids = {
      data: Array.from({ length: MAX_DELETE_PLAN_DATES + 1 }, (_, i) => ({
        id: `k${i}`,
        starts_at: future,
      })),
      error: null,
    }
    const plan = await loadEventDeletePlan(ANCHOR_ID)
    expect(plan.truncated).toBe(true)
    expect(plan.otherDates).toBe(MAX_DELETE_PLAN_DATES)
    expect(deleteWarning(plan)).toContain(`at least ${MAX_DELETE_PLAN_DATES} other dates`)
  })
})
