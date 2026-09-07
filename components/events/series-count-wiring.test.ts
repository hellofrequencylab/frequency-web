import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
import { SERIES_COLUMNS, countSeries, type SeriesRow } from '@/lib/events/series'

// The COUNT half of the series fold (LIVE-198 / SERIES-COUNT) — the sibling of
// components/events/series-wiring.test.ts (the /events index + the event page) and
// series-browse-wiring.test.ts (the blocks and lists). Those pin the surfaces that LISTED one card
// per date; this one pins the surfaces that COUNTED one event per date.
//
// THE PRODUCTION READING THIS EXISTS FOR, measured 2026-09-07 on the live database:
//   • 21 upcoming, non-cancelled rows across the community are 5 gatherings;
//   • 18 of those 21 rows are series children (parent_event_id is not null);
//   • the two Spaces that run a weekly series each advertised "9 upcoming events" where 1 is true.
// (The row's own "~60x" predates the fold work and is stale; the real figure is 9-for-1 per Space.)
//
// SOURCE-LEVEL, like its siblings, because both failure modes are silent: a count that reverts to
// `head: true` or to `rows.length` still renders a number, and a SELECT that drops the recurrence
// columns makes the fold a no-op with no error and no log. Neither shows up in a type check.

type Site = {
  path: string
  /** What the number is called on the surface, for the failure message. */
  stat: string
  /** True when the rows come from a reader that already carries SERIES_COLUMNS (lib/events/store.ts
   *  listEventsForSpace), so the file itself does not name them. */
  viaReader?: boolean
}

const SITES: Site[] = [
  { path: 'lib/spaces/discovery.ts', stat: 'the /spaces directory card’s "N upcoming events"' },
  { path: 'app/(main)/admin/page.tsx', stat: 'the admin home KPI + Community tile "Events ahead"' },
  { path: 'components/admin/admin-info-rail.tsx', stat: 'the admin rail’s "Upcoming events"' },
  { path: 'components/sidebar/rail-panels.tsx', stat: 'Community pulse "N this week"' },
  { path: 'components/widgets/community/manage.tsx', stat: 'the Community Manage card "upcoming events"' },
  { path: 'components/widgets/community/structure.tsx', stat: 'Structure & people "Upcoming events"' },
  { path: 'components/widgets/lead/lead-stats.tsx', stat: 'the leadership hub "Upcoming events"' },
  { path: 'app/(main)/nearby/page.tsx', stat: '/nearby "N upcoming events" + the Coming up header' },
  { path: 'app/(main)/spaces/[slug]/manage/rail-getters.ts', stat: 'the Space manage rail’s Calendar box', viaReader: true },
  { path: 'app/(main)/spaces/[slug]/settings/calendar/page.tsx', stat: 'the Space calendar console’s "N upcoming events."', viaReader: true },
  { path: 'lib/spaces/profile-stats.ts', stat: 'the public Space hero stats (Sessions / Offerings)', viaReader: true },
]

/** The shapes that count ROWS. `head: true` on `events` is the tally that cannot fold at all;
 *  `.count ?? 0` on an events read is the same thing one line later. */
// Anchored on the events SELECT ITSELF — `[^)]*` cannot cross out of the argument list, so a
// `head: true` count on some OTHER table further down the same Promise.all can never satisfy it.
const HEAD_COUNT = /from\(\s*['"]events['"]\s*\)\s*\.select\(\s*[^)]*head:\s*true/
const COUNT_CALLS = ['countSeries(', 'countSeriesBy(']

const read = (path: string) => readFileSync(path, 'utf8')
/** Comments name the trap each file avoids, so prose must never satisfy an assertion about code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('every surface that counts events counts GATHERINGS', () => {
  it('the site list is non-empty and every file is real (guards a vacuous pass)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(11)
    for (const s of SITES) expect(read(s.path).length).toBeGreaterThan(500)
  })

  for (const site of SITES) {
    describe(site.path, () => {
      const code = stripComments(read(site.path))

      it(`folds ${site.stat} through the one count helper`, () => {
        expect(COUNT_CALLS.some((call) => code.includes(call))).toBe(true)
      })

      it('carries the recurrence columns into the read, or the fold silently does nothing', () => {
        // Via the shared fragment, so a rename cannot leave a stale copy behind. The three
        // listEventsForSpace callers inherit it from that reader's own COLS instead.
        expect(code.includes('SERIES_COLUMNS') || site.viaReader === true).toBe(true)
      })

      it('no `head: true` tally survives on the events table — it cannot fold', () => {
        expect(code).not.toMatch(HEAD_COUNT)
      })
    })
  }

  it('the shared reader behind the three viaReader sites selects the columns itself', () => {
    // Without this line those three count nine dates as nine events again, and nothing else in this
    // file would notice: their own source never names the columns.
    // Import-free too (LIVE-167): the name must be the shared constant in use, not a private copy.
    const store = sourceWithoutComments('lib/events/store.ts', { imports: true })
    expect(store).toContain('${SERIES_COLUMNS}')
    expect(store).not.toMatch(/const SERIES_COLUMNS\b/)
  })
})

describe('the detectors themselves fire (a guard that cannot fail reads as coverage)', () => {
  it('HEAD_COUNT matches the exact shape every one of these sites used to carry', () => {
    // The literal pre-fix line from components/widgets/community/structure.tsx.
    expect(`admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', nowIso)`).toMatch(HEAD_COUNT)
    // …and the single-line spelling from the Pulse panel.
    expect(`admin.from('events').select('id', { count: 'exact', head: true }).eq('is_cancelled', false)`).toMatch(HEAD_COUNT)
  })

  it('HEAD_COUNT does NOT fire on a head count of another table in the same batch', () => {
    expect(`admin.from('events').select(\`id, \${SERIES_COLUMNS}\`),
    admin.from('profiles').select('id', { count: 'exact', head: true }),`).not.toMatch(HEAD_COUNT)
  })

  it('the fold detector is not satisfied by a comment that merely mentions the helper', () => {
    expect(stripComments("// countSeries( is what this should call\nconst n = rows.length")).not.toContain('countSeries(')
  })
})

describe('the helper the sites share', () => {
  const weekly = (n: number): SeriesRow[] => {
    const start = Date.UTC(2099, 0, 6, 19, 0, 0)
    return [
      { id: 'anchor', starts_at: new Date(start).toISOString(), recurrence_type: 'weekly', parent_event_id: null, is_cancelled: false },
      ...Array.from({ length: n }, (_, i) => ({
        id: `c${i}`,
        starts_at: new Date(start + (i + 1) * 7 * 864e5).toISOString(),
        recurrence_type: 'none',
        parent_event_id: 'anchor',
        is_cancelled: false,
      })),
    ]
  }

  it('reproduces the production reading: nine materialised rows, one gathering', () => {
    expect(weekly(8)).toHaveLength(9)
    expect(countSeries(weekly(8))).toBe(1)
  })

  it('and the community aggregate: 21 rows over 5 gatherings, 18 of them series children', () => {
    // The live shape on 2026-09-07: two weekly series (9 rows each) plus three one-offs.
    const rows: SeriesRow[] = [
      ...weekly(8),
      ...weekly(8).map((r) => ({ ...r, id: `b-${r.id}`, parent_event_id: r.parent_event_id ? 'b-anchor' : null })),
      { id: 'one', starts_at: '2099-03-01T19:00:00Z', recurrence_type: 'none', parent_event_id: null, is_cancelled: false },
      { id: 'two', starts_at: '2099-03-02T19:00:00Z', recurrence_type: 'none', parent_event_id: null, is_cancelled: false },
      { id: 'three', starts_at: '2099-03-03T19:00:00Z', recurrence_type: 'none', parent_event_id: null, is_cancelled: false },
    ]
    expect(rows).toHaveLength(21)
    expect(rows.filter((r) => r.parent_event_id != null)).toHaveLength(16) // 8 children per series
    expect(countSeries(rows)).toBe(5)
  })

  it('SERIES_COLUMNS is exactly the three columns the fold needs', () => {
    expect(SERIES_COLUMNS.split(', ')).toHaveLength(3)
  })
})
