import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CADENCES,
  DEFAULT_CARDS_PER_SERIES,
  SERIES_COLUMNS,
  SERIES_FETCH_CEILING,
  TEASER_CARDS_PER_SERIES,
  collapseSeries,
  collapseSeriesAroundFloor,
  collapseSeriesRows,
  isSeriesAnchor,
  isSeriesCadence,
  seriesDates,
  seriesFetchLimit,
  seriesKey,
  seriesUpcomingFloor,
  type SeriesRow,
} from './series'

// What this file prevents, in one line each:
//   • A repeating event occupying a dozen consecutive cards on /events (the production read).
//   • The fold DELETING an established series once its anchor row ages out of the query window.
//   • A naive `new Date()` compare dropping tonight's 7pm gathering after 5pm Pacific.
//   • A SELECT that forgot `id` collapsing the entire listing to a single card.

const FLOOR = seriesUpcomingFloor('2027-03-01')

function row(over: Partial<SeriesRow> & { id: string }): SeriesRow {
  return {
    starts_at: '2027-03-05T19:00:00Z',
    slug: over.id,
    recurrence_type: 'none',
    recurrence_until: null,
    parent_event_id: null,
    is_cancelled: false,
    ...over,
  }
}

/** An anchor + N weekly children, the shape the cron materialises. Dates are built with real UTC
 *  arithmetic, not string padding: a hand-built `2027-03-${5 + 7 * 4}` yields "2027-03-33", which
 *  Date.parse rejects, so those rows would silently take the pass-through path and the fixture would
 *  test nothing. (That is exactly what the first draft of this file did.) */
function weekly(count: number): SeriesRow[] {
  const start = Date.UTC(2027, 2, 5, 19, 0, 0)
  const week = 7 * 24 * 60 * 60 * 1000
  const out: SeriesRow[] = [
    row({ id: 'a', starts_at: new Date(start).toISOString(), recurrence_type: 'weekly' }),
  ]
  for (let i = 1; i <= count; i++) {
    out.push(
      row({
        id: `c${i}`,
        starts_at: new Date(start + i * week).toISOString(),
        parent_event_id: 'a',
      }),
    )
  }
  return out
}

const ids = (rows: SeriesRow[]) => rows.map((r) => r.id)

describe('collapseSeries — the basics', () => {
  it('1. empty input', () => {
    const r = collapseSeries([], { upcomingFrom: FLOOR })
    expect(r.rows).toEqual([])
    expect(r.groups).toEqual([])
    expect(r.byRowId.size).toBe(0)
  })

  it('2. one-offs pass through in order, marked non-recurring', () => {
    const rows = [
      row({ id: 'x', starts_at: '2027-03-02T10:00:00Z' }),
      row({ id: 'y', starts_at: '2027-03-03T10:00:00Z' }),
    ]
    const r = collapseSeries(rows, { upcomingFrom: FLOOR })
    expect(ids(r.rows)).toEqual(['x', 'y'])
    expect(r.groups.every((g) => !g.recurring && g.hiddenCount === 0)).toBe(true)
  })

  it('3. rows missing the recurrence columns behave as one-offs, never throw', () => {
    const rows = [
      { id: 'x', starts_at: '2027-03-02T10:00:00Z' },
      { id: 'y', starts_at: '2027-03-03T10:00:00Z' },
    ] as SeriesRow[]
    expect(ids(collapseSeriesRows(rows, { upcomingFrom: FLOOR }))).toEqual(['x', 'y'])
  })
})

describe('collapseSeries — the fold', () => {
  it('4. a weekly series collapses to the default card count', () => {
    const r = collapseSeries(weekly(8), { upcomingFrom: FLOOR })
    expect(r.rows.length).toBe(DEFAULT_CARDS_PER_SERIES)
    const g = r.groups[0]!
    expect(g.dateCount).toBe(9)
    expect(g.hiddenCount).toBe(9 - DEFAULT_CARDS_PER_SERIES)
    expect(g.anchorPresent).toBe(true)
    expect(g.anchorId).toBe('a')
  })

  it('5. perSeries: 1 elects only the earliest', () => {
    const r = collapseSeries(weekly(8), { upcomingFrom: FLOOR, perSeries: 1 })
    expect(ids(r.rows)).toEqual(['a'])
    expect(r.groups[0]!.hiddenCount).toBe(8)
  })

  it('5b. perSeries: 3 elects the next three dates, all mapping to one group', () => {
    const r = collapseSeries(weekly(8), { upcomingFrom: FLOOR, perSeries: 3 })
    expect(ids(r.rows)).toEqual(['a', 'c1', 'c2'])
    const g = r.byRowId.get('a')!
    expect(r.byRowId.get('c1')).toBe(g)
    expect(r.byRowId.get('c2')).toBe(g)
    expect(g.hiddenCount).toBe(6)
  })

  it('6. perSeries coercion: 0, -3, NaN clamp to 1; 2.7 floors to 2', () => {
    const count = (p: number) => collapseSeries(weekly(8), { upcomingFrom: FLOOR, perSeries: p }).rows.length
    expect([count(0), count(-3), count(NaN), count(2.7)]).toEqual([1, 1, 1, 2])
  })

  it('6b. only an ABSENT perSeries takes the default — a bad number clamps to the floor', () => {
    // A malformed operator setting must not silently widen to the default, nor delete the series.
    const absent = collapseSeries(weekly(8), { upcomingFrom: FLOOR }).rows.length
    expect(absent).toBe(DEFAULT_CARDS_PER_SERIES)
    expect(collapseSeries(weekly(8), { upcomingFrom: FLOOR, perSeries: NaN }).rows.length).toBe(1)
  })

  it('8. THE ANCHOR AGED OUT: children only, series survives with the earliest child', () => {
    const rows = weekly(8).filter((r) => r.id !== 'a')
    const res = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 })
    expect(ids(res.rows)).toEqual(['c1'])
    const g = res.groups[0]!
    expect(g.anchorId).toBe('a')
    expect(g.anchorPresent).toBe(false)
    expect(g.dateCount).toBe(8)
  })

  it('9. orphans sharing a missing parent form one group, nothing dropped', () => {
    const rows = [
      row({ id: 'o1', starts_at: '2027-03-04T10:00:00Z', parent_event_id: 'ghost' }),
      row({ id: 'o2', starts_at: '2027-03-11T10:00:00Z', parent_event_id: 'ghost' }),
    ]
    const r = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 })
    expect(r.groups.length).toBe(1)
    expect(r.groups[0]!.key).toBe('ghost')
    expect(ids(r.rows)).toEqual(['o1'])
  })

  it('10. mixed series and one-offs keep global input order minus folded rows', () => {
    const rows = [
      row({ id: 'x', starts_at: '2027-03-02T10:00:00Z' }),
      ...weekly(3),
      row({ id: 'z', starts_at: '2027-03-09T10:00:00Z' }),
    ]
    expect(ids(collapseSeriesRows(rows, { upcomingFrom: FLOOR, perSeries: 1 }))).toEqual(['x', 'a', 'z'])
  })

  it('16. a daily series of 61 rows collapses, dates capped, count uncapped', () => {
    const rows: SeriesRow[] = [row({ id: 'a', starts_at: '2027-03-01T08:00:00Z', recurrence_type: 'daily' })]
    for (let i = 1; i <= 60; i++) {
      const d = new Date(Date.UTC(2027, 2, 1 + i, 8, 0, 0))
      rows.push(row({ id: `d${i}`, starts_at: d.toISOString(), parent_event_id: 'a' }))
    }
    const r = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 })
    expect(r.rows.length).toBe(1)
    expect(r.groups[0]!.dateCount).toBe(61)
    expect(r.groups[0]!.hiddenCount).toBe(60)
    expect(r.groups[0]!.dates.length).toBe(12)
  })

  it('17. two interleaved series make two groups in first-appearance order', () => {
    const rows = [
      row({ id: 'a1', starts_at: '2027-03-02T10:00:00Z', recurrence_type: 'weekly' }),
      row({ id: 'b1', starts_at: '2027-03-03T10:00:00Z', recurrence_type: 'weekly' }),
      row({ id: 'a2', starts_at: '2027-03-09T10:00:00Z', parent_event_id: 'a1' }),
      row({ id: 'b2', starts_at: '2027-03-10T10:00:00Z', parent_event_id: 'b1' }),
    ]
    const r = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 })
    expect(r.groups.map((g) => g.key)).toEqual(['a1', 'b1'])
    expect(ids(r.rows)).toEqual(['a1', 'b1'])
  })
})

describe('collapseSeries — cancellation', () => {
  it('11. a cancelled middle occurrence is excluded from dates and the count', () => {
    const rows = weekly(3)
    rows[2]!.is_cancelled = true // c2
    const g = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 }).groups[0]!
    expect(g.dateCount).toBe(3)
    expect(g.dates.some((d) => d.id === 'c2')).toBe(false)
  })

  it('12. a cancelled representative hands off to the next eligible date', () => {
    const rows = weekly(3)
    rows[0]!.is_cancelled = true // the anchor
    expect(ids(collapseSeriesRows(rows, { upcomingFrom: FLOOR, perSeries: 1 }))).toEqual(['c1'])
  })

  it('13. every occurrence cancelled drops the group entirely', () => {
    const rows = weekly(3).map((r) => ({ ...r, is_cancelled: true }))
    expect(collapseSeriesRows(rows, { upcomingFrom: FLOOR })).toEqual([])
  })

  it('14. dropCancelled: false keeps everything', () => {
    const rows = weekly(3).map((r) => ({ ...r, is_cancelled: true }))
    const r = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1, dropCancelled: false })
    expect(r.rows.length).toBe(1)
    expect(r.groups[0]!.dateCount).toBe(4)
  })

  it('29. a cancelled anchor with live children still reads as a series', () => {
    const rows = weekly(3)
    rows[0]!.is_cancelled = true
    const g = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 }).groups[0]!
    expect(g.recurring).toBe(true)
    expect(g.anchorId).toBe('a')
  })
})

describe('collapseSeries — time', () => {
  it('19+20. the wall-clock floor keeps tonight 19:00, where a naive new Date() compare would not', () => {
    const tonight = row({ id: 't', starts_at: '2027-03-01T19:00:00Z' })
    expect(ids(collapseSeriesRows([tonight], { upcomingFrom: FLOOR }))).toEqual(['t'])
    // The counter-test: at 2027-03-01 18:00Z (10am PT) a true-instant floor still passes, but the
    // documented failure is a floor built from `new Date()` AFTER 19:00Z, which would drop it. The
    // module never builds that floor itself — the caller passes the wall-clock day floor above.
    const naiveFloor = '2027-03-01T20:00:00.000Z'
    expect(collapseSeriesRows([tonight], { upcomingFrom: naiveFloor })).toEqual([])
  })

  it('21. a DST-boundary weekly series keeps its 19:00 wall time on every date', () => {
    const rows = [
      row({ id: 'a', starts_at: '2027-03-07T19:00:00Z', recurrence_type: 'weekly' }),
      row({ id: 'c1', starts_at: '2027-03-14T19:00:00Z', parent_event_id: 'a' }),
      row({ id: 'c2', starts_at: '2027-03-21T19:00:00Z', parent_event_id: 'a' }),
    ]
    const g = collapseSeries(rows, { upcomingFrom: FLOOR, perSeries: 1 }).groups[0]!
    expect(g.dates.every((d) => d.startsAt.includes('T19:00'))).toBe(true)
  })

  it('30. +00:00 and Z spellings sort by instant, not by string', () => {
    const rows = [
      row({ id: 'a', starts_at: '2027-03-10T19:00:00+00:00', recurrence_type: 'weekly' }),
      row({ id: 'c1', starts_at: '2027-03-03T19:00:00Z', parent_event_id: 'a' }),
    ]
    expect(ids(collapseSeriesRows(rows, { upcomingFrom: FLOOR, perSeries: 1 }))).toEqual(['c1'])
  })
})

describe('collapseSeries — rows it cannot place', () => {
  it('25. null and unparseable starts_at pass through at their input positions', () => {
    const rows = [
      row({ id: 'n', starts_at: null }),
      row({ id: 'ok', starts_at: '2027-03-04T10:00:00Z' }),
      row({ id: 'bad', starts_at: 'not-a-date' }),
    ]
    expect(ids(collapseSeriesRows(rows, { upcomingFrom: FLOOR }))).toEqual(['n', 'ok', 'bad'])
  })

  it('26. rows with a falsy id pass through and must NOT collapse the list to one', () => {
    const rows = [
      { id: undefined, starts_at: '2027-03-02T10:00:00Z' },
      { id: undefined, starts_at: '2027-03-03T10:00:00Z' },
      { id: undefined, starts_at: '2027-03-04T10:00:00Z' },
    ] as unknown as SeriesRow[]
    expect(collapseSeriesRows(rows, { upcomingFrom: FLOOR }).length).toBe(3)
  })

  it('24. a duplicate row id is counted once and emitted once', () => {
    const dup = row({ id: 'a', starts_at: '2027-03-05T19:00:00Z', recurrence_type: 'weekly' })
    const r = collapseSeries([dup, { ...dup }], { upcomingFrom: FLOOR, perSeries: 1 })
    expect(ids(r.rows)).toEqual(['a'])
    expect(r.groups[0]!.dateCount).toBe(1)
  })
})

describe('collapseSeries — group metadata', () => {
  it('23. the last occurrence of a finished series is a group of one', () => {
    const rows = [row({ id: 'a', starts_at: '2027-03-05T19:00:00Z', recurrence_type: 'weekly' })]
    const g = collapseSeries(rows, { upcomingFrom: FLOOR }).groups[0]!
    expect([g.recurring, g.dateCount, g.hiddenCount]).toEqual([true, 1, 0])
  })

  it('27. byRowId is keyed by representative only', () => {
    const r = collapseSeries(weekly(8), { upcomingFrom: FLOOR, perSeries: 1 })
    expect(r.byRowId.has('a')).toBe(true)
    expect(r.byRowId.has('c1')).toBe(false)
  })

  it('28. anchorId equals the key for a series and is null for a one-off', () => {
    const one = collapseSeries([row({ id: 'x' })], { upcomingFrom: FLOOR }).groups[0]!
    expect(one.anchorId).toBe(null)
    expect(collapseSeries(weekly(2), { upcomingFrom: FLOOR }).groups[0]!.anchorId).toBe('a')
  })

  it('15. dateCount counts ROWS only, never extrapolating recurrence_until', () => {
    const rows = weekly(2).map((r) => ({ ...r, recurrence_until: '2027-12-31T00:00:00Z' }))
    expect(collapseSeries(rows, { upcomingFrom: FLOOR }).groups[0]!.dateCount).toBe(3)
  })
})

describe('seriesDates + fetch sizing + predicates', () => {
  it('31. seriesDates returns the next N, earliest first, cancelled excluded, carrying slug', () => {
    const rows = weekly(8)
    rows[3]!.is_cancelled = true
    const dates = seriesDates(rows, { upcomingFrom: FLOOR, limit: 5 })
    expect(dates.length).toBe(5)
    expect(dates.map((d) => d.id)).toEqual(['a', 'c1', 'c2', 'c4', 'c5'])
    expect(dates[0]!.slug).toBe('a')
    expect([...dates].sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt))).toEqual(dates)
  })

  it('32+33. seriesFetchLimit multiplies then ceilings', () => {
    expect([3, 6, 24, 40, 0, 200].map(seriesFetchLimit)).toEqual([30, 60, 240, 240, 10, SERIES_FETCH_CEILING])
  })

  it('35. isSeriesCadence accepts only the three real cadences', () => {
    expect(['daily', 'weekly', 'monthly'].every(isSeriesCadence)).toBe(true)
    expect([null, undefined, '', 'none', 'fortnightly'].some(isSeriesCadence)).toBe(false)
    expect(CADENCES.size).toBe(3)
  })

  it('isSeriesAnchor: a cadence with no parent; a child is never an anchor', () => {
    expect(isSeriesAnchor(row({ id: 'a', recurrence_type: 'weekly' }))).toBe(true)
    expect(isSeriesAnchor(row({ id: 'c', recurrence_type: 'none', parent_event_id: 'a' }))).toBe(false)
  })

  it('seriesKey is parent_event_id ?? id', () => {
    expect(seriesKey(row({ id: 'c', parent_event_id: 'a' }))).toBe('a')
    expect(seriesKey(row({ id: 'x' }))).toBe('x')
  })
})

describe('collapseSeriesAroundFloor — the search partition', () => {
  // Search reads TWICE around the floor because it must still answer for past events. Each half
  // folds on its own, so a running series leads with its NEXT date and a finished one with its LAST.
  const past = (id: string, at: string, parent: string | null = null) =>
    row({ id, starts_at: at, parent_event_id: parent })

  it('34. the upcoming half comes first, in its own order', () => {
    const upcoming = [row({ id: 'u1', starts_at: '2027-03-06T19:00:00Z' })]
    const back = [past('p1', '2027-02-20T19:00:00Z')]
    expect(ids(collapseSeriesAroundFloor(upcoming, back, 10, { upcomingFrom: FLOOR }))).toEqual([
      'u1',
      'p1',
    ])
  })

  it('34b. a series straddling the floor is emitted ONCE, by its upcoming date', () => {
    // Without the cross-half dedupe the same weekly cowork reads as "next Tuesday" and
    // "last Tuesday" in one result list.
    const upcoming = [row({ id: 'c9', starts_at: '2027-03-09T19:00:00Z', parent_event_id: 'a' })]
    const back = [past('c8', '2027-02-23T19:00:00Z', 'a')]
    const out = collapseSeriesAroundFloor(upcoming, back, 10, { upcomingFrom: FLOOR })
    expect(ids(out)).toEqual(['c9'])
  })

  it('34c. the limit counts SERIES across the concatenation, not rows', () => {
    const upcoming = weekly(4) // one series, four dates + anchor
    const back = [past('p1', '2027-02-20T19:00:00Z'), past('p2', '2027-02-10T19:00:00Z')]
    const out = collapseSeriesAroundFloor(upcoming, back, 2, {
      upcomingFrom: FLOOR,
      perSeries: 1,
    })
    expect(ids(out)).toEqual(['a', 'p1'])
  })

  it('34d. an empty upcoming half still answers with the past half', () => {
    // The past half must NOT receive the floor: "past" is defined as below it, so every row would
    // be dropped by construction and search would go silent for finished events.
    const back = [past('p1', '2027-02-20T19:00:00Z'), past('p2', '2027-02-10T19:00:00Z')]
    expect(ids(collapseSeriesAroundFloor([], back, 10, { upcomingFrom: FLOOR }))).toEqual([
      'p1',
      'p2',
    ])
  })

  it('34e. a finished series is represented by its LAST date, never its opening night', () => {
    // The killer case: the caller's past read is newest-first, but the fold elects by INSTANT, so
    // without the 'latest' election a search for a long-running series answers with a date from
    // years ago.
    const back = [past('c8', '2027-02-23T19:00:00Z', 'a'), past('c1', '2026-12-01T19:00:00Z', 'a')]
    expect(ids(collapseSeriesAroundFloor([], back, 10, { upcomingFrom: FLOOR, perSeries: 1 }))).toEqual([
      'c8',
    ])
  })

  it('the upcoming half keeps the default election, so it still shows the NEXT date', () => {
    const out = collapseSeriesAroundFloor(weekly(3), [], 10, { upcomingFrom: FLOOR, perSeries: 1 })
    expect(ids(out)).toEqual(['a'])
  })

  it('a teaser block asks for one card per series', () => {
    expect(TEASER_CARDS_PER_SERIES).toBe(1)
    const out = collapseSeriesAroundFloor(weekly(6), [], 5, {
      upcomingFrom: FLOOR,
      perSeries: TEASER_CARDS_PER_SERIES,
    })
    expect(ids(out)).toEqual(['a'])
  })
})

describe('36. purity', () => {
  it('same input twice is deep-equal, and neither the input array nor its rows are mutated', () => {
    const rows = weekly(4)
    const snapshot = JSON.parse(JSON.stringify(rows))
    const a = collapseSeries(rows, { upcomingFrom: FLOOR })
    const b = collapseSeries(rows, { upcomingFrom: FLOOR })
    expect(a.rows).toEqual(b.rows)
    expect(a.groups).toEqual(b.groups)
    expect(rows).toEqual(snapshot)
  })
})

describe('S1.5 source-shape drift guard', () => {
  const src = readFileSync('lib/events/series.ts', 'utf8')
  // Assert against CODE, not prose. The header comment deliberately names the traps it avoids
  // ("never `new Date()`", "never call nextOccurrence"), so a raw substring search on the whole file
  // fails on its own documentation — which is what the first draft of these guards did.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('the file is non-trivial (guards against a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(2000)
    expect(code.length).toBeGreaterThan(1500)
  })

  it('has ZERO import statements, so a client component may import it', () => {
    // Zero imports is what keeps lib/time/zone.ts's tz-lookup dataset out of a client bundle.
    expect(code).not.toMatch(/^\s*import\s/m)
  })

  it('never reads the clock itself — the caller owns it', () => {
    expect(code).not.toContain('Date.now(')
    expect(code).not.toMatch(/new Date\(\s*\)/)
  })

  it('never expands a cadence: rows win over arithmetic', () => {
    expect(code).not.toContain('nextOccurrence')
  })

  it('publishes the exact SELECT fragment every folding read must carry', () => {
    expect(SERIES_COLUMNS).toBe('recurrence_type, recurrence_until, parent_event_id')
  })
})
