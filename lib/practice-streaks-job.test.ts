import { describe, it, expect } from 'vitest'
import { consecutiveOnTrackWeeks } from './practice-streaks-job'
import { consistencyTier, depthAward, depthLabel, PRACTICE_STREAK_WEEKS } from './practice-shelf'

// Mondays (UTC) for a synthetic calendar.
const W0 = '2026-06-08' // current week
const W1 = '2026-06-01'
const W2 = '2026-05-25'
const W3 = '2026-05-18'

describe('consecutiveOnTrackWeeks', () => {
  it('counts completed on-track weeks walking back', () => {
    const weeks = new Map([[W1, 3], [W2, 3], [W3, 3]])
    expect(consecutiveOnTrackWeeks(weeks, 3, W0)).toBe(3)
  })

  it('counts the current week as soon as it is on track', () => {
    const weeks = new Map([[W0, 1], [W1, 1]])
    expect(consecutiveOnTrackWeeks(weeks, 1, W0)).toBe(2)
  })

  it('never counts the current partial week against the run', () => {
    // Current week not yet on track (0 days) but last two weeks were.
    const weeks = new Map([[W1, 7], [W2, 7]])
    expect(consecutiveOnTrackWeeks(weeks, 7, W0)).toBe(2)
  })

  it('a missed completed week resets the run', () => {
    const weeks = new Map([[W1, 3], [W3, 3]]) // W2 missed
    expect(consecutiveOnTrackWeeks(weeks, 3, W0)).toBe(1)
  })

  it('cadence target gates "on track" (Daily = 7 distinct days)', () => {
    const weeks = new Map([[W1, 6]])
    expect(consecutiveOnTrackWeeks(weeks, 7, W0)).toBe(0)
    expect(consecutiveOnTrackWeeks(weeks, 3, W0)).toBe(1)
  })
})

describe('consistency + depth ladders', () => {
  it('tiers at 2 / 4 / 8 / 13 weeks', () => {
    expect(PRACTICE_STREAK_WEEKS).toEqual({ in_motion: 2, groove: 4, deep_groove: 8, full_cycle: 13 })
    expect(consistencyTier(1)).toBeNull()
    expect(consistencyTier(2)?.label).toBe('In Motion')
    expect(consistencyTier(7)?.label).toBe('Groove')
    expect(consistencyTier(12)?.label).toBe('Deep Groove')
    expect(consistencyTier(13)?.label).toBe('Full Cycle')
  })

  it('depth awards at 10 / 25 / 50 / 100', () => {
    expect(depthAward(9)).toBeNull()
    expect(depthAward(10)).toBe(10)
    expect(depthAward(99)).toBe(50)
    expect(depthAward(250)).toBe(100)
    expect(depthLabel(25)).toBe('25 Deep')
  })
})
