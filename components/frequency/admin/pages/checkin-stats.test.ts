import { describe, expect, it } from 'vitest'
import { DAY_MS, barHeights, checkinsByEvent, countBetween, firstTimers, percentChange, repeatShare, returnRate, rsvpShowRate, visitsByProfile, weeklyCounts, type CheckinRow } from './checkin-stats'

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

describe('event and repeat arithmetic', () => {
  const at = (profileId: string, days: number, eventId?: string): CheckinRow => ({ profileId, at: ago(days), eventId })

  it('counts check-ins per listed event only', () => {
    const rows = [at('a', 1, 'e1'), at('b', 1, 'e1'), at('a', 8, 'e2'), at('c', 2, 'other'), at('d', 2)]
    const by = checkinsByEvent(rows, ['e1', 'e2', 'e3'])
    expect([...by.entries()]).toEqual([['e1', 2], ['e2', 1], ['e3', 0]])
  })

  it('reads the repeat share over the window, null with nobody in it', () => {
    const rows = [at('a', 1), at('a', 30), at('b', 5), at('c', 200), at('c', 210)]
    expect(repeatShare(rows, NOW, 90)).toEqual({ rate: 50, people: 2 })
    expect(repeatShare([at('c', 200)], NOW, 90)).toBeNull()
  })

  it('converts going RSVPs to check-ins on the same event', () => {
    const going = [
      { eventId: 'e1', profileId: 'a' },
      { eventId: 'e1', profileId: 'b' },
      { eventId: 'e2', profileId: 'a' },
      { eventId: 'e2', profileId: 'c' },
    ]
    // a came to e1 only; c came to e1 (not their RSVP'd event); b never came.
    const rows = [at('a', 3, 'e1'), at('c', 3, 'e1')]
    expect(rsvpShowRate(going, rows)).toEqual({ rate: 25, rsvps: 4 })
    expect(rsvpShowRate([], rows)).toBeNull()
  })
})
