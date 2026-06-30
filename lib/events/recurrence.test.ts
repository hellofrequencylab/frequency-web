import { describe, it, expect } from 'vitest'
import { nextOccurrence, recurrenceLabel, validateRecurrenceUntil } from './recurrence'

// nextOccurrence is the read-side helper that keeps a recurring event in
// "upcoming" once its anchor date has passed: it returns the next date the
// series lands on, at or after `now`, respecting `recurrence_until`.

const iso = (d: Date | null) => (d ? d.toISOString() : null)

describe('recurrenceLabel', () => {
  it('returns a plain-voice label per cadence, null for none', () => {
    expect(recurrenceLabel('daily')).toBe('Repeats daily')
    expect(recurrenceLabel('weekly')).toBe('Repeats weekly')
    expect(recurrenceLabel('monthly')).toBe('Repeats monthly')
    expect(recurrenceLabel('none')).toBeNull()
    expect(recurrenceLabel(null)).toBeNull()
    expect(recurrenceLabel(undefined)).toBeNull()
  })
})

describe('nextOccurrence — non-recurring + edge cases', () => {
  it('returns null for a one-time event', () => {
    expect(
      nextOccurrence(
        { startsAt: '2027-01-01T08:00:00.000Z', recurrenceType: 'none', recurrenceUntil: null },
        new Date('2026-12-01T00:00:00.000Z'),
      ),
    ).toBeNull()
  })

  it('returns null for an unparseable anchor date', () => {
    expect(
      nextOccurrence({ startsAt: 'not-a-date', recurrenceType: 'weekly' }, new Date('2027-01-01T00:00:00.000Z')),
    ).toBeNull()
  })

  it('returns the anchor itself when the anchor is still in the future', () => {
    const next = nextOccurrence(
      { startsAt: '2027-06-01T19:00:00.000Z', recurrenceType: 'weekly', recurrenceUntil: null },
      new Date('2027-05-01T00:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-06-01T19:00:00.000Z')
  })
})

describe('nextOccurrence — daily', () => {
  it('returns the next day once the anchor has passed', () => {
    // Anchor Jan 1 08:00; now Jan 3 09:00 -> next is Jan 4 08:00.
    const next = nextOccurrence(
      { startsAt: '2027-01-01T08:00:00.000Z', recurrenceType: 'daily', recurrenceUntil: null },
      new Date('2027-01-03T09:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-01-04T08:00:00.000Z')
  })

  it('returns today\'s occurrence when now is just before its time', () => {
    const next = nextOccurrence(
      { startsAt: '2027-01-01T08:00:00.000Z', recurrenceType: 'daily', recurrenceUntil: null },
      new Date('2027-01-03T07:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-01-03T08:00:00.000Z')
  })
})

describe('nextOccurrence — weekly', () => {
  it('jumps to the next weekly slot after the anchor passes', () => {
    // Anchor Jan 1 (Fri) 19:00; now Jan 10 -> next weekly is Jan 15.
    const next = nextOccurrence(
      { startsAt: '2027-01-01T19:00:00.000Z', recurrenceType: 'weekly', recurrenceUntil: null },
      new Date('2027-01-10T00:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-01-15T19:00:00.000Z')
  })
})

describe('nextOccurrence — monthly (day clamping)', () => {
  it('clamps a Jan-31 anchor to the next month length', () => {
    // Anchor Jan 31; now mid-Feb -> next is Feb 28 (2027 non-leap), clamped.
    const next = nextOccurrence(
      { startsAt: '2027-01-31T09:00:00.000Z', recurrenceType: 'monthly', recurrenceUntil: null },
      new Date('2027-02-10T00:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-02-28T09:00:00.000Z')
  })

  it('returns the original day where the month allows it', () => {
    const next = nextOccurrence(
      { startsAt: '2027-01-31T09:00:00.000Z', recurrenceType: 'monthly', recurrenceUntil: null },
      new Date('2027-03-01T00:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-03-31T09:00:00.000Z')
  })
})

describe('nextOccurrence — respects recurrence_until', () => {
  it('returns null once the next occurrence would fall past until', () => {
    // Weekly anchor; until Jan 20; now Jan 21 -> series is over.
    const next = nextOccurrence(
      {
        startsAt: '2027-01-01T19:00:00.000Z',
        recurrenceType: 'weekly',
        recurrenceUntil: '2027-01-20T23:59:59.000Z',
      },
      new Date('2027-01-21T00:00:00.000Z'),
    )
    expect(next).toBeNull()
  })

  it('returns the last valid occurrence when it is still within until', () => {
    // Weekly anchor Jan 1; until Jan 20; now Jan 16 -> Jan 22 is past until,
    // but Jan 15 already passed, so the only candidate >= now within until... none.
    // Use a now that lands exactly between Jan 15 and the until cutoff with Jan 15
    // still ahead: now Jan 9 -> Jan 15 (within until Jan 20).
    const next = nextOccurrence(
      {
        startsAt: '2027-01-01T19:00:00.000Z',
        recurrenceType: 'weekly',
        recurrenceUntil: '2027-01-20T23:59:59.000Z',
      },
      new Date('2027-01-09T00:00:00.000Z'),
    )
    expect(iso(next)).toBe('2027-01-15T19:00:00.000Z')
  })
})

describe('validateRecurrenceUntil', () => {
  it('allows a non-recurring event regardless of until', () => {
    expect(validateRecurrenceUntil('none', '2027-01-01T19:00:00.000Z', '2020-01-01T00:00:00.000Z')).toBeNull()
  })

  it('allows an indefinite recurring event (blank until)', () => {
    expect(validateRecurrenceUntil('weekly', '2027-01-01T19:00:00.000Z', null)).toBeNull()
    expect(validateRecurrenceUntil('weekly', '2027-01-01T19:00:00.000Z', '')).toBeNull()
  })

  it('rejects an until at or before the start', () => {
    expect(
      validateRecurrenceUntil('weekly', '2027-01-10T19:00:00.000Z', '2027-01-10T19:00:00.000Z'),
    ).toMatch(/after the start/)
    expect(
      validateRecurrenceUntil('weekly', '2027-01-10T19:00:00.000Z', '2027-01-01T00:00:00.000Z'),
    ).toMatch(/after the start/)
  })

  it('accepts an until after the start', () => {
    expect(validateRecurrenceUntil('weekly', '2027-01-01T19:00:00.000Z', '2027-03-01T00:00:00.000Z')).toBeNull()
  })

  it('rejects an unparseable until', () => {
    expect(validateRecurrenceUntil('daily', '2027-01-01T19:00:00.000Z', 'whenever')).toMatch(/valid date/)
  })
})
