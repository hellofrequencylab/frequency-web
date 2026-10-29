// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// A calendar opens on the CURRENT month, wherever the events are, unless the link named a month.
// The clock is frozen at 28 Oct 2026; The Group's shape is nothing this month and the events
// all in November and December, and a render that arrived from a tab opened in September.

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-10-28T19:00:00Z'))
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

const later: CalendarEvent[] = ['2026-11-05', '2026-12-03'].map((dayKey) => ({
  slug: `e-${dayKey}`,
  title: 'Chapter night',
  dayKey,
  timeLabel: '7:00 PM',
  whenLabel: dayKey,
  startInstantIso: null,
  location: null,
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
}))

function shownMonth(initialYear: number, initialMonth1: number, monthPinned?: boolean) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<EventCalendar events={later} initialYear={initialYear} initialMonth1={initialMonth1} monthPinned={monthPinned} />))
  act(() => {
    vi.advanceTimersByTime(10)
  })
  return container.textContent ?? ''
}

describe('the month a calendar opens on', () => {
  it('is the current month when the events are all later', () => {
    const text = shownMonth(2026, 10)
    expect(text).toContain('October 2026')
    expect(text).not.toContain('November 2026')
  })

  it('moves a render from an earlier month up to the current one', () => {
    expect(shownMonth(2026, 9)).toContain('October 2026')
  })

  it('leaves a month the link named where the link put it', () => {
    const text = shownMonth(2026, 12, true)
    expect(text).toContain('December 2026')
    expect(text).not.toContain('October 2026')
  })
})
