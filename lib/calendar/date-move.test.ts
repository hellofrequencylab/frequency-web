import { describe, expect, it } from 'vitest'
import { daysBetween, keyboardMoveDelta, planEntryMove, shiftDayKey, withMovedDay } from './date-move'
import type { EntryInput } from './entries'
import type { CalendarEvent } from './item'

// PROG-CAL15. The drop reducer: which day a pick-up lands on, and what a refused move says. Pure, so
// the answer is testable without a grid, a pointer or a browser.

function input(over: Partial<EntryInput> = {}): EntryInput {
  return {
    kind: 'pencil',
    title: 'Open house',
    holdExpiresOn: '',
    candidateDates: [],
    stage: 'pencil',
    description: '',
    notes: '',
    location: '',
    allDay: true,
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    startTime: '09:00',
    endTime: '10:00',
    timeZone: 'UTC',
    status: 'tentative',
    blocksTime: false,
    showPublicly: false,
    planId: 'plan-1',
    repeat: '',
    exceptionDates: [],
    ...over,
  }
}

function pencil(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    slug: 'entry-1',
    title: 'Open house',
    dayKey: '2026-09-20',
    timeLabel: 'All day',
    whenLabel: 'Sun, Sep 20, all day',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'pencil',
    stage: 'pencil',
    entryId: 'entry-1',
    entryInput: input(),
    planId: 'plan-1',
    ...over,
  }
}

const september = { year: 2026, month1: 9 }

describe('day maths', () => {
  it('steps a day key forwards and backwards across a month and a year edge', () => {
    expect(shiftDayKey('2026-09-20', 1)).toBe('2026-09-21')
    expect(shiftDayKey('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('refuses anything that is not a day', () => {
    expect(shiftDayKey('2026-02-30', 1)).toBeNull()
    expect(shiftDayKey('tomorrow', 1)).toBeNull()
    expect(shiftDayKey('2026-09-20', 1.5)).toBeNull()
    expect(daysBetween('2026-09-20', 'nope')).toBeNull()
  })

  it('counts whole days between two days', () => {
    expect(daysBetween('2026-09-20', '2026-09-27')).toBe(7)
    expect(daysBetween('2026-09-20', '2026-09-20')).toBe(0)
    expect(daysBetween('2026-09-20', '2026-09-19')).toBe(-1)
  })
})

describe('the keyboard is the equal path', () => {
  it('moves a day sideways and a week up or down, with Shift held', () => {
    expect(keyboardMoveDelta('ArrowLeft', true)).toBe(-1)
    expect(keyboardMoveDelta('ArrowRight', true)).toBe(1)
    expect(keyboardMoveDelta('ArrowUp', true)).toBe(-7)
    expect(keyboardMoveDelta('ArrowDown', true)).toBe(7)
  })

  it('leaves the bare arrows to the month, and every other key alone', () => {
    expect(keyboardMoveDelta('ArrowRight', false)).toBeNull()
    expect(keyboardMoveDelta('ArrowUp', false)).toBeNull()
    expect(keyboardMoveDelta('Enter', true)).toBeNull()
    expect(keyboardMoveDelta('PageDown', true)).toBeNull()
    expect(keyboardMoveDelta(' ', true)).toBeNull()
  })
})

describe('planEntryMove', () => {
  it('hands back the drawer input on the new day, and the line the console says', () => {
    const move = planEntryMove(pencil(), '2026-09-26', september)
    expect(move.ok).toBe(true)
    if (!move.ok) return
    expect(move.entryId).toBe('entry-1')
    expect(move.fromDayKey).toBe('2026-09-20')
    expect(move.toDayKey).toBe('2026-09-26')
    expect(move.input.startDate).toBe('2026-09-26')
    expect(move.input.endDate).toBe('2026-09-26')
    // Everything else the drawer holds rides along untouched, so the write is an ordinary edit.
    expect(move.input.planId).toBe('plan-1')
    expect(move.input.title).toBe('Open house')
    expect(move.line).toBe('Moved Open house to Sat, Sep 26.')
    expect(move.line).not.toContain('—')
  })

  it('keeps the length of a date that spans days', () => {
    const item = pencil({
      endDayKey: '2026-09-22',
      entryInput: input({ startDate: '2026-09-20', endDate: '2026-09-22' }),
    })
    const move = planEntryMove(item, '2026-09-10', september)
    expect(move.ok && move.input.startDate).toBe('2026-09-10')
    expect(move.ok && move.input.endDate).toBe('2026-09-12')
  })

  it('never carries candidate dates into the move', () => {
    const item = pencil({ entryInput: input({ candidateDates: ['2026-09-25'] }) })
    const move = planEntryMove(item, '2026-09-21', september)
    expect(move.ok && move.input.candidateDates).toEqual([])
  })

  it('refuses a date that is already a published event, and names the door', () => {
    const move = planEntryMove(
      pencil({ entryId: null, entryInput: null, eventId: 'evt-1', layer: 'events', title: 'New moon sit' }),
      '2026-09-26',
      september,
    )
    expect(move.ok).toBe(false)
    expect(!move.ok && move.reason).toBe('published')
    expect(move.line).toBe('New moon sit is a published event now. Open the event to change its date.')
  })

  it('refuses anything that is not an entry at all', () => {
    const move = planEntryMove(pencil({ entryId: null, entryInput: null, layer: 'todos' }), '2026-09-26', september)
    expect(!move.ok && move.reason).toBe('not-an-entry')
    expect(move.line).toBe('Only a Pencil or a Plan date moves this way.')
  })

  it('refuses one occurrence of a repeating Pencil, because it carries the whole series', () => {
    const move = planEntryMove(pencil({ occurrenceDate: '2026-09-20' }), '2026-09-26', september)
    expect(!move.ok && move.reason).toBe('repeats')
    expect(move.line).toContain('repeats')
  })

  it('refuses a drop on the month either side of the one being shown', () => {
    const move = planEntryMove(pencil(), '2026-10-01', september)
    expect(!move.ok && move.reason).toBe('other-month')
    expect(move.line).toBe('Thu, Oct 1 is in another month. Open that month first, then move the date.')
  })

  it('allows the whole month when no month is being shown', () => {
    expect(planEntryMove(pencil(), '2026-10-01').ok).toBe(true)
  })

  it('refuses a drop on the day it is already on, and a day that is not a day', () => {
    expect(planEntryMove(pencil(), '2026-09-20', september).line).toBe('Open house is already on Sun, Sep 20.')
    expect(planEntryMove(pencil(), 'someday', september).line).toBe('That is not a day on this calendar, so nothing moved.')
  })

  it('says something whatever happens: every arm carries a line', () => {
    const tries: CalendarEvent[] = [
      pencil(),
      pencil({ occurrenceDate: '2026-09-20' }),
      pencil({ entryId: null, entryInput: null, eventId: 'evt-1' }),
      pencil({ entryId: null, entryInput: null }),
    ]
    for (const item of tries) {
      for (const day of ['2026-09-26', '2026-09-20', '2026-10-02', 'nope']) {
        const move = planEntryMove(item, day, september)
        expect(move.line.length).toBeGreaterThan(0)
        expect(move.line).not.toContain('—')
      }
    }
  })
})

describe('withMovedDay', () => {
  it('draws the date on its new days until the server confirms it', () => {
    const held = withMovedDay(pencil({ endDayKey: '2026-09-22', entryInput: input({ endDate: '2026-09-22' }) }), '2026-09-27')
    expect(held.dayKey).toBe('2026-09-27')
    expect(held.endDayKey).toBe('2026-09-29')
    expect(held.entryInput?.startDate).toBe('2026-09-27')
    expect(held.entryInput?.endDate).toBe('2026-09-29')
  })

  it('leaves an item it cannot move alone, by identity', () => {
    const item = pencil()
    expect(withMovedDay(item, '2026-09-20')).toBe(item)
    expect(withMovedDay(item, 'nope')).toBe(item)
  })
})
