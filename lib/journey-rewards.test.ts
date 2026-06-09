import { describe, it, expect } from 'vitest'
import {
  evaluateLogRewards,
  fullDayKey,
  weeklyRhythmKey,
  completionKey,
  practiceLogZaps,
  FULL_DAY_ZAPS,
  WEEKLY_RHYTHM_ZAPS,
  STANDARD_LOG_ZAPS,
  type LogRewardInput,
} from '@/lib/journey-rewards'

const base: LogRewardInput = {
  date: '2026-06-21',
  stepsDueToday: 4,
  distinctStepsLoggedToday: 4,
  planId: 'plan-1',
  season: 1,
  seasonWeekBucket: 0,
  allStepsOnTrack: true,
  qualifyingWeeks: 8,
  targetWeeks: 8,
  completionGems: 30,
  alreadyGranted: new Set<string>(),
}

describe('evaluateLogRewards', () => {
  it('fires Full Day, Weekly Rhythm and Completion when every condition is met', () => {
    const keys = evaluateLogRewards(base).map((b) => b.key)
    expect(keys).toContain(fullDayKey('2026-06-21'))
    expect(keys).toContain(weeklyRhythmKey('plan-1', 1, 0))
    expect(keys).toContain(completionKey('plan-1', 1))
  })
  it('withholds Full Day until every due step is logged', () => {
    const out = evaluateLogRewards({ ...base, distinctStepsLoggedToday: 3 })
    expect(out.find((b) => b.label === 'Full Day')).toBeUndefined()
  })
  it('withholds Weekly Rhythm when a step is off track', () => {
    const out = evaluateLogRewards({ ...base, allStepsOnTrack: false })
    expect(out.find((b) => b.label === 'Weekly Rhythm')).toBeUndefined()
  })
  it('withholds Weekly Rhythm outside the season window (null bucket)', () => {
    const out = evaluateLogRewards({ ...base, seasonWeekBucket: null })
    expect(out.find((b) => b.label === 'Weekly Rhythm')).toBeUndefined()
  })
  it('withholds Completion before the target weeks', () => {
    const out = evaluateLogRewards({ ...base, qualifyingWeeks: 7 })
    expect(out.find((b) => b.label === 'Journey complete')).toBeUndefined()
  })
  it('skips everything already granted (idempotency)', () => {
    const granted = new Set([
      fullDayKey('2026-06-21'),
      weeklyRhythmKey('plan-1', 1, 0),
      completionKey('plan-1', 1),
    ])
    expect(evaluateLogRewards({ ...base, alreadyGranted: granted })).toEqual([])
  })
  it('pays the configured completion gems', () => {
    const out = evaluateLogRewards({
      ...base,
      completionGems: 50,
      alreadyGranted: new Set([fullDayKey('2026-06-21'), weeklyRhythmKey('plan-1', 1, 0)]),
    })
    expect(out.find((b) => b.label === 'Journey complete')).toMatchObject({ kind: 'gems', amount: 50 })
  })
  it('uses the design amounts for the zap bonuses', () => {
    expect(FULL_DAY_ZAPS).toBe(25)
    expect(WEEKLY_RHYTHM_ZAPS).toBe(50)
  })
})

describe('practiceLogZaps', () => {
  it('defaults to the standard 12', () => {
    expect(practiceLogZaps(null)).toBe(STANDARD_LOG_ZAPS)
    expect(practiceLogZaps(undefined)).toBe(12)
  })
  it('uses a per-practice override when set', () => {
    expect(practiceLogZaps(15)).toBe(15)
  })
})
