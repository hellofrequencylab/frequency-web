import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import { agendaDayLabel, agendaForMonth, listIndexItems, selectListItem } from './list-index'

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
      item({
        slug: 'open-house',
        title: 'Open house',
        dayKey: '2026-09-24',
        eventId: 'evt-1',
        publicationState: 'published',
        goingCount: 12,
      }),
      item({ slug: 'entry-2', title: 'Staff meeting', dayKey: '2026-09-23', layer: 'private' }),
    ])
    expect(rows.map((r) => r.title)).toEqual(['New moon sit', 'Open house'])
    expect(rows[0]?.entryId).toBe('e1')
    expect(rows[0]?.publicSlug).toBeNull()
    expect(rows[1]?.eventId).toBe('evt-1')
    expect(rows[1]?.publicSlug).toBe('open-house')
    expect(rows[1]?.href).toBe('/events/open-house')
    expect(rows[1]?.goingCount).toBe(12)
  })

  it('never exposes a public event route for an unpublished admin row', () => {
    const [row] = listIndexItems([
      item({
        slug: 'draft-gathering',
        title: 'Draft gathering',
        dayKey: '2026-09-25',
        eventId: 'evt-draft',
        publicationState: 'unpublished',
        editHref: '/events/draft-gathering/manage?section=settings',
      }),
    ])
    expect(row?.publicSlug).toBeNull()
    expect(row?.href).toBe('/events/draft-gathering/manage?section=settings')
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

describe('agendaForMonth (PROG-CAL12)', () => {
  it('keeps the shown month, grouped by day in day order, with a day heading', () => {
    const rows = listIndexItems([
      item({ slug: 'b', title: 'Board night', dayKey: '2026-09-23' }),
      item({ slug: 'a', title: 'A sit', dayKey: '2026-09-22' }),
      item({ slug: 'c', title: 'Cider press', dayKey: '2026-09-22' }),
      item({ slug: 'o', title: 'October only', dayKey: '2026-10-02' }),
    ])
    const days = agendaForMonth(rows, 2026, 9)
    expect(days.map((d) => d.dayKey)).toEqual(['2026-09-22', '2026-09-23'])
    expect(days[0].label).toBe('Tue, Sep 22')
    expect(days[0].items.map((i) => i.title)).toEqual(['A sit', 'Cider press'])
    expect(days[1].items.map((i) => i.title)).toEqual(['Board night'])
    expect(agendaForMonth(rows, 2026, 11)).toEqual([])
    expect(agendaDayLabel('nope')).toBe('nope')
  })
})
