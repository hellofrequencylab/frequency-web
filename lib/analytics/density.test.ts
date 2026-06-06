import { describe, it, expect } from 'vitest'
import {
  scorePlace,
  buildDensitySignal,
  READY_SCORE,
  GROWING_SCORE,
  CRUNCH,
  type DensityCityRow,
} from './density'

const row = (over: Partial<DensityCityRow> = {}): DensityCityRow => ({
  city: 'Testville',
  circles: 0,
  active_circles: 0,
  circle_members: 0,
  capacity: 0,
  residents: 0,
  new_residents_30d: 0,
  listings: 0,
  ...over,
})

describe('scorePlace', () => {
  it('handles an empty city without dividing by zero', () => {
    const p = scorePlace(row())
    expect(p.saturation).toBe(0)
    expect(p.momentum).toBe(0)
    expect(p.unmet).toBe(0)
    expect(p.score).toBe(0)
    expect(p.stage).toBe('seed')
    expect(p.capacityCrunch).toBe(false)
  })

  it('caps a population with no circles at "growing" — seed a circle, not a building', () => {
    // Lots of residents + fast growth, but zero circles → no saturation term.
    const p = scorePlace(row({ residents: 200, new_residents_30d: 200 }))
    expect(p.saturation).toBe(0)
    expect(p.unmet).toBe(200)
    expect(p.stage).toBe('growing')
    expect(p.score).toBeLessThan(READY_SCORE)
  })

  it('marks a saturated, populous, growing city as ready for a Lab', () => {
    const p = scorePlace(
      row({ circles: 3, active_circles: 3, circle_members: 95, capacity: 100, residents: 120, new_residents_30d: 30 }),
    )
    expect(p.saturation).toBeCloseTo(0.95, 2)
    expect(p.capacityCrunch).toBe(true)
    expect(p.stage).toBe('ready')
    expect(p.score).toBeGreaterThanOrEqual(READY_SCORE)
  })

  it('flags a capacity crunch at the threshold and computes unmet demand', () => {
    const p = scorePlace(row({ circle_members: 85, capacity: 100, residents: 130 }))
    expect(p.saturation).toBeCloseTo(CRUNCH, 5)
    expect(p.capacityCrunch).toBe(true)
    expect(p.unmet).toBe(45) // 130 residents - 85 reached by circles
  })

  it('does not crunch just below the threshold', () => {
    const p = scorePlace(row({ circle_members: 84, capacity: 100 }))
    expect(p.capacityCrunch).toBe(false)
  })

  it('clamps the score to 0–100 even with runaway inputs', () => {
    const p = scorePlace(
      row({ circle_members: 500, capacity: 100, residents: 9999, new_residents_30d: 9999 }),
    )
    expect(p.score).toBeLessThanOrEqual(100)
    expect(p.score).toBeGreaterThanOrEqual(0)
  })
})

describe('buildDensitySignal', () => {
  it('ranks places by score and pulls out the ready set', () => {
    const ready = row({ city: 'Hot', circles: 3, circle_members: 95, capacity: 100, residents: 120, new_residents_30d: 30 })
    const seed = row({ city: 'Quiet', residents: 3 })
    const sig = buildDensitySignal([seed, ready])
    expect(sig.places[0].city).toBe('Hot') // higher score sorts first
    expect(sig.places[1].city).toBe('Quiet')
    expect(sig.ready.map((p) => p.city)).toEqual(['Hot'])
  })

  it('totals across all cities', () => {
    const sig = buildDensitySignal([
      row({ city: 'A', circles: 2, circle_members: 40, residents: 50, listings: 3 }),
      row({ city: 'B', circles: 1, circle_members: 10, residents: 12, listings: 1 }),
    ])
    expect(sig.totals).toEqual({ cities: 2, circles: 3, members: 50, residents: 62, listings: 4 })
  })

  it('returns an empty, safe signal for no data', () => {
    const sig = buildDensitySignal([])
    expect(sig.places).toEqual([])
    expect(sig.ready).toEqual([])
    expect(sig.totals.cities).toBe(0)
  })

  it('every growing place clears the growing bar and stays under ready', () => {
    const sig = buildDensitySignal([row({ residents: 200, new_residents_30d: 200 })])
    const p = sig.places[0]
    expect(p.score).toBeGreaterThanOrEqual(GROWING_SCORE)
    expect(p.score).toBeLessThan(READY_SCORE)
  })
})
