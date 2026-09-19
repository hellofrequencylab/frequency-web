import { describe, it, expect } from 'vitest'
import { stackDay } from './sunday-stack'
import type { CalendarEvent } from './item'

function item(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title' | 'dayKey'>): CalendarEvent {
  return {
    timeLabel: '7:00 PM',
    whenLabel: 'When',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...partial,
  }
}

describe('stackDay', () => {
  it('groups three Sunday items as one stacked block', () => {
    const stacked = stackDay([
      item({ slug: 'a', title: 'Ceremony', dayKey: '2026-10-04' }),
      item({ slug: 'b', title: 'Lunch', dayKey: '2026-10-04' }),
      item({ slug: 'c', title: 'Workshop', dayKey: '2026-10-04' }),
      item({ slug: 'd', title: 'Monday', dayKey: '2026-10-05' }),
    ])
    expect(stacked[0]).toMatchObject({ dayKey: '2026-10-04', stacked: true })
    expect(stacked[0].items).toHaveLength(3)
    expect(stacked[1].stacked).toBe(false)
  })
})
