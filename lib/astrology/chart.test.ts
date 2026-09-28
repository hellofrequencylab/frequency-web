import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { computeNatalChart } from './chart'
import { parseStoredChart, signFromLongitude, CHART_BODIES } from './chart-data'

// ── Fixtures against KNOWN ephemeris values (ADR-1138) ─────────────────────────────
// Geocentric apparent ecliptic longitudes (true equinox of date) at J2000 — noon UTC,
// 2000-01-01 — cross-checked against JPL Horizons / the Astronomical Almanac. The chart
// engine must reproduce these within 0.05 degrees, or the dependency (or an upgrade of
// it) is not computing what we store.
const J2000: Record<(typeof CHART_BODIES)[number], number> = {
  sun: 280.369,
  moon: 223.324,
  mercury: 271.889,
  venus: 241.565,
  mars: 327.964,
  jupiter: 25.254,
  saturn: 40.396,
}

describe('computeNatalChart', () => {
  it('reproduces the J2000 ephemeris within 0.05 degrees on every body', () => {
    const chart = computeNatalChart({ date: '2000-01-01' })
    expect(chart).not.toBeNull()
    for (const body of CHART_BODIES) {
      expect(chart!.bodies[body].lon).toBeCloseTo(J2000[body], 1)
      expect(Math.abs(chart!.bodies[body].lon - J2000[body])).toBeLessThan(0.05)
    }
  })

  it('derives tropical signs from the longitudes (and agrees with the shipped sun-sign table)', () => {
    const chart = computeNatalChart({ date: '2000-01-01' })!
    expect(chart.bodies.sun.sign).toBe('capricorn') // 280.4 -> slice 9
    expect(chart.bodies.moon.sign).toBe('scorpio') // 223.3 -> slice 7
    expect(chart.bodies.jupiter.sign).toBe('aries') // 25.3 -> slice 0

    // A second, independent date: 1990-06-15 solar longitude ~84.1 (Gemini).
    const summer = computeNatalChart({ date: '1990-06-15' })!
    expect(summer.bodies.sun.lon).toBeCloseTo(84.129, 1)
    expect(summer.bodies.sun.sign).toBe('gemini')
  })

  it('is deterministic and marks its precision honestly', () => {
    const a = computeNatalChart({ date: '1985-03-30' })
    const b = computeNatalChart({ date: '1985-03-30' })
    expect(a).toEqual(b)
    expect(a!.v).toBe(1)
    expect(a!.precision).toBe('date-only')
  })

  it('returns null on malformed and impossible dates, never throwing', () => {
    for (const bad of ['', 'not-a-date', '2000-13-01', '2000-02-30', '2000-1-1', null, undefined]) {
      expect(computeNatalChart({ date: bad })).toBeNull()
    }
  })
})

describe('signFromLongitude', () => {
  it('maps 30-degree slices from 0 Aries and normalizes out-of-range input', () => {
    expect(signFromLongitude(0)).toBe('aries')
    expect(signFromLongitude(29.999)).toBe('aries')
    expect(signFromLongitude(30)).toBe('taurus')
    expect(signFromLongitude(359.9)).toBe('pisces')
    expect(signFromLongitude(360)).toBe('aries')
    expect(signFromLongitude(-10)).toBe('pisces')
  })
})

describe('parseStoredChart', () => {
  it('round-trips a computed chart and rejects junk shapes', () => {
    const chart = computeNatalChart({ date: '2000-01-01' })!
    expect(parseStoredChart(JSON.parse(JSON.stringify(chart)))).toEqual(chart)
    expect(parseStoredChart(null)).toBeNull()
    expect(parseStoredChart('capricorn')).toBeNull()
    expect(parseStoredChart({ v: 2, precision: 'date-only', bodies: chart.bodies })).toBeNull()
    expect(parseStoredChart({ v: 1, precision: 'date-only', bodies: { sun: { lon: 'NaN' } } })).toBeNull()
  })
})

// ── The import seam, pinned (ADR-1138 / build-budget) ──────────────────────────────
// 'astronomy-engine' (1.8 MB installed) may be imported by exactly one module —
// lib/astrology/chart.ts — and chart.ts itself may only be imported from the profile-save
// action and tests. Anything reachable from a shared server module is multiplied by every
// route beneath it; this test is the gate that notices the seam leaking.
describe('the ephemeris import seam', () => {
  const ROOTS = ['app', 'components', 'lib']
  const repo = join(__dirname, '..', '..')

  const sources: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        sources.push(full)
      }
    }
  }
  for (const root of ROOTS) walk(join(repo, root))

  // TWO modules may reach the ephemeris, and the list is CLOSED on purpose. The seam exists for
  // build-budget / DEPLOY-SAFETY reasons (see chart.ts's header): astronomy-engine is 1.8 MB
  // installed and 116 KB minified in the browser build, so anything reachable from a shared module
  // or the app shell multiplies it across every route beneath. Widening this list is a decision,
  // never a convenience: each entry below is pinned to its own consumers by the tests that follow.
  const EPHEMERIS_IMPORTERS = [join('lib', 'astrology', 'chart.ts'), join('lib', 'calendar', 'astro-markers.ts')]

  it('only the two declared modules import the ephemeris', () => {
    const importers = sources
      .filter((f) => /from\s+['"]astronomy-engine['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(repo.length + 1))
      // TESTS are excluded, as they are in the chart.ts consumer assertion below: this seam is
      // about what SHIPS, and a spec file is not in any bundle. astro-markers.test.ts imports the
      // ephemeris deliberately, as an INDEPENDENT source to cross-check the moon dates that module
      // delegates to lib/calendar/moon.ts -- which is the one job a second engine is good for.
      .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    expect(importers.sort()).toEqual([...EPHEMERIS_IMPORTERS].sort())
  })

  // The sky markers (LIVE-526) are the second entry. Their containment rule is the same shape as
  // chart.ts's: a short list of SERVER route files may import them for real, and everything else may
  // only import the TYPE, which is erased at build. A client component that imported the module for
  // real would put the ephemeris on every phone opening a Space calendar.
  it('lib/calendar/astro-markers.ts is imported for REAL only by server route files', () => {
    const runtime: string[] = []
    const typeOnly: string[] = []
    for (const f of sources) {
      const src = readFileSync(f, 'utf8')
      if (!/from\s+['"](@\/lib\/calendar\/astro-markers|\.\/astro-markers)['"]/.test(src)) continue
      const rel = f.slice(repo.length + 1)
      if (/\.test\.(ts|tsx)$/.test(rel)) continue
      const isTypeOnly = /import\s+type\s+\{[^}]*\}\s+from\s+['"](@\/lib\/calendar\/astro-markers|\.\/astro-markers)['"]/.test(src)
      ;(isTypeOnly ? typeOnly : runtime).push(rel)
    }
    expect(runtime.sort()).toEqual(
      [
        join('app', '(main)', 'spaces', '[slug]', '(profile)', 'calendar', 'page.tsx'),
        join('app', '(main)', 'spaces', '[slug]', 'settings', 'calendar', 'page.tsx'),
      ].sort(),
    )
    // The client components must be on the type-only side, and there must BE some: an empty list
    // would mean the grid stopped taking the markers at all.
    expect(typeOnly.length).toBeGreaterThanOrEqual(3)
    for (const f of typeOnly) expect(runtime, `${f} is on both sides`).not.toContain(f)
  })

  it('lib/astrology/chart.ts is imported only by the profile-save action (and tests)', () => {
    const importers = sources
      .filter((f) => /from\s+['"](@\/lib\/astrology\/chart|\.\/chart)['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(repo.length + 1))
      .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    expect(importers.sort()).toEqual([join('app', '(main)', 'settings', 'connections', 'match-actions.ts')])
  })
})
