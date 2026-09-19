// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

function item(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    slug: over.slug ?? 'sit',
    title: over.title ?? 'Open sit',
    dayKey: over.dayKey ?? '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: over.isCancelled ?? false,
  }
}

describe('EventCalendar cancelled + keyboard (calendar polish)', () => {
  it('paints cancelled as the date-square footer, not a chip', () => {
    const el = mount(
      <EventCalendar
        events={[item({ slug: 'off', title: 'Called off', isCancelled: true }), item()]}
        initialYear={2026}
        initialMonth1={9}
      />,
    )
    const footer = el.querySelector('[data-calendar-cancelled-footer]')
    expect(footer?.textContent).toContain('Called off')
    expect(footer?.textContent).toContain('Cancelled')
    expect(el.querySelector('[data-calendar-root]')?.getAttribute('tabindex')).toBe('0')
  })

  it('keeps cancelled off the list chips and in the same muted footer', () => {
    const el = mount(
      <EventCalendar
        events={[item({ slug: 'off', title: 'Called off', isCancelled: true }), item()]}
        initialYear={2026}
        initialMonth1={9}
        initialView="list"
      />,
    )
    const list = el.querySelector('[data-calendar-list]')
    expect(list?.textContent).toContain('Open sit')
    const footer = list?.querySelector('[data-calendar-cancelled-footer]')
    expect(footer?.textContent).toContain('Called off')
    expect(footer?.textContent).toContain('Cancelled')
    const chips = list?.querySelectorAll('button')
    const chipTitles = [...(chips ?? [])].map((n) => n.textContent ?? '')
    expect(chipTitles.some((t) => t.includes('Open sit'))).toBe(true)
    expect(chipTitles.some((t) => t.includes('Called off') && !t.includes('Cancelled'))).toBe(false)
  })
})
