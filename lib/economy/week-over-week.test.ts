import { describe, it, expect } from 'vitest'
import { zapWeeks, weekOverWeekDelta } from './week-over-week'
import type { EffortEntry } from '@/lib/quest/effort'

// LIVE-685: the Vault stat row says whether a member earned more this week than last. Fails on the
// pre-change tree because the module did not exist: nothing summed a member's ledger by week.

const NOW = Date.parse('2026-09-29T18:00:00.000Z')
const DAY = 86_400_000
const ago = (days: number, amount: number): EffortEntry => ({ at: new Date(NOW - days * DAY).toISOString(), amount })

describe('zapWeeks', () => {
  it('splits the last 14 days into this week and last week', () => {
    const rows = [ago(0.1, 10), ago(6.9, 5), ago(7.1, 20), ago(13.9, 1), ago(14.1, 999)]
    expect(zapWeeks(rows, NOW)).toEqual({ thisWeek: 15, lastWeek: 21 })
  })

  it('ignores corrections and clawbacks, so a refund never reads as a lighter week', () => {
    expect(zapWeeks([ago(1, 30), ago(2, -30), ago(8, 0)], NOW)).toEqual({ thisWeek: 30, lastWeek: 0 })
  })

  it('counts a clock-skewed future row as this week and skips an unparseable one', () => {
    expect(zapWeeks([ago(-0.5, 4), { at: 'not a date', amount: 50 }], NOW)).toEqual({ thisWeek: 4, lastWeek: 0 })
  })

  it('is zero and zero with no rows', () => {
    expect(zapWeeks([], NOW)).toEqual({ thisWeek: 0, lastWeek: 0 })
  })
})

describe('weekOverWeekDelta', () => {
  it('names the gain and marks it up when this week is ahead', () => {
    expect(weekOverWeekDelta({ thisWeek: 1240, lastWeek: 40 })).toEqual({ label: '1,200 more than last week', trend: 'up' })
    expect(weekOverWeekDelta({ thisWeek: 5, lastWeek: 0 })).toEqual({ label: '5 more than last week', trend: 'up' })
  })

  it('says so plainly when the weeks match', () => {
    expect(weekOverWeekDelta({ thisWeek: 12, lastWeek: 12 })).toEqual({ label: 'Same as last week', trend: 'flat' })
    expect(weekOverWeekDelta({ thisWeek: 0, lastWeek: 0 })).toEqual({ label: 'Same as last week', trend: 'flat' })
  })

  it('never shames a lighter week: no down trend, no deficit, just last week’s number', () => {
    const d = weekOverWeekDelta({ thisWeek: 10, lastWeek: 1500 })
    expect(d).toEqual({ label: 'Last week: 1,500', trend: 'flat' })
    expect(d.trend).not.toBe('down')
    expect(d.label).not.toMatch(/less|fewer|down|behind|drop|-/i)
  })
})
