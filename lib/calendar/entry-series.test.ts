import { describe, it, expect } from 'vitest'
import {
  entryExceptionDays,
  entryRepeatRule,
  expandEntrySeries,
  isDayKey,
  skippedEntrySeriesDates,
  withExceptionDay,
  withoutExceptionDay,
  type EntrySeriesRow,
} from './entry-series'
import { expandRepeat, parseRepeat } from '@/lib/events/repeat-rule'
import { entryToCalendarItem, type EntryFormatters, type EntryRow } from './entries'

// REPEATING PENCILS WITH EXPLICIT EXCEPTIONS (ADR-1386 phase 5, ADR-1511).
//
// The one thing phase 5 promises and that nothing could keep before this: a biweekly series with an
// INTENTIONALLY skipped date keeps that skip, and the generator never normalises the gap back into
// the cadence. Both halves are pinned here — the date that must not be emitted, and the same date
// coming back the moment the exception is removed — because a skip that cannot be undone is a
// different bug wearing the same green test.

/** A biweekly Tuesday Pencil at 7pm, wall clock as UTC parts (the convention this layer stores in). */
const biweekly: EntrySeriesRow = {
  starts_at: '2026-10-06T19:00:00.000Z',
  ends_at: '2026-10-06T21:00:00.000Z',
  recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2',
  exception_dates: [],
}

const OCTOBER = { fromDay: '2026-09-28', toDay: '2026-12-07' }

const days = (row: EntrySeriesRow, window = OCTOBER) => expandEntrySeries(row, window).map((o) => o.dayKey)

describe('expandEntrySeries', () => {
  it('lands on the cadence the rule states', () => {
    expect(days(biweekly)).toEqual(['2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17', '2026-12-01'])
  })

  it('does not emit a date the series deliberately skips', () => {
    const withSkip = { ...biweekly, exception_dates: ['2026-11-03'] }
    expect(days(withSkip)).not.toContain('2026-11-03')
    expect(days(withSkip)).toEqual(['2026-10-06', '2026-10-20', '2026-11-17', '2026-12-01'])
  })

  it('leaves the gap where the operator put it instead of closing the cadence up behind it', () => {
    // 🔴 THE REGRESSION THIS FILE EXISTS FOR. A generator that re-walked from the last KEPT date
    // would put the next one on 2026-11-10 (two weeks after 10-20). The rule still says "every
    // other Tuesday from the 6th", so the date after the skip is 11-17, exactly where it always was.
    const withSkip = { ...biweekly, exception_dates: ['2026-11-03'] }
    expect(days(withSkip)).toContain('2026-11-17')
    expect(days(withSkip)).not.toContain('2026-11-10')
  })

  it('brings the date back when the exception is removed', () => {
    const withSkip = { ...biweekly, exception_dates: ['2026-11-03'] }
    const restored = { ...withSkip, exception_dates: withoutExceptionDay(withSkip.exception_dates, '2026-11-03') }
    expect(days(restored)).toEqual(days(biweekly))
    expect(days(restored)).toContain('2026-11-03')
  })

  it('survives a round trip through the two exception helpers', () => {
    const skipped = { ...biweekly, exception_dates: withExceptionDay(biweekly.exception_dates ?? [], '2026-10-20') }
    expect(days(skipped)).not.toContain('2026-10-20')
    const back = { ...skipped, exception_dates: withoutExceptionDay(skipped.exception_dates, '2026-10-20') }
    expect(days(back)).toEqual(days(biweekly))
  })

  it('can skip the series own first date', () => {
    const withSkip = { ...biweekly, exception_dates: ['2026-10-06'] }
    expect(days(withSkip)).not.toContain('2026-10-06')
    expect(days(withSkip)[0]).toBe('2026-10-20')
  })

  it('keeps the entry time of day and span on every date', () => {
    const [second] = expandEntrySeries(biweekly, OCTOBER).slice(1)
    expect(second.starts_at).toBe('2026-10-20T19:00:00.000Z')
    expect(second.ends_at).toBe('2026-10-20T21:00:00.000Z')
    expect(second.isAnchor).toBe(false)
    expect(second.skipped).toBe(false)
  })

  it('marks the one real row as the anchor', () => {
    expect(expandEntrySeries(biweekly, OCTOBER)[0]).toMatchObject({ dayKey: '2026-10-06', isAnchor: true })
  })

  it('honours an UNTIL carried inside the stored rule, inclusive of its own day', () => {
    const bounded = { ...biweekly, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;UNTIL=20261103' }
    expect(days(bounded)).toEqual(['2026-10-06', '2026-10-20', '2026-11-03'])
  })

  it('returns nothing for a date that does not repeat', () => {
    expect(expandEntrySeries({ ...biweekly, recurrence_rule: null }, OCTOBER)).toEqual([])
  })

  it('returns nothing for a rule it cannot read, so the caller renders the single date instead', () => {
    expect(entryRepeatRule({ recurrence_rule: 'FREQ=FORTNIGHTLY' })).toBeNull()
    expect(expandEntrySeries({ ...biweekly, recurrence_rule: 'FREQ=FORTNIGHTLY' }, OCTOBER)).toEqual([])
  })

  it('stays inside the window it was asked for', () => {
    expect(days(biweekly, { fromDay: '2026-11-01', toDay: '2026-11-30' })).toEqual(['2026-11-03', '2026-11-17'])
  })
})

describe('skippedEntrySeriesDates', () => {
  it('reports the gap so the calendar can draw something undoable', () => {
    const withSkip = { ...biweekly, exception_dates: ['2026-11-03'] }
    expect(skippedEntrySeriesDates(withSkip, OCTOBER).map((o) => o.dayKey)).toEqual(['2026-11-03'])
    expect(skippedEntrySeriesDates(withSkip, OCTOBER)[0].skipped).toBe(true)
  })

  it('is empty for a series with no skips', () => {
    expect(skippedEntrySeriesDates(biweekly, OCTOBER)).toEqual([])
  })

  it('ignores a stored exception the rule no longer lands on', () => {
    // 2026-11-04 is a Wednesday: the series never lands there, so it is stale, not a gap.
    const stale = { ...biweekly, exception_dates: ['2026-11-04'] }
    expect(skippedEntrySeriesDates(stale, OCTOBER)).toEqual([])
    expect(days(stale)).toEqual(days(biweekly))
  })

  it('never overlaps the live dates', () => {
    const withSkip = { ...biweekly, exception_dates: ['2026-10-20', '2026-12-01'] }
    const live = new Set(days(withSkip))
    for (const gap of skippedEntrySeriesDates(withSkip, OCTOBER)) expect(live.has(gap.dayKey)).toBe(false)
  })
})

describe('entryExceptionDays', () => {
  it('normalises what a date[] column can actually hand back', () => {
    expect(entryExceptionDays({ exception_dates: ['2026-11-03', '2026-11-03', '2026-10-20'] })).toEqual([
      '2026-10-20',
      '2026-11-03',
    ])
    expect(entryExceptionDays({ exception_dates: null })).toEqual([])
    expect(entryExceptionDays({ exception_dates: ['2026-11-03T00:00:00.000Z'] })).toEqual(['2026-11-03'])
    expect(entryExceptionDays({ exception_dates: ['nonsense', '2026-02-31'] })).toEqual([])
  })

  it('refuses a day that is not a real calendar day', () => {
    expect(isDayKey('2026-02-31')).toBe(false)
    expect(isDayKey('2026-2-3')).toBe(false)
    expect(isDayKey('2026-02-28')).toBe(true)
  })

  it('adds and removes idempotently', () => {
    expect(withExceptionDay(['2026-11-03'], '2026-11-03')).toEqual(['2026-11-03'])
    expect(withExceptionDay(['2026-11-03'], 'nonsense')).toEqual(['2026-11-03'])
    expect(withoutExceptionDay(['2026-11-03'], '2026-10-20')).toEqual(['2026-11-03'])
    expect(withoutExceptionDay(['2026-11-03'], '2026-11-03')).toEqual([])
  })
})

describe('expandRepeat exceptDays', () => {
  it('counts an excluded landing against COUNT, RFC 5545 order', () => {
    // COUNT bounds the set the RULE generates; the exception subtracts from that set afterwards.
    // So a six-date series with one skip is five dates, not six shifted a fortnight later.
    const rule = parseRepeat('FREQ=WEEKLY;INTERVAL=2;COUNT=4')!
    const through = new Date('2027-01-01T00:00:00.000Z')
    const all = expandRepeat(biweekly.starts_at, rule, { through }).map((d) => d.toISOString().slice(0, 10))
    const minusOne = expandRepeat(biweekly.starts_at, rule, { through, exceptDays: ['2026-10-20'] }).map((d) =>
      d.toISOString().slice(0, 10),
    )
    expect(all).toEqual(['2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17'])
    expect(minusOne).toEqual(['2026-10-06', '2026-11-03', '2026-11-17'])
  })

  it('changes nothing when no day is excluded', () => {
    const rule = parseRepeat('FREQ=DAILY')!
    const through = new Date('2026-10-10T23:59:59.000Z')
    const plain = expandRepeat(biweekly.starts_at, rule, { through })
    expect(expandRepeat(biweekly.starts_at, rule, { through, exceptDays: [] })).toEqual(plain)
    expect(expandRepeat(biweekly.starts_at, rule, { through, exceptDays: null })).toEqual(plain)
  })
})

describe('entryToCalendarItem, one date of a series', () => {
  const fmt: EntryFormatters = {
    timeLabel: (iso) => iso.slice(11, 16),
    whenLabel: (iso) => iso.slice(0, 16),
    dateLabel: (iso) => iso.slice(0, 10),
    instantIso: (iso) => iso,
  }
  const row: EntryRow = {
    id: '11111111-1111-4111-8111-111111111111',
    space_id: '22222222-2222-4222-8222-222222222222',
    kind: 'pencil',
    title: 'Sound bath',
    notes: null,
    location: null,
    all_day: false,
    starts_at: biweekly.starts_at,
    ends_at: biweekly.ends_at,
    time_zone: 'America/Los_Angeles',
    status: 'tentative',
    blocks_time: false,
    visibility: 'team',
    option_group: null,
    hold_expires_at: null,
    stage: 'pencil',
    description: null,
    plan_id: null,
    published_event_id: null,
    recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2',
    exception_dates: ['2026-11-03'],
  }

  it('gives each date its own key and says which day it is', () => {
    const items = expandEntrySeries(row, OCTOBER).map((occurrence) =>
      entryToCalendarItem(row, fmt, { editable: true, occurrence }),
    )
    expect(new Set(items.map((i) => i.slug)).size).toBe(items.length)
    expect(items[0].slug).toBe(`entry-${row.id}-2026-10-06`)
    expect(items.map((i) => i.seriesDayKey)).toEqual(['2026-10-06', '2026-10-20', '2026-11-17', '2026-12-01'])
    expect(items.every((i) => i.entryId === row.id)).toBe(true)
    expect(items.every((i) => i.isSkippedDate === false)).toBe(true)
  })

  it('draws a skipped date struck through and labelled, so the gap can be undone', () => {
    const [gap] = skippedEntrySeriesDates(row, OCTOBER).map((occurrence) =>
      entryToCalendarItem(row, fmt, { editable: true, occurrence }),
    )
    expect(gap.seriesDayKey).toBe('2026-11-03')
    expect(gap.isSkippedDate).toBe(true)
    expect(gap.isCancelled).toBe(true)
    expect(gap.statusLabel).toContain('Skipped')
  })

  it('reads the DATE time, not the anchor time', () => {
    const [, second] = expandEntrySeries(row, OCTOBER).map((occurrence) =>
      entryToCalendarItem(row, fmt, { editable: true, occurrence }),
    )
    expect(second.dayKey).toBe('2026-10-20')
    expect(second.whenLabel.startsWith('2026-10-20')).toBe(true)
  })

  it('leaves a one-off entry exactly as it was', () => {
    const once = entryToCalendarItem({ ...row, recurrence_rule: null, exception_dates: [] }, fmt, { editable: true })
    expect(once.slug).toBe(`entry-${row.id}`)
    expect(once.seriesDayKey).toBeNull()
    expect(once.isSkippedDate).toBe(false)
  })
})
