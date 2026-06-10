import { describe, it, expect } from 'vitest'
import {
  seasonWeekBucket,
  currentSeasonWeek,
  qualifyingWeeks,
  isJourneyComplete,
  seasonAct,
  SEASON_DAYS,
  SEASON_WEEKS,
  DEFAULT_TARGET_WEEKS,
} from '@/lib/journey-quest-clock'

const START = '2026-06-21' // a solstice anchor

describe('seasonWeekBucket', () => {
  it('day 0 (the season start) is bucket 0', () => {
    expect(seasonWeekBucket('2026-06-21', START)).toBe(0)
  })
  it('day 6 is still bucket 0; day 7 rolls to bucket 1', () => {
    expect(seasonWeekBucket('2026-06-27', START)).toBe(0)
    expect(seasonWeekBucket('2026-06-28', START)).toBe(1)
  })
  it('the last in-window day (day 90) is bucket 12', () => {
    expect(seasonWeekBucket('2026-09-19', START)).toBe(12)
  })
  it('returns null outside the 91-day window', () => {
    expect(seasonWeekBucket('2026-06-20', START)).toBeNull() // day -1, before
    expect(seasonWeekBucket('2026-09-20', START)).toBeNull() // day 91, past the end
  })
  it('returns null for malformed dates', () => {
    expect(seasonWeekBucket('not-a-date', START)).toBeNull()
  })
  it('produces exactly 13 buckets across the whole season', () => {
    const seen = new Set<number>()
    const start = Date.parse(`${START}T00:00:00Z`)
    for (let d = 0; d < SEASON_DAYS; d++) {
      const day = new Date(start + d * 86_400_000).toISOString().slice(0, 10)
      const b = seasonWeekBucket(day, START)
      if (b !== null) seen.add(b)
    }
    expect(seen.size).toBe(SEASON_WEEKS)
  })
})

describe('currentSeasonWeek', () => {
  it('is 1-based', () => {
    expect(currentSeasonWeek('2026-06-21', START)).toBe(1)
    expect(currentSeasonWeek('2026-06-28', START)).toBe(2)
  })
  it('is null outside the season', () => {
    expect(currentSeasonWeek('2026-06-01', START)).toBeNull()
  })
})

describe('qualifyingWeeks', () => {
  it('dedupes multiple qualifying days in the same week', () => {
    expect(qualifyingWeeks(['2026-06-21', '2026-06-22', '2026-06-23'], START)).toBe(1)
  })
  it('counts distinct weeks and ignores out-of-window days', () => {
    const days = ['2026-06-21', '2026-06-28', '2026-07-05', '2026-06-01' /* out */]
    expect(qualifyingWeeks(days, START)).toBe(3)
  })
  it('is 0 for no qualifying days', () => {
    expect(qualifyingWeeks([], START)).toBe(0)
  })
})

describe('isJourneyComplete', () => {
  it('completes at the default target of 8', () => {
    expect(isJourneyComplete(7)).toBe(false)
    expect(isJourneyComplete(8)).toBe(true)
    expect(DEFAULT_TARGET_WEEKS).toBe(8)
  })
  it('honors a custom target', () => {
    expect(isJourneyComplete(6, 6)).toBe(true)
    expect(isJourneyComplete(5, 6)).toBe(false)
  })
})

describe('seasonAct', () => {
  it('maps the 13 weeks to the three Acts (Open / Deepen / Land)', () => {
    expect(seasonAct(1)?.act).toBe(1)
    expect(seasonAct(4)?.name).toBe('Open')
    expect(seasonAct(5)?.act).toBe(2)
    expect(seasonAct(9)?.name).toBe('Deepen')
    expect(seasonAct(10)?.act).toBe(3)
    expect(seasonAct(13)?.name).toBe('Land')
  })
  it('is null off-season', () => {
    expect(seasonAct(null)).toBeNull()
    expect(seasonAct(0)).toBeNull()
    expect(seasonAct(SEASON_WEEKS + 1)).toBeNull()
  })
})
