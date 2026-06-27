import { describe, it, expect } from 'vitest'
import {
  localActivityState,
  rippleRadiusM,
  MAX_RIPPLE_FACTOR,
  FOUNDER_DENSITY_THRESHOLD,
  type CellDensity,
} from './ripple'

function cell(over: Partial<CellDensity> = {}): CellDensity {
  return { activeMembers: 0, recentPosts: 0, recentEvents: 0, recentCircles: 0, densityScore: 0, ...over }
}

describe('localActivityState', () => {
  it('no location -> no-location, whatever the density', () => {
    expect(localActivityState(false, null)).toBe('no-location')
    expect(localActivityState(false, cell({ densityScore: 0.9 }))).toBe('no-location')
  })

  it('a null density cell (nothing rolled up) reads as founder', () => {
    expect(localActivityState(true, null)).toBe('founder')
  })

  it('an empty, anchor-less, near-empty cell reads as founder', () => {
    expect(localActivityState(true, cell({ densityScore: 0.02, activeMembers: 1 }))).toBe('founder')
  })

  it('a standing circle OR an upcoming event keeps it active even when sparse', () => {
    expect(localActivityState(true, cell({ densityScore: 0.02, recentCircles: 1 }))).toBe('active')
    expect(localActivityState(true, cell({ densityScore: 0.02, recentEvents: 1 }))).toBe('active')
  })

  it('enough people keeps it active even with no circle/event', () => {
    expect(localActivityState(true, cell({ densityScore: 0.05, activeMembers: 5 }))).toBe('active')
  })

  it('a dense cell is active', () => {
    expect(localActivityState(true, cell({ densityScore: 0.6, activeMembers: 12 }))).toBe('active')
  })

  it('the founder threshold is the boundary', () => {
    expect(localActivityState(true, cell({ densityScore: FOUNDER_DENSITY_THRESHOLD }))).toBe('active')
  })
})

describe('rippleRadiusM', () => {
  it('a fully alive cell keeps the base radius (x1)', () => {
    expect(rippleRadiusM(25000, cell({ densityScore: 1 }))).toBe(25000)
  })

  it('an empty cell opens to the max factor', () => {
    expect(rippleRadiusM(25000, cell({ densityScore: 0 }))).toBe(25000 * MAX_RIPPLE_FACTOR)
  })

  it('a null density opens to the max (never empty feed)', () => {
    expect(rippleRadiusM(25000, null)).toBe(25000 * MAX_RIPPLE_FACTOR)
  })

  it('is monotonic: sparser -> wider', () => {
    const dense = rippleRadiusM(10000, cell({ densityScore: 0.8 }))
    const sparse = rippleRadiusM(10000, cell({ densityScore: 0.2 }))
    expect(sparse).toBeGreaterThan(dense)
  })

  it('never narrows below the base', () => {
    expect(rippleRadiusM(5000, cell({ densityScore: 1 }))).toBeGreaterThanOrEqual(5000)
  })
})
