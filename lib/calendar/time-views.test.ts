import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import {
  addDays,
  clockMinutes,
  layoutDay,
  nowOffsetMin,
  parseTimeView,
  timelineWindow,
  weekDayKeys,
  weekStart,
} from './time-views'

function ev(over: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'dayKey' | 'timeLabel'>): CalendarEvent {
  return {
    title: over.slug,
    whenLabel: '',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

describe('day keys (LIVE-1178)', () => {
  it('starts the week on Monday', () => {
    // 2026-10-26 is a Monday; 2026-10-25 is the Sunday before it.
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekDayKeys('2026-10-28')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })
  it('steps across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('clock labels', () => {
  it('reads the server short time', () => {
    expect(clockMinutes('7:00 PM')).toBe(19 * 60)
    expect(clockMinutes('12:30 AM')).toBe(30)
    expect(clockMinutes('12:00 PM')).toBe(12 * 60)
    expect(clockMinutes('9 am')).toBe(9 * 60)
  })
  it('refuses labels that are not a clock time', () => {
    expect(clockMinutes('All day')).toBeNull()
    expect(clockMinutes('To-do')).toBeNull()
    expect(clockMinutes(null)).toBeNull()
  })
})

describe('layoutDay', () => {
  const day = '2026-10-27'
  it('puts all-day runs, to-dos and multi-day items in the all-day row', () => {
    const out = layoutDay(
      [
        ev({ slug: 'retreat', dayKey: '2026-10-26', endDayKey: '2026-10-28', timeLabel: '9:00 AM' }),
        ev({ slug: 'todo', dayKey: day, timeLabel: 'To-do', layer: 'todos' }),
        ev({ slug: 'yoga', dayKey: day, timeLabel: '6:00 PM', endTimeLabel: '7:00 PM' }),
      ],
      day,
    )
    expect(out.allDay.map((i) => i.slug).sort()).toEqual(['retreat', 'todo'])
    expect(out.timed.map((b) => b.item.slug)).toEqual(['yoga'])
  })

  it('gives an item with no end an hour', () => {
    const [b] = layoutDay([ev({ slug: 'a', dayKey: day, timeLabel: '10:00 AM' })], day).timed
    expect(b.endMin - b.startMin).toBe(60)
  })

  it('shares lanes between overlaps and gives separate clusters the full width', () => {
    const { timed } = layoutDay(
      [
        ev({ slug: 'a', dayKey: day, timeLabel: '10:00 AM', endTimeLabel: '12:00 PM' }),
        ev({ slug: 'b', dayKey: day, timeLabel: '11:00 AM', endTimeLabel: '1:00 PM' }),
        ev({ slug: 'c', dayKey: day, timeLabel: '3:00 PM', endTimeLabel: '4:00 PM' }),
      ],
      day,
    )
    const by = Object.fromEntries(timed.map((t) => [t.item.slug, t]))
    expect([by.a.lane, by.b.lane]).toEqual([0, 1])
    expect([by.a.lanes, by.b.lanes]).toEqual([2, 2])
    expect([by.c.lane, by.c.lanes]).toEqual([0, 1])
  })

  it('reuses a lane once its block has ended', () => {
    const { timed } = layoutDay(
      [
        ev({ slug: 'a', dayKey: day, timeLabel: '10:00 AM', endTimeLabel: '11:00 AM' }),
        ev({ slug: 'b', dayKey: day, timeLabel: '10:30 AM', endTimeLabel: '12:00 PM' }),
        ev({ slug: 'c', dayKey: day, timeLabel: '11:00 AM', endTimeLabel: '11:30 AM' }),
      ],
      day,
    )
    const by = Object.fromEntries(timed.map((t) => [t.item.slug, t]))
    expect(by.c.lane).toBe(0)
    expect(by.a.lanes).toBe(2)
  })

  it('clamps an item outside 7 AM to 11 PM onto the grid', () => {
    const { timed } = layoutDay([ev({ slug: 'late', dayKey: day, timeLabel: '11:30 PM' })], day)
    expect(timed[0].startMin).toBeLessThan(23 * 60)
    expect(timed[0].endMin).toBe(23 * 60)
    const early = layoutDay([ev({ slug: 'early', dayKey: day, timeLabel: '5:00 AM' })], day).timed[0]
    expect(early.startMin).toBe(7 * 60)
  })
})

describe('now line', () => {
  it('draws only inside the grid hours', () => {
    expect(nowOffsetMin(6 * 60)).toBeNull()
    expect(nowOffsetMin(7 * 60)).toBe(0)
    expect(nowOffsetMin(12 * 60)).toBe(5 * 60)
    expect(nowOffsetMin(23 * 60 + 1)).toBeNull()
  })
})

describe('timeline', () => {
  const plans = [{ id: 'p1', title: 'Autumn retreat', stage: 'planning' as const }]
  const today = '2026-10-27'
  it('spans nine weeks from last Monday', () => {
    const win = timelineWindow([], plans, today, today)
    expect(win.startDay).toBe('2026-10-19')
    expect(win.days).toBe(63)
    expect(win.weekTicks).toHaveLength(9)
    expect(win.todayPct).not.toBeNull()
  })

  it('groups dates and to-dos under their Plan and marks overdue to-dos', () => {
    const win = timelineWindow(
      [
        ev({ slug: 'a', dayKey: '2026-11-02', timeLabel: '6:00 PM', planId: 'p1' }),
        ev({ slug: 'b', dayKey: '2026-11-09', timeLabel: '6:00 PM', planId: 'p1' }),
        ev({ slug: 't1', dayKey: '2026-10-22', timeLabel: 'To-do', layer: 'todos', planId: 'p1' }),
        ev({ slug: 't2', dayKey: '2026-11-03', timeLabel: 'To-do', layer: 'todos', planId: 'p1' }),
        ev({ slug: 'solo', dayKey: '2026-11-05', timeLabel: '1:00 PM' }),
        ev({ slug: 'loose', dayKey: '2026-11-04', timeLabel: 'To-do', layer: 'todos' }),
        ev({ slug: 'far', dayKey: '2027-06-01', timeLabel: '1:00 PM', planId: 'p1' }),
      ],
      plans,
      today,
      today,
    )
    expect(win.rows.map((r) => r.key)).toEqual(['plan-p1', 'item-solo', 'loose-todos'])
    const row = win.rows[0]
    expect(row.title).toBe('Autumn retreat')
    expect(row.dates.map((d) => d.item.slug)).toEqual(['a', 'b'])
    expect(row.todos.map((t) => [t.item.slug, t.overdue])).toEqual([['t1', true], ['t2', false]])
  })

  it('leaves out hidden layers', () => {
    const win = timelineWindow(
      [ev({ slug: 't', dayKey: '2026-11-03', timeLabel: 'To-do', layer: 'todos' })],
      [],
      today,
      today,
      new Set(['todos']),
    )
    expect(win.rows).toEqual([])
  })
})

describe('parseTimeView', () => {
  it('accepts day, week and timeline only', () => {
    expect(parseTimeView('week')).toBe('week')
    expect(parseTimeView(['timeline'])).toBe('timeline')
    expect(parseTimeView('month')).toBeNull()
    expect(parseTimeView(undefined)).toBeNull()
  })
})
