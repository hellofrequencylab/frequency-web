import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CENSUS_PATH,
  CONFIG_PATH,
  HOME_STORE,
  INDETERMINATE,
  MAX_CENSUS_AGE_DAYS,
  MAX_HOPS,
  MIN_DOCUMENTS,
  MIN_HREFS_SET,
  MIN_REDIRECTS,
  MIN_STORES,
  classify,
  classifyHome,
  classifyTarget,
  followRedirects,
  freshnessProblems,
  homeStoreProblems,
  integrityProblems,
  loadCensus,
  loadRedirects,
  normaliseHref,
  parseRedirects,
  recaptureDates,
  report,
  resolveRedirect,
} from './check-stored-links.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ENFORCING HALF of check:stored-links (ADR-1241, backlog HYG-023; census ADR-1115).
//
// The CLI is pure node and reads two files: the link census and next.config.ts. Nothing here needs
// a TSX registry, so this file's job is different from check-stored-blocks.test.ts's: it is the
// NON-VACUITY PROOF. Every arm of the checker is driven twice, once against the real tree (where
// the correct answer is silence) and once against a fixture built to break it (where the correct
// answer is red). A guard that has never been seen to fail is a guard nobody has tested, and the
// census's own recapture log records the failure this instrument exists for: a date that moved
// while the reading did not, and two probes that went on agreeing with it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..')
const census = loadCensus(join(ROOT, CENSUS_PATH))
const redirects = loadRedirects(join(ROOT, CONFIG_PATH))
/** The clock every real-tree assertion uses: the day of the last re-capture plus a week, so the
 *  suite measures the census against ITS OWN date and does not itself go red on a calendar. The
 *  calendar arm is proven on fixtures below; the CLI (which the probes run) uses the real clock. */
const NOW = Date.parse(`${census.capturedAt}T00:00:00Z`) + 7 * 86_400_000

type Target = { hits: number; docs: number }
type Store = { store: string; documents: number; hrefsSet: number; hrefsEmpty: number; targets: Record<string, Target> }
type Link = { block: number; id: string; type: string; prop: string; label: string; href: string }
type Home = {
  slug: string
  blocks: number
  distinctDestinations: number
  destinations: string[]
  retiredHrefs: number
  absoluteSelfHrefs: number
  links: Link[]
}
type Census = { capturedAt?: string; recaptureLog?: string[]; origin: string; stores: Store[]; home: Home }

const ORIGIN = 'https://example.test'

/** A census shaped like the real one but small: the base every broken fixture mutates. It is
 *  internally consistent (the home store's targets ARE the home links, hit for hit) and clears
 *  every floor, so a clean run on it is the control for every red run below. */
function fixtureCensus(overrides: Partial<Census> = {}): Census {
  const link = (block: number, prop: string, href: string): Link => ({ block, id: `b${block}`, type: 'Hero', prop, label: 'x', href })
  const links = [
    link(1, 'ctaPrimaryHref', '/join'),
    link(1, 'ctaSecondaryHref', '/discover'),
    link(2, 'ctaHref', '/about'),
    link(3, 'ctaPrimaryHref', '/join'),
    link(3, 'ctaSecondaryHref', '#contact'),
  ]
  return {
    capturedAt: '2026-09-01',
    recaptureLog: ['2026-08-24 first capture', '2026-09-01 re-captured'],
    origin: ORIGIN,
    stores: [
      { store: 'pages.data', documents: 10, hrefsSet: 10, hrefsEmpty: 2, targets: { '/join': { hits: 10, docs: 10 } } },
      { store: HOME_STORE, documents: 1, hrefsSet: 5, hrefsEmpty: 0, targets: { '/join': { hits: 2, docs: 1 }, '/discover': { hits: 1, docs: 1 }, '/about': { hits: 1, docs: 1 }, '#contact': { hits: 1, docs: 1 } } },
      { store: 'spaces.preferences.pageDocs', documents: 12, hrefsSet: 12, hrefsEmpty: 3, targets: { '#contact': { hits: 12, docs: 12 } } },
    ],
    home: { slug: 'home', blocks: 3, distinctDestinations: 3, destinations: ['/about', '/discover', '/join'], retiredHrefs: 0, absoluteSelfHrefs: 0, links },
    ...overrides,
  }
}

/** A redirect table shaped like next.config.ts's, above the floor, with the shapes the parser has
 *  to read: single-line, wrapped across lines, a `:path*` pattern, and a two-hop chain. */
const FIXTURE_CONFIG = [
  ...Array.from({ length: 22 }, (_, i) => `      { source: '/old-${i}', destination: '/new-${i}', permanent: true },`),
  `      {`,
  `        source: '/help/sharing/broadcasts',`,
  `        destination: '/help/sharing/nearby',`,
  `        permanent: true,`,
  `      },`,
  `      { source: '/onboarding/beta', destination: '/join', permanent: true },`,
  `      { source: '/onboarding/beta/:path*', destination: '/join/:path*', permanent: true },`,
  `      { source: '/beta/:slug', destination: '/join/:slug', permanent: true },`,
  `      { source: '/chain-a', destination: '/chain-b', permanent: false },`,
  `      { source: '/chain-b', destination: '/chain-c', permanent: false },`,
  `      { source: '/loop-a', destination: '/loop-b', permanent: false },`,
  `      { source: '/loop-b', destination: '/loop-a', permanent: false },`,
].join('\n')
const fixtureRedirects = parseRedirects(FIXTURE_CONFIG)

const NOW_FIXTURE = Date.parse('2026-09-07T00:00:00Z')
const guard = (c: Census, r = fixtureRedirects, now = NOW_FIXTURE) => report(c, r, { now })
const probeHome = (c: Census, r = fixtureRedirects, now = NOW_FIXTURE) => report(c, r, { probe: 'home', now })
const probeRetired = (c: Census, r = fixtureRedirects, now = NOW_FIXTURE) => report(c, r, { probe: 'retired', now })

// ── The real tree ────────────────────────────────────────────────────────────────────────────

describe('the real census is a corpus, not a placeholder', () => {
  it('clears its integrity floors', () => {
    expect(integrityProblems(census, redirects)).toEqual([])
  })

  it('records the stores, documents and hrefs it claims to', () => {
    const docs = (census.stores as Store[]).reduce((n, s) => n + s.documents, 0)
    const set = (census.stores as Store[]).reduce((n, s) => n + s.hrefsSet, 0)
    expect(census.stores.length).toBeGreaterThanOrEqual(MIN_STORES)
    expect(docs).toBeGreaterThanOrEqual(MIN_DOCUMENTS)
    expect(set).toBeGreaterThanOrEqual(MIN_HREFS_SET)
  })

  it('covers the three live Puck document stores by name', () => {
    // Pinned by name, not by count: a store silently dropped from the capture is exactly the
    // "the thing I measure disappeared" failure the floors alone cannot tell from progress.
    const names = (census.stores as Store[]).map((s) => s.store)
    expect(names).toContain('pages.data')
    expect(names).toContain('pages.published_data')
    expect(names).toContain('spaces.preferences.pageDocs')
  })

  it('is fresh against its own capture date, and its newest log entry carries that date', () => {
    expect(freshnessProblems(census, { now: NOW })).toEqual([])
    expect(recaptureDates(census)[0]).toBe(census.capturedAt)
  })
})

describe('the real redirect table is readable, so "retired" means something', () => {
  it('parses well above the floor and still names the address ADR-1090 retired', () => {
    // The control for the retired arm. If the parser stopped reading next.config.ts, every target
    // would classify as live and the arm would go silent for the wrong reason.
    expect(redirects.size).toBeGreaterThanOrEqual(MIN_REDIRECTS)
    expect(redirects.get('/onboarding/beta')).toBe('/join')
  })
})

describe('THE INVARIANT on the real tree: every stored link goes somewhere live, and the census agrees with itself', () => {
  const v = classify(census, redirects, { now: NOW })

  it('no stored target routes through a retired address or hardcodes the origin', () => {
    expect(
      v.bad.map((f) => `${f.store} ${f.href}`),
      'A stored document points at an address next.config.ts declares a redirect SOURCE, or starts ' +
        'with the site origin. Fix it in the DATA (a repair migration, as ADR-1125 did), or keep the address alive.',
    ).toEqual([])
  })

  it('the home block re-derives: every recorded count equals what its links and the redirect table produce', () => {
    expect(v.home.disagreements).toEqual([])
  })

  it('the home block and its store describe the same document, hit for hit', () => {
    expect(
      v.unknownLinks,
      `The home block map and the ${HOME_STORE} store were re-captured separately. Re-run recaptureQuery and rewrite both.`,
    ).toEqual([])
  })

  it('the guard and both probes are green', () => {
    expect(report(census, redirects, { now: NOW }).code).toBe(0)
    expect(report(census, redirects, { probe: 'home', now: NOW }).code).toBe(0)
    expect(report(census, redirects, { probe: 'retired', now: NOW }).code).toBe(0)
  })

  it('the published home document offers more than one destination (LIVE-104 stays closed)', () => {
    expect(v.home.destinations.length).toBeGreaterThanOrEqual(2)
  })
})

// ── The parser and the walk, on shapes the real file may not have today ──────────────────────

describe('the redirect parser reads every shape the table uses', () => {
  it('reads single-line and wrapped entries alike', () => {
    expect(fixtureRedirects.get('/old-3')).toBe('/new-3')
    expect(fixtureRedirects.get('/help/sharing/broadcasts')).toBe('/help/sharing/nearby')
  })

  it('🔴 loadRedirects throws below the floor rather than returning a table that retires nothing', () => {
    const io = { exists: () => true, readFile: () => "{ source: '/a', destination: '/b' }" }
    expect(() => loadRedirects('any', io)).toThrow(/floor/)
  })

  it('resolves exact sources, `:param` and `:path*` patterns, and leaves live paths alone', () => {
    expect(resolveRedirect('/onboarding/beta', fixtureRedirects)).toBe('/join')
    expect(resolveRedirect('/onboarding/beta/circles', fixtureRedirects)).toBe('/join/circles')
    expect(resolveRedirect('/beta/thing', fixtureRedirects)).toBe('/join/thing')
    expect(resolveRedirect('/beta/too/deep', fixtureRedirects)).toBeNull()
    expect(resolveRedirect('/join', fixtureRedirects)).toBeNull()
  })

  it('follows a chain to where the click lands and counts the hops', () => {
    expect(followRedirects('/chain-a', fixtureRedirects)).toEqual({ path: '/chain-c', hops: 2, looped: false })
    expect(followRedirects('/join', fixtureRedirects)).toEqual({ path: '/join', hops: 0, looped: false })
  })

  it(`🔴 a loop is called a loop after ${MAX_HOPS} hops instead of hanging`, () => {
    const f = followRedirects('/loop-a', fixtureRedirects)
    expect(f.hops).toBe(MAX_HOPS)
    expect(f.looped).toBe(true)
  })
})

describe('href normalisation', () => {
  it('strips the recorded origin and remembers that it did', () => {
    expect(normaliseHref(`${ORIGIN}/onboarding/beta`, ORIGIN)).toEqual({ path: '/onboarding/beta', kind: 'path', absolute: true })
    expect(normaliseHref(ORIGIN, ORIGIN)).toEqual({ path: '/', kind: 'path', absolute: true })
  })

  it('tells anchors, external links and empties apart from paths', () => {
    expect(normaliseHref('#contact', ORIGIN).kind).toBe('anchor')
    expect(normaliseHref('https://elsewhere.example/x', ORIGIN).kind).toBe('external')
    expect(normaliseHref('mailto:hello@example.test', ORIGIN).kind).toBe('external')
    expect(normaliseHref('', ORIGIN).kind).toBe('empty')
    expect(normaliseHref('/join', ORIGIN)).toEqual({ path: '/join', kind: 'path', absolute: false })
  })

  it('classifies a target the way LIVE-108 did: retired by the table, pinned by the origin', () => {
    expect(classifyTarget('/onboarding/beta', ORIGIN, fixtureRedirects).kind).toBe('retired')
    expect(classifyTarget(`${ORIGIN}/join`, ORIGIN, fixtureRedirects).kind).toBe('absolute-origin')
    expect(classifyTarget('/join', ORIGIN, fixtureRedirects).kind).toBe('live')
    expect(classifyTarget('https://elsewhere.example/', ORIGIN, fixtureRedirects).bad).toBe(false)
  })
})

// ── NON-VACUITY: every arm, driven by a fixture built to break it ─────────────────────────────

describe('NON-VACUITY: the detector fires', () => {
  it('a clean fixture is green in all three modes (the control)', () => {
    expect(guard(fixtureCensus()).code).toBe(0)
    expect(probeHome(fixtureCensus()).code).toBe(0)
    expect(probeRetired(fixtureCensus()).code).toBe(0)
  })

  describe('INTEGRITY', () => {
    it('🔴 an emptied census is INDETERMINATE in every mode, never a verdict', () => {
      const empty = fixtureCensus({ stores: [], home: { ...fixtureCensus().home, links: [] } })
      expect(integrityProblems(empty, fixtureRedirects).length).toBeGreaterThan(0)
      expect(guard(empty).code).toBe(INDETERMINATE)
      expect(probeHome(empty).code).toBe(INDETERMINATE)
      expect(probeRetired(empty).code).toBe(INDETERMINATE)
    })

    it('🔴 a store dropped from the capture trips the store floor', () => {
      const c = fixtureCensus()
      c.stores = c.stores.slice(0, 2)
      expect(integrityProblems(c, fixtureRedirects).some((p) => p.includes('store(s)'))).toBe(true)
    })

    it('🔴 a store that claims set hrefs but records no targets fails, so a half-truncated capture cannot pass', () => {
      const c = fixtureCensus()
      c.stores[0].targets = {}
      expect(integrityProblems(c, fixtureRedirects).some((p) => p.includes('records no targets'))).toBe(true)
    })

    it('🔴 a census with no capturedAt, no recaptureLog, or no origin fails', () => {
      const a = fixtureCensus()
      delete a.capturedAt
      expect(integrityProblems(a, fixtureRedirects).some((p) => p.includes('capturedAt'))).toBe(true)
      const b = fixtureCensus({ recaptureLog: [] })
      expect(integrityProblems(b, fixtureRedirects).some((p) => p.includes('recaptureLog'))).toBe(true)
      const d = fixtureCensus({ origin: '' })
      expect(integrityProblems(d, fixtureRedirects).some((p) => p.includes('origin'))).toBe(true)
    })

    it('🔴 a redirect table below the floor is an integrity failure, not a clean bill for every link', () => {
      const tiny = parseRedirects("{ source: '/a', destination: '/b' }")
      expect(integrityProblems(fixtureCensus(), tiny).some((p) => p.includes('redirect'))).toBe(true)
      expect(guard(fixtureCensus(), tiny).code).toBe(INDETERMINATE)
    })

    it('loadCensus throws on a missing file rather than manufacturing an empty corpus', () => {
      expect(() => loadCensus('scripts/definitely-not-here.json')).toThrow()
    })
  })

  describe('FRESHNESS', () => {
    it(`🔴 a census older than ${MAX_CENSUS_AGE_DAYS} days FAILS the guard and makes both probes 79`, () => {
      const stale = fixtureCensus({ capturedAt: '2026-01-01', recaptureLog: ['2026-01-01 captured'] })
      expect(freshnessProblems(stale, { now: NOW_FIXTURE }).some((p) => p.includes('STALE'))).toBe(true)
      expect(guard(stale).code).toBe(1)
      expect(probeHome(stale).code).toBe(INDETERMINATE)
      expect(probeRetired(stale).code).toBe(INDETERMINATE)
    })

    it('…and the ceiling is exact: the day it is reached passes, the day after fails', () => {
      const c = fixtureCensus({ capturedAt: '2026-09-01', recaptureLog: ['2026-09-01 captured'] })
      const captured = Date.parse('2026-09-01T00:00:00Z')
      expect(freshnessProblems(c, { now: captured + MAX_CENSUS_AGE_DAYS * 86_400_000 })).toEqual([])
      expect(freshnessProblems(c, { now: captured + (MAX_CENSUS_AGE_DAYS + 1) * 86_400_000 }).length).toBe(1)
    })

    it('🔴 a capturedAt in the future fails', () => {
      const c = fixtureCensus({ capturedAt: '2027-01-01', recaptureLog: ['2027-01-01 captured'] })
      expect(freshnessProblems(c, { now: NOW_FIXTURE }).some((p) => p.includes('future'))).toBe(true)
    })

    it('🔴 a capturedAt that is not a date fails, including a calendar-impossible one', () => {
      expect(freshnessProblems(fixtureCensus({ capturedAt: 'yesterday' }), { now: NOW_FIXTURE }).length).toBe(1)
      expect(freshnessProblems(fixtureCensus({ capturedAt: '2026-02-30' }), { now: NOW_FIXTURE }).length).toBe(1)
    })

    it('🔴 THE FAILURE THE LOG RECORDS: a capturedAt moved without a log entry behind it fails', () => {
      // 2026-08-25 in the real census: the date was stamped while the body still held the
      // 2026-08-24 reading. A re-capture writes both, so a date the log does not know is a stamp.
      const c = fixtureCensus({ capturedAt: '2026-09-05', recaptureLog: ['2026-08-24 first', '2026-09-01 re-captured'] })
      const problems = freshnessProblems(c, { now: NOW_FIXTURE })
      expect(problems.some((p) => p.includes('newest recaptureLog entry is dated 2026-09-01'))).toBe(true)
      expect(guard(c).code).toBe(1)
      expect(probeHome(c).code).toBe(INDETERMINATE)
    })

    it('🔴 …and the mirror: a log entry newer than capturedAt fails too', () => {
      const c = fixtureCensus({ capturedAt: '2026-09-01', recaptureLog: ['2026-09-01 re-captured', '2026-09-06 re-read but the date was not moved'] })
      expect(freshnessProblems(c, { now: NOW_FIXTURE }).length).toBe(1)
    })

    it('the newest log entry is found by date, not by position', () => {
      const c = fixtureCensus({ recaptureLog: ['2026-09-01 re-captured', '2026-08-24 first, appended out of order'] })
      expect(recaptureDates(c)).toEqual(['2026-09-01', '2026-08-24'])
      expect(freshnessProblems(c, { now: NOW_FIXTURE })).toEqual([])
    })
  })

  describe('RETIRED', () => {
    it('🔴 a stored target that is a redirect source fails the guard and the retired probe', () => {
      const c = fixtureCensus()
      c.stores[0].targets['/onboarding/beta'] = { hits: 4, docs: 2 }
      const g = guard(c)
      expect(g.code).toBe(1)
      expect(g.lines.join('\n')).toContain('pages.data /onboarding/beta is a retired address (4 hit(s)')
      expect(probeRetired(c).code).toBe(1)
      expect(probeHome(c).code).toBe(0) // the home document itself is still clean
    })

    it('🔴 a stored target under a `:path*` source is retired too, which the inline probes could not see', () => {
      const c = fixtureCensus()
      c.stores[0].targets['/onboarding/beta/circles'] = { hits: 1, docs: 1 }
      expect(probeRetired(c).code).toBe(1)
    })

    it('🔴 a stored target that hardcodes the origin fails, even when the path behind it is live', () => {
      const c = fixtureCensus()
      c.stores[2].targets[`${ORIGIN}/join`] = { hits: 1, docs: 1 }
      const r = probeRetired(c)
      expect(r.code).toBe(1)
      expect(r.lines.join('\n')).toContain('hardcodes the origin')
      expect(guard(c).code).toBe(1)
    })

    it('🔴 retiring a URL in the TABLE turns a green census red with no edit to the census', () => {
      const c = fixtureCensus()
      expect(probeRetired(c).code).toBe(0)
      const retiredJoin = parseRedirects(`${FIXTURE_CONFIG}\n      { source: '/join', destination: '/apply', permanent: true },`)
      expect(probeRetired(c, retiredJoin).code).toBe(1)
      expect(probeHome(c, retiredJoin).code).toBe(1) // the home block's recorded retiredHrefs 0 now disagrees
    })

    it('🔴 a redirect loop in stored data fails the guard', () => {
      const c = fixtureCensus()
      c.stores[0].targets['/loop-a'] = { hits: 1, docs: 1 }
      const g = guard(c)
      expect(g.code).toBe(1)
      expect(g.lines.join('\n')).toContain('never settles')
    })

    it('an external link and an in-page anchor are neither retired nor pinned', () => {
      const c = fixtureCensus()
      c.stores[0].targets['https://elsewhere.example/'] = { hits: 1, docs: 1 }
      c.stores[0].targets['#contact'] = { hits: 1, docs: 1 }
      expect(probeRetired(c).code).toBe(0)
      expect(guard(c).code).toBe(0)
    })
  })

  describe('AGREEMENT (the home block re-derives, and its store knows every link)', () => {
    it('🔴 a recorded count that disagrees with its links fails the home probe and the guard', () => {
      const c = fixtureCensus()
      c.home.distinctDestinations = 7
      const h = classifyHome(c, fixtureRedirects)
      expect(h.disagreements).toEqual(['distinctDestinations recorded 7, derived 3'])
      expect(probeHome(c).code).toBe(1)
      expect(guard(c).code).toBe(1)
    })

    it('🔴 a recorded destination list that disagrees with the derived one fails', () => {
      const c = fixtureCensus()
      c.home.destinations = ['/about', '/discover', '/join', '/pricing']
      expect(classifyHome(c, fixtureRedirects).disagreements.join('\n')).toContain('destinations recorded')
      expect(probeHome(c).code).toBe(1)
    })

    it('🔴 a retired or absolute href in the home block is counted, and the recorded zero then disagrees', () => {
      const c = fixtureCensus()
      c.home.links[1].href = '/onboarding/beta'
      c.stores[1].targets = { '/join': { hits: 2, docs: 1 }, '/onboarding/beta': { hits: 1, docs: 1 }, '/about': { hits: 1, docs: 1 }, '#contact': { hits: 1, docs: 1 } }
      const h = classifyHome(c, fixtureRedirects)
      expect(h.retired).toBe(1)
      expect(h.derived.retiredHrefs).toBe(1)
      expect(probeHome(c).code).toBe(1)
      // …and once the record agrees (the retired hop lands on /join, so /discover leaves the
      // destination set too), the probe still fails, on the retired href itself.
      c.home.retiredHrefs = 1
      c.home.destinations = ['/about', '/join']
      c.home.distinctDestinations = 2
      const r = probeHome(c)
      expect(r.code).toBe(1)
      expect(r.lines.join('\n')).toContain('route through a retired address')
    })

    it('🔴 a home document with ONE destination fails the home probe (LIVE-104 as filed) but not the guard', () => {
      // The guard is a required job; a content decision the owner makes in the editor must not hold
      // every unrelated PR hostage (ADR-970). The probe is the row, and the row says not done.
      const c = fixtureCensus()
      for (const l of c.home.links) if (l.href.startsWith('/')) l.href = '/join'
      c.home.destinations = ['/join']
      c.home.distinctDestinations = 1
      c.stores[1].targets = { '/join': { hits: 4, docs: 1 }, '#contact': { hits: 1, docs: 1 } }
      const r = probeHome(c)
      expect(r.code).toBe(1)
      expect(r.lines.join('\n')).toContain('offers 1 destination')
      expect(guard(c).code).toBe(0)
    })

    it('🔴 THE STATE THIS FILE FOUND ON 2026-09-07: a home link its own store does not record fails the guard', () => {
      // The block map had been re-captured when LIVE-104 closed and `stores` had not, so the census
      // named three links pages.published_data did not know. A half re-capture is now red.
      const c = fixtureCensus()
      c.stores[1].targets = { '/join': { hits: 2, docs: 1 }, '#contact': { hits: 1, docs: 1 } }
      c.stores[1].hrefsSet = 3
      const problems = homeStoreProblems(c)
      expect(problems.some((p) => p.includes('home links /discover but'))).toBe(true)
      expect(problems.some((p) => p.includes('home links /about but'))).toBe(true)
      const g = guard(c)
      expect(g.code).toBe(1)
      expect(g.lines.join('\n')).toContain('describe different documents')
      // The two row probes are unchanged by it: neither row is about census hygiene.
      expect(probeHome(c).code).toBe(0)
      expect(probeRetired(c).code).toBe(0)
    })

    it('🔴 the mirror: a store target the block map does not link, or a hit count that differs, fails', () => {
      const a = fixtureCensus()
      a.stores[1].targets['/pricing'] = { hits: 1, docs: 1 }
      a.stores[1].hrefsSet = 6
      expect(homeStoreProblems(a).some((p) => p.includes('records /pricing but the home block map does not'))).toBe(true)
      const b = fixtureCensus()
      b.stores[1].targets['/join'] = { hits: 5, docs: 1 }
      expect(homeStoreProblems(b).some((p) => p.includes('/join 2 time(s) but'))).toBe(true)
      const d = fixtureCensus()
      d.stores[1].hrefsSet = 9
      expect(homeStoreProblems(d).some((p) => p.includes('says 9 href(s) are set'))).toBe(true)
    })

    it('with more than one document in the home store, only the unknown-link half is asserted', () => {
      // A second published page would legitimately add targets the home map does not carry.
      const c = fixtureCensus()
      c.stores[1].documents = 2
      c.stores[1].targets['/pricing'] = { hits: 3, docs: 1 }
      expect(homeStoreProblems(c)).toEqual([])
      c.stores[1].targets = { '/join': { hits: 2, docs: 1 } }
      expect(homeStoreProblems(c).length).toBe(3)
    })
  })
})

// ── The three exit codes, never confused ──────────────────────────────────────────────────────

describe('the probes answer 0 / 1 / 79 and never confuse them', () => {
  it('79 is INDETERMINATE and outside the verdict range', () => {
    expect(INDETERMINATE).toBe(79)
  })

  it('the guard prints the fix beside the failure, so a red run says what to do', () => {
    const c = fixtureCensus()
    c.stores[0].targets['/onboarding/beta'] = { hits: 1, docs: 1 }
    expect(guard(c).lines.join('\n')).toContain('fixed in the DATA')
    const stale = fixtureCensus({ capturedAt: '2026-01-01', recaptureLog: ['2026-01-01'] })
    expect(guard(stale).lines.join('\n')).toContain('recaptureQuery')
  })

  it('the real census file is the one the CLI reads, and the CLI reads the same table this test does', () => {
    // A cheap wiring check: the constants name real files and the config parses to the same map.
    expect(readFileSync(join(ROOT, CENSUS_PATH), 'utf8')).toContain('"recaptureQuery"')
    expect(parseRedirects(readFileSync(join(ROOT, CONFIG_PATH), 'utf8')).size).toBe(redirects.size)
  })
})
