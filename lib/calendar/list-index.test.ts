import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import { listIndexItems, selectListItem } from './list-index'

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

describe('listIndexItems', () => {
  it('keeps the operator set and drops private and unavailable', () => {
    const rows = listIndexItems([
      item({ slug: 'entry-1', title: 'New moon sit', dayKey: '2026-09-22', stage: 'pencil', layer: 'pencil', entryId: 'e1' }),
      item({ slug: 'open-house', title: 'Open house', dayKey: '2026-09-24', eventId: 'evt-1', goingCount: 12 }),
      item({ slug: 'entry-2', title: 'Staff meeting', dayKey: '2026-09-23', layer: 'private' }),
    ])
    expect(rows.map((r) => r.title)).toEqual(['New moon sit', 'Open house'])
    expect(rows[0]?.entryId).toBe('e1')
    expect(rows[1]?.eventId).toBe('evt-1')
    expect(rows[1]?.goingCount).toBe(12)
  })
})

describe('selectListItem', () => {
  it('selects the matching key, else the first, else null', () => {
    const rows = listIndexItems([
      item({ slug: 'a', title: 'A', dayKey: '2026-09-22' }),
      item({ slug: 'b', title: 'B', dayKey: '2026-09-23' }),
    ])
    expect(selectListItem(rows, 'b|2026-09-23')?.title).toBe('B')
    expect(selectListItem(rows, 'missing')?.title).toBe('A')
    expect(selectListItem([], 'a|2026-09-22')).toBeNull()
  })
})
