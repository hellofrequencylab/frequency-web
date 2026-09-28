// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'

// LIVE-530 (owner ask 2026-09-27: "make it so the calendar infinitely scrolls through that section
// instead of flipping pages"). What `monthFlow="scroll"` promises, pinned without a layout engine:
// the months are all in the tree under one scroller and each is clearly marked; every month of the
// band is asked for; a failed month says so on its own band; the anchor is read back off the scroll
// position ONCE per landing; dragging is refused at the seam; and the scroll names the edge it
// stops growing at. The default is `page`, and a mount that does not ask is exactly as it was.

let container: HTMLDivElement | null = null
let root: Root | null = null

/** A stand-in IntersectionObserver: records what it observes and lets a test fire its callback. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed: Element[] = []
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {
    this.observed = []
  }
  unobserve() {}
  takeRecords() {
    return []
  }
  /** Say which bands cross the anchor line, by month key. */
  cross(keys: string[]) {
    const entries = this.observed.map((el) => ({
      target: el,
      isIntersecting: keys.includes((el as HTMLElement).dataset.calendarMonthBand ?? ''),
    })) as unknown as IntersectionObserverEntry[]
    this.callback(entries, this as unknown as IntersectionObserver)
  }
}

beforeEach(() => {
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: new Date('2026-09-28T12:00:00') })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
    slug: 'sit',
    title: 'Open sit',
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

const bands = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-calendar-month-band]')]
const bandKeys = (el: HTMLElement) => bands(el).map((b) => b.dataset.calendarMonthBand)
const latestObserver = () => FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1]!

describe('EventCalendar monthFlow="page" (the default) is one month, as it always was', () => {
  it('renders exactly one month wrapper and no bands', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    expect(el.querySelectorAll('[data-calendar-month]').length).toBe(1)
    expect(el.querySelector('[data-calendar-month]')!.getAttribute('data-calendar-month')).toBe('2026-09')
    expect(bands(el)).toEqual([])
    expect(FakeIntersectionObserver.instances.length).toBe(0)
  })
})

describe('EventCalendar monthFlow="scroll": the months run under one scroller', () => {
  it('draws a band of months around the anchor, each clearly marked, each a wrapper of week rows', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} monthFlow="scroll" />)
    expect(bandKeys(el)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    for (const band of bands(el)) {
      const key = band.dataset.calendarMonthBand!
      expect(band.querySelector('h3')!.textContent).toMatch(/^(August|September|October|November) 2026$/)
      const wrapper = band.querySelector<HTMLElement>('[data-calendar-month]')!
      expect(wrapper.getAttribute('data-calendar-month')).toBe(key)
      // The invariant the fill test reads: every child of the month wrapper is a week row.
      for (const row of wrapper.children) expect(row.className).toContain('grid-cols-7')
      expect(wrapper.children.length).toBeGreaterThan(3)
    }
    // No slide and no page wrapper: the scroller is the one that moves.
    expect(el.querySelector('.touch-pan-y')!.className).toContain('overflow-y-auto')
    expect(el.querySelector('[data-calendar-load-error]')).toBeNull()
  })

  it('asks for every month of the band except the one the page shipped, each once', () => {
    const loadMonth = vi.fn((_y: number, _m1: number) => new Promise<CalendarEvent[]>(() => {}))
    mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} monthFlow="scroll" />)
    const asked = loadMonth.mock.calls.map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`).sort()
    expect(asked).toEqual(['2026-08', '2026-10', '2026-11'])
  })

  it('a month that fails to load says so ON ITS OWN BAND, with the sentence the a11y test pins, and retries there', async () => {
    const loadMonth = vi.fn((_y: number, m1: number) =>
      m1 === 10 ? Promise.reject(new Error('offline')) : Promise.resolve([] as CalendarEvent[]),
    )
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} loadMonth={loadMonth} monthFlow="scroll" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const october = el.querySelector<HTMLElement>('[data-calendar-month-band="2026-10"]')!
    const line = october.querySelector('[data-calendar-load-error]')
    expect(line?.textContent).toContain('October 2026 did not load')
    expect(line?.getAttribute('role')).toBe('alert')
    expect(el.querySelectorAll('[data-calendar-load-error]').length).toBe(1)
    const calls = loadMonth.mock.calls.length
    await act(async () => {
      ;[...line!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Try again')!.click()
      await Promise.resolve()
    })
    expect(loadMonth.mock.calls.length).toBe(calls + 1)
    expect(loadMonth.mock.calls[calls]).toEqual([2026, 10])
  })

  it('🔴 reads the anchor off the scroll position ONCE per landing, after the scroll has been quiet', () => {
    const onMonthChange = vi.fn()
    mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} monthFlow="scroll" onMonthChange={onMonthChange} />,
    )
    const io = latestObserver()
    expect(io.options?.root).toBe(document.querySelector('.touch-pan-y'))
    expect(io.observed.length).toBe(4)
    // A flick across two months: October crosses the line, then November, inside the quiet window.
    act(() => io.cross(['2026-10']))
    act(() => vi.advanceTimersByTime(100))
    expect(onMonthChange).not.toHaveBeenCalled()
    act(() => io.cross(['2026-11']))
    act(() => vi.advanceTimersByTime(149))
    expect(onMonthChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onMonthChange).toHaveBeenCalledTimes(1)
    expect(onMonthChange).toHaveBeenCalledWith({ year: 2026, month1: 11 })
    // Two bands on the line at once: the EARLIEST is the anchor, and a landing on the month already
    // shown reports nothing.
    act(() => io.cross(['2026-11', '2026-10']))
    act(() => vi.advanceTimersByTime(150))
    expect(onMonthChange).toHaveBeenCalledTimes(2)
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month1: 10 })
    act(() => io.cross(['2026-10']))
    act(() => vi.advanceTimersByTime(150))
    expect(onMonthChange).toHaveBeenCalledTimes(2)
  })

  it('a month handed in from outside the band re-centres the band on it, and the scroll never echoes it back', () => {
    const onMonthChange = vi.fn()
    const el = mount(
      <EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} monthFlow="scroll" onMonthChange={onMonthChange} />,
    )
    // Shift+PageDown on the calendar itself: twelve months on, well outside the band.
    const rootEl = el.querySelector<HTMLElement>('[data-calendar-root]')!
    act(() => {
      rootEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', shiftKey: true, bubbles: true }))
    })
    expect(onMonthChange).toHaveBeenCalledTimes(1)
    expect(onMonthChange).toHaveBeenCalledWith({ year: 2027, month1: 9 })
    expect(bandKeys(el)).toEqual(['2027-08', '2027-09', '2027-10', '2027-11'])
    // The observer re-armed over the new bands, and its first reading (the anchor itself) is silent.
    act(() => latestObserver().cross(['2027-09']))
    act(() => vi.advanceTimersByTime(150))
    expect(onMonthChange).toHaveBeenCalledTimes(1)
  })

  it('🔴 a move across a month boundary is an ordinary move under the scroll, and every date has one cell', () => {
    const entry = item({
      slug: 'entry-1',
      title: 'Open house',
      dayKey: '2026-09-27',
      layer: 'pencil',
      entryId: 'entry-1',
      entryInput: {
        kind: 'pencil',
        title: 'Open house',
        allDay: true,
        startDate: '2026-09-27',
        endDate: '2026-09-27',
        timeZone: 'UTC',
        blocksTime: false,
        showPublicly: false,
      },
    })
    const shiftDown = (el: HTMLElement) =>
      act(() => {
        el.querySelector<HTMLButtonElement>('button[title="Open house"]')!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }),
        )
      })
    // The control case: under `page`, Sunday the 27th plus a week is October, and the planner
    // refuses it with the page-first sentence PROG-CAL15 chose.
    const pagedMoves: unknown[] = []
    const paged = mount(
      <EventCalendar events={[entry]} initialYear={2026} initialMonth1={9} onMoveEntry={(m) => pagedMoves.push(m)} audience="team" />,
    )
    shiftDown(paged)
    expect(pagedMoves).toHaveLength(1)
    expect(pagedMoves[0]).toMatchObject({ ok: false, reason: 'other-month' })
    act(() => root!.unmount())
    root = null
    container!.remove()

    const moves: unknown[] = []
    const scrolled = mount(
      <EventCalendar
        events={[entry]}
        initialYear={2026}
        initialMonth1={9}
        onMoveEntry={(m) => moves.push(m)}
        audience="team"
        monthFlow="scroll"
      />,
    )
    // One chip, in the band that owns the day, draggable; the padded copy in the October band draws nothing.
    const chips = [...scrolled.querySelectorAll<HTMLElement>('[data-move-chip="entry-1"]')]
    expect(chips).toHaveLength(1)
    expect(chips[0].closest('[data-calendar-month-band]')!.getAttribute('data-calendar-month-band')).toBe('2026-09')
    expect(chips[0].getAttribute('draggable')).toBe('true')
    const cells = [...scrolled.querySelectorAll<HTMLElement>('[data-day-cell]')].map((c) => c.dataset.dayCell)
    expect(new Set(cells).size, 'every date has exactly one owning cell across the scroller').toBe(cells.length)
    // October is open, three inches below: the same move lands.
    shiftDown(scrolled)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ ok: true, entryId: 'entry-1', fromDayKey: '2026-09-27', toDayKey: '2026-10-04' })
    // And the chip is drawn ONCE on its new day, in the band that owns October 4th.
    const moved = [...scrolled.querySelectorAll<HTMLElement>('[data-move-chip="entry-1"]')]
    expect(moved).toHaveLength(1)
    expect(moved[0].closest('[data-day-cell]')!.getAttribute('data-day-cell')).toBe('2026-10-04')
    expect(moved[0].closest('[data-calendar-month-band]')!.getAttribute('data-calendar-month-band')).toBe('2026-10')
  })

  it('names the edge it stops growing at, and only there', () => {
    // Today is 2026-09-28 (faked above), so the events window opens in August 2025 (ADR-1536).
    const el = mount(<EventCalendar events={[]} initialYear={2025} initialMonth1={8} monthFlow="scroll" />)
    expect(bandKeys(el)).toEqual(['2025-07', '2025-08', '2025-09', '2025-10'])
    const edge = el.querySelector('[data-calendar-edge="floor"]')
    expect(edge?.textContent).toContain('back to August 2025')
    expect(edge?.textContent).toContain('jump to a month')
    expect(el.querySelector('[data-calendar-edge="ceiling"]')).toBeNull()
    const mid = mount(<EventCalendar events={[]} initialYear={2026} initialMonth1={9} monthFlow="scroll" />)
    expect(mid.querySelector('[data-calendar-edge]')).toBeNull()
  })
})
