import { describe, it, expect } from 'vitest'
import { monthMatrix, monthLabel, addMonth, eventDayKey, WEEKDAY_LABELS, calendarChrome, cellFloorClass, HOST_DRAWN_CONTROL_MARKS, SHORT_MONTH_LABELS } from './calendar-grid'

describe('monthLabel', () => {
  it('names the month and year', () => {
    expect(monthLabel(2026, 7)).toBe('July 2026')
    expect(monthLabel(2026, 1)).toBe('January 2026')
    expect(monthLabel(2026, 12)).toBe('December 2026')
  })
})

describe('addMonth', () => {
  it('advances and rewinds within a year', () => {
    expect(addMonth(2026, 7, 1)).toEqual({ year: 2026, month1: 8 })
    expect(addMonth(2026, 7, -1)).toEqual({ year: 2026, month1: 6 })
  })
  it('rolls across year boundaries in both directions', () => {
    expect(addMonth(2026, 12, 1)).toEqual({ year: 2027, month1: 1 })
    expect(addMonth(2026, 1, -1)).toEqual({ year: 2025, month1: 12 })
    expect(addMonth(2026, 3, -5)).toEqual({ year: 2025, month1: 10 })
  })
})

describe('monthMatrix', () => {
  it('builds full 7-day weeks starting Sunday', () => {
    const weeks = monthMatrix(2026, 7) // July 2026: 1st is a Wednesday
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    // First row starts on a Sunday: 2026-06-28 (the Sunday before Wed 07-01).
    expect(weeks[0][0].date).toBe('2026-06-28')
    expect(weeks[0][0].inMonth).toBe(false)
    // Wednesday 07-01 sits in column 3 (Sun=0).
    const wed = weeks[0][3]
    expect(wed.date).toBe('2026-07-01')
    expect(wed.inMonth).toBe(true)
  })

  it('marks leading/trailing pad days as out-of-month and the month days in-month', () => {
    const weeks = monthMatrix(2026, 7)
    const flat = weeks.flat()
    expect(flat.filter((c) => c.inMonth)).toHaveLength(31) // July has 31 days
    expect(flat.find((c) => c.date === '2026-07-31')!.inMonth).toBe(true)
    expect(flat.find((c) => c.date === '2026-08-01')!.inMonth).toBe(false)
    // The last row ends on a Saturday.
    const lastRow = weeks[weeks.length - 1]
    expect(lastRow[6].date >= '2026-07-31').toBe(true)
  })

  it('handles February in a non-leap year', () => {
    const weeks = monthMatrix(2027, 2) // Feb 2027, 28 days
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(28)
  })

  it('handles a leap-year February', () => {
    const weeks = monthMatrix(2028, 2) // Feb 2028, 29 days
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(29)
    expect(weeks.flat().find((c) => c.date === '2028-02-29')!.inMonth).toBe(true)
  })

  it('is contiguous (no gaps or repeats across week boundaries)', () => {
    const flat = monthMatrix(2026, 12).flat().map((c) => c.date)
    for (let i = 1; i < flat.length; i++) {
      const prev = new Date(`${flat[i - 1]}T00:00:00Z`).getTime()
      const cur = new Date(`${flat[i]}T00:00:00Z`).getTime()
      expect(cur - prev).toBe(86_400_000)
    }
  })
})

describe('eventDayKey', () => {
  it('reads the date portion of the stored start (the event-local day)', () => {
    expect(eventDayKey('2026-07-20T19:00:00Z')).toBe('2026-07-20')
    expect(eventDayKey('2026-07-20T19:00:00+00:00')).toBe('2026-07-20')
  })
  it('returns null for a missing/invalid start', () => {
    expect(eventDayKey(null)).toBeNull()
    expect(eventDayKey(undefined)).toBeNull()
    expect(eventDayKey('not-a-date')).toBeNull()
  })
})

describe('WEEKDAY_LABELS', () => {
  it('is a Sunday-first week of 7', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7)
    expect(WEEKDAY_LABELS[0]).toBe('Sun')
    expect(WEEKDAY_LABELS[6]).toBe('Sat')
  })
})

// THE GRID'S HOST DECISIONS (PROG-CAL13, LIVE-475, widened by LIVE-485). Pure, so both the
// component and the backlog probe that guards them read the same function rather than the same
// spelling.
describe('calendarChrome', () => {
  it('draws everything on the page', () => {
    expect(calendarChrome(false)).toEqual({
      monthTitle: true,
      paging: true,
      viewSwitch: true,
      monthJump: true,
      layerFilters: true,
    })
  })

  // 🔴 THE RULE THE CONSOLE DEAD END TAUGHT (LIVE-475): a host may only take a control it actually
  // draws. It used to be enforced by KEEPING the switcher and the jump in both modes, because no
  // host drew them. The console header draws all five now (LIVE-485), so all five come off, and
  // HOST_DRAWN_CONTROL_MARKS is what keeps "the host draws it" honest: every control this gives up
  // names the marker the console header has to carry, and the LIVE-478 probe checks it is there.
  it('gives up every control to a host, and names the marker that host must carry', () => {
    const chrome = calendarChrome(true)
    expect(chrome).toEqual({
      monthTitle: false,
      paging: false,
      viewSwitch: false,
      monthJump: false,
      layerFilters: false,
    })
    // Nothing is taken away without a marker to point at.
    for (const key of Object.keys(chrome) as (keyof typeof chrome)[]) {
      expect(HOST_DRAWN_CONTROL_MARKS[key], key).toMatch(/^data-calendar-console-/)
    }
  })
})

describe('cellFloorClass', () => {
  it('has no floor when the grid fills its host', () => {
    expect(cellFloorClass(true)).toBe('min-h-0')
    expect(/min-h-(?!0\b)[\w.[\]]+/.test(cellFloorClass(true))).toBe(false)
  })

  it('keeps a floor when the grid sizes to its own content', () => {
    expect(cellFloorClass(false)).toContain('min-h-20')
    expect(cellFloorClass(false)).toContain('sm:min-h-28')
  })
})

describe('SHORT_MONTH_LABELS', () => {
  it('is the twelve months, once, so the grid jump and the console jump read the same list', () => {
    expect(SHORT_MONTH_LABELS.length).toBe(12)
    expect(SHORT_MONTH_LABELS[0]).toBe('Jan')
    expect(SHORT_MONTH_LABELS[11]).toBe('Dec')
  })
})
