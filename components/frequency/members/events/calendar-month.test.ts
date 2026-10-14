import { describe, expect, it } from 'vitest'
import { buildCalendarMonth, resolveMonth, chipTime, MONTHS_AHEAD } from './calendar-month'

const row = (id: string, starts_at: string) => ({ id, slug: id, title: `Event ${id}`, starts_at })

describe('resolveMonth', () => {
  it('defaults to the community month', () => {
    expect(resolveMonth(undefined, '2026-10-13')).toEqual({ year: 2026, month1: 10 })
  })
  it('takes a valid month inside the window', () => {
    expect(resolveMonth('2026-12', '2026-10-13')).toEqual({ year: 2026, month1: 12 })
  })
  it('refuses a past month, a malformed value and one past the window', () => {
    expect(resolveMonth('2026-09', '2026-10-13')).toEqual({ year: 2026, month1: 10 })
    expect(resolveMonth('2026-13', '2026-10-13')).toEqual({ year: 2026, month1: 10 })
    expect(resolveMonth('nope', '2026-10-13')).toEqual({ year: 2026, month1: 10 })
    expect(resolveMonth(`${2026 + 2}-10`, '2026-10-13')).toEqual({ year: 2026, month1: 10 })
  })
})

describe('buildCalendarMonth', () => {
  const rows = [row('a', '2026-10-15T18:00:00.000Z'), row('b', '2026-10-15T18:30:00.000Z'), row('c', '2026-11-02T09:00:00.000Z')]
  const cal = buildCalendarMonth(rows, { year: 2026, month1: 10, today: '2026-10-13', going: (r) => r.id === 'b' })

  it('draws October 2026 Monday first: it opens on a Thursday, so three blanks lead', () => {
    expect(cal.title).toBe('October 2026')
    expect(cal.weeks[0].slice(0, 3).every((c) => c.key === null)).toBe(true)
    expect(cal.weeks[0][3]).toMatchObject({ key: '2026-10-01', day: 1, label: 'Thursday, October 1' })
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('puts each date on its own stored day, marks today and the past, and counts only this month', () => {
    const cells = cal.weeks.flat()
    const d15 = cells.find((c) => c.key === '2026-10-15')!
    expect(d15.events.map((e) => [e.id, e.time, e.going])).toEqual([
      ['a', '6pm', false],
      ['b', '6:30pm', true],
    ])
    expect(cells.find((c) => c.key === '2026-10-13')!.today).toBe(true)
    expect(cells.find((c) => c.key === '2026-10-12')!.past).toBe(true)
    expect(cal.total).toBe(2)
  })

  it('pages forward inside the window and never back before this month', () => {
    expect(cal.prev).toBeNull()
    expect(cal.next).toBe('2026-11')
    const nov = buildCalendarMonth(rows, { year: 2026, month1: 11, today: '2026-10-13', going: () => false })
    expect(nov.prev).toBe('2026-10')
    expect(nov.total).toBe(1)
    const last = buildCalendarMonth(rows, { year: 2027, month1: 10, today: '2026-10-13', going: () => false })
    expect(MONTHS_AHEAD).toBe(12)
    expect(last.next).toBeNull()
    expect(last.total).toBe(0)
  })

  it('reads the wall clock in UTC parts', () => {
    expect(chipTime('2026-10-15T07:05:00.000Z')).toBe('7:05am')
  })
})
