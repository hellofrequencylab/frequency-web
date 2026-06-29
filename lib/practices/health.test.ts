import { describe, it, expect } from 'vitest'
import {
  weeklyCounts,
  cumulativeFrom,
  computeGrowth,
  computeCoverage,
  computeFunnel,
  computePerformers,
  computeReviewSla,
  computeContributors,
  REVIEW_FRESH_DAYS,
  REVIEW_OVERDUE_DAYS,
  type HealthPracticeRow,
  type PillarRow,
  type SubcategoryRow,
  type ContributorProfile,
} from './health'

// The health dashboard's metric layer (Phase 4.3) is pure, so its boundaries are unit-tested
// without a database: weekly bucketing, coverage gaps, the adoption funnel nesting, the
// review-SLA aging, top/bottom ranking, and the contributor roll-up. A fixed `now` makes the
// time math deterministic. getLibraryHealth's I/O wrapper is intentionally NOT tested here —
// only the rules these tests lock the UI to.

const NOW = Date.parse('2026-06-29T00:00:00Z')
const DAY = 86_400_000
const WEEK = 7 * DAY

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}

let seq = 0
function practice(over: Partial<HealthPracticeRow> = {}): HealthPracticeRow {
  seq += 1
  return {
    id: `p-${seq}`,
    title: `Practice ${seq}`,
    status: 'active',
    is_public: true,
    domain_id: 'd-mind',
    subcategory_id: 'sc-focus',
    created_at: daysAgo(3),
    created_by: 'author-1',
    reviewed_at: daysAgo(2),
    adopters: 5,
    logs_30d: 10,
    logs_total: 50,
    ...over,
  }
}

describe('weeklyCounts', () => {
  it('buckets timestamps into trailing whole weeks, current week last', () => {
    const buckets = weeklyCounts(
      [daysAgo(0), daysAgo(2), daysAgo(8), daysAgo(15)],
      3,
      NOW,
    )
    // 3 weeks: [15d ago] [8d ago] [0d + 2d ago]
    expect(buckets).toEqual([1, 1, 2])
  })

  it('drops future and out-of-window timestamps', () => {
    const future = new Date(NOW + 2 * DAY).toISOString()
    const tooOld = new Date(NOW - 10 * WEEK).toISOString()
    expect(weeklyCounts([future, tooOld, daysAgo(1)], 4, NOW)).toEqual([0, 0, 0, 1])
  })

  it('ignores null and unparseable timestamps', () => {
    expect(weeklyCounts([null, 'not-a-date', daysAgo(1)], 2, NOW)).toEqual([0, 1])
  })

  it('returns an all-zero array of the right length for no data', () => {
    expect(weeklyCounts([], 4, NOW)).toEqual([0, 0, 0, 0])
  })
})

describe('cumulativeFrom', () => {
  it('produces a running total anchored on the base', () => {
    expect(cumulativeFrom(10, [1, 2, 3])).toEqual([11, 13, 16])
  })
  it('a zero base is just the running sum', () => {
    expect(cumulativeFrom(0, [2, 0, 5])).toEqual([2, 2, 7])
  })
})

describe('computeGrowth', () => {
  it('counts the total and the most recent week, and the curve ends at the total', () => {
    const published = [
      practice({ created_at: daysAgo(1) }), // this week
      practice({ created_at: daysAgo(2) }), // this week
      practice({ created_at: daysAgo(9) }), // last week
      practice({ created_at: daysAgo(100) }), // before the window
    ]
    const g = computeGrowth(published, 4, NOW)
    expect(g.totalPublished).toBe(4)
    expect(g.addedThisWeek).toBe(2)
    // The cumulative curve must end at the true library size.
    expect(g.cumulative[g.cumulative.length - 1]).toBe(4)
    // 4 weekly buckets.
    expect(g.weeklyAdds).toHaveLength(4)
  })

  it('an empty library is all zeros', () => {
    const g = computeGrowth([], 4, NOW)
    expect(g.totalPublished).toBe(0)
    expect(g.addedThisWeek).toBe(0)
    expect(g.cumulative).toEqual([0, 0, 0, 0])
  })
})

describe('computeCoverage', () => {
  const pillars: PillarRow[] = [
    { id: 'd-mind', name: 'Mind', slug: 'mind' },
    { id: 'd-body', name: 'Body', slug: 'body' },
  ]
  const subs: SubcategoryRow[] = [
    { id: 'sc-focus', name: 'Focus', slug: 'focus', domain_id: 'd-mind' },
    { id: 'sc-calm', name: 'Calm', slug: 'calm', domain_id: 'd-mind' },
    { id: 'sc-move', name: 'Movement', slug: 'movement', domain_id: 'd-body' },
  ]

  it('counts per Pillar and flags empty sub-categories as gaps', () => {
    const published = [
      practice({ domain_id: 'd-mind', subcategory_id: 'sc-focus' }),
      practice({ domain_id: 'd-mind', subcategory_id: 'sc-focus' }),
      // sc-calm and sc-move have nothing → gaps
    ]
    const c = computeCoverage(published, pillars, subs)
    const mind = c.pillars.find((p) => p.id === 'd-mind')!
    const body = c.pillars.find((p) => p.id === 'd-body')!
    expect(mind.count).toBe(2)
    expect(body.count).toBe(0)
    expect(mind.emptySubcategories.map((s) => s.name)).toEqual(['Calm'])
    expect(body.emptySubcategories.map((s) => s.name)).toEqual(['Movement'])
    expect(c.totalEmptySubcategories).toBe(2)
  })

  it('counts practices with no Pillar as unpilared, not toward any Pillar', () => {
    const published = [
      practice({ domain_id: null, subcategory_id: null }),
      practice({ domain_id: 'd-mind', subcategory_id: 'sc-focus' }),
    ]
    const c = computeCoverage(published, pillars, subs)
    expect(c.unpilared).toBe(1)
    expect(c.pillars.find((p) => p.id === 'd-mind')!.count).toBe(1)
  })

  it('a practice with a Pillar but no sub-category counts to the Pillar only', () => {
    const published = [practice({ domain_id: 'd-mind', subcategory_id: null })]
    const c = computeCoverage(published, pillars, subs)
    const mind = c.pillars.find((p) => p.id === 'd-mind')!
    expect(mind.count).toBe(1)
    // No sub-category got the credit, so both Mind sub-categories are still empty.
    expect(mind.emptySubcategories).toHaveLength(2)
  })
})

describe('computeFunnel', () => {
  it('nests published ≥ adopted ≥ logged ≥ loggedRecently and reports rates over published', () => {
    const published = [
      practice({ adopters: 3, logs_total: 10, logs_30d: 4 }), // active
      practice({ adopters: 2, logs_total: 5, logs_30d: 0 }), // logged but not recently
      practice({ adopters: 1, logs_total: 0, logs_30d: 0 }), // adopted, never logged
      practice({ adopters: 0, logs_total: 0, logs_30d: 0 }), // published only
    ]
    const f = computeFunnel(published)
    expect(f.published).toBe(4)
    expect(f.adopted).toBe(3)
    expect(f.logged).toBe(2)
    expect(f.loggedRecently).toBe(1)
    expect(f.adoptedRate).toBeCloseTo(0.75)
    expect(f.loggedRate).toBeCloseTo(0.5)
    expect(f.activeRate).toBeCloseTo(0.25)
  })

  it('an empty library has zero rates (no divide-by-zero)', () => {
    const f = computeFunnel([])
    expect(f.published).toBe(0)
    expect(f.adoptedRate).toBe(0)
    expect(f.loggedRate).toBe(0)
    expect(f.activeRate).toBe(0)
  })
})

describe('computePerformers', () => {
  it('ranks top by 30-day logs and surfaces the idle tail least-adopted first', () => {
    const published = [
      practice({ id: 'busy', logs_30d: 40, logs_total: 100, adopters: 9 }),
      practice({ id: 'mid', logs_30d: 12, logs_total: 30, adopters: 4 }),
      practice({ id: 'idle-popular', logs_30d: 0, logs_total: 20, adopters: 8 }),
      practice({ id: 'idle-orphan', logs_30d: 0, logs_total: 0, adopters: 0 }),
    ]
    const { top, bottom } = computePerformers(published, 5)
    expect(top.map((r) => r.id)).toEqual(['busy', 'mid'])
    // bottom = the two with no 30-day logs, fewest adopters first.
    expect(bottom.map((r) => r.id)).toEqual(['idle-orphan', 'idle-popular'])
  })

  it('respects the limit on each side', () => {
    const published = Array.from({ length: 8 }, (_, i) =>
      practice({ id: `t-${i}`, logs_30d: i + 1 }),
    )
    expect(computePerformers(published, 3).top).toHaveLength(3)
  })
})

describe('computeReviewSla', () => {
  it('ages the pending queue into fresh / aging / overdue and finds the oldest', () => {
    const pending = [
      { created_at: daysAgo(0) }, // fresh
      { created_at: daysAgo(1) }, // fresh (< 2)
      { created_at: daysAgo(4) }, // aging (2..7)
      { created_at: daysAgo(10) }, // overdue (>= 7)
    ]
    const sla = computeReviewSla(pending, NOW)
    expect(sla.pending).toBe(4)
    expect(sla.fresh).toBe(2)
    expect(sla.aging).toBe(1)
    expect(sla.overdue).toBe(1)
    expect(sla.oldestDays).toBe(10)
  })

  it('respects the threshold boundaries', () => {
    const atOverdue = computeReviewSla([{ created_at: daysAgo(REVIEW_OVERDUE_DAYS) }], NOW)
    expect(atOverdue.overdue).toBe(1)
    const atFresh = computeReviewSla([{ created_at: daysAgo(REVIEW_FRESH_DAYS) }], NOW)
    // exactly 2 days old is no longer "fresh" (the band is < 2), it's aging.
    expect(atFresh.fresh).toBe(0)
    expect(atFresh.aging).toBe(1)
  })

  it('counts a null created_at as pending but never ages it into a breach', () => {
    const sla = computeReviewSla([{ created_at: null }], NOW)
    expect(sla.pending).toBe(1)
    expect(sla.overdue).toBe(0)
    expect(sla.oldestDays).toBe(0)
  })

  it('an empty queue is all zeros', () => {
    expect(computeReviewSla([], NOW)).toEqual({
      pending: 0,
      fresh: 0,
      aging: 0,
      overdue: 0,
      oldestDays: 0,
    })
  })
})

describe('computeContributors', () => {
  const profiles: ContributorProfile[] = [
    { id: 'a', display_name: 'Ada', handle: 'ada' },
    { id: 'b', display_name: 'Ben', handle: 'ben' },
  ]

  it('rolls published rows up by author, ordered by published then reach', () => {
    const published = [
      practice({ created_by: 'a', logs_30d: 5, adopters: 2 }),
      practice({ created_by: 'a', logs_30d: 3, adopters: 1 }),
      practice({ created_by: 'b', logs_30d: 20, adopters: 9 }),
    ]
    const rows = computeContributors(published, profiles, 10)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']) // a authored 2, b authored 1
    const ada = rows.find((r) => r.id === 'a')!
    expect(ada.displayName).toBe('Ada')
    expect(ada.published).toBe(2)
    expect(ada.reach30d).toBe(8)
    expect(ada.adopters).toBe(3)
  })

  it('skips rows with no author and falls back when a profile is missing', () => {
    const published = [
      practice({ created_by: null }),
      practice({ created_by: 'ghost', logs_30d: 1 }),
    ]
    const rows = computeContributors(published, profiles, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('ghost')
    expect(rows[0].displayName).toBe('Member ghost')
  })

  it('respects the limit', () => {
    const published = Array.from({ length: 5 }, (_, i) => practice({ created_by: `c-${i}` }))
    expect(computeContributors(published, [], 3)).toHaveLength(3)
  })
})
