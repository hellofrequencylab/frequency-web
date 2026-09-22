import { describe, expect, it } from 'vitest'
import {
  expandPencilSeries,
  normaliseExceptionDates,
  pencilRepeatChoice,
  pencilRepeatRule,
  pencilRuleForChoice,
  withExceptionDate,
  withoutExceptionDate,
  type SeriesMaster,
} from './pencil-series'

// REPEATING PENCILS WITH EXPLICIT EXCEPTIONS (PROG-CAL5). The promise the phase makes, pinned: a
// biweekly series with an intentionally skipped date keeps that skip through regeneration, the
// cadence is never re-based around the gap, and the date comes back ONLY when the exception is
// removed. Nothing infers a skip from a gap.

/** A 7pm to 9pm Pencil on Monday 5 October 2026, every other week, in Los Angeles. */
const biweekly: SeriesMaster = {
  starts_at: '2026-10-05T19:00:00.000Z',
  ends_at: '2026-10-05T21:00:00.000Z',
  recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2',
  exception_dates: [],
}
const quarter = { fromDay: '2026-10-01', toDay: '2027-01-01' }
const days = (m: SeriesMaster) => expandPencilSeries(m, quarter).map((o) => o.dayKey)

describe('a skipped date survives regeneration', () => {
  it('lands every other Monday with no skip', () => {
    expect(days(biweekly)).toEqual(['2026-10-05', '2026-10-19', '2026-11-02', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28'])
  })

  it('drops the skipped date and keeps the cadence around it, every time it is asked', () => {
    const skipped: SeriesMaster = { ...biweekly, exception_dates: ['2026-11-02'] }
    const expected = ['2026-10-05', '2026-10-19', '2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28']
    expect(days(skipped)).toEqual(expected)
    // Regenerated from the same row, the gap is still there: nothing normalises it back into the
    // cadence, and the next landing is still four weeks after the one before the gap, not two.
    expect(days(skipped)).toEqual(expected)
    expect(days(skipped)).not.toContain('2026-11-02')
    expect(days(skipped)).not.toContain('2026-11-09')
  })

  it('brings the date back only when the exception is removed', () => {
    const skipped: SeriesMaster = { ...biweekly, exception_dates: withExceptionDate([], '2026-11-02') }
    expect(days(skipped)).not.toContain('2026-11-02')
    const restored: SeriesMaster = { ...skipped, exception_dates: withoutExceptionDate(skipped.exception_dates, '2026-11-02') }
    expect(restored.exception_dates).toEqual([])
    expect(days(restored)).toEqual(days(biweekly))
  })

  it('never infers a skip: a day the rule does not land on is not an exception, and an exception on such a day changes nothing', () => {
    const offCadence: SeriesMaster = { ...biweekly, exception_dates: ['2026-11-09'] }
    expect(days(offCadence)).toEqual(days(biweekly))
  })

  it('can skip the anchor itself', () => {
    expect(days({ ...biweekly, exception_dates: ['2026-10-05'] })[0]).toBe('2026-10-19')
  })

  it('shifts the whole span to each landing and keeps the wall clock', () => {
    const [first, second] = expandPencilSeries(biweekly, quarter)
    expect(first).toEqual({ dayKey: '2026-10-05', starts_at: '2026-10-05T19:00:00.000Z', ends_at: '2026-10-05T21:00:00.000Z' })
    expect(second).toEqual({ dayKey: '2026-10-19', starts_at: '2026-10-19T19:00:00.000Z', ends_at: '2026-10-19T21:00:00.000Z' })
    // Across the November DST change the series is still 7pm to 9pm wall clock.
    expect(expandPencilSeries(biweekly, quarter).every((o) => o.starts_at.endsWith('T19:00:00.000Z'))).toBe(true)
  })
})

describe('the window', () => {
  it('returns only landings that overlap the window, including one that started before it', () => {
    // A three-day all-day retreat every week; the week of the 12th starts before a window at the 13th.
    const retreat: SeriesMaster = {
      starts_at: '2026-10-05T00:00:00.000Z',
      ends_at: '2026-10-08T00:00:00.000Z',
      recurrence_rule: 'FREQ=WEEKLY',
      exception_dates: [],
    }
    expect(expandPencilSeries(retreat, { fromDay: '2026-10-13', toDay: '2026-10-20' }).map((o) => o.dayKey)).toEqual([
      '2026-10-12',
      '2026-10-19',
    ])
  })

  it('excludes a landing that starts exactly at the window end', () => {
    expect(days({ ...biweekly, recurrence_rule: 'FREQ=WEEKLY' })).not.toContain('2027-01-01')
    expect(expandPencilSeries(biweekly, { fromDay: '2026-10-19', toDay: '2026-11-02' }).map((o) => o.dayKey)).toEqual(['2026-10-19'])
  })

  it('hands a one-off back as itself when it overlaps, and nothing otherwise', () => {
    const once: SeriesMaster = { ...biweekly, recurrence_rule: null }
    expect(days(once)).toEqual(['2026-10-05'])
    expect(expandPencilSeries(once, { fromDay: '2026-11-01', toDay: '2026-12-01' })).toEqual([])
  })

  it('honours COUNT from the rule and treats a rule outside the subset as absent (ADR-1299)', () => {
    expect(days({ ...biweekly, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=3' })).toEqual(['2026-10-05', '2026-10-19', '2026-11-02'])
    expect(days({ ...biweekly, recurrence_rule: 'FREQ=WEEKLY;BYWEEKNO=3' })).toEqual(['2026-10-05'])
  })

  it('clamps a monthly series on the 31st the way events do', () => {
    const monthly: SeriesMaster = {
      starts_at: '2026-10-31T10:00:00.000Z',
      ends_at: '2026-10-31T11:00:00.000Z',
      recurrence_rule: 'FREQ=MONTHLY',
      exception_dates: [],
    }
    expect(expandPencilSeries(monthly, { fromDay: '2026-10-01', toDay: '2027-03-01' }).map((o) => o.dayKey)).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ])
  })

  it('returns nothing for an unreadable window or span', () => {
    expect(expandPencilSeries(biweekly, { fromDay: '2026-13-01', toDay: '2027-01-01' })).toEqual([])
    expect(expandPencilSeries(biweekly, { fromDay: '2027-01-01', toDay: '2026-10-01' })).toEqual([])
    expect(expandPencilSeries({ ...biweekly, ends_at: biweekly.starts_at }, quarter)).toEqual([])
  })
})

describe('what the row stores', () => {
  it('keeps exception dates valid, unique and ascending, whatever arrives', () => {
    expect(normaliseExceptionDates(['2026-11-16', '2026-11-02', '2026-11-02', 'soon', 42, '2026-02-30', '2026-11-16T00:00:00.000Z'])).toEqual([
      '2026-11-02',
      '2026-11-16',
    ])
    expect(normaliseExceptionDates(null)).toEqual([])
    expect(withExceptionDate(['2026-11-02'], '2026-11-02')).toEqual(['2026-11-02'])
  })

  it('stores the canonical spelling of a rule and nothing for a bad one', () => {
    expect(pencilRepeatRule('freq=weekly;interval=2;UNTIL=20261231')).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(pencilRepeatRule('FREQ=WEEKLY;INTERVAL=1')).toBe('FREQ=WEEKLY')
    expect(pencilRepeatRule('')).toBeNull()
    expect(pencilRepeatRule('every tuesday')).toBeNull()
    expect(pencilRepeatRule(null)).toBeNull()
  })

  it('maps the drawer choices to rules and back, and keeps a hand-written rule as custom', () => {
    expect(pencilRuleForChoice('biweekly')).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(pencilRuleForChoice('none')).toBeNull()
    expect(pencilRuleForChoice('nonsense')).toBeNull()
    expect(pencilRepeatChoice('FREQ=WEEKLY;INTERVAL=2')).toBe('biweekly')
    expect(pencilRepeatChoice('FREQ=MONTHLY')).toBe('monthly')
    expect(pencilRepeatChoice(null)).toBe('none')
    expect(pencilRepeatChoice('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3')).toBe('custom')
  })
})
