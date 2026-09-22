// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// LIVE-469. The three promises this file pins are the ones a phone and a screen reader keep
// catching the calendar on: a chip that prints a time and no title, a control that vanishes from
// under the focus that pressed it, and a month that failed to load drawn as a month with nothing
// in it. Each test fails on the code as it stood before this row.

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
    timeLabel: over.timeLabel ?? '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
  }
}

describe('EventCalendar on a phone (LIVE-469)', () => {
  it('keeps the title in the chip and moves the time out of sight, not out of earshot', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    const time = Array.from(el.querySelectorAll('span')).find((s) => s.textContent?.trim() === '7:00 PM')
    expect(time, 'the time label is still rendered').toBeTruthy()
    // sr-only until there is room for both, which is what stops a 46px cell printing "7:0".
    expect(time!.className).toContain('sr-only')
    expect(time!.className).toContain('sm:not-sr-only')
  })

  it('does not put a per-day add button inside a phone-width cell', () => {
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} onCreateAt={() => {}} />,
    )
    const add = el.querySelector('[aria-label^="Add a date on"]')
    expect(add, 'the per-day + still exists for a pointer').toBeTruthy()
    expect(add!.closest('.hidden.sm\\:contents'), 'it is hidden below sm').toBeTruthy()
  })
})

describe('EventCalendar focus and announcements (LIVE-469)', () => {
  it('keeps Today mounted and disabled, and hands focus to the month title', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    const today = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Today')
    expect(today, 'Today is always in the tree').toBeTruthy()

    const next = el.querySelector<HTMLButtonElement>('[aria-label="Next month"]')
    act(() => next!.click())
    const stillThere = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Today')
    expect(stillThere!.hasAttribute('disabled')).toBe(false)

    act(() => stillThere!.click())
    const month = Array.from(el.querySelectorAll('button')).find((b) => /^September 2026/.test(b.textContent ?? ''))
    expect(document.activeElement, 'focus lands on the month title, never the body').toBe(month)
    const backOnToday = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Today')
    expect(backOnToday!.hasAttribute('disabled'), 'disabled rather than removed').toBe(true)
  })

  it('announces Loading from a region that was already in the tree', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    const status = el.querySelector('[role="status"]')
    expect(status, 'the live region is mounted before it has anything to say').toBeTruthy()
    expect(status!.textContent).toBe('')
  })

  it('says a month did not load instead of drawing it empty, and retries', async () => {
    const loadMonth = vi.fn().mockRejectedValue(new Error('offline'))
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} />,
    )
    const next = el.querySelector<HTMLButtonElement>('[aria-label="Next month"]')
    await act(async () => {
      next!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    const line = el.querySelector('[data-calendar-load-error]')
    expect(line?.textContent).toContain('October 2026 did not load')
    expect(line?.getAttribute('role')).toBe('alert')

    const retry = Array.from(line!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Try again')
    expect(retry, 'the line carries its own retry').toBeTruthy()
    const calls = loadMonth.mock.calls.length
    await act(async () => {
      retry!.click()
      await Promise.resolve()
    })
    expect(loadMonth.mock.calls.length).toBeGreaterThan(calls)
  })

  it('names the details popup after the entry, not "Details"', () => {
    const el = mount(<EventCalendar events={[item({ title: 'New moon sit' })]} initialYear={2026} initialMonth1={9} />)
    const chip = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('New moon sit'))
    act(() => chip!.click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog, 'the popup opened').toBeTruthy()
    expect(dialog!.hasAttribute('aria-labelledby'), 'named by its own title element').toBe(true)
    const labelled = document.getElementById(dialog!.getAttribute('aria-labelledby')!)
    expect(labelled?.textContent).toBe('New moon sit')
  })
})
