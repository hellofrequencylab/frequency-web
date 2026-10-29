// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SiteMonth } from './site-month'
import { SITE_MONTH_CSS } from './site-month-css'
import { publicSiteItems } from '@/lib/calendar/site-month'
import type { CalendarEvent } from '@/lib/calendar/item'

// Pass 10: the website month. Day cells with chips, a marker on today, paging inside the loaded window,
// the Agenda, and the popup an event opens.

let container: HTMLDivElement | null = null
let root: Root | null = null

// The page asks the clock for today, so the clock is the test's.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T19:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
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

const ev = (slug: string, title: string, dayKey: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  slug,
  title,
  dayKey,
  timeLabel: '7:00 PM',
  whenLabel: 'Thu, Oct 15, 7:00 PM PDT',
  startInstantIso: null,
  location: 'Encinitas',
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
  layer: 'events',
  ...extra,
})

const items = publicSiteItems([
  ev('cn', 'Circle Night', '2026-10-15'),
  ev('bw', 'Breathwork Saturday', '2026-10-24'),
  ev('x1', 'One', '2026-10-20'),
  ev('x2', 'Two', '2026-10-20'),
  ev('x3', 'Three', '2026-10-20'),
  ev('x4', 'Four', '2026-10-20'),
  ev('hold', 'Team pencil', '2026-10-21', { layer: 'works' as never, stage: 'pencil' }),
  ev('nov', 'November Gathering', '2026-11-05'),
])

const props = { items, today: '2026-10-15', timeZone: null, openYm: '2026-10', minYm: '2026-08', maxYm: '2026-12', eventOrigin: 'https://frequencylocal.com', brandName: 'Meld' }

describe('the website month', () => {
  it('draws the month with a chip per gathering, today marked, and never a Pencil', () => {
    const el = mount(<SiteMonth {...props} />)
    const grid = el.querySelector('.sm-month-panel')!
    expect(el.querySelector('[data-site-month]')?.getAttribute('data-view')).toBe('auto')
    expect(el.querySelector('.sm-title')?.textContent).toBe('October 2026')
    // Before anyone chooses, the control names what a wide screen shows.
    expect(el.querySelector('[data-segmented] button[aria-pressed="true"]')?.textContent).toBe('Month')
    expect(grid.querySelectorAll('.sm-day[data-today]')).toHaveLength(1)
    expect(grid.querySelector('.sm-day[data-today]')?.textContent).toContain('Circle Night')
    expect(el.textContent).not.toContain('Team pencil')
    // Three chips and a "+1 more" on the busy day.
    const busy = [...grid.querySelectorAll('.sm-day')].find((d) => d.textContent?.includes('One'))!
    expect(busy.querySelectorAll('.sm-chip')).toHaveLength(3)
    expect(busy.querySelector('.sm-more')?.textContent).toBe('+1 more')
  })

  it('pages inside the loaded window and stops at its edges', () => {
    const el = mount(<SiteMonth {...props} openYm="2026-12" />)
    const next = el.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')!
    expect(next.disabled).toBe(true)
    expect(el.textContent).toContain('This is as far ahead as the calendar loads.')
    act(() => el.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!.click())
    expect(el.querySelector('.sm-title')?.textContent).toBe('November 2026')
    expect(el.querySelector('.sm-month-panel')?.textContent).toContain('November Gathering')
  })

  it('switches to the Agenda and opens an event preview', () => {
    const el = mount(<SiteMonth {...props} />)
    const agendaBtn = [...el.querySelectorAll<HTMLButtonElement>('[data-segmented] button')].find((b) => b.textContent === 'Agenda')!
    act(() => agendaBtn.click())
    expect(el.querySelector('[data-site-month]')?.getAttribute('data-view')).toBe('agenda')
    const row = [...el.querySelectorAll<HTMLButtonElement>('.sm-agenda .sm-chip')].find((b) => b.textContent?.includes('Breathwork'))!
    act(() => row.click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Breathwork Saturday')
    expect(dialog?.textContent).toContain('Encinitas')
  })
})

describe('the website month sheet', () => {
  it('is scoped, tokened, and carries no literal colour or px type size', () => {
    const lines = SITE_MONTH_CSS.split('\n').filter((l) => l.trim() && !l.startsWith('/*') && !l.startsWith(' ') && !l.startsWith('@') && !l.startsWith('}'))
    // Every rule opens on the component's own scope.
    for (const l of lines) expect(l.startsWith('[data-site-month]'), l).toBe(true)
    expect(SITE_MONTH_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(SITE_MONTH_CSS).not.toMatch(/\b(?:rgba?|hsla?|oklch|lab|lch)\(/)
    expect(SITE_MONTH_CSS).not.toMatch(/font-size:\s*[\d.]+(?:px|rem|em)/)
    expect(SITE_MONTH_CSS).not.toMatch(/--fq-/)
  })
})
