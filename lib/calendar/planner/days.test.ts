import { describe, expect, it } from 'vitest'
import {
  addDays,
  clockLabel,
  dayCount,
  dayLabel,
  dayOfWeek,
  diffDays,
  lastDay,
  lengthLabel,
  mondayOnOrBefore,
  monthDayLabel,
  spansDay,
  weekdayName,
} from './days'

describe('day arithmetic', () => {
  it('adds and diffs across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDays('2026-10-21', '2026-10-28')).toBe(7)
    expect(diffDays('2026-10-28', '2026-10-21')).toBe(-7)
  })
  it('never moves a date across the daylight saving change', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })
  it('leaves an unreadable key alone', () => {
    expect(addDays('nope', 3)).toBe('nope')
    expect(diffDays('nope', '2026-10-21')).toBe(0)
  })
  it('finds the Monday of a week', () => {
    expect(dayOfWeek('2026-10-21')).toBe(3)
    expect(mondayOnOrBefore('2026-10-21')).toBe('2026-10-19')
    expect(mondayOnOrBefore('2026-10-25')).toBe('2026-10-19')
    expect(mondayOnOrBefore('2026-10-26')).toBe('2026-10-26')
    expect(weekdayName('2026-10-21')).toBe('Wednesday')
  })
  it('knows what a run covers', () => {
    expect(lastDay({ date: '2026-10-21' })).toBe('2026-10-21')
    expect(lastDay({ date: '2026-10-21', end: '2026-10-23' })).toBe('2026-10-23')
    expect(lastDay({ date: '2026-10-21', end: '2026-10-19' })).toBe('2026-10-21')
    expect(spansDay({ date: '2026-10-21', end: '2026-10-23' }, '2026-10-23')).toBe(true)
    expect(spansDay({ date: '2026-10-21', end: '2026-10-23' }, '2026-10-24')).toBe(false)
  })
})

describe('labels', () => {
  it('words a day', () => {
    expect(monthDayLabel('2026-10-27')).toBe('Oct 27')
    expect(dayLabel('2026-10-21')).toBe('Wed, Oct 21')
  })
  it('words a clock time', () => {
    expect(clockLabel(19 * 60)).toBe('7 PM')
    expect(clockLabel(9 * 60 + 30)).toBe('9:30 AM')
    expect(clockLabel(0)).toBe('12 AM')
    expect(clockLabel(12 * 60)).toBe('12 PM')
    expect(clockLabel(1440)).toBe('12 AM')
  })
  it('words a length and a count', () => {
    expect(lengthLabel(30)).toBe('30 min')
    expect(lengthLabel(60)).toBe('1 hour')
    expect(lengthLabel(90)).toBe('1.5 hours')
    expect(dayCount(1)).toBe('1 day')
    expect(dayCount(0)).toBe('0 days')
  })
})
