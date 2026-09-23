// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// PROG-CAL13, widened by LIVE-485. What the Calendar console asks of the grid, and one thing that
// was flickering.
//
// `hostChrome`: the console's one header bar draws the month label, the Prev / Today / Next
// cluster, the month-and-year jump, the grid / list switcher and the layer chips, so the grid draws
// none of them. Before LIVE-485 it kept the last three, which put two more bands of furniture
// inside the console under the console's own header.
//
// 🔴 AND A HOST MAY ONLY TAKE A CONTROL IT DRAWS (LIVE-475). The first cut of `hostChrome` took the
// whole header off while NOTHING outside this component drew the switcher or the jump: switching
// the page grid to List and then pressing Fullscreen left a reader in list mode with no way back to
// the month and no way to move more than one month at a time, with closing the console the only
// exit. The rule survives; what changed is that the console now genuinely draws them, which is
// pinned in calendar-workspace.render.test.tsx (the console's header, in the real DOM) and gated by
// HOST_DRAWN_CONTROL_MARKS. What this file pins is the other half: under a host, the grid hands the
// controls over AND still answers a host that drives them from outside.
//
// `fill`: the six week rows share the height the host gives them, so no cell may insist on a floor
// of its own, and a day holding more than its share scrolls INSIDE its cell rather than sending the
// reader to another view.
//
// 🔴 THE RESIDUAL BLINK. `slide` was set on a month change and never cleared, so the month wrapper
// carried its animation class for the rest of the session. The console moves this whole subtree
// between two DOM homes on every open and close, and taking an element out of the document cancels
// its animations while putting it back starts them from zero, so every open and every close
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

  it('draws no chrome at all when the host says it owns it, and still announces a loading month', () => {
    const el = mount(
      <EventCalendar events={[]} initialYear={2026} initialMonth1={9} layers={['events', 'pencil']} hostChrome />,
    )
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('September 2026'))).toBe(false)
    expect(el.querySelectorAll('[aria-label="Previous month"]').length).toBe(0)
    expect(el.querySelectorAll('[aria-label="Next month"]').length).toBe(0)
    // The three LIVE-485 folded into the console header.
    expect(el.querySelector('[aria-label="Calendar view"]')).toBeNull()
    expect(el.querySelector('[aria-label="Jump to a month"]')).toBeNull()
    expect(el.querySelector('[aria-label="Show on the calendar"]')).toBeNull()
    // The live region is not chrome: a month that has not arrived is announced wherever it mounts.
    expect(el.querySelector('[role="status"]')).not.toBeNull()
    // The days are still there, and the weekday header with them.
    expect(el.textContent).toContain('Sun')
    expect(weekRows(el).length).toBeGreaterThan(4)
  })

  // 🔴 THE OTHER HALF OF THE EXIT (LIVE-475, LIVE-485). The grid only gives its switcher up because
  // the host drives it from outside, so a host that owns the chrome must be able to put the grid
  // back on the month without touching anything inside the grid. If this stopped working, the
  // console's header switcher would be a button that does nothing and the dead end would be back.
  it('takes its view from the host and reports every switch back, under a host that owns the chrome', () => {
    const seen: ('grid' | 'list')[] = []
    const el = mount(
      <EventCalendar
        events={busy}
        initialYear={2026}
        initialMonth1={9}
        view="list"
        onViewChange={(next) => seen.push(next)}
        fill
        hostChrome
      />,
    )
    expect(el.querySelector('[data-calendar-list]')).not.toBeNull()
    // Nothing inside the grid switches it: the host's control does.
    expect(el.querySelector('[aria-label="Grid view"]')).toBeNull()
    act(() => {
      root!.render(
        <EventCalendar
          events={busy}
          initialYear={2026}
          initialMonth1={9}
          view="grid"
          onViewChange={(next) => seen.push(next)}
          fill
          hostChrome
        />,
      )
    })
    expect(el.querySelector('[data-calendar-list]')).toBeNull()
    expect(weekRows(el).length).toBeGreaterThan(4)
  })

  // The page keeps both controls and its own state, because on the page nothing else draws them.
  it('reports a switch made on its own control, so a host can follow the page grid into the console', () => {
    const seen: ('grid' | 'list')[] = []
    const el = mount(<EventCalendar events={busy} initialYear={2026} initialMonth1={9} onViewChange={(n) => seen.push(n)} />)
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="List view"]')!.click()
    })
    expect(seen).toEqual(['list'])
    expect(el.querySelector('[data-calendar-list]')).not.toBeNull()
  })

  // The layers work the same way: the host holds which are hidden, the grid draws no chips.
  it('hides the layers the host says are hidden, and draws no chips of its own under a host', () => {
    const hidden = new Set<'pencil'>(['pencil'])
    const el = mount(
      <EventCalendar
        events={[item({ slug: 'p1', title: 'Penciled sit', layer: 'pencil' }), item({ slug: 'e1', title: 'Open sit' })]}
        initialYear={2026}
        initialMonth1={9}
        layers={['events', 'pencil']}
        hiddenLayers={hidden}
        hostChrome
        fill
      />,
    )
    expect(el.querySelector('[aria-label="Show on the calendar"]')).toBeNull()
    expect(el.textContent).toContain('Open sit')
    expect(el.textContent).not.toContain('Penciled sit')
  })

  // More than one month at a time is the host's job now; the page keeps its own jump.
  it('keeps its month-and-year jump on the page, where nothing else draws one', () => {
    const el = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} />)
    act(() => {
      const monthTitle = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes('September 2026'),
      )!
      monthTitle.click()
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
