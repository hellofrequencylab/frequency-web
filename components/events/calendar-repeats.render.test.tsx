// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'
import type { CalendarRepeatSeries } from '@/lib/events/calendar-repeats'

// The RENDERING half of the Repeats strip (LIVE-081). The plan is pinned in
// lib/events/calendar-repeats.test.ts; this pins what a member actually sees, because the two
// failure modes that matter here are both invisible to a unit test of the plan:
//   · a chip that is a bare marker (the row's skeptic test: a member cannot tell what it is), and
//   · a "collapse" that HIDES dates, which is the one thing the owner's standing calendar rule
//     forbids and which series-browse-wiring.test.ts guards from the other side.

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

function date(slug: string, dayKey: string, isLaterDate: boolean): CalendarEvent {
  return {
    slug,
    title: 'Breathe Connect Expand',
    dayKey,
    timeLabel: '6:30 PM',
    whenLabel: `Thu, ${dayKey}, 6:30 PM PDT`,
    startInstantIso: `${dayKey}T18:30:00.000Z`,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    seriesKey: 'S1',
    isLaterDate,
  }
}

// August 2026 renders Sun Jul 26 through Sat Sep 5, so all three dates below are on screen at once.
const EVENTS: CalendarEvent[] = [date('bce-2026-08-20', '2026-08-20', false), date('bce-2026-08-27', '2026-08-27', true)]

const SERIES: CalendarRepeatSeries[] = [
  {
    key: 'S1',
    name: 'Breathe Connect Expand',
    cadenceLabel: 'Thursdays',
    href: '/events/bce-2026-08-20',
    liveDayKeys: ['2026-08-20', '2026-08-27'],
    pendingDayKeys: ['2026-09-03'],
  },
]

const render = () => mount(<EventCalendar events={EVENTS} initialYear={2026} initialMonth1={8} repeats={SERIES} />)

describe('the Repeats strip', () => {
  it('labels each chip with the series name AND its cadence, never a bare marker', () => {
    const el = render()
    const chipLink = el.querySelector('a[href="/events/bce-2026-08-20"]') as HTMLAnchorElement
    expect(chipLink?.textContent).toBe('Breathe Connect Expand')
    const toggle = el.querySelector('button[aria-label^="Thursdays"]') as HTMLButtonElement
    expect(toggle.textContent).toBe('Thursdays')
  })

  it('says plainly that the computed dates are not open yet', () => {
    expect(render().textContent).toContain('open for RSVP about two months ahead')
  })

  it('highlights on press and hides nothing', () => {
    const el = render()
    const toggle = el.querySelector('button[aria-label^="Thursdays"]') as HTMLButtonElement
    const buttonsBefore = el.querySelectorAll('button').length
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(el.querySelectorAll('[class*="ring-primary/"]').length).toBe(0)

    act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    // Highlighted, not filtered: the same controls are still on screen.
    expect(el.querySelectorAll('[class*="ring-primary/"]').length).toBeGreaterThan(0)
    expect(el.querySelectorAll('button').length).toBe(buttonsBefore)

    // Pressing again clears it.
    act(() => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('the grid cells', () => {
  it('gives the next date a card and every later date a dot, and keeps both reachable', () => {
    const el = render()
    const card = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Breathe Connect Expand'))
    expect(card).toBeTruthy()
    // Exactly ONE card for the series, not one per date.
    expect([...el.querySelectorAll('button')].filter((b) => b.textContent?.includes('Breathe Connect Expand'))).toHaveLength(1)

    // The later date is still there, still openable, and carries a name for a screen reader.
    const dot = el.querySelector('button[aria-label="Breathe Connect Expand, 6:30 PM"]') as HTMLButtonElement
    expect(dot).toBeTruthy()
    expect(dot.textContent).toBe('')
  })

  it('draws a computed date as a dot that cannot be clicked into nothing', () => {
    const el = render()
    const pending = [...el.querySelectorAll('span.sr-only')].filter((s) => s.textContent === 'Breathe Connect Expand, a date that is not open yet')
    expect(pending).toHaveLength(1)
    expect(pending[0].closest('a')).toBeNull()
    expect(pending[0].closest('button')).toBeNull()
  })

  it('renders exactly as before when no repeats are passed', () => {
    const el = mount(<EventCalendar events={EVENTS.map((e) => ({ ...e, seriesKey: null, isLaterDate: false }))} initialYear={2026} initialMonth1={8} />)
    expect(el.querySelector('button[aria-label^="Thursdays"]')).toBeNull()
    expect([...el.querySelectorAll('button')].filter((b) => b.textContent?.includes('Breathe Connect Expand'))).toHaveLength(2)
  })
})
