// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'
import { ALL_DAY_LABEL } from '@/lib/calendar/item'

// LIVE-491, owner ask 2026-09-24, three rules for what a day square says and in what order:
//   1. all-day / multi-day items draw as ONE uniform line across the square, like a calendar draws
//      a span, rather than as a pill per day that reads like a repeated appointment;
//   2. those bands ride the TOP of the square;
//   3. day notes -- Quiet hours, Flex day, Retreat & rental -- move to the BOTTOM.
// The order is the whole point, so this reads the real DOM rather than trusting a class name.

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

function item(over: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title'>): CalendarEvent {
  return {
    dayKey: '2026-10-05',
    timeLabel: '7:00 PM',
    whenLabel: 'Mon, Oct 5, 7:00 PM PDT',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

const cell = (el: HTMLElement, date: string) => el.querySelector<HTMLElement>(`[data-day-cell="${date}"]`)!

describe('the day square, top to bottom (LIVE-491)', () => {
  it('draws an all-day item as a band and a timed item as a chip', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        events={[
          item({ slug: 'closed', title: 'Awake is Loud', dayKey: '2026-10-05', timeLabel: ALL_DAY_LABEL }),
          item({ slug: 'craft', title: 'Craft Night', dayKey: '2026-10-05', timeLabel: '6:00 PM' }),
        ]}
      />,
    )
    const c = cell(el, '2026-10-05')
    expect(c.querySelectorAll('[data-calendar-band]').length).toBe(1)
    expect(c.querySelector('[data-calendar-band]')!.textContent).toContain('Awake is Loud')
    // The timed one is still an ordinary chip, not a band.
    const chips = [...c.querySelectorAll('[data-calendar-chip]')].map((n) => n.textContent)
    expect(chips.some((t) => t?.includes('Craft Night'))).toBe(true)
  })

  it('puts the band ABOVE the timed chips', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        events={[
          item({ slug: 'craft', title: 'Craft Night', dayKey: '2026-10-05', timeLabel: '6:00 PM' }),
          item({ slug: 'closed', title: 'Awake is Loud', dayKey: '2026-10-05', timeLabel: ALL_DAY_LABEL }),
        ]}
      />,
    )
    const c = cell(el, '2026-10-05')
    const band = c.querySelector('[data-calendar-band]')!
    const chip = c.querySelector('[data-calendar-chip]')!
    // DOCUMENT_POSITION_FOLLOWING: the chip comes after the band, whatever order they arrived in.
    expect(band.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts the day note at the BOTTOM, under everything the day holds', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        dayNotes={[{ id: 'n1', label: 'Quiet hours', weekdays: null, startsOn: '2026-10-05', endsOn: '2026-10-05' }]}
        events={[
          item({ slug: 'closed', title: 'Awake is Loud', dayKey: '2026-10-05', timeLabel: ALL_DAY_LABEL }),
          item({ slug: 'craft', title: 'Craft Night', dayKey: '2026-10-05', timeLabel: '6:00 PM' }),
        ]}
      />,
    )
    const c = cell(el, '2026-10-05')
    const note = c.querySelector('[data-day-note]')!
    expect(note.textContent).toContain('Quiet hours')
    for (const sel of ['[data-calendar-band]', '[data-calendar-chip]']) {
      const before = c.querySelector(sel)!
      expect(before.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING, sel).toBeTruthy()
    }
  })

  it('reads a run as ONE line: rounded only where it begins and ends', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        events={[
          item({ slug: 'retreat', title: 'Retreat', dayKey: '2026-10-05', endDayKey: '2026-10-07', timeLabel: ALL_DAY_LABEL }),
        ]}
      />,
    )
    const first = cell(el, '2026-10-05').querySelector<HTMLElement>('[data-calendar-band]')!
    const middle = cell(el, '2026-10-06').querySelector<HTMLElement>('[data-calendar-band]')!
    const last = cell(el, '2026-10-07').querySelector<HTMLElement>('[data-calendar-band]')!

    expect(first.dataset.bandStart).toBe('true')
    expect(first.dataset.bandEnd).toBeUndefined()
    // The middle day is square at BOTH ends -- that is what makes three cells read as one rule.
    expect(middle.dataset.bandStart).toBeUndefined()
    expect(middle.dataset.bandEnd).toBeUndefined()
    expect(last.dataset.bandStart).toBeUndefined()
    expect(last.dataset.bandEnd).toBe('true')
  })

  it('says the title once where the run starts, and keeps it for a screen reader after', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        events={[
          item({ slug: 'retreat', title: 'Retreat', dayKey: '2026-10-05', endDayKey: '2026-10-07', timeLabel: ALL_DAY_LABEL }),
        ]}
      />,
    )
    const middle = cell(el, '2026-10-06').querySelector<HTMLElement>('[data-calendar-band]')!
    // Not repeated in the visible bar mid-run...
    expect(middle.querySelector('.sr-only')?.textContent).toContain('Retreat')
    // ...but never lost: the accessible name and the tooltip still carry it.
    expect(middle.getAttribute('aria-label')).toContain('Retreat')
    expect(middle.getAttribute('title')).toContain('Retreat')
  })

  it('never hides a band behind the three-chip limit', () => {
    const el = mount(
      <EventCalendar
        initialYear={2026}
        initialMonth1={10}
        events={[
          ...Array.from({ length: 5 }, (_, i) =>
            item({ slug: `t${i}`, title: `Timed ${i}`, dayKey: '2026-10-05', timeLabel: '6:00 PM' }),
          ),
          item({ slug: 'closed', title: 'Awake is Loud', dayKey: '2026-10-05', timeLabel: ALL_DAY_LABEL }),
        ]}
      />,
    )
    const c = cell(el, '2026-10-05')
    // The band draws whatever the timed crowd does, and the overflow counts TIMED items only.
    expect(c.querySelector('[data-calendar-band]')).not.toBeNull()
    expect(c.textContent).toContain('+2 more')
  })
})
