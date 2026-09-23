// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// PROG-CAL13. Two things the Calendar console asks of the grid, and one thing that was flickering.
//
// `hostChrome`: the console header already draws the month and the Prev / Today / Next cluster, so
// the grid must draw neither. It kept drawing both, which is why the console paid for the same month
// label twice and the month was cut off in the fourth week.
//
// 🔴 AND IT MUST STILL DRAW THE OTHER TWO (LIVE-475). The first cut took the whole header off, which
// took the grid / list switcher and the month-and-year jump with it — and NOTHING outside this
// component draws either one (the console header's view controls are the workspace's four-panel
// toggle, a different control over a different set). Switching the page grid to List and then
// pressing Fullscreen left a reader in list mode with no way back to the month and no way to move
// more than one month at a time, with closing the console the only exit.
//
// `fill`: the six week rows share the height the host gives them, so no cell may insist on a floor
// of its own, and a day holding more than its share scrolls INSIDE its cell rather than sending the
// reader to another view.
//
// 🔴 THE RESIDUAL BLINK. `slide` was set on a month change and never cleared, so the month wrapper
// carried its animation class for the rest of the session. The console moves this whole subtree
// between two DOM homes on every open and close, and taking an element out of the document cancels
// its animations while putting it back starts them from zero — so every open and every close
// replayed the month slide underneath the dialog's own entrance. The class must not outlive the
// animation.

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

const busy = Array.from({ length: 6 }, (_, i) => item({ slug: `s${i}`, title: `Sitting ${i + 1}` }))

const monthWrapper = (el: HTMLElement) => el.querySelector('.touch-pan-y')!.firstElementChild as HTMLElement
const weekRows = (el: HTMLElement) => [...monthWrapper(el).children] as HTMLElement[]

describe('EventCalendar under a host that draws the chrome', () => {
  it('draws its own month title, paging cluster and view switcher on the page', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} />)
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(true)
    expect(el.querySelectorAll('[aria-label="Previous month"]').length).toBe(1)
    expect(el.querySelector('[aria-label="Calendar view"]')).not.toBeNull()
  })

  it('drops the month label and the paging cluster when the host says it owns them, and still announces a loading month', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} hostChrome />)
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(false)
    expect(el.querySelectorAll('[aria-label="Previous month"]').length).toBe(0)
    expect(el.querySelectorAll('[aria-label="Next month"]').length).toBe(0)
    // The live region is not chrome: a month that has not arrived is announced wherever it mounts.
    expect(el.querySelector('[role="status"]')).not.toBeNull()
    // The days are still there, and the weekday header with them.
    expect(el.textContent).toContain('Sun')
    expect(weekRows(el).length).toBeGreaterThan(4)
  })

  // 🔴 THE EXIT (LIVE-475). Under a host that owns the chrome, the two controls no host draws stay:
  // the way back to the month from list mode, and the way to move more than one month at a time.
  it('keeps its own view switcher and its month jump when the host owns the chrome', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} hostChrome />)
    const switcher = el.querySelector('[aria-label="Calendar view"]')
    expect(switcher).not.toBeNull()
    expect(switcher!.querySelector('[aria-label="Grid view"]')).not.toBeNull()
    expect(el.querySelector('button[aria-label="Jump to a month"]')).not.toBeNull()
  })

  // The dead end itself: in list mode, under a host that owns the chrome, a control returns to the
  // month. Before LIVE-475 there was none, and closing the console was the only way out.
  it('returns to the month from list mode while the host owns the chrome', () => {
    const el = mount(<EventCalendar events={busy} initialYear={2026} initialMonth1={9} initialView="list" fill hostChrome />)
    expect(el.querySelector('[data-calendar-list]')).not.toBeNull()
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')!.click()
    })
    expect(el.querySelector('[data-calendar-list]')).toBeNull()
    expect(weekRows(el).length).toBeGreaterThan(4)
  })

  // More than one month at a time, without the grid's own month title to hang the jump on.
  it('jumps a whole month from the host-chrome strip', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} hostChrome />)
    act(() => {
      el.querySelector<HTMLButtonElement>('button[aria-label="Jump to a month"]')!.click()
    })
    const panel = el.querySelector('[aria-label="Jump to a month"][role="dialog"]')
    expect(panel).not.toBeNull()
    expect([...panel!.querySelectorAll('button')].some((b) => b.textContent?.trim().startsWith('Dec'))).toBe(true)
  })

  it('gives the week rows the host height and lets a busy cell scroll its own items', () => {
    const el = mount(<EventCalendar events={busy} initialYear={2026} initialMonth1={9} fill hostChrome />)
    expect(el.querySelector('[data-calendar-root]')!.className).toContain('flex-1')
    for (const row of weekRows(el)) expect(row.className).toContain('flex-1')
    const cell = [...el.querySelectorAll<HTMLElement>('[data-calendar-root] .group')].find((c) =>
      c.textContent?.includes('Sitting 1'),
    )!
    // No floor under a cell that has to share a fixed height.
    expect(cell.className).toContain('min-h-0')
    expect(cell.className).not.toContain('min-h-20')
    const items = cell.querySelector<HTMLElement>('.overflow-y-auto')!
    expect(items.className).toContain('overscroll-contain')
    // Everything the day holds is IN the cell, so nothing is hidden behind another view.
    expect(items.textContent).toContain('Sitting 6')
    expect(cell.textContent).not.toContain('more')
  })

  it('keeps the three-item cap and the overflow count when it is not filling', () => {
    const el = mount(<EventCalendar events={busy} initialYear={2026} initialMonth1={9} />)
    const cell = [...el.querySelectorAll<HTMLElement>('[data-calendar-root] .group')].find((c) =>
      c.textContent?.includes('Sitting 1'),
    )!
    expect(cell.textContent).toContain('+3 more')
    expect(cell.textContent).not.toContain('Sitting 6')
  })

  it('pages the month on Up and Down as well as Left and Right, when the calendar itself has focus', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} />)
    const grid = el.querySelector<HTMLElement>('[data-calendar-root]')!
    // NAME THE MONTH, not "the first polite live region in the grid". The grid gained a second one
    // when a date became movable (PROG-CAL15, the line a move leaves), and a loose selector that
    // happened to mean the month title started reading an empty region instead.
    const shown = () => el.querySelector('button [aria-live="polite"]')!.textContent
    const press = (key: string) =>
      act(() => {
        grid.focus()
        grid.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      })
    press('ArrowDown')
    expect(shown()).toBe('October 2026')
    press('ArrowUp')
    expect(shown()).toBe('September 2026')
    press('ArrowRight')
    expect(shown()).toBe('October 2026')
    press('ArrowLeft')
    expect(shown()).toBe('September 2026')
    // A key pressed on a control INSIDE the grid is that control's: focus still moves normally.
    const inner = grid.querySelector('button')!
    act(() => {
      inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    })
    expect(shown()).toBe('September 2026')
  })

  // 🔴 REGRESSION: the animation class outliving its animation is what the console's DOM move
  // replayed on every open and close.
  it('drops the month slide class as soon as the slide has ended', async () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} />)
    expect(monthWrapper(el).className).not.toContain('calendarSlide')
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click()
    })
    const wrapper = monthWrapper(el)
    expect(wrapper.className).toContain('calendarSlideNext')
    // Both spellings: jsdom has no `AnimationEvent` constructor, so React falls back to the vendor
    // prefixed name it would never use in a browser that does.
    await act(async () => {
      wrapper.dispatchEvent(new Event('animationend', { bubbles: true }))
      wrapper.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }))
    })
    expect(monthWrapper(el).className).not.toContain('calendarSlide')
  })
})
