import { describe, it, expect } from 'vitest'
import { computeOccurrenceDates, expandOccurrenceInstants } from './event-recurrence'

// F1: monthly recurrence must NOT overflow for day-29/30/31 anchors. The old
// setUTCMonth(+1) turned Jan 31 → Mar 3 (skipping Feb entirely). The fix counts
// whole months from the series start and clamps the day to the target month's
// length, so each occurrence lands on the right calendar month.

const day = (d: Date) => d.toISOString().slice(0, 10)

// The horizon is `now + horizonDays`, so for fixed future-dated anchors we pass a
// horizon comfortably past every asserted occurrence; recurrence_until is the real
// stop bound under test.
const FAR = 5000

describe('computeOccurrenceDates — monthly day-clamping (F1)', () => {
  it('clamps a Jan-31 anchor to Feb 28/29, Mar 31, Apr 30, … (no Feb skip)', () => {
    // 2027 (non-leap) → Feb 28.
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T09:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-06-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    expect(days).toEqual([
      '2027-02-28', // clamped (Feb has 28 days in 2027), NOT overflowed into March
      '2027-03-31', // back to the original day where the month allows it
      '2027-04-30', // clamped (April has 30)
      '2027-05-31',
      '2027-06-30', // clamped + stops at recurrence_until
    ])
  })

  it('does not accumulate drift: a short month never shortens a later one', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T00:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-04-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // March must be the 31st (original day), proving Feb's clamp didn't carry forward.
    expect(days).toContain('2027-03-31')
  })

  it('handles a Feb-29 leap anchor — only Februaries with a 29th keep the 29', () => {
    // 2028 is a leap year. Anchor on Feb 29, 2028.
    const dates = computeOccurrenceDates(
      { starts_at: '2028-02-29T12:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2029-02-28T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // Mar 29, Apr 29 … (clamped to 28/30 where needed), and the next Feb (2029, non-leap)
    // clamps to the 28th — never overflows into March.
    expect(days[0]).toBe('2028-03-29')
    expect(days).toContain('2028-04-29')
    expect(days).toContain('2029-02-28') // 2029 Feb has no 29th → clamped, not skipped
    expect(days.some((d) => d.startsWith('2029-03'))).toBe(false) // never overflowed past the Feb cap
  })

  it('preserves the anchor time-of-day on each monthly occurrence', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-15T17:30:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-03-31T23:59:59.000Z' },
      FAR,
    )
    expect(dates[0].toISOString()).toBe('2027-02-15T17:30:00.000Z')
  })
})

describe('computeOccurrenceDates — daily/weekly unchanged (regression)', () => {
  it('daily advances one calendar day at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: '2027-01-04T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('weekly advances seven days at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-29T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29'])
  })

  it('returns nothing for a non-recurring anchor', () => {
    expect(
      computeOccurrenceDates({ starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null }),
    ).toEqual([])
  })
})

describe('expandOccurrenceInstants — Date.now()-independent expansion to an explicit bound', () => {
  it('expands from step 1 up to and INCLUDING the untilInstant', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: null },
      new Date('2027-01-04T08:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('stops at recurrence_until even when the bound is later', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-15T23:59:59.000Z' },
      new Date('2027-03-01T00:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15'])
  })

  it('returns [] for a non-recurring anchor', () => {
    expect(
      expandOccurrenceInstants(
        { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null },
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toEqual([])
  })
})
