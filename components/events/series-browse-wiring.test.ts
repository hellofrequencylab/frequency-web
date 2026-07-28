import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SERIES_COLUMNS } from '@/lib/events/series'

// The BROWSE surfaces of the series fold (ADR-897) — the blocks and lists that showed one card per
// DATE. The sibling guard (components/events/series-wiring.test.ts) pins the /events index and the
// event page; this one pins the five that flooded around them, including the right-rail panel the
// duplication was originally reported on (one cowork series holding all three slots).
//
// Everything here is a SOURCE-LEVEL assertion, the house archetype (lib/events/options.test.ts),
// because both failure modes are silent:
//   • a SELECT missing the three recurrence columns makes the fold a no-op — no error, no log;
//   • a LIMIT still sized for one row per card starves the fold, so a 3-slot block shows ONE card.
// Neither shows up in a type check or a render test.

type Surface = {
  path: string
  /** How the read now sizes itself: the over-fetch helper, or the global cap for a wide read. */
  sizing: string
  /** A bare pre-fold limit literal that must be gone. Omitted where the same literal legitimately
   *  sizes a NON-event read in the same file (the search files also list people and posts). */
  oldLimit?: string
}

const SURFACES: Surface[] = [
  { path: 'components/sidebar/rail-panels.tsx', sizing: 'seriesFetchLimit(', oldLimit: '.limit(3)' },
  {
    path: 'components/widgets/circles/circle-events.tsx',
    sizing: 'seriesFetchLimit(',
    oldLimit: '.limit(CIRCLE_UPCOMING_LIMIT + 1)',
  },
  { path: 'components/events/upcoming-widget.tsx', sizing: 'seriesFetchLimit(', oldLimit: '.limit(3)' },
  { path: 'app/discover/events/_data.ts', sizing: 'SERIES_WIDE_READ', oldLimit: 'limit = 500' },
  { path: 'app/(main)/search/page.tsx', sizing: 'seriesFetchLimit(' },
  { path: 'app/api/search/route.ts', sizing: 'seriesFetchLimit(' },
]

/** An events read that still sizes itself with a bare number: `.order('starts_at', …).limit(6)`.
 *  This is the starvation shape, and it is the one that survives a type check. */
const BARE_EVENT_LIMIT = /\.order\(\s*['"]starts_at['"][\s\S]{0,120}?\.limit\(\s*\d/

const FOLD_CALLS = ['collapseSeriesRows(', 'collapseSeries(', 'collapseSeriesAroundFloor(']

const read = (path: string) => readFileSync(path, 'utf8')
/** Comments name the traps these files avoid ("never `new Date()`"), so prose must never satisfy —
 *  or fail — an assertion about code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('every browse surface folds repeating events', () => {
  it('the surface list is non-empty and every file is real (guards a vacuous pass)', () => {
    expect(SURFACES.length).toBeGreaterThanOrEqual(6)
    for (const s of SURFACES) expect(read(s.path).length).toBeGreaterThan(500)
  })

  for (const surface of SURFACES) {
    describe(surface.path, () => {
      const code = stripComments(read(surface.path))

      it('selects the three recurrence columns, or the fold silently does nothing', () => {
        // Via the shared SERIES_COLUMNS fragment, so a rename cannot leave a stale copy behind.
        expect(code).toContain('SERIES_COLUMNS')
        for (const col of SERIES_COLUMNS.split(', ')) {
          expect(SERIES_COLUMNS).toContain(col)
        }
      })

      it('applies the fold', () => {
        expect(FOLD_CALLS.some((call) => code.includes(call))).toBe(true)
      })

      it('over-fetches, since the fold spends the LIMIT on rows it discards', () => {
        expect(code).toContain(surface.sizing)
        expect(code).not.toMatch(BARE_EVENT_LIMIT)
        if (surface.oldLimit) expect(code).not.toContain(surface.oldLimit)
      })

      it('floors on the wall clock, not on a raw instant', () => {
        // starts_at is the host's wall clock kept as UTC parts: `new Date().toISOString()` is
        // already tomorrow by 5pm Pacific, so tonight's 7pm gathering vanishes from the listing.
        expect(code).toContain('seriesUpcomingFloor(')
        expect(code).not.toContain(".gte('starts_at', new Date().toISOString())")
      })
    })
  }
})

describe('the surfaces with a shape of their own', () => {
  it('the rail panel wires BOTH branches, so the unscoped fallback cannot keep flooding', () => {
    const code = stripComments(read('components/sidebar/rail-panels.tsx'))
    // Two reads: the viewer's Circles, and the community-wide fallback when those are quiet.
    // Wiring only the first leaves the unscoped one flooding every member's rail.
    expect(code.split('${SERIES_COLUMNS}').length).toBe(3)
    expect(code.split('.limit(fetchLimit)').length).toBe(3)
    expect(code.split('= fold(').length).toBe(3) // one shared fold, called by BOTH branches
    // The gate is the query here: this panel reads through the RLS-bypassing admin client, and it
    // used to filter is_cancelled alone, so drafts and removed events were eligible for the rail.
    expect(code.split("eq('status', 'published')").length).toBe(3)
    expect(code.split("is('removed_at', null)").length).toBe(3)
    expect(code).toContain("eq('visibility', 'public')")
  })

  it('the Circle block folds BEFORE it selects, and never hides its own escape hatch', () => {
    const code = stripComments(read('components/widgets/circles/circle-events.tsx'))
    const foldAt = code.indexOf('collapseSeriesRows(')
    const selectAt = code.indexOf('selectUpcomingForCircle(')
    expect(foldAt).toBeGreaterThan(-1)
    expect(selectAt).toBeGreaterThan(foldAt)
    // hasMore counts SERIES, plus the truncated-read signal: fifty rows of a daily series hide a
    // sibling one-off fifty-five days out, and the row count is the only trace of that.
    expect(code).toContain('rows.length >= fetchLimit')
  })

  it('the hub read folds BEFORE the enrichment map, where the recurrence fields still exist', () => {
    const code = stripComments(read('app/discover/events/_data.ts'))
    const foldAt = code.indexOf('collapseSeriesRows(')
    const mapAt = code.indexOf('.map(toEnriched)')
    expect(foldAt).toBeGreaterThan(-1)
    expect(mapAt).toBeGreaterThan(foldAt)
  })

  for (const path of ['app/(main)/search/page.tsx', 'app/api/search/route.ts']) {
    it(`${path} partitions around the floor instead of folding a floorless window`, () => {
      const code = stripComments(read(path))
      // Two reads: upcoming ascending, past DESCENDING. One fold over a floorless ascending read
      // would elect a series' very first date ever.
      expect(code).toContain('collapseSeriesAroundFloor(')
      expect(code).toContain('ascending: false')
      expect(code).toContain("lt('starts_at'")
      // A FACTORY, never one shared builder: PostgrestFilterBuilder mutates `this` and returns
      // `this`, and .order() concatenates, so a shared instance fires ONE query carrying both
      // predicates and a doubled order, which matches nothing.
      expect(code).toContain('const eventsBase = () =>')
      expect(code).not.toMatch(/const\s+eventsBase\s*=\s*admin/)
    })
  }
})

describe('calendars must NOT fold', () => {
  // The owner's standing instruction: every date shows on personal and Space calendars, and on
  // every .ics feed. A fold there is a regression, not an improvement.
  const NEVER = [
    'app/(main)/events/calendar/page.tsx',
    'app/(main)/spaces/[slug]/(profile)/calendar/page.tsx',
    'lib/events/ics.ts',
    'lib/spaces/collaborator-calendar.ts',
  ]

  it('no calendar surface collapses a series', () => {
    for (const path of NEVER) {
      const code = stripComments(read(path))
      expect(code.length).toBeGreaterThan(500)
      for (const call of FOLD_CALLS) expect(code).not.toContain(call)
    }
  })
})
