// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// LIVE-528. The grid can have SEVERAL months in flight now, because the continuous month scroll it
// is heading for renders more than one at a time. What this file pins is what that cost and what it
// bought, on a mount that still shows exactly one month.
//
// 🔴 THE CLEANUP THAT RAN ON EVERY STEP. The loader used to be one effect keyed on the shown month,
// so React ran its cleanup on every navigation and the cleanup forgot any request that had not
// arrived yet. Two things followed, both reproduced below against the code as it stood:
//
//   1. Paging away and back before a month arrived asked for it AGAIN, so a reader who wobbled
//      between two months paid for the same month twice. With one month in flight that was a tidy
//      way to avoid a stale write; with several it is a refetch on every wobble of the viewport.
//   2. The Loading announcement never came down. `setLoading(false)` sat behind the same per-month
//      `live` flag, so a request whose month the reader had already left could not clear it: the
//      live region announced Loading for the rest of the session, on a month that was fully loaded.
//
// Nothing but UNMOUNT ends a request now, and Loading is a SET of the months actually in flight.
// The failure path still forgets its own month, because Try again depends on that.

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

function item(): CalendarEvent {
  return {
    slug: 'sit',
    title: 'Open sit',
    dayKey: '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
  }
}

const click = (el: HTMLElement, label: string) =>
  act(() => el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())

describe('EventCalendar month cache (LIVE-528)', () => {
  it('does not ask for a month twice because the reader paged away before it arrived', () => {
    const loadMonth = vi.fn((_y: number, _m1: number) => new Promise<CalendarEvent[]>(() => {}))
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} />,
    )
    click(el, 'Next month') // October, requested
    click(el, 'Next month') // November, requested
    click(el, 'Previous month') // back on October, still in flight

    const asked = loadMonth.mock.calls.map(([y, m]) => `${y}-${m}`)
    expect(asked, 'each month in flight is asked for exactly once').toEqual(['2026-10', '2026-11'])
  })

  it('stops announcing Loading when a request settles under a month the reader has left', async () => {
    let settle: ((items: CalendarEvent[]) => void) | null = null
    const loadMonth = vi.fn(
      () =>
        new Promise<CalendarEvent[]>((res) => {
          settle = res
        }),
    )
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} />,
    )
    click(el, 'Next month') // October, in flight
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Loading')

    click(el, 'Previous month') // back on September, which the page shipped: nothing to fetch
    await act(async () => {
      settle!([])
      await Promise.resolve()
      await Promise.resolve()
    })
    for (const region of Array.from(el.querySelectorAll('[role="status"]'))) {
      expect(region.textContent, 'no month is in flight, so nothing announces Loading').toBe('')
    }
  })

  it('says which month did not load, once, and retries that month', async () => {
    const loadMonth = vi.fn((_y: number, m1: number) =>
      m1 === 10 ? Promise.reject(new Error('offline')) : Promise.resolve([]),
    )
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} />,
    )
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const lines = el.querySelectorAll('[data-calendar-load-error]')
    expect(lines.length, 'one line, from one place in the tree').toBe(1)
    expect(lines[0].textContent).toContain('October 2026 did not load')
    for (const region of Array.from(el.querySelectorAll('[role="status"]'))) {
      expect(region.textContent, 'a month that failed is not also still announced as Loading').toBe('')
    }

    // November loads fine. October is a different month, so its answer is untouched: the reader is
    // on November, where there is nothing to report.
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(el.querySelector('[data-calendar-load-error]'), 'November loaded').toBeNull()

    // Back on October, which is still failing: the line is back, named after October.
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[aria-label="Previous month"]')!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(el.querySelector('[data-calendar-load-error]')?.textContent).toContain(
      'October 2026 did not load',
    )
  })
})
