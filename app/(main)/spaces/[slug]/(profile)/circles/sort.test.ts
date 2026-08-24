import { describe, it, expect } from 'vitest'
import { roomIn, sortCircles, isOpenToJoin, UNCAPPED_ROOM } from './sort'
import type { SpaceCircle } from '@/lib/circles/store'

// LIVE-096. `roomIn` returned 0 for an UNCAPPED circle, so under "Most room" every uncapped Circle
// sorted BELOW a capped one with a single seat left — the exact opposite of its own docstring, and
// the opposite of how `isOpenToJoin` reads the very same `cap <= 0` expression. Uncapped is the
// DEFAULT for a new Circle, so this was the common case, not an edge.
//
// These helpers were private to page.tsx until this fix, which is precisely why nothing caught it.

function circle(over: Partial<SpaceCircle>): SpaceCircle {
  return {
    id: 'c1',
    slug: 'c1',
    name: 'Circle',
    about: null,
    type: 'circle',
    member_count: 0,
    member_cap: null,
    status: 'active',
    host_id: null,
    space_id: 's1',
    created_at: '2026-01-01',
    ...over,
  } as SpaceCircle
}

describe('roomIn (LIVE-096)', () => {
  it('treats an uncapped circle as roomy, not empty', () => {
    expect(roomIn(circle({ member_cap: null, member_count: 3 }))).toBe(UNCAPPED_ROOM)
    // cap 0 means NO CAP too, the same reading isOpenToJoin uses.
    expect(roomIn(circle({ member_cap: 0, member_count: 3 }))).toBe(UNCAPPED_ROOM)
  })

  it('counts real seats left for a capped circle, never below zero', () => {
    expect(roomIn(circle({ member_cap: 10, member_count: 4 }))).toBe(6)
    expect(roomIn(circle({ member_cap: 10, member_count: 10 }))).toBe(0)
    expect(roomIn(circle({ member_cap: 10, member_count: 12 }))).toBe(0)
  })

  it('agrees with isOpenToJoin about what cap <= 0 means', () => {
    const uncapped = circle({ member_cap: 0, member_count: 99, access: 'open' } as Partial<SpaceCircle>)
    expect(isOpenToJoin(uncapped)).toBe(true)
    expect(roomIn(uncapped)).toBeGreaterThan(0)
  })
})

describe('sortCircles "Most room" (LIVE-096)', () => {
  it('ranks an uncapped circle above a capped one with one seat left', () => {
    const rows = [
      circle({ id: 'nearly-full', member_cap: 10, member_count: 9 }),
      circle({ id: 'uncapped', member_cap: null, member_count: 3 }),
    ]
    expect(sortCircles(rows, 'open').map((c) => c.id)).toEqual(['uncapped', 'nearly-full'])
  })

  it('still lets a genuinely roomier capped circle win — "roomy but never infinite"', () => {
    const rows = [
      circle({ id: 'uncapped', member_cap: null, member_count: 0 }),
      circle({ id: 'huge-and-empty', member_cap: UNCAPPED_ROOM + 500, member_count: 0 }),
    ]
    expect(sortCircles(rows, 'open').map((c) => c.id)).toEqual(['huge-and-empty', 'uncapped'])
  })

  it('does not mutate the caller’s array', () => {
    const rows = [circle({ id: 'a', member_cap: 2 }), circle({ id: 'b', member_cap: 9 })]
    sortCircles(rows, 'open')
    expect(rows.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('sorts busiest first under "active" and newest first by default', () => {
    const rows = [
      circle({ id: 'quiet', member_count: 1, created_at: '2026-05-01' }),
      circle({ id: 'busy', member_count: 40, created_at: '2026-01-01' }),
    ]
    expect(sortCircles(rows, 'active').map((c) => c.id)).toEqual(['busy', 'quiet'])
    expect(sortCircles(rows, 'new').map((c) => c.id)).toEqual(['quiet', 'busy'])
  })
})
