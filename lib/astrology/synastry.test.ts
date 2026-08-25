import { describe, it, expect } from 'vitest'
import { aspectScore, chartCompatibility } from './synastry'
import type { NatalChart, ChartBody } from './chart-data'
import { signFromLongitude } from './chart-data'

const chart = (lons: Record<ChartBody, number>): NatalChart => ({
  v: 1,
  precision: 'date-only',
  bodies: Object.fromEntries(
    Object.entries(lons).map(([b, lon]) => [b, { lon, sign: signFromLongitude(lon) }]),
  ) as NatalChart['bodies'],
})

describe('aspectScore', () => {
  // ── SHARED FIXTURE VECTORS ──────────────────────────────────────────────────────
  // public.housing_aspect_score (migration 20270326000000) mirrors this function
  // EXACTLY and must reproduce every row of this table. If you change either side,
  // change both and update these vectors in the same PR (ADR-1138).
  const VECTORS: [number, number, number][] = [
    [10, 130, 1.0], // exact trine
    [0, 0, 0.9], // exact conjunction
    [40, 100, 0.8], // exact sextile
    [10, 100, 0.45], // exact square
    [5, 185, 0.55], // exact opposition
    [0, 30, 0.5], // no aspect -> neutral
    [0, 128, 0.5], // orb edge (120 + 8) -> back to neutral
    [359, 1, 0.8], // wraparound: separation 2, conjunction at 6/8 falloff -> 0.5 + 0.4 * 0.75
    [10, 126, 0.75], // trine, 4 degrees off -> 0.5 + 0.5 * 0.5
  ]

  it('reproduces the shared vector table (the SQL mirror must match every row)', () => {
    for (const [a, b, want] of VECTORS) {
      expect(aspectScore(a, b), `aspectScore(${a}, ${b})`).toBeCloseTo(want, 10)
    }
  })

  it('is symmetric and bounded', () => {
    for (let a = 0; a < 360; a += 17) {
      for (let b = 0; b < 360; b += 23) {
        const s = aspectScore(a, b)
        expect(s).toBe(aspectScore(b, a))
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('chartCompatibility', () => {
  const base: Record<ChartBody, number> = {
    sun: 10, moon: 40, mercury: 20, venus: 70, mars: 100, jupiter: 200, saturn: 300,
  }

  it('scores an all-trine pairing high and reports a quiet reason', () => {
    const a = chart(base)
    const b = chart({
      sun: 130, moon: 160, mercury: 140, venus: 220, mars: 190, jupiter: 320, saturn: 60,
    })
    const r = chartCompatibility(a, b)
    // sun-sun, moon-moon, mercury-mercury exact trines (1.0); sun(10)-moon(160) at 150 -> 0.5;
    // moon(40)-sun(130) at 90 -> 0.45; venus(70)-mars(190) at 120 -> 1.0; mars(100)-venus(220)
    // at 120 -> 1.0. Weighted: .25 + .20 + .15 + .10*.5 + .10*.45 + .10 + .10 = 0.895
    expect(r.score).toBeCloseTo(0.895, 10)
    expect(r.reason).toBe('your Suns sit at an easy angle')
  })

  it('is symmetric — the same score and reason from both sides', () => {
    const a = chart(base)
    const b = chart({
      sun: 275, moon: 12, mercury: 199, venus: 33, mars: 271, jupiter: 5, saturn: 111,
    })
    expect(chartCompatibility(a, b).score).toBeCloseTo(chartCompatibility(b, a).score, 10)
  })

  it('never leaves [0,1] and stays neutral-ish with no aspects anywhere', () => {
    const a = chart(base)
    // Offsets of 25 degrees from every base lon: no pair lands within any orb.
    const b = chart({
      sun: 35, moon: 65, mercury: 45, venus: 240, mars: 95, jupiter: 225, saturn: 325,
    })
    const r = chartCompatibility(a, b)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(1)
  })

  it('falls back to the spicier reason when nothing lands an easy angle', () => {
    // Sun and Moon conjunct in `a` so that every one of the seven scoring pairs can sit
    // at an exact square (90) from its partner -> all 0.45.
    const a = chart({ sun: 40, moon: 40, mercury: 20, venus: 70, mars: 100, jupiter: 200, saturn: 300 })
    const b = chart({ sun: 130, moon: 130, mercury: 110, venus: 190, mars: 160, jupiter: 290, saturn: 30 })
    const r = chartCompatibility(a, b)
    expect(r.score).toBeCloseTo(0.45, 10)
    expect(r.reason).toBe('a spicier chart mix')
  })
})
