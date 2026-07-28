import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isOccurrenceIndexed, seriesRobots, suppressPastNoindex, type SeriesSeoFacts } from './series-seo'
import { DEFAULT_INDEXED_OCCURRENCES } from './series'

// The crawl half of ADR-897. The pure rules are exercised directly; the reads are pinned by a
// source-shape guard, the same archetype as components/events/series-wiring.test.ts — a folding or
// gating read is wrong in ways a unit test with a stubbed client would happily pass.

const facts = (over: Partial<SeriesSeoFacts> = {}): SeriesSeoFacts => ({
  inSeries: true,
  isAnchor: false,
  ordinal: 0,
  seriesLive: true,
  ...over,
})

describe('isOccurrenceIndexed', () => {
  // The one question both crawl surfaces ask. The sitemap sizes its per-series fold with the same
  // number, so these cases are also the sitemap's contract: three indexable URLs at the default.

  it('indexes a one-off: it is not our call to make', () => {
    expect(isOccurrenceIndexed({ inSeries: false, isAnchor: false, ordinal: null, seriesLive: false }, 2)).toBe(true)
  })

  it('indexes the elected series home and the next N dates, and nothing past them', () => {
    expect([0, 1, 2, 3, 4].map((ordinal) => isOccurrenceIndexed(facts({ ordinal }), 2))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })

  it('always indexes the anchor, whatever its ordinal or the allowance', () => {
    expect(isOccurrenceIndexed(facts({ isAnchor: true, ordinal: 40 }), 2)).toBe(true)
    expect(isOccurrenceIndexed(facts({ isAnchor: true, ordinal: 40 }), 0)).toBe(true)
  })

  it('honours 0 as "the series page only"', () => {
    expect(isOccurrenceIndexed(facts({ ordinal: 0 }), 0)).toBe(true)
    expect(isOccurrenceIndexed(facts({ ordinal: 1 }), 0)).toBe(false)
  })

  it('opens back up as the operator raises the knob', () => {
    expect(isOccurrenceIndexed(facts({ ordinal: 9 }), 2)).toBe(false)
    expect(isOccurrenceIndexed(facts({ ordinal: 9 }), 10)).toBe(true)
  })

  it('floors a fractional allowance rather than rounding it up', () => {
    expect(isOccurrenceIndexed(facts({ ordinal: 3 }), 2.9)).toBe(false)
  })

  it('falls back to the shipped default when the settings read gave a malformed number', () => {
    expect(DEFAULT_INDEXED_OCCURRENCES).toBe(2)
    expect(isOccurrenceIndexed(facts({ ordinal: 2 }), Number.NaN)).toBe(true)
    expect(isOccurrenceIndexed(facts({ ordinal: 3 }), Number.NaN)).toBe(false)
    expect(isOccurrenceIndexed(facts({ ordinal: 3 }), Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('clamps a negative allowance to 0, NEVER to "index everything"', () => {
    expect(isOccurrenceIndexed(facts({ ordinal: 1 }), -5)).toBe(false)
    expect(isOccurrenceIndexed(facts({ ordinal: 0 }), -5)).toBe(true)
  })

  it('stays quiet when the ordinal could not be resolved (a read failed): exactly today', () => {
    expect(isOccurrenceIndexed(facts({ ordinal: null }), 2)).toBe(true)
  })

  it('agrees with seriesRobots on every case: one rule, two shapes', () => {
    for (const isAnchor of [true, false]) {
      for (const ordinal of [null, 0, 1, 2, 3, 12]) {
        for (const allowance of [0, 1, 2, 5]) {
          const f = facts({ isAnchor, ordinal })
          expect(seriesRobots(f, allowance) === undefined).toBe(isOccurrenceIndexed(f, allowance))
        }
      }
    }
  })
})

describe('seriesRobots', () => {
  it('leaves a one-off alone', () => {
    expect(seriesRobots({ inSeries: false, isAnchor: false, ordinal: null, seriesLive: false }, 2)).toBeUndefined()
  })

  it('NEVER noindexes the series anchor, at any ordinal', () => {
    expect(seriesRobots(facts({ isAnchor: true, ordinal: 0 }), 2)).toBeUndefined()
    expect(seriesRobots(facts({ isAnchor: true, ordinal: 9 }), 2)).toBeUndefined()
    expect(seriesRobots(facts({ isAnchor: true, ordinal: 9 }), 0)).toBeUndefined()
  })

  it('indexes the elected series home and the first N dates', () => {
    for (const ordinal of [0, 1, 2]) {
      expect(seriesRobots(facts({ ordinal }), 2)).toBeUndefined()
    }
  })

  it('noindex,follow beyond the allowance', () => {
    expect(seriesRobots(facts({ ordinal: 3 }), 2)).toEqual({ index: false, follow: true })
    expect(seriesRobots(facts({ ordinal: 60 }), 2)).toEqual({ index: false, follow: true })
  })

  it('honours indexedOccurrences 0: the series home only', () => {
    expect(seriesRobots(facts({ ordinal: 0 }), 0)).toBeUndefined()
    expect(seriesRobots(facts({ ordinal: 1 }), 0)).toEqual({ index: false, follow: true })
  })

  it('turns off cleanly when the operator raises the allowance', () => {
    expect(seriesRobots(facts({ ordinal: 9 }), 10)).toBeUndefined()
  })

  it('falls back to the default allowance on a malformed number', () => {
    expect(DEFAULT_INDEXED_OCCURRENCES).toBe(2)
    expect(seriesRobots(facts({ ordinal: 3 }), Number.NaN)).toEqual({ index: false, follow: true })
    expect(seriesRobots(facts({ ordinal: 2 }), Number.NaN)).toBeUndefined()
    // A negative clamps to 0, never to "index everything".
    expect(seriesRobots(facts({ ordinal: 1 }), -5)).toEqual({ index: false, follow: true })
  })

  it('stays quiet when the ordinal could not be resolved (a read failed)', () => {
    expect(seriesRobots(facts({ ordinal: null }), 2)).toBeUndefined()
  })
})

describe('suppressPastNoindex', () => {
  it('rescues the anchor of a series that is still meeting (D1)', () => {
    expect(suppressPastNoindex(facts({ isAnchor: true, seriesLive: true }))).toBe(true)
  })

  it('lets a finished series expire', () => {
    expect(suppressPastNoindex(facts({ isAnchor: true, seriesLive: false }))).toBe(false)
  })

  it('never rescues a past child date: it really is over', () => {
    expect(suppressPastNoindex(facts({ isAnchor: false, seriesLive: true }))).toBe(false)
  })

  it('never rescues a one-off', () => {
    expect(suppressPastNoindex({ inSeries: false, isAnchor: false, ordinal: null, seriesLive: false })).toBe(false)
  })
})

// ── Source-shape guards ─────────────────────────────────────────────────────
// The crawl gate is the part that cannot be allowed to drift. `public_events` filters only
// is_cancelled + starts_at, so if these reads ever lose a clause the sitemap starts advertising
// unlisted or removed events again.

const src = readFileSync(join(process.cwd(), 'lib/events/series-seo.ts'), 'utf8')

describe('series-seo source shape', () => {
  it('carries SERIES_COLUMNS into the sitemap select (without them the fold is a no-op)', () => {
    expect(src).toContain('${SERIES_COLUMNS}')
  })

  it('applies the full public gate on every crawl read', () => {
    for (const clause of [
      `.eq('status', 'published')`,
      `.eq('visibility', 'public')`,
      `.eq('is_cancelled', false)`,
      `.is('removed_at', null)`,
    ]) {
      // Twice: the ordinal read and the sitemap read. Three times once the llms.txt count is included.
      expect(src.split(clause).length - 1).toBeGreaterThanOrEqual(3)
    }
  })

  it('never reaches for the loose public_events RPC (named in the header, never called)', () => {
    expect(src).toContain('public_events') // the header explains WHY it is not used
    expect(src).not.toContain('.rpc(')
    expect(src).not.toContain('getPublicEvents')
  })

  it('uses the community wall-clock floor, never a raw new Date() comparison', () => {
    expect(src).toContain('seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))')
  })

  it('sanitizes the series key before interpolating it into a PostgREST .or()', () => {
    expect(src).toContain('UUID.test(key)')
  })

  it('is server-only', () => {
    expect(src.startsWith("import 'server-only'")).toBe(true)
  })
})

describe('sitemap wiring', () => {
  const sitemap = readFileSync(join(process.cwd(), 'app/sitemap.ts'), 'utf8')

  it('builds event entries from listSitemapEventEntries, not getPublicEvents', () => {
    expect(sitemap).toContain('listSitemapEventEntries')
    // The RPC filters ONLY is_cancelled + starts_at, so going back to it re-advertises unlisted,
    // draft and moderator-removed events. Both the call and the import must stay gone.
    expect(sitemap).not.toContain('getPublicEvents(')
    expect(sitemap).not.toContain('getPublicEvents,')
  })

  it('sizes the fold with the OPERATOR knob, not a hardcoded number', () => {
    // A sitemap that advertises date three while that page answers noindex is a self-contradicting
    // crawl signal, and the knob is the only thing that keeps the two in step. This is the exact
    // failure the build plan named: a console that writes a row nobody reads.
    expect(sitemap).toContain('getSeriesDisplayConfig()')
    expect(sitemap).toContain('occurrences: indexedOccurrences')
    expect(sitemap).not.toMatch(/occurrences:\s*\d/)
  })

  it('reads the folded entry shape, so a rename cannot silently emit undefined URLs', () => {
    // `e.starts_at` (the old RPC row) would produce `new Date(undefined)` -> Invalid Date in every
    // lastModified, which serialises without throwing. The type is the real guard; this is the
    // cheap one that runs on every push.
    expect(sitemap).toContain('e.startsAt')
    expect(sitemap).not.toContain('e.starts_at')
  })

  it('ranks the series page above its individual dates', () => {
    expect(sitemap).toContain('e.isSeriesHome ? 0.8 : 0.7')
  })
})

describe('embeddings wiring (ADR-897 E1 + E2 ship together or not at all)', () => {
  const embeddings = readFileSync(join(process.cwd(), 'lib/events/embeddings.ts'), 'utf8')
  const matching = readFileSync(join(process.cwd(), 'lib/events/matching.ts'), 'utf8')

  it('writes one vector per SERIES, keyed on the anchor', () => {
    expect(embeddings).toContain("import { seriesKey } from '@/lib/events/series'")
    expect(embeddings).toContain('bySeries')
    expect(embeddings).toContain('event_id: key')
    // parent_event_id in the SELECT is what makes seriesKey mean anything. Without it every
    // occurrence reads as its own series and the de-duplication silently stops.
    expect(embeddings).toContain('parent_event_id')
  })

  it('keeps the READER fanning out, or narrowing the writer is a silent 45% signal loss', () => {
    expect(matching).toContain("import { seriesKey } from '@/lib/events/series'")
    expect(matching).toContain('parent_event_id')
    // The union lookup: the row's own id AND its series key, own id winning.
    expect(matching).toContain('[...keys]')
    expect(matching).toContain('byKey[e.id] ??')
  })

  it('does not exclude a series whose ANCHOR date has already passed', () => {
    // `.is('parent_event_id', null)` on an upcoming-only read makes a long-running series
    // permanently unembeddable: its anchor row can never come back into the window. The candidate
    // read must go through the live occurrences and collapse.
    expect(embeddings).not.toContain(".is('parent_event_id', null)")
  })
})

describe('llms.txt wiring', () => {
  const llms = readFileSync(join(process.cwd(), 'app/llms.txt/route.ts'), 'utf8')

  it('counts series, not rows', () => {
    expect(llms).toContain('countUpcomingPublicSeries')
  })
})

describe('event page robots wiring', () => {
  const page = readFileSync(join(process.cwd(), 'app/(main)/events/[slug]/page.tsx'), 'utf8')

  it('reads the series facts off the row generateMetadata already fetched', () => {
    expect(page).toContain('seriesSeoFacts')
    expect(page).toContain('suppressPastNoindex')
    expect(page).toContain('seriesRobots')
  })

  it('keeps the occurrence SELF-canonical: a canonical to the series page would delete it from the index', () => {
    expect(page).toContain('canonical: `/events/${slug}`')
  })

  it('sizes the directive with the same operator knob the sitemap uses', () => {
    expect(page).toContain('seriesRobots(facts, indexedOccurrences)')
  })

  it('spreads robots CONDITIONALLY, so an indexable page still inherits the layout', () => {
    // Next merges nested metadata fields by OVERWRITE, not by merge
    // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1328),
    // so an always-present `robots` key would drop the layout's fields on every event page.
    expect(page).toContain('...(robots ? { robots } : {})')
  })

  it('applies the same two rules on the /discover twin', () => {
    const twin = readFileSync(join(process.cwd(), 'app/discover/events/[slug]/page.tsx'), 'utf8')
    expect(twin).toContain('seriesRobots(facts, indexedOccurrences)')
    expect(twin).toContain('suppressPastNoindex')
    // A canonical is only a HINT; the directive is what keeps date twenty out of the index.
    expect(twin).toContain('canonical: `/events/${event.slug}`')
  })
})
