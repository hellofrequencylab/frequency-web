import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SERIES_COLUMNS } from '@/lib/events/series'

// The series fold (ADR-897) is a POST-QUERY fold: it is a silent no-op on any read whose SELECT
// omits the recurrence columns, and it starves on any read whose LIMIT was sized for one row per
// card. Both failure modes look like "the fix didn't work" rather than an error, so they are pinned
// here at the source level — the house drift-guard archetype (lib/events/options.test.ts).

const indexData = readFileSync('app/(main)/events/index-data.ts', 'utf8')
const detailPage = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')

describe('the /events index folds repeating series', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(indexData.length).toBeGreaterThan(5000)
  })

  it("selects the three columns the fold reads, or the fold silently does nothing", () => {
    for (const col of SERIES_COLUMNS.split(', ')) {
      expect(indexData).toContain(col)
    }
  })

  it('applies the fold, passing the query floor straight through as the fold floor', () => {
    expect(indexData).toContain('collapseSeriesRows(filteredEvents')
    // The count is the OPERATOR knob now (ADR-897 §7.3), not a module constant: a hardcoded
    // CARDS_PER_SERIES here made the console write a row nobody read. The knob's own consumer
    // guard lives in lib/events/series-config.test.ts.
    expect(indexData).toContain('perSeries: cardsPerSeries')
    // One value for both, so the query and the fold can never disagree about "upcoming".
    expect(indexData).toContain('upcomingFrom: listableFrom')
  })

  it('folds AFTER the facet filter and BEFORE the sort', () => {
    // Order of operations is what makes a date facet elect the occurrence INSIDE the window.
    const filterAt = indexData.indexOf('const filteredEvents')
    const foldAt = indexData.indexOf('collapseSeriesRows(filteredEvents')
    const sortAt = indexData.indexOf('const sortedEvents')
    expect(filterAt).toBeGreaterThan(-1)
    expect(foldAt).toBeGreaterThan(filterAt)
    expect(sortAt).toBeGreaterThan(foldAt)
  })

  it('over-fetches, since the fold spends the LIMIT on rows it then discards', () => {
    expect(indexData).toContain('SERIES_WIDE_READ')
    // The pre-fold literals must be gone: 200 rows is ~3 daily series.
    expect(indexData).not.toContain('publicQuery.limit(200)')
    expect(indexData).not.toContain('circleQuery.limit(40)')
  })
})

describe('the event page offers the series its other dates', () => {
  it('loads the rail dates and renders the rail', () => {
    expect(detailPage).toContain('loadSeriesDates({')
    expect(detailPage).toContain('<SeriesDatesRail')
  })
})
