import { describe, expect, it } from 'vitest'
import { addDays, groupByMonth, groupByWhen, splitAt } from './group'

const ev = (day: string, id = day) => ({ id, starts_at: `${day}T19:00:00+00:00` })

describe('groupByWhen', () => {
  const today = '2026-10-13'

  it('buckets this week, next week, then one bucket per month', () => {
    const groups = groupByWhen(
      [ev('2026-10-13'), ev('2026-10-19'), ev('2026-10-20'), ev('2026-10-26'), ev('2026-10-29'), ev('2026-11-02')],
      today,
    )
    expect(groups.map((g) => [g.label, g.events.length])).toEqual([
      ['This week', 2],
      ['Next week', 2],
      ['October', 1],
      ['November', 1],
    ])
  })

  it('keeps an event dated before today in this week instead of dropping it', () => {
    expect(groupByWhen([ev('2026-10-12')], today)[0].label).toBe('This week')
  })

  it('names the year once the calendar crosses into the next one', () => {
    expect(groupByWhen([ev('2027-01-05')], today)[0].label).toBe('January 2027')
  })

  it('returns no groups for an empty calendar', () => {
    expect(groupByWhen([], today)).toEqual([])
  })
})

describe('splitAt', () => {
  const groups = groupByWhen([ev('2026-10-13', 'a'), ev('2026-10-14', 'b'), ev('2026-10-15', 'c'), ev('2026-11-02', 'd')], '2026-10-13')

  it('shows the first rows and folds the rest, keeping the bucket label on both sides', () => {
    const { shown, folded, foldedCount } = splitAt(groups, 2)
    expect(shown.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([['This week', ['a', 'b']]])
    expect(folded.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ['This week', ['c']],
      ['November', ['d']],
    ])
    expect(foldedCount).toBe(2)
  })

  it('folds nothing when the list fits', () => {
    expect(splitAt(groups, 10).foldedCount).toBe(0)
  })
})

describe('addDays', () => {
  it('crosses a month boundary in calendar days', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })
})

describe('groupByMonth', () => {
  it('buckets past events by month, newest first as given', () => {
    const groups = groupByMonth([ev('2026-10-02'), ev('2026-09-20'), ev('2025-12-01')], '2026-10-13')
    expect(groups.map((g) => g.label)).toEqual(['October', 'September', 'December 2025'])
  })
})
