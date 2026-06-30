import { describe, it, expect } from 'vitest'
import {
  applyQuery,
  clampPageSize,
  matchesFacets,
  matchesText,
  profileHrefFor,
  sortMembers,
  type MemberSummary,
} from './member-viewer'

function member(over: Partial<MemberSummary>): MemberSummary {
  return {
    id: 'm1',
    handle: 'ada',
    displayName: 'Ada Lovelace',
    ...over,
  }
}

const ROSTER: MemberSummary[] = [
  member({ id: 'm1', handle: 'ada', displayName: 'Ada Lovelace', headline: 'Counts on lace', badges: ['resonant', 'new'], stats: [{ label: 'Health', value: '88' }] }),
  member({ id: 'm2', handle: 'grace', displayName: 'Grace Hopper', headline: 'Finds the bug', badges: ['cooling', 'engaged'], stats: [{ label: 'Health', value: '54' }] }),
  member({ id: 'm3', handle: 'alan', displayName: 'Alan Turing', headline: 'Breaks the code', badges: ['at_risk', 'dormant'], stats: [{ label: 'Health', value: '21' }] }),
  member({ id: 'm4', handle: 'katherine', displayName: 'Katherine Johnson', headline: 'Charts the orbit', badges: ['resonant', 'engaged'], stats: [{ label: 'Health', value: '95' }] }),
]

describe('matchesText', () => {
  it('matches across name, handle, and headline, case-insensitively', () => {
    expect(matchesText(ROSTER[0], 'lovelace')).toBe(true)
    expect(matchesText(ROSTER[0], 'ADA')).toBe(true)
    expect(matchesText(ROSTER[0], 'lace')).toBe(true) // headline
    expect(matchesText(ROSTER[0], 'hopper')).toBe(false)
  })

  it('treats a blank or whitespace needle as match-all', () => {
    expect(matchesText(ROSTER[0], '')).toBe(true)
    expect(matchesText(ROSTER[0], '   ')).toBe(true)
    expect(matchesText(ROSTER[0], undefined)).toBe(true)
  })
})

describe('matchesFacets', () => {
  it('requires every selected facet value to be in the row badges', () => {
    expect(matchesFacets(ROSTER[0], { tier: 'resonant' })).toBe(true)
    expect(matchesFacets(ROSTER[0], { tier: 'cooling' })).toBe(false)
    expect(matchesFacets(ROSTER[0], { tier: 'resonant', stage: 'new' })).toBe(true)
    expect(matchesFacets(ROSTER[0], { tier: 'resonant', stage: 'engaged' })).toBe(false)
  })

  it('ignores empty selections and no-facet input (match-all)', () => {
    expect(matchesFacets(ROSTER[0], { tier: '' })).toBe(true)
    expect(matchesFacets(ROSTER[0], {})).toBe(true)
    expect(matchesFacets(ROSTER[0], undefined)).toBe(true)
  })
})

describe('sortMembers', () => {
  it('sorts by name ascending and descending', () => {
    const asc = sortMembers(ROSTER, { key: 'name', direction: 'asc' }).map((m) => m.handle)
    expect(asc).toEqual(['ada', 'alan', 'grace', 'katherine'])
    const desc = sortMembers(ROSTER, { key: 'name', direction: 'desc' }).map((m) => m.handle)
    expect(desc).toEqual(['katherine', 'grace', 'alan', 'ada'])
  })

  it('sorts numerically on a stats key (by label)', () => {
    const byHealth = sortMembers(ROSTER, { key: 'Health', direction: 'asc' }).map((m) => m.handle)
    expect(byHealth).toEqual(['alan', 'grace', 'ada', 'katherine'])
  })

  it('is stable for equal values and does not mutate the input', () => {
    const tied = [member({ id: 'a', handle: 'x', displayName: 'Same' }), member({ id: 'b', handle: 'y', displayName: 'Same' })]
    const snapshot = tied.slice()
    const out = sortMembers(tied, { key: 'name', direction: 'asc' })
    expect(out.map((m) => m.id)).toEqual(['a', 'b'])
    expect(tied).toEqual(snapshot) // input untouched
  })

  it('returns input order with no spec', () => {
    expect(sortMembers(ROSTER, undefined).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
  })
})

describe('clampPageSize', () => {
  it('defaults to 15 for missing or non-finite input', () => {
    expect(clampPageSize(undefined)).toBe(15)
    expect(clampPageSize(NaN)).toBe(15)
  })

  it('clamps to the 10..20 window', () => {
    expect(clampPageSize(5)).toBe(10)
    expect(clampPageSize(50)).toBe(20)
    expect(clampPageSize(12)).toBe(12)
  })
})

describe('applyQuery', () => {
  it('filters by text and facets together', () => {
    const r = applyQuery(ROSTER, { text: 'a', facets: { tier: 'resonant' } }, 1, 15)
    // "a" matches everyone; tier=resonant keeps Ada + Katherine.
    expect(r.total).toBe(2)
    expect(r.filtered.map((m) => m.handle).sort()).toEqual(['ada', 'katherine'])
  })

  it('paginates and reports hasMore + caps the visible window', () => {
    const page1 = applyQuery(ROSTER, {}, 1, 10) // pageSize clamps up to 10
    expect(page1.visible).toHaveLength(4)
    expect(page1.hasMore).toBe(false)

    const big: MemberSummary[] = Array.from({ length: 33 }, (_, i) =>
      member({ id: `b${i}`, handle: `h${i}`, displayName: `Name ${i}` }),
    )
    const r1 = applyQuery(big, {}, 1, 15)
    expect(r1.visible).toHaveLength(15)
    expect(r1.hasMore).toBe(true)
    expect(r1.total).toBe(33)

    const r2 = applyQuery(big, {}, 2, 15) // "Show more" -> 30 visible
    expect(r2.visible).toHaveLength(30)
    expect(r2.hasMore).toBe(true)

    const r3 = applyQuery(big, {}, 3, 15) // last page -> all 33
    expect(r3.visible).toHaveLength(33)
    expect(r3.hasMore).toBe(false)
  })

  it('applies the sort within the paged result', () => {
    const r = applyQuery(ROSTER, { sort: { key: 'Health', direction: 'desc' } }, 1, 15)
    expect(r.visible.map((m) => m.handle)).toEqual(['katherine', 'ada', 'grace', 'alan'])
  })

  it('clamps a zero/negative page to the first page', () => {
    const r = applyQuery(ROSTER, {}, 0, 10)
    expect(r.visible).toHaveLength(4)
  })

  it('handles an empty roster without throwing', () => {
    const r = applyQuery([], { text: 'anything' }, 1, 15)
    expect(r).toMatchObject({ total: 0, hasMore: false })
    expect(r.visible).toEqual([])
  })
})

describe('profileHrefFor', () => {
  it('defaults to /people/<handle> and honors an explicit href', () => {
    expect(profileHrefFor({ handle: 'ada' })).toBe('/people/ada')
    expect(profileHrefFor({ handle: 'ada', profileHref: '/x/ada' })).toBe('/x/ada')
  })
})
