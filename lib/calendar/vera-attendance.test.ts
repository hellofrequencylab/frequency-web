import { afterEach, describe, expect, it } from 'vitest'
import { attendanceHistory, attendanceHistoryWords, hourWords, slotWords, wallClockSlot } from './vera-attendance'

// DATES FROM WHAT HAPPENED (PROG-CAL11 slice 4, LIVE-539). The fold behind Vera's attendance_history
// tool: which weekday and starting hour drew the most people to THIS Space, read off the stored
// wall clock, with an unrecorded event left out rather than counted as empty.

const PACIFIC = 'America/Los_Angeles'
const previousZone = process.env.TZ

afterEach(() => {
  if (previousZone === undefined) delete process.env.TZ
  else process.env.TZ = previousZone
})

describe('wallClockSlot', () => {
  it('reads the weekday and hour off the stored digits, whatever zone the machine runs in', () => {
    // A naive ISO through `new Date(string)` is LOCAL, so west of UTC a late Saturday would become
    // a Sunday at the parse. The zone is forced so the case fails on CI (UTC) too if that creeps in.
    process.env.TZ = PACIFIC
    expect(wallClockSlot('2026-09-05T23:30:00')).toEqual({ weekday: 6, hour: 23 })
    expect(wallClockSlot('2026-09-06 00:15:00')).toEqual({ weekday: 0, hour: 0 })
    expect(wallClockSlot('2026-09-05T19:00:00+00:00')).toEqual({ weekday: 6, hour: 19 })
  })

  it('refuses what is not a wall clock', () => {
    expect(wallClockSlot(null)).toBeNull()
    expect(wallClockSlot('')).toBeNull()
    expect(wallClockSlot('2026-09-05')).toBeNull()
    expect(wallClockSlot('soon')).toBeNull()
    expect(wallClockSlot('2026-02-30T19:00:00')).toBeNull()
    expect(wallClockSlot('2026-09-05T25:00:00')).toBeNull()
  })
})

describe('attendanceHistory', () => {
  const rows = [
    { startsAt: '2026-09-05T19:00:00', attendance: 12 }, // Saturday 7 PM
    { startsAt: '2026-09-08T18:00:00', attendance: 3 }, // Tuesday 6 PM
    { startsAt: '2026-09-12T19:00:00', attendance: 9 }, // Saturday 7 PM
    { startsAt: '2026-09-16T10:00:00', attendance: null }, // Wednesday, no record
  ]

  it('prefers the weekday that drew the most people, and the hour within it', () => {
    const h = attendanceHistory(rows)
    expect(h.recordedEvents).toBe(3)
    expect(h.best).toEqual({ weekday: 6, hour: 19, people: 21, events: 2 })
    expect(h.byWeekday).toEqual([
      { weekday: 6, events: 2, people: 21 },
      { weekday: 2, events: 1, people: 3 },
    ])
    expect(h.byHour).toEqual([
      { hour: 19, events: 2, people: 21 },
      { hour: 18, events: 1, people: 3 },
    ])
  })

  it('an unrecorded event is left out, not counted as nobody', () => {
    // Wednesday carries no record: it appears in no bucket, so it cannot outrank or drag anything.
    const h = attendanceHistory(rows)
    expect(h.byWeekday.find((w) => w.weekday === 3)).toBeUndefined()
    expect(h.byHour.find((x) => x.hour === 10)).toBeUndefined()
  })

  it('answers null when nothing has a record, never a weekday nobody came on', () => {
    expect(attendanceHistory([])).toEqual({ recordedEvents: 0, best: null, byWeekday: [], byHour: [] })
    const h = attendanceHistory([
      { startsAt: '2026-09-05T19:00:00', attendance: null },
      { startsAt: null, attendance: 4 },
      { startsAt: 'someday', attendance: 4 },
      { startsAt: '2026-09-05T19:00:00', attendance: -1 },
    ])
    expect(h.best).toBeNull()
    expect(h.recordedEvents).toBe(0)
  })

  it('the best hour is the best hour of the best weekday, not the busiest hour of the week', () => {
    const h = attendanceHistory([
      { startsAt: '2026-09-05T10:00:00', attendance: 15 }, // Saturday 10 AM
      { startsAt: '2026-09-06T19:00:00', attendance: 8 }, // Sunday 7 PM
      { startsAt: '2026-09-07T19:00:00', attendance: 8 }, // Monday 7 PM
    ])
    // Across the week 7 PM drew 16 and 10 AM drew 15, but Saturday is the weekday that drew the
    // most, and on Saturdays the hour is 10 AM. One answer, not two that contradict each other.
    expect(h.byHour[0]).toEqual({ hour: 19, events: 2, people: 16 })
    expect(h.best).toEqual({ weekday: 6, hour: 10, people: 15, events: 1 })
  })

  it('breaks a tie on people by events, then by the earlier slot, so the order is stable', () => {
    const h = attendanceHistory([
      { startsAt: '2026-09-08T19:00:00', attendance: 10 }, // Tuesday, one event
      { startsAt: '2026-09-07T19:00:00', attendance: 5 }, // Monday, two events
      { startsAt: '2026-09-14T19:00:00', attendance: 5 },
      { startsAt: '2026-09-10T19:00:00', attendance: 10 }, // Thursday, one event
    ])
    expect(h.byWeekday.map((w) => w.weekday)).toEqual([1, 2, 4])
    expect(h.best?.weekday).toBe(1)
  })

  it('reads the stored wall clock in any machine zone', () => {
    process.env.TZ = PACIFIC
    const h = attendanceHistory([{ startsAt: '2026-09-05T23:30:00', attendance: 5 }])
    expect(h.best).toEqual({ weekday: 6, hour: 23, people: 5, events: 1 })
  })
})

describe('the words', () => {
  it('spell the hour the way the proposal line does', () => {
    expect(hourWords(0)).toBe('12 AM')
    expect(hourWords(7)).toBe('7 AM')
    expect(hourWords(12)).toBe('12 PM')
    expect(hourWords(19)).toBe('7 PM')
    expect(slotWords({ weekday: 6, hour: 19 })).toBe('Saturdays at 7 PM')
  })

  it('state the count the preference rests on, and say plainly when there is none', () => {
    expect(attendanceHistoryWords(attendanceHistory([
      { startsAt: '2026-09-05T19:00:00', attendance: 12 },
      { startsAt: '2026-09-12T19:00:00', attendance: 9 },
    ]))).toBe('Saturdays at 7 PM have drawn the most people here: 21 over 2 events.')
    expect(attendanceHistoryWords(attendanceHistory([{ startsAt: '2026-09-08T18:00:00', attendance: 3 }]))).toBe(
      'Tuesdays at 6 PM have drawn the most people here: 3 over 1 event.',
    )
    const none = attendanceHistoryWords(attendanceHistory([]))
    expect(none).toContain('No attendance has been recorded here yet')
    for (const s of [none, attendanceHistoryWords(attendanceHistory([{ startsAt: '2026-09-05T19:00:00', attendance: 1 }]))]) {
      expect(s).not.toMatch(/[–—!]/)
    }
  })
})
