import { describe, it, expect } from 'vitest'
import {
  seedReadiness,
  wantsFounder,
  rollupByCity,
  summarizeDensity,
  cityKey,
  CITY_GRID_DECIMALS,
  MIN_CITY_MEMBERS,
  LIVE_MIN_ANCHORS,
  LIVE_MIN_MEMBERS,
  WARM_MIN_MEMBERS,
  type DensityCell,
} from './density-rollup'

function cell(over: Partial<DensityCell> = {}): DensityCell {
  return {
    geocellLat: 40.71,
    geocellLng: -74.0,
    activeMembers: 0,
    recentPosts: 0,
    recentEvents: 0,
    recentCircles: 0,
    densityScore: 0,
    ...over,
  }
}

describe('seedReadiness', () => {
  it('no cells at all is the canonical empty cold start', () => {
    const s = seedReadiness([])
    expect(s.readiness).toBe('empty')
    expect(s.activeMembers).toBe(0)
    expect(s.anchors).toBe(0)
    expect(s.cells).toBe(0)
    expect(wantsFounder(s)).toBe(true)
  })

  it('cells with zero signal still read empty', () => {
    expect(seedReadiness([cell(), cell()]).readiness).toBe('empty')
  })

  it('a spark of people but no anchor is seeding', () => {
    expect(seedReadiness([cell({ activeMembers: WARM_MIN_MEMBERS })]).readiness).toBe('seeding')
  })

  it('chatter alone (a post, nobody homed) is seeding', () => {
    expect(seedReadiness([cell({ recentPosts: 1 })]).readiness).toBe('seeding')
  })

  it('one standing circle is warm, not just seeding', () => {
    expect(seedReadiness([cell({ recentCircles: 1 })]).readiness).toBe('warm')
  })

  it('one upcoming event is warm', () => {
    expect(seedReadiness([cell({ recentEvents: 1 })]).readiness).toBe('warm')
  })

  it('two anchors is live (no founder prompt needed)', () => {
    const s = seedReadiness([cell({ recentCircles: 1 }), cell({ recentEvents: 1 })])
    expect(s.anchors).toBe(LIVE_MIN_ANCHORS)
    expect(s.readiness).toBe('live')
    expect(wantsFounder(s)).toBe(false)
  })

  it('a healthy crowd alone is live even with no anchor', () => {
    expect(seedReadiness([cell({ activeMembers: LIVE_MIN_MEMBERS })]).readiness).toBe('live')
  })

  it('rolls counts across the cells of a locality', () => {
    const s = seedReadiness([
      cell({ activeMembers: 2, recentPosts: 1, recentCircles: 1, densityScore: 0.3 }),
      cell({ activeMembers: 1, recentEvents: 2, densityScore: 0.6 }),
    ])
    expect(s.activeMembers).toBe(3)
    expect(s.anchors).toBe(3) // 1 circle + 2 events
    expect(s.recentPosts).toBe(1)
    expect(s.peakDensity).toBe(0.6) // the alive-est cell
    expect(s.cells).toBe(2)
  })

  it('clamps an out-of-range density score into [0,1] for peakDensity', () => {
    expect(seedReadiness([cell({ densityScore: 1.5 })]).peakDensity).toBe(1)
    expect(seedReadiness([cell({ densityScore: -0.2 })]).peakDensity).toBe(0)
  })
})

describe('cityKey', () => {
  it('coarsens a fuzzed cell to the city grid', () => {
    expect(cityKey(40.71, -74.01)).toBe('40.7,-74')
    expect(cityKey(40.69, -74.04)).toBe('40.7,-74')
  })

  it('two nearby fuzzed cells share a city bucket; a far one does not', () => {
    expect(cityKey(40.71, -74.0)).toBe(cityKey(40.69, -74.03))
    expect(cityKey(40.71, -74.0)).not.toBe(cityKey(34.05, -118.24))
  })

  it('honors the configured grid resolution', () => {
    // A 1-decimal grid: 0.05 apart can round to the same bucket, 0.2 apart cannot.
    expect(CITY_GRID_DECIMALS).toBe(1)
    expect(cityKey(1.02, 2.0)).toBe(cityKey(0.98, 2.0))
    expect(cityKey(1.0, 2.0)).not.toBe(cityKey(1.3, 2.0))
  })
})

describe('rollupByCity', () => {
  it('empty input yields no cities', () => {
    expect(rollupByCity([])).toEqual([])
  })

  it('clusters cells into city buckets and rolls their counts', () => {
    const cities = rollupByCity([
      cell({ geocellLat: 40.71, geocellLng: -74.0, activeMembers: 2, recentCircles: 1, densityScore: 0.4 }),
      cell({ geocellLat: 40.69, geocellLng: -74.03, activeMembers: 1, recentEvents: 1, densityScore: 0.7 }),
      cell({ geocellLat: 34.05, geocellLng: -118.24, activeMembers: 1, densityScore: 0.05 }),
    ])
    expect(cities).toHaveLength(2)
    const ny = cities.find((c) => c.key === '40.7,-74')!
    expect(ny.activeMembers).toBe(3)
    expect(ny.anchors).toBe(2)
    expect(ny.readiness).toBe('live') // two anchors
    expect(ny.peakDensity).toBe(0.7)
    expect(ny.cells).toBe(2)
  })

  it('ranks busiest city first (peak density, then members)', () => {
    const cities = rollupByCity([
      cell({ geocellLat: 1.0, geocellLng: 1.0, densityScore: 0.2, activeMembers: 1 }),
      cell({ geocellLat: 2.0, geocellLng: 2.0, densityScore: 0.9, activeMembers: 1 }),
    ])
    expect(cities[0].peakDensity).toBe(0.9)
    expect(cities[1].peakDensity).toBe(0.2)
  })

  it('flags a thin city below the anonymity floor, but still ranks it', () => {
    const cities = rollupByCity([cell({ geocellLat: 5.0, geocellLng: 5.0, activeMembers: MIN_CITY_MEMBERS - 1 })])
    expect(cities).toHaveLength(1)
    expect(cities[0].belowAnonymityFloor).toBe(true)
  })

  it('does not flag a city at or above the floor', () => {
    const cities = rollupByCity([cell({ geocellLat: 5.0, geocellLng: 5.0, activeMembers: MIN_CITY_MEMBERS })])
    expect(cities[0].belowAnonymityFloor).toBe(false)
  })
})

describe('summarizeDensity', () => {
  it('counts live / seedable / empty cities and totals', () => {
    const cities = rollupByCity([
      cell({ geocellLat: 1.0, geocellLng: 1.0, recentCircles: 2, activeMembers: 4 }), // live
      cell({ geocellLat: 2.0, geocellLng: 2.0, recentCircles: 1, activeMembers: 1 }), // warm -> seedable
      cell({ geocellLat: 3.0, geocellLng: 3.0 }), // empty -> seedable + empty
    ])
    const sum = summarizeDensity(cities)
    expect(sum.cities).toBe(3)
    expect(sum.liveCities).toBe(1)
    expect(sum.seedableCities).toBe(2)
    expect(sum.emptyCities).toBe(1)
    expect(sum.totalActiveMembers).toBe(5)
    expect(sum.totalAnchors).toBe(3)
  })

  it('an empty world summarizes to all-zeros', () => {
    expect(summarizeDensity([])).toEqual({
      cities: 0,
      liveCities: 0,
      seedableCities: 0,
      emptyCities: 0,
      totalActiveMembers: 0,
      totalAnchors: 0,
    })
  })
})
