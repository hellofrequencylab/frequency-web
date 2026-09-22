import { describe, it, expect } from 'vitest'
import { availabilityWindow, busyDayKeysFor } from './availability'
import { suggestDates } from './vera-plan'
import type { DayNote } from './day-notes'

// THE MAPPING FROM ROWS TO BUSY DAYS (PROG-CAL6). Pinned here because the library it feeds
// (`suggestDates`) was always correct and the product handed it nothing: an empty busy set is
// indistinguishable from a free calendar unless the derivation itself is under test.

const WINDOW = { fromDay: '2026-10-01', toDay: '2026-10-31' }

const entry = (starts: string, ends: string, over: Partial<{ all_day: boolean; status: string }> = {}) => ({
  starts_at: starts,
  ends_at: ends,
  all_day: over.all_day ?? false,
  status: (over.status ?? 'tentative') as 'confirmed' | 'tentative' | 'cancelled',
})

describe('busyDayKeysFor', () => {
  it('a Pencil claims its day, an all-day Unavailable span claims every day of it', () => {
    const keys = busyDayKeysFor({
      ...WINDOW,
      entries: [
        entry('2026-10-04T19:00:00Z', '2026-10-04T21:00:00Z'),
        entry('2026-10-10T00:00:00Z', '2026-10-13T00:00:00Z', { all_day: true }),
      ],
      events: [],
      dayNotes: [],
    })
    expect(keys).toEqual(['2026-10-04', '2026-10-10', '2026-10-11', '2026-10-12'])
  })

  it('a cancelled entry and a cancelled event claim nothing', () => {
    const keys = busyDayKeysFor({
      ...WINDOW,
      entries: [entry('2026-10-04T19:00:00Z', '2026-10-04T21:00:00Z', { status: 'cancelled' })],
      events: [{ starts_at: '2026-10-05T19:00:00', ends_at: null, is_cancelled: true }],
      dayNotes: [],
    })
    expect(keys).toEqual([])
  })

  it('an event claims its start day, and its end day when it has one', () => {
    const keys = busyDayKeysFor({
      ...WINDOW,
      entries: [],
      events: [
        { starts_at: '2026-10-05T19:00:00', ends_at: null, is_cancelled: false },
        { starts_at: '2026-10-17T09:00:00', ends_at: '2026-10-18T17:00:00', is_cancelled: null },
      ],
      dayNotes: [],
    })
    expect(keys).toEqual(['2026-10-05', '2026-10-17', '2026-10-18'])
  })

  it('a weekly day note claims each matching weekday inside the window, a dated one its range', () => {
    const notes: DayNote[] = [
      { id: 'n1', label: 'Quiet hours', weekdays: [1], startsOn: null, endsOn: null },
      { id: 'n2', label: 'Retreat', weekdays: null, startsOn: '2026-10-23', endsOn: '2026-10-24' },
    ]
    const keys = busyDayKeysFor({ ...WINDOW, entries: [], events: [], dayNotes: notes })
    // Mondays in October 2026: 5, 12, 19, 26.
    expect(keys).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-23', '2026-10-24', '2026-10-26'])
  })

  it('days outside the window are dropped and duplicates collapse', () => {
    const keys = busyDayKeysFor({
      ...WINDOW,
      entries: [entry('2026-09-30T19:00:00Z', '2026-09-30T21:00:00Z'), entry('2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z')],
      events: [{ starts_at: '2026-10-04T19:00:00', ends_at: null, is_cancelled: false }],
      dayNotes: [],
    })
    expect(keys).toEqual(['2026-10-04'])
  })

  it('the keys it produces are the keys suggestDates skips', () => {
    const busyDayKeys = busyDayKeysFor({
      ...WINDOW,
      entries: [entry('2026-10-04T19:00:00Z', '2026-10-04T21:00:00Z')],
      events: [{ starts_at: '2026-10-11T19:00:00', ends_at: null, is_cancelled: false }],
      dayNotes: [{ id: 'n', label: 'Closed', weekdays: null, startsOn: '2026-10-18', endsOn: '2026-10-18' }],
    })
    // Sundays after Oct 1: 4 (Pencil), 11 (event), 18 (note), 25.
    expect(suggestDates({ busyDayKeys, preferredWeekdays: [0], fromDayKey: '2026-10-01', count: 1 })).toEqual(['2026-10-25'])
  })
})

describe('availabilityWindow', () => {
  it('is [fromDay, fromDay + days) so it lines up with the entry store read', () => {
    expect(availabilityWindow('2026-10-01', 90)).toEqual({ fromDay: '2026-10-01', toDay: '2026-12-30' })
    expect(availabilityWindow('not-a-day')).toEqual({ fromDay: 'not-a-day', toDay: 'not-a-day' })
  })
})
