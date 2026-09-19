import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import { monthTimelineBars, monthTimelineDays } from './month-timeline'

function item(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title' | 'dayKey'>): CalendarEvent {
  return {
    timeLabel: '7:00 PM',
    whenLabel: `Sat, ${partial.dayKey}, 7:00 PM PDT`,
    startInstantIso: `${partial.dayKey}T19:00:00.000Z`,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...partial,
  }
}

describe('monthTimelineDays', () => {
  it('lays September 2026 as 30 day columns with today marked', () => {
    const days = monthTimelineDays(2026, 9, '2026-09-19')
    expect(days).toHaveLength(30)
    expect(days[0]).toMatchObject({ dayKey: '2026-09-01', day: 1, weekday: 'Tue', isToday: false })
    expect(days[18]).toMatchObject({ dayKey: '2026-09-19', isToday: true })
    expect(days[29]?.dayKey).toBe('2026-09-30')
  })
})

describe('monthTimelineBars', () => {
  it('clips a spanning gathering to the month and drops items outside it', () => {
    const bars = monthTimelineBars(
      [
        item({ slug: 'sit', title: 'New moon sit', dayKey: '2026-09-22' }),
        item({ slug: 'retreat', title: 'Retreat', dayKey: '2026-08-30', endDayKey: '2026-09-03' }),
        item({ slug: 'later', title: 'October sit', dayKey: '2026-10-02' }),
        item({ slug: 'staff', title: 'Staff meeting', dayKey: '2026-09-10', layer: 'private' }),
      ],
      2026,
      9,
    )
    expect(bars.map((b) => b.title)).toEqual(['Retreat', 'New moon sit'])
    expect(bars[0]).toMatchObject({ startCol: 1, span: 3 })
    expect(bars[1]).toMatchObject({ startCol: 22, span: 1, timeLabel: '7:00 PM' })
  })
})
