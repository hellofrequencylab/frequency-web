// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// LIVE-467, finding 1. A day holding two or more items rendered ONE chip whose text joined every
// title and whose click opened only the first, and "+N more" never showed because the joined chip
// swallowed the count. Each item now keeps its own button, so a guest or an operator can open the
// second gathering on a busy day from the grid.

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

function item(over: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title'>): CalendarEvent {
  return {
    dayKey: '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

const chipTitles = (el: HTMLElement) =>
  [...el.querySelectorAll('button[title]')].map((b) => b.getAttribute('title')).filter((t): t is string => !!t)

describe('EventCalendar grid: one button per item on a busy day', () => {
  it('two gatherings on one day are two buttons, each opening its own item', () => {
    const opened: string[] = []
    const el = mount(
      <EventCalendar
        events={[item({ slug: 'a', title: 'Morning sit' }), item({ slug: 'b', title: 'Evening talk' })]}
        initialYear={2026}
        initialMonth1={9}
        onSelectEvent={(ev) => opened.push(ev.slug)}
      />,
    )
    const titles = chipTitles(el)
    expect(titles).toContain('Morning sit')
    expect(titles).toContain('Evening talk')
    expect(titles.some((t) => t.includes(','))).toBe(false)
    const second = el.querySelector('button[title="Evening talk"]') as HTMLButtonElement
    act(() => second.click())
    expect(opened).toEqual(['b'])
  })

  it('back-to-back items stack into one block that still holds a button per item', () => {
    const opened: string[] = []
    const el = mount(
      <EventCalendar
        events={[
          item({ slug: 'a', title: 'Ceremony', startInstantIso: '2026-09-20T16:00:00Z' }),
          item({ slug: 'b', title: 'Lunch', startInstantIso: '2026-09-20T19:00:00Z' }),
        ]}
        initialYear={2026}
        initialMonth1={9}
        onSelectEvent={(ev) => opened.push(ev.slug)}
      />,
    )
    const stack = el.querySelector('[data-calendar-stack]')
    expect(stack).not.toBeNull()
    expect(stack!.querySelectorAll('button')).toHaveLength(2)
    act(() => (stack!.querySelector('button[title="Lunch"]') as HTMLButtonElement).click())
    expect(opened).toEqual(['b'])
  })

  it('past three items the rest are counted, whatever the day holds', () => {
    const el = mount(
      <EventCalendar
        events={['a', 'b', 'c', 'd', 'e'].map((slug) => item({ slug, title: `Item ${slug}` }))}
        initialYear={2026}
        initialMonth1={9}
      />,
    )
    expect(el.textContent).toContain('+2 more')
    expect(chipTitles(el).filter((t) => t.startsWith('Item '))).toHaveLength(3)
  })
})
