import { describe, it, expect } from 'vitest'
import {
  AMPLITUDE_LEVEL_COEFF,
  AMPLITUDE_MILESTONES,
  amplitudeLevel,
  amplitudeProgress,
  cumulativeForLevel,
  formatAmplitude,
} from './amplitude'

describe('cumulativeForLevel', () => {
  it('follows 50 * L * (L+1)', () => {
    expect(cumulativeForLevel(0)).toBe(0)
    expect(cumulativeForLevel(1)).toBe(100)
    expect(cumulativeForLevel(2)).toBe(300)
    expect(cumulativeForLevel(3)).toBe(600)
    expect(cumulativeForLevel(4)).toBe(1000)
    expect(cumulativeForLevel(10)).toBe(5500)
  })
})

describe('amplitudeLevel', () => {
  it('is the largest L where cumulative(L) <= amplitude', () => {
    expect(amplitudeLevel(0)).toBe(0)
    expect(amplitudeLevel(99)).toBe(0)
    expect(amplitudeLevel(100)).toBe(1)
    expect(amplitudeLevel(299)).toBe(1)
    expect(amplitudeLevel(300)).toBe(2)
    expect(amplitudeLevel(1000)).toBe(4) // milestone 1k = exactly level 4
    expect(amplitudeLevel(14_200)).toBe(16) // the brief's "Beacon · 14,200" example
  })

  it('is exact at every boundary up to level 200', () => {
    for (let l = 1; l <= 200; l++) {
      const c = cumulativeForLevel(l)
      expect(amplitudeLevel(c)).toBe(l)
      expect(amplitudeLevel(c - 1)).toBe(l - 1)
    }
  })

  it('never goes negative on junk input', () => {
    expect(amplitudeLevel(-50)).toBe(0)
    expect(amplitudeLevel(NaN)).toBe(0)
  })
})

describe('amplitudeProgress', () => {
  it('tracks level segment fill', () => {
    const p = amplitudeProgress(150) // level 1 spans 100..300
    expect(p.level).toBe(1)
    expect(p.intoLevel).toBe(50)
    expect(p.toNext).toBe(150)
    expect(p.pct).toBe(25)
  })

  it('tracks milestones', () => {
    const p = amplitudeProgress(5_500)
    expect(p.milestonesReached).toEqual([1_000, 5_000])
    expect(p.nextMilestone).toBe(10_000)
  })

  it('returns null next milestone once all are reached', () => {
    const top = AMPLITUDE_MILESTONES[AMPLITUDE_MILESTONES.length - 1]
    expect(amplitudeProgress(top).nextMilestone).toBeNull()
  })
})

describe('formatAmplitude', () => {
  it('formats with thousands separators', () => {
    expect(formatAmplitude(14_200)).toBe('14,200')
    expect(formatAmplitude(0)).toBe('0')
  })
})

describe('constants', () => {
  it('coefficient is 50 per the brief', () => {
    expect(AMPLITUDE_LEVEL_COEFF).toBe(50)
  })
  it('milestones match the brief', () => {
    expect([...AMPLITUDE_MILESTONES]).toEqual([1_000, 5_000, 10_000, 25_000, 50_000, 100_000])
  })
})
