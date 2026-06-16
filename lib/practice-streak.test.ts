import { describe, it, expect } from 'vitest'
import {
  derivePracticeStreak,
  shiftDay,
  dayDiff,
  pauseCoveredDays,
  isResting,
  MAX_PAUSE_DAYS,
} from './practice-streak'

const TODAY = '2026-06-06'
const set = (...days: string[]) => new Set(days)
const back = (n: number) => shiftDay(TODAY, -n)

describe('date helpers', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDay('2026-06-01', -1)).toBe('2026-05-31')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01') // 2026 is not a leap year
    expect(shiftDay('2026-06-06', 0)).toBe('2026-06-06')
  })
  it('counts whole-day differences', () => {
    expect(dayDiff('2026-06-06', '2026-06-04')).toBe(2)
    expect(dayDiff('2026-06-01', '2026-05-30')).toBe(2)
    expect(dayDiff('2026-06-06', '2026-06-06')).toBe(0)
  })
})

describe('derivePracticeStreak', () => {
  it('is zero with no logs', () => {
    const r = derivePracticeStreak(set(), set(), TODAY)
    expect(r).toEqual({ current: 0, loggedToday: false, alive: false })
  })

  it('counts consecutive days ending today', () => {
    const r = derivePracticeStreak(set(back(0), back(1), back(2)), set(), TODAY)
    expect(r.current).toBe(3)
    expect(r.loggedToday).toBe(true)
    expect(r.alive).toBe(true)
  })

  it('stays alive but at-risk when only yesterday is logged', () => {
    const r = derivePracticeStreak(set(back(1), back(2)), set(), TODAY)
    expect(r.current).toBe(2)
    expect(r.loggedToday).toBe(false)
    expect(r.alive).toBe(true)
  })

  it('breaks when the most recent log is two days ago', () => {
    const r = derivePracticeStreak(set(back(2), back(3)), set(), TODAY)
    expect(r.alive).toBe(false)
    expect(r.current).toBe(0)
  })

  it('bridges a single missed day with a freeze', () => {
    // logged today + day-before-yesterday; yesterday missing but frozen.
    const r = derivePracticeStreak(set(back(0), back(2), back(3)), set(back(1)), TODAY)
    expect(r.current).toBe(4)
    expect(r.alive).toBe(true)
  })

  it('a freeze far from the run does not extend it', () => {
    const r = derivePracticeStreak(set(back(0), back(1)), set(back(5)), TODAY)
    expect(r.current).toBe(2)
  })

  it('handles a single day logged today', () => {
    const r = derivePracticeStreak(set(back(0)), set(), TODAY)
    expect(r.current).toBe(1)
    expect(r.loggedToday).toBe(true)
  })
})

describe('pauseCoveredDays (the "life happens" rest window)', () => {
  it('is empty with no window', () => {
    expect(pauseCoveredDays(null, TODAY)).toEqual([])
    expect(pauseCoveredDays(undefined, TODAY)).toEqual([])
  })

  it('covers every passed day in the window, inclusive', () => {
    const rest = { from: back(3), through: back(1) }
    expect(pauseCoveredDays(rest, TODAY)).toEqual([back(3), back(2), back(1)])
  })

  it('never covers the future — clamps the window end to today', () => {
    const rest = { from: back(1), through: shiftDay(TODAY, 5) }
    // only yesterday and today have actually passed
    expect(pauseCoveredDays(rest, TODAY)).toEqual([back(1), back(0)])
  })

  it('returns nothing for a window that has not started yet', () => {
    const rest = { from: shiftDay(TODAY, 2), through: shiftDay(TODAY, 4) }
    expect(pauseCoveredDays(rest, TODAY)).toEqual([])
  })

  it('caps the span at MAX_PAUSE_DAYS so it can never freeze unbounded', () => {
    const rest = { from: shiftDay(TODAY, -100), through: TODAY }
    expect(pauseCoveredDays(rest, TODAY)).toHaveLength(MAX_PAUSE_DAYS)
  })
})

describe('isResting', () => {
  it('is true inside the window and false outside it', () => {
    expect(isResting({ from: back(2), through: back(1) }, TODAY)).toBe(false)
    expect(isResting({ from: back(1), through: back(0) }, TODAY)).toBe(true)
    expect(isResting({ from: TODAY, through: shiftDay(TODAY, 3) }, TODAY)).toBe(true)
    expect(isResting(null, TODAY)).toBe(false)
  })
})

describe('a planned rest bridges the streak like a reserve day', () => {
  it('survives a break when its days are folded into the frozen set', () => {
    // Logged today + four days ago; the three days between were a planned rest.
    const logged = set(back(0), back(4), back(5))
    const restDays = pauseCoveredDays({ from: back(3), through: back(1) }, TODAY)
    const frozen = new Set([...set(), ...restDays])
    const r = derivePracticeStreak(logged, frozen, TODAY)
    expect(r.alive).toBe(true)
    expect(r.current).toBe(6) // today + 3 rested + 2 logged before
  })
})
