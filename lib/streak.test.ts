import { describe, it, expect } from 'vitest'
import { streakProgress, STREAK_MILESTONES } from './streak'

describe('streakProgress', () => {
  it('targets the first checkpoint from zero', () => {
    const p = streakProgress(0)
    expect(p.reached).toHaveLength(0)
    expect(p.next?.day).toBe(3)
    expect(p.prevDay).toBe(0)
    expect(p.toNext).toBe(3)
    expect(p.maxed).toBe(false)
  })

  it('fills the current segment between checkpoints', () => {
    const p = streakProgress(5) // between 3 and 7
    expect(p.reached.map((m) => m.day)).toEqual([3])
    expect(p.next?.day).toBe(7)
    expect(p.prevDay).toBe(3)
    expect(p.toNext).toBe(2)
    expect(p.pct).toBe(50) // (5-3)/(7-3)
  })

  it('counts a reached checkpoint exactly', () => {
    const p = streakProgress(7)
    expect(p.reached.map((m) => m.day)).toContain(7)
    expect(p.next?.day).toBe(14)
    expect(p.prevDay).toBe(7)
  })

  it('maxes out past the final milestone', () => {
    const last = STREAK_MILESTONES[STREAK_MILESTONES.length - 1].day
    const p = streakProgress(last + 10)
    expect(p.next).toBeNull()
    expect(p.maxed).toBe(true)
    expect(p.pct).toBe(100)
    expect(p.toNext).toBe(0)
  })

  it('treats junk input as zero', () => {
    expect(streakProgress(-4).streak).toBe(0)
    expect(streakProgress(NaN).streak).toBe(0)
  })
})
