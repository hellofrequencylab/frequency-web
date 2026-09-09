import { describe, it, expect, vi, beforeEach } from 'vitest'

// The nightly `space_standing` rollup (LIVE-263). What is locked here, network-free:
//   1. It writes ONE row per ACTIVE, non-root Space, with all six signals and the resolved score.
//   2. Gatherings HELD counts occurrences; gatherings AHEAD folds a recurring series to one. The
//      two questions are different, and the rollup must not answer them the same way.
//   3. A sub-read that FAILS leaves its signal unmeasured rather than writing a false zero.
//   4. A failure is RETURNED, never swallowed (the lesson of lib/resonance/density.ts, finding R2:
//      a rollup that wrote nothing and a rollup that failed were the same return value, and a real
//      failure went unseen every night for two weeks).
//   5. No paid signal reaches the write.

type Row = Record<string, unknown>

const store: {
  spaces: Row[]
  events: Row[]
  circles: Row[]
  follows: Row[]
  members: Row[]
  /** Tables whose read should fail, to exercise the unmeasured path. */
  broken: Set<string>
  written: Row[] | null
  writeFails: boolean
} = {
  spaces: [],
  events: [],
  circles: [],
  follows: [],
  members: [],
  broken: new Set(),
  written: null,
  writeFails: false,
}

/** A thenable builder over a plain row array that applies the filters the rollup chains. */
function builder(name: string, rows: Row[]) {
  let out = rows
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      out = out.filter((r) => r[col] === val)
      return api
    },
    neq(col: string, val: unknown) {
      out = out.filter((r) => r[col] !== val)
      return api
    },
    in(col: string, vals: readonly unknown[]) {
      out = out.filter((r) => vals.includes(r[col]))
      return api
    },
    or(filter: string) {
      if (filter === 'unlisted.is.null,unlisted.eq.false') out = out.filter((r) => r.unlisted !== true)
      return api
    },
    gt(col: string, val: string) {
      out = out.filter((r) => String(r[col] ?? '') > val)
      return api
    },
    gte(col: string, val: string) {
      out = out.filter((r) => String(r[col] ?? '') >= val)
      return api
    },
    lt(col: string, val: string) {
      out = out.filter((r) => String(r[col] ?? '') < val)
      return api
    },
    limit: () => api,
    upsert(values: Row[]) {
      if (store.writeFails) return Promise.resolve({ error: { message: 'write refused' } })
      store.written = values
      return Promise.resolve({ error: null })
    },
    then(resolve: (r: { data: Row[] | null; error: unknown }) => unknown) {
      if (store.broken.has(name)) {
        return Promise.resolve(resolve({ data: null, error: { message: `${name} unreadable` } }))
      }
      return Promise.resolve(resolve({ data: out, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      if (t === 'spaces') return builder(t, store.spaces)
      if (t === 'events') return builder(t, store.events)
      if (t === 'circles') return builder(t, store.circles)
      if (t === 'space_follows') return builder(t, store.follows)
      if (t === 'space_members') return builder(t, store.members)
      return builder(t, [])
    },
  }),
}))

import { refreshSpaceStanding } from './standing-rollup'

const PAST = '2020-01-01T00:00:00.000Z'
const RECENT_PAST = new Date(Date.now() - 7 * 86_400_000).toISOString()
const FUTURE = '2099-01-01T00:00:00.000Z'

const written = () => store.written ?? []
const rowFor = (id: string) => written().find((r) => r.space_id === id) as Row | undefined

beforeEach(() => {
  store.broken = new Set()
  store.written = null
  store.writeFails = false
  store.events = []
  store.circles = []
  store.follows = []
  store.members = []
  store.spaces = [
    {
      id: 'a',
      status: 'active',
      type: 'business',
      tagline: 'Sound baths on the river',
      brand_logo_url: 'logo.png',
      cover_image_url: null,
      preferences: { profileData: { subject: 'sound', about: 'We gather weekly.' } },
    },
    {
      id: 'b',
      status: 'active',
      type: 'practitioner',
      tagline: null,
      brand_logo_url: null,
      cover_image_url: null,
      preferences: null,
    },
    // Excluded: the platform Space itself, and an archived one.
    { id: 'root', status: 'active', type: 'root', tagline: null, brand_logo_url: null, cover_image_url: null, preferences: null },
    { id: 'gone', status: 'archived', type: 'business', tagline: null, brand_logo_url: null, cover_image_url: null, preferences: null },
  ]
})

describe('refreshSpaceStanding', () => {
  it('writes one row per ACTIVE, non-root Space, with all six signals and a score', async () => {
    store.events = [
      { space_id: 'a', id: 'e1', starts_at: RECENT_PAST, status: 'published', is_cancelled: false, parent_event_id: null, recurrence_type: 'none', recurrence_until: null },
      { space_id: 'a', id: 'e2', starts_at: FUTURE, status: 'published', is_cancelled: false, parent_event_id: null, recurrence_type: 'none', recurrence_until: null },
    ]
    store.circles = [{ space_id: 'a', status: 'active', unlisted: null }]
    store.follows = [{ space_id: 'a' }, { space_id: 'a' }, { space_id: 'b' }]
    store.members = [{ space_id: 'a', status: 'active' }, { space_id: 'a', status: 'pending' }]

    const result = await refreshSpaceStanding()
    expect(result.error).toBeUndefined()
    expect(result.spaces).toBe(2)
    expect(written().map((r) => r.space_id).sort()).toEqual(['a', 'b'])

    const a = rowFor('a')!
    expect(a.gatherings_held).toBe(1)
    expect(a.upcoming_gatherings).toBe(1)
    expect(a.rooms).toBe(1)
    expect(a.audience).toBe(2)
    expect(a.commons).toBe(1) // the pending membership does not count
    expect(a.care).toBeGreaterThan(0)
    expect(a.standing_score).toBeGreaterThan(0)
    expect(a.standing_score).toBeLessThanOrEqual(1)

    // b did nothing and filled in nothing, so it stands below a. It is still WRITTEN: an operator
    // cannot be told where they stand if the rollup skips the Spaces with nothing yet.
    const b = rowFor('b')!
    expect(b.care).toBe(0)
    expect(Number(b.standing_score)).toBeLessThan(Number(a.standing_score))
  })

  it('counts gatherings HELD as occurrences and gatherings AHEAD folded to the series', async () => {
    // One weekly series, materialised: three occurrences already met, three still ahead. Held is
    // three (they gathered three times); ahead is one (one thing is on the calendar).
    const series = (id: string, starts: string) => ({
      space_id: 'a',
      id,
      starts_at: starts,
      status: 'published',
      is_cancelled: false,
      parent_event_id: 'series-1',
      recurrence_type: 'weekly',
      recurrence_until: FUTURE,
    })
    store.events = [
      series('p1', new Date(Date.now() - 21 * 86_400_000).toISOString()),
      series('p2', new Date(Date.now() - 14 * 86_400_000).toISOString()),
      series('p3', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      series('f1', '2099-01-01T00:00:00.000Z'),
      series('f2', '2099-01-08T00:00:00.000Z'),
      series('f3', '2099-01-15T00:00:00.000Z'),
    ]
    await refreshSpaceStanding()
    const a = rowFor('a')!
    expect(a.gatherings_held).toBe(3)
    expect(a.upcoming_gatherings).toBe(1)
  })

  it('ignores a cancelled, unpublished, or out-of-window gathering', async () => {
    store.events = [
      { space_id: 'a', id: 'c', starts_at: RECENT_PAST, status: 'published', is_cancelled: true, parent_event_id: null, recurrence_type: 'none', recurrence_until: null },
      { space_id: 'a', id: 'd', starts_at: RECENT_PAST, status: 'draft', is_cancelled: false, parent_event_id: null, recurrence_type: 'none', recurrence_until: null },
      { space_id: 'a', id: 'old', starts_at: PAST, status: 'published', is_cancelled: false, parent_event_id: null, recurrence_type: 'none', recurrence_until: null },
    ]
    await refreshSpaceStanding()
    expect(rowFor('a')!.gatherings_held).toBe(0)
  })

  it('leaves a signal UNMEASURED when its read fails, rather than writing a false zero', async () => {
    store.follows = [{ space_id: 'a' }]
    const withFollows = await refreshSpaceStanding()
    expect(withFollows.error).toBeUndefined()
    const scoreWithAudience = Number(rowFor('a')!.standing_score)

    store.written = null
    store.broken = new Set(['space_follows'])
    await refreshSpaceStanding()
    const broken = rowFor('a')!
    // The stored COLUMN falls back to 0 (the column is not nullable), but the SCORE renormalised
    // over the signals that were measured, so it is not the score of a Space with no followers.
    expect(broken.audience).toBe(0)
    expect(Number(broken.standing_score)).not.toBeCloseTo(scoreWithAudience, 6)
  })

  it('RETURNS a read failure instead of reporting an empty success', async () => {
    store.broken = new Set(['spaces'])
    const result = await refreshSpaceStanding()
    expect(result.spaces).toBe(0)
    expect(result.error).toContain('spaces unreadable')
  })

  it('RETURNS a write failure instead of reporting an empty success', async () => {
    store.writeFails = true
    const result = await refreshSpaceStanding()
    expect(result.spaces).toBe(0)
    expect(result.error).toContain('write refused')
  })

  it('🔴 writes no commercial column: the row is six earned signals, a score, and a timestamp', async () => {
    await refreshSpaceStanding()
    expect(Object.keys(rowFor('a')!).sort()).toEqual(
      [
        'audience',
        'care',
        'commons',
        'computed_at',
        'gatherings_held',
        'rooms',
        'space_id',
        'standing_score',
        'upcoming_gatherings',
      ].sort(),
    )
  })
})
