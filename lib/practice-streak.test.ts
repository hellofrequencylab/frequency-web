import { describe, it, expect } from 'vitest'
import { derivePracticeStreak, shiftDay, dayDiff } from './practice-streak'

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
