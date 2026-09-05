import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
import {
  DEFAULT_CARDS_PER_SERIES,
  DEFAULT_RAIL_DATES,
  DEFAULT_INDEXED_OCCURRENCES,
} from './series'

// The operator knobs (ADR-897 §7.2). Two jobs here, because the knob has two ways to be useless:
//
//   1. THE COERCION TABLE. Zero configuration must be EXACTLY the shipped numbers (3 / 5 / 2), and
//      no stored value may ever produce zero events. A broken read shows fewer duplicates, never an
//      empty listing.
//   2. THE CONSUMER WIRING. The draft of this feature shipped a console that wrote a row NOBODY
//      READ and a kill switch that did nothing. These source-level assertions (the house archetype,
//      lib/events/options.test.ts) are what stops that repeating: they pin that the two surfaces
//      this scope wired actually ask for the value and actually pass it down.

// The settings read is mocked at the module boundary so the coercion + fail-safe paths are
// exercised without a database. `store.value` is what the (already request-cached) reader returns;
// `store.throws` simulates the DB being unreachable.
const store: { value: string; throws: boolean; written: Array<[string, string, string | null]> } = {
  value: '',
  throws: false,
  written: [],
}

vi.mock('@/lib/platform-flags', () => ({
  getPlatformSetting: async (_key: string, fallback: string) => {
    if (store.throws) throw new Error('platform_settings unreachable')
    return store.value || fallback
  },
  setPlatformSetting: async (key: string, value: string, changedBy?: string | null) => {
    store.written.push([key, value, changedBy ?? null])
    store.value = value
  },
}))

const {
  SERIES_DISPLAY_KEY,
  DEFAULT_SERIES_DISPLAY,
  MAX_CARDS_PER_SERIES,
  MAX_RAIL_DATES,
  MAX_INDEXED_OCCURRENCES,
  coerceSeriesDisplay,
  getSeriesDisplayConfig,
  saveSeriesDisplayConfig,
} = await import('./series-config')

beforeEach(() => {
  store.value = ''
  store.throws = false
  store.written = []
})

describe('the shipped defaults', () => {
  it('are IMPORTED from the pure fold module, never re-declared', () => {
    expect(DEFAULT_SERIES_DISPLAY).toEqual({
      cardsPerSeries: DEFAULT_CARDS_PER_SERIES,
      railDates: DEFAULT_RAIL_DATES,
      indexedOccurrences: DEFAULT_INDEXED_OCCURRENCES,
    })
  })

  it('are the numbers the owner asked for: 3 cards, 5 rail dates', () => {
    // Pinned literally as well as by identity: the plan's §7.2 table shows a stale "1" for
    // cardsPerSeries, and an implementer following that table would ship a different default than
    // the ADR and the fold's own tests assert.
    expect(DEFAULT_SERIES_DISPLAY.cardsPerSeries).toBe(3)
    expect(DEFAULT_SERIES_DISPLAY.railDates).toBe(5)
    expect(DEFAULT_SERIES_DISPLAY.indexedOccurrences).toBe(2)
  })
})

describe('coerceSeriesDisplay — the whole table, and it never throws', () => {
  const D = DEFAULT_SERIES_DISPLAY

  it('falls back WHOLESALE for anything that is not an object', () => {
    // The normal state is an ABSENT row, which reaches here as the '' fallback.
    for (const raw of ['', '   ', 'not json at all', 'null', '"5"', '[1,2]', null, undefined, 5, true, [1, 2]]) {
      expect(coerceSeriesDisplay(raw)).toEqual(D)
    }
  })

  it('merges a partial object field by field', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":2}')).toEqual({ ...D, cardsPerSeries: 2 })
    expect(coerceSeriesDisplay({ railDates: 8 })).toEqual({ ...D, railDates: 8 })
  })

  it('clamps zero UP for the two display counts, and leaves it alone for the crawl count', () => {
    // 0 cards would delete every repeating event from browse. 0 indexed occurrences is a legal
    // posture ("the series page only").
    expect(coerceSeriesDisplay('{"cardsPerSeries":0,"railDates":0,"indexedOccurrences":0}')).toEqual({
      cardsPerSeries: 1,
      railDates: 1,
      indexedOccurrences: 0,
    })
  })

  it('clamps a negative to the FLOOR, not to the default', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":-4,"railDates":-1,"indexedOccurrences":-9}')).toEqual({
      cardsPerSeries: 1,
      railDates: 1,
      indexedOccurrences: 0,
    })
  })

  it('clamps an over-large value to the ceiling, so a typed 99 becomes 60', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":99,"railDates":100000,"indexedOccurrences":50}')).toEqual({
      cardsPerSeries: MAX_CARDS_PER_SERIES,
      railDates: MAX_RAIL_DATES,
      indexedOccurrences: MAX_INDEXED_OCCURRENCES,
    })
    expect(MAX_CARDS_PER_SERIES).toBe(60)
  })

  it('floors a fraction, never rounds up past what was asked', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":2.7,"railDates":5.9}')).toEqual({
      ...D,
      cardsPerSeries: 2,
      railDates: 5,
    })
  })

  it('accepts numeric strings, because a number input posts strings', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":"3","railDates":"8"}')).toEqual({
      ...D,
      cardsPerSeries: 3,
      railDates: 8,
    })
  })

  it('sends an unusable field to its DEFAULT, leaving its siblings intact', () => {
    expect(coerceSeriesDisplay('{"cardsPerSeries":"lots","railDates":4}')).toEqual({ ...D, railDates: 4 })
    expect(coerceSeriesDisplay({ cardsPerSeries: Number.NaN, railDates: Number.POSITIVE_INFINITY })).toEqual(D)
    expect(coerceSeriesDisplay({ cardsPerSeries: null, railDates: {}, indexedOccurrences: [] })).toEqual(D)
  })

  it('never returns a number outside its range, for any input in the table', () => {
    for (const raw of ['', '{}', '{"cardsPerSeries":0}', '{"railDates":-3}', '{"indexedOccurrences":999}']) {
      const c = coerceSeriesDisplay(raw)
      expect(c.cardsPerSeries).toBeGreaterThanOrEqual(1)
      expect(c.cardsPerSeries).toBeLessThanOrEqual(MAX_CARDS_PER_SERIES)
      expect(c.railDates).toBeGreaterThanOrEqual(1)
      expect(c.railDates).toBeLessThanOrEqual(MAX_RAIL_DATES)
      expect(c.indexedOccurrences).toBeGreaterThanOrEqual(0)
      expect(c.indexedOccurrences).toBeLessThanOrEqual(MAX_INDEXED_OCCURRENCES)
    }
  })
})

describe('getSeriesDisplayConfig — zero configuration, and fail-safe', () => {
  it('is exactly 3 and 5 with no settings row written anywhere', async () => {
    store.value = ''
    const c = await getSeriesDisplayConfig()
    expect(c).toEqual(DEFAULT_SERIES_DISPLAY)
    expect(store.written).toHaveLength(0)
  })

  it('returns the defaults when the settings read throws', async () => {
    store.throws = true
    expect(await getSeriesDisplayConfig()).toEqual(DEFAULT_SERIES_DISPLAY)
  })

  it('reads the stored row, clamped', async () => {
    store.value = '{"cardsPerSeries":99,"railDates":2,"indexedOccurrences":0}'
    expect(await getSeriesDisplayConfig()).toEqual({ cardsPerSeries: 60, railDates: 2, indexedOccurrences: 0 })
  })

  it('is the kill switch: cardsPerSeries 60 restores pre-fold behaviour', async () => {
    // 60 is at or above the row count any cadence reaches inside the 60-day materialisation
    // horizon, so every date shows again. One upsert, no deploy.
    store.value = '{"cardsPerSeries":60,"railDates":20,"indexedOccurrences":10}'
    expect((await getSeriesDisplayConfig()).cardsPerSeries).toBe(60)
  })
})

describe('saveSeriesDisplayConfig', () => {
  it('writes the ONE key, and returns the STORED value so a typed 99 visibly becomes 60', async () => {
    const stored = await saveSeriesDisplayConfig({ cardsPerSeries: 99 }, 'profile-1')
    expect(stored.cardsPerSeries).toBe(60)
    expect(store.written).toHaveLength(1)
    const [key, value, changedBy] = store.written[0]
    expect(key).toBe(SERIES_DISPLAY_KEY)
    expect(key).toBe('events_series_display')
    expect(JSON.parse(value)).toEqual({ cardsPerSeries: 60, railDates: 5, indexedOccurrences: 2 })
    expect(changedBy).toBe('profile-1')
  })

  it('leaves an untouched field at its CURRENT value, not at the default', async () => {
    store.value = '{"cardsPerSeries":6,"railDates":9,"indexedOccurrences":1}'
    const stored = await saveSeriesDisplayConfig({ railDates: 4 })
    expect(stored).toEqual({ cardsPerSeries: 6, railDates: 4, indexedOccurrences: 1 })
  })
})

// ── The wiring guard: the knob must actually reach a consumer ─────────────────────────────────
// (source-level, house archetype — a knob nothing reads is the exact failure the draft shipped)

const indexData = readFileSync('app/(main)/events/index-data.ts', 'utf8')
const detailPage = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')
const adminPage = readFileSync('app/(main)/admin/events/page.tsx', 'utf8')
const adminAction = readFileSync('app/(main)/admin/events/series-actions.ts', 'utf8')
const configSrc = readFileSync('lib/events/series-config.ts', 'utf8')

describe('the knob reaches the surfaces it claims to tune', () => {
  it('guards non-trivially (an empty read passes every assertion below)', () => {
    for (const src of [indexData, detailPage, adminPage, adminAction, configSrc]) {
      expect(src.length).toBeGreaterThan(400)
    }
  })

  it('the /events index reads cardsPerSeries instead of a hardcoded constant', () => {
    expect(indexData).toContain('getSeriesDisplayConfig(')
    expect(indexData).toContain('perSeries: cardsPerSeries')
    // The module-level constant is what made the knob inoperative on the biggest surface.
    expect(indexData).not.toContain('const CARDS_PER_SERIES')
  })

  it('the event page passes railDates into the rail read', () => {
    expect(detailPage).toContain('getSeriesDisplayConfig(')
    expect(detailPage).toContain('limit: railDates')
  })

  it('the console reads the stored value and its action re-gates on janitor', () => {
    expect(adminPage).toContain('getSeriesDisplayConfig(')
    expect(adminPage).toContain('<SeriesDisplaySection')
    // The chrome decides what renders; the action is the law. /admin/events admits community host
    // and community staff, but these three numbers are platform-wide.
    expect(adminAction).toContain("requireAdmin('janitor')")
    expect(adminAction).toContain('saveSeriesDisplayConfig(')
    // The knob genuinely reaches every surface, so the save purges the whole layout.
    // Matched on comment-free source (scan2 L8-04): the needle also sits in a comment of the pinned
    // file, so a bare toContain stayed green with the code deleted.
    expect(sourceWithoutComments('app/(main)/admin/events/series-actions.ts')).toContain(
      "revalidatePath('/', 'layout')",
    )
  })

  it('adds NO parallel admin-menu catalog (MENU-CONTRACT: /admin/events is already registered)', () => {
    // scripts/check-menu.mjs fails the build on `const X_MODULES = [` outside the three allowlisted
    // catalogs. A fourth AdminSection on a registered destination is a content edit, not a menu
    // change, so nothing here may declare one.
    const catalog = /\bconst\s+[A-Z][A-Z0-9_]*_MODULES\b\s*[:=]/
    for (const src of [adminPage, adminAction, configSrc, readFileSync('app/(main)/admin/events/series-display-section.tsx', 'utf8')]) {
      expect(catalog.test(src)).toBe(false)
    }
    // And the destination itself stays a single STUDIO_LEAVES row.
    expect(readFileSync('lib/nav/studio.ts', 'utf8')).toContain("href: '/admin/events'")
  })

  it('keeps the settings module server-only, so no client bundle can reach the service role', () => {
    expect(configSrc).toContain("import 'server-only'")
  })

  // 🔴 THE REGRESSION THIS PINS, because nothing else in the harness can. The console shipped
  // importing MIN_/MAX_ from the server-only module: `pnpm exec tsc --noEmit` passed, the full
  // 7514-test vitest run passed (vitest.config.ts aliases `server-only` to a stub so server modules
  // stay unit-testable), and `pnpm build` died with "'server-only' cannot be imported from a Client
  // Component module". Only the build sees it, so the guard has to be a source assertion.
  it("no 'use client' file imports the server-only settings module", () => {
    const clientFiles = [
      'app/(main)/admin/events/series-display-section.tsx',
    ]
    for (const path of clientFiles) {
      const src = readFileSync(path, 'utf8')
      expect(src).toContain("'use client'")
      // The bounds must come from the pure sibling. The `.shared` suffix is load-bearing: a bare
      // '@/lib/events/series-config' import from a client component fails the production build.
      expect(src).toContain("from '@/lib/events/series-config.shared'")
      expect(src).not.toMatch(/from '@\/lib\/events\/series-config'/)
    }
  })

  it('the shared half stays pure, so it is safe to import from anywhere', () => {
    const shared = readFileSync('lib/events/series-config.shared.ts', 'utf8')
    expect(shared).not.toContain("import 'server-only'")
    // Its ONLY import is the zero-import pure fold. Reaching for the Supabase client or
    // next/headers here would re-create the problem the split exists to solve.
    // `[\s\S]*?` not `.*?`: the import list here spans lines, and a single-line regex would find
    // zero imports and pass vacuously.
    const imports = [...shared.matchAll(/\bimport[\s\S]*?from '([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['./series'])
    // And the coercion table really is defined here rather than duplicated in both files.
    expect(shared).toContain('export function coerceSeriesDisplay')
    expect(configSrc).not.toContain('export function coerceSeriesDisplay')
  })
})
