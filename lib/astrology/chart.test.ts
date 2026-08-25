import { readdirSync, readFileSync, statSync } from 'node:fs'
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
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(name)) {
        sources.push(full)
      }
    }
  }
  for (const root of ROOTS) walk(join(repo, root))

  it("only lib/astrology/chart.ts imports 'astronomy-engine'", () => {
    const importers = sources.filter((f) => /from\s+['"]astronomy-engine['"]/.test(readFileSync(f, 'utf8')))
    expect(importers.map((f) => f.slice(repo.length + 1))).toEqual([join('lib', 'astrology', 'chart.ts')])
  })

  it('lib/astrology/chart.ts is imported only by the profile-save action (and tests)', () => {
    const importers = sources
      .filter((f) => /from\s+['"](@\/lib\/astrology\/chart|\.\/chart)['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(repo.length + 1))
      .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    expect(importers.sort()).toEqual([join('app', '(main)', 'settings', 'connections', 'match-actions.ts')])
  })
})
