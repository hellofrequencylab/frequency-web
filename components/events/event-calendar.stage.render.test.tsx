// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EventCalendar, type CalendarEvent } from './event-calendar'
import { CALENDAR_PRESENTATIONS, NARROW_GRID_WIDTH } from '@/lib/calendar/registry'

// COLOUR PLUS THE WORD, on the grid (LIVE-470).
//
// 🔴 WHAT THIS PROVES that lib/calendar/registry-presentation.test.ts cannot. That test reads the
// table. These mount the real calendar and read the DOM, because the defect was not a wrong table,
// it was a grid that never printed the word the table already held, and three chips that resolved
// to the same class string.

let container: HTMLDivElement | null = null
let root: Root | null = null
const realMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  if (realMatchMedia) Object.defineProperty(window, 'matchMedia', realMatchMedia)
  else delete (window as { matchMedia?: unknown }).matchMedia
})

/** A viewport of `width`, as the chip's media query sees it. */
function setViewport(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY)
      return {
        matches: width <= max,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }
    },
  })
}

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
    title: 'New moon sit',
    dayKey: '2026-09-20',
    timeLabel: '7:00 PM',
    whenLabel: 'Sun, Sep 20, 7:00 PM PDT',
    startInstantIso: '2026-09-20T19:00:00.000Z',
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...over,
  }
}

/** Every chip word the grid printed, in order. */
function chipWords(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-calendar-chip-word]')].map((n) => n.textContent ?? '')
}

function chipKeys(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-calendar-chip-word]')].map(
    (n) => n.getAttribute('data-calendar-chip-word') ?? '',
  )
}

/** The three kinds that used to paint the same `bg-info-bg text-info`. */
const THREE_KINDS = [
  item({ slug: 'plng', title: 'Solstice', dayKey: '2026-09-10', layer: 'pencil', stage: 'planning' }),
  item({ slug: 'entry-1', title: 'Staff sync', dayKey: '2026-09-11', layer: 'private' }),
  item({ slug: 'entry-2', title: 'Order candles', dayKey: '2026-09-12', layer: 'todos' }),
]

/** Every grid chip's class string, in day order. `data-calendar-chip` is the chip's identity
 *  whatever it prints, which is what lets the member half be asserted at all. */
function chipClasses(el: HTMLElement): string[] {
  return [...el.querySelectorAll<HTMLElement>('[data-calendar-chip]')].map((n) => n.className)
}

function chipIdentities(el: HTMLElement): string[] {
  return [...el.querySelectorAll('[data-calendar-chip]')].map((n) => n.getAttribute('data-calendar-chip') ?? '')
}

describe('the grid chip prints the stage word (LIVE-470)', () => {
  it('names the stage on every chip, not just its colour', () => {
    const el = mount(
      <EventCalendar audience="team" events={THREE_KINDS} initialYear={2026} initialMonth1={9} />,
    )
    expect(chipKeys(el)).toEqual(['planning', 'private', 'todos'])
    expect(chipWords(el)).toEqual(['Planning', 'Private', 'To-do'])
  })

  it('paints the three kinds that used to share bg-info-bg in three different colours', () => {
    const el = mount(
      <EventCalendar audience="team" events={THREE_KINDS} initialYear={2026} initialMonth1={9} />,
    )
    const classes = chipClasses(el)
    expect(classes).toHaveLength(3)
    expect(classes[0]).toContain('bg-info-bg')
    expect(classes[1]).toContain('bg-broadcast-bg')
    expect(classes[2]).toContain('bg-move-bg')
    expect(new Set(classes).size).toBe(3)
  })

  it(`abbreviates at ${NARROW_GRID_WIDTH}px rather than dropping the word`, () => {
    setViewport(NARROW_GRID_WIDTH)
    const el = mount(
      <EventCalendar
        audience="team"
        events={[item({ slug: 'plng', title: 'Solstice', dayKey: '2026-09-10', layer: 'pencil', stage: 'planning' })]}
        initialYear={2026}
        initialMonth1={9}
      />,
    )
    expect(chipWords(el)).toEqual([CALENDAR_PRESENTATIONS.planning.shortWord])
    expect(chipWords(el)[0]).not.toBe('')
    // The title is still there; it is the thing that gave up the pixels.
    expect(el.textContent).toContain('Solstice')
  })

  it('measures the width itself where there are no media queries', () => {
    // jsdom has no matchMedia, which is the fallback path: the rule still has to fire.
    const real = window.innerWidth
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: NARROW_GRID_WIDTH })
      const el = mount(
        <EventCalendar
          audience="team"
          events={[item({ slug: 'plng', title: 'Solstice', dayKey: '2026-09-10', layer: 'pencil', stage: 'planning' })]}
          initialYear={2026}
          initialMonth1={9}
        />,
      )
      expect(chipWords(el)).toEqual([CALENDAR_PRESENTATIONS.planning.shortWord])
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: real })
    }
  })

  it('prints the word in full one pixel wider', () => {
    setViewport(NARROW_GRID_WIDTH + 1)
    const el = mount(
      <EventCalendar
        audience="team"
        events={[item({ slug: 'plng', title: 'Solstice', dayKey: '2026-09-10', layer: 'pencil', stage: 'planning' })]}
        initialYear={2026}
        initialMonth1={9}
      />,
    )
    expect(chipWords(el)).toEqual(['Planning'])
  })

  // ── BOTH HALVES OF THE 2026-09-23 RULING ──────────────────────────────────────────────────
  // The team half is the cases above. These two are the member half, and they are here so the word
  // cannot creep back onto a public Space calendar unnoticed: a test that only pinned the new
  // behaviour would have let exactly that happen.

  it('says no word at all on a member-facing calendar, where every row is an event', () => {
    const el = mount(<EventCalendar events={THREE_KINDS} initialYear={2026} initialMonth1={9} />)
    expect(chipWords(el)).toEqual([])
    expect(el.querySelector('[data-calendar-chip-word]')).toBeNull()
    // The chips are all there; it is only the word that is not.
    expect(chipIdentities(el)).toEqual(['planning', 'private', 'todos'])
    // The word is what separates KINDS. A public calendar shows one kind, so it separates nothing.
    expect(el.textContent).not.toContain('Planning')
    expect(el.textContent).not.toContain('Event')
  })

  it('keeps all three colours on the member calendar even with the word gone', () => {
    const el = mount(<EventCalendar events={THREE_KINDS} initialYear={2026} initialMonth1={9} />)
    const classes = chipClasses(el)
    expect(classes).toHaveLength(3)
    expect(classes[0]).toContain('bg-info-bg')
    expect(classes[1]).toContain('bg-broadcast-bg')
    expect(classes[2]).toContain('bg-move-bg')
    expect(new Set(classes).size).toBe(3)
    // The events layer stays off the translucent ground that measured 4.45:1 on the member shell.
    const events = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    expect(chipClasses(events)[0]).toContain('bg-primary-bg')
    expect(chipClasses(events)[0]).not.toContain('bg-primary/10')
  })

  it('still calls the same published date a Production for the team', () => {
    const team = mount(<EventCalendar audience="team" events={[item()]} initialYear={2026} initialMonth1={9} />)
    expect(chipWords(team)).toEqual(['Production'])
  })
})

describe('the popup says the same word in the same tone (LIVE-470)', () => {
  it('opens a stage pill that is not the Draft grey', () => {
    const el = mount(
      <EventCalendar
        audience="team"
        events={[item({ slug: 'plng', title: 'Solstice', dayKey: '2026-09-10', layer: 'pencil', stage: 'production' })]}
        initialYear={2026}
        initialMonth1={9}
      />,
    )
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-calendar-chip-word]')!.closest('button')!.click()
    })
    const pill = document.body.querySelector('[data-calendar-stage]')
    expect(pill?.getAttribute('data-calendar-stage')).toBe('production')
    expect(pill?.textContent).toBe('Production')
    expect(pill?.querySelector('span')?.className).toContain('bg-success-bg')
  })

  it('shows no stage pill in a member-facing popup', () => {
    const el = mount(<EventCalendar events={[item()]} initialYear={2026} initialMonth1={9} />)
    act(() => {
      el.querySelector<HTMLButtonElement>('[data-calendar-chip]')!.click()
    })
    expect(document.body.querySelector('[data-calendar-stage]')).toBeNull()
    expect(document.body.textContent).toContain('New moon sit')
  })
})
