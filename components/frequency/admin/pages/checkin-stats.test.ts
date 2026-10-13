import { describe, expect, it } from 'vitest'
import { DAY_MS, barHeights, countBetween, firstTimers, percentChange, returnRate, visitsByProfile, weeklyCounts, type CheckinRow } from './checkin-stats'

const NOW = Date.UTC(2026, 9, 13, 12)
const ago = (days: number) => NOW - days * DAY_MS
const row = (profileId: string, days: number): CheckinRow => ({ profileId, at: ago(days) })

describe('check-in arithmetic', () => {
  it('counts a window and buckets weeks oldest first', () => {
    const rows = [row('a', 1), row('b', 2), row('a', 10), row('c', 40), row('c', 100)]
    expect(countBetween(rows, NOW, 30)).toBe(3)
    expect(countBetween(rows, NOW, 60, 30)).toBe(1)
    const weeks = weeklyCounts(rows, NOW, 12)
    expect(weeks).toHaveLength(12)
    expect(weeks[11]).toBe(2)
    expect(weeks[10]).toBe(1)
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(4) // the 100-day row is outside 12 weeks
  })

  it('has no change reading without a prior period', () => {
    expect(percentChange(10, 0)).toBeNull()
    expect(percentChange(12, 10)).toBe(20)
    expect(percentChange(8, 10)).toBe(-20)
  })

  it('reads the return rate only over people with two weeks of follow-up', () => {
    const rows = [row('a', 20), row('a', 10), row('b', 25), row('c', 5)]
    expect(returnRate(rows, NOW)).toEqual({ rate: 50, people: 2 })
    expect(returnRate([row('c', 5)], NOW)).toBeNull()
  })

  it('folds visits and first timers', () => {
    const rows = [row('a', 3), row('a', 50), row('b', 2)]
    expect(visitsByProfile(rows).get('a')).toEqual({ visits: 2, last: ago(3) })
    expect(firstTimers(rows, NOW, 7)).toBe(1)
  })

  it('scales bars to the tallest week and keeps a sliver for zero', () => {
    expect(barHeights([0, 5, 10])).toEqual([3, 50, 100])
    expect(barHeights([0, 0])).toEqual([3, 3])
  })
})
