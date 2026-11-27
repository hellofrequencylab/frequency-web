// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { CalendarWorkspace } from './calendar-workspace'
import type { CalendarEvent } from '@/lib/calendar/item'

// THE PUBLIC CALENDAR TAB (SCAN-1344). One guest calendar for every viewer, the Space's team
// included, with one button to the team calendar for a viewer who may run the Space's events. The
// operator half this file used to pin (the staff grid, List, Workflow, the console, Ask Vera, the
// Plan drawer) left this tab; the team calendar's own tests live with components/calendar-suite.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
}))

// Every grid mount, counted at its MOUNT effect, so the hydration test can say how many times the
// calendar was built rather than infer it (LIVE-481).
const grid = vi.hoisted(() => ({ mounts: 0 }))
vi.mock('@/components/events/event-calendar', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/components/events/event-calendar')>()
  function CountedEventCalendar(props: Parameters<typeof mod.EventCalendar>[0]) {
    useEffect(() => {
      grid.mounts += 1
    }, [])
    return <mod.EventCalendar {...props} />
  }
  return { ...mod, EventCalendar: CountedEventCalendar }
})

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

const sit: CalendarEvent = {
  slug: 'sit',
  title: 'New moon sit',
  dayKey: '2026-09-22',
  timeLabel: '7:00 PM',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  startInstantIso: '2026-09-22T19:00:00.000Z',
  location: null,
  goingCount: 4,
  coverUrl: null,
  isCancelled: false,
  eventId: 'evt-1',
  planId: null,
}

function props(overrides: Partial<Parameters<typeof CalendarWorkspace>[0]> = {}) {
  return {
    slug: 'lab',
    brandName: 'Frequency Lab',
    initialYear: 2026,
    initialMonth1: 9,
    guestEvents: [sit],
    guestFirstUse: false,
    subscribe: null,
    loadGuestMonth: async () => [],
    ...overrides,
  }
}

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container!
}

function remount(node: React.ReactNode) {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  return mount(node)
}

describe('CalendarWorkspace, the public Calendar tab', () => {
  it('gives a visitor a REACHABLE view switch, and only the surfaces they have', () => {
    const el = mount(<CalendarWorkspace {...props()} />)
    expect(el.querySelector('[data-calendar-view="guest"]')).not.toBeNull()
    const box = el.querySelector('[aria-label="How to see the calendar"]')
    expect(box).not.toBeNull()
    const labels = [...box!.querySelectorAll('button')].map((n) => n.textContent)
    expect(labels).toEqual(['Month', 'Agenda'])
    expect(el.querySelector('[data-calendar-page-view-switch]')).not.toBeNull()

    // And it WORKS: pressing Agenda moves the grid to its agenda, in place.
    expect(el.querySelector('[data-calendar-list]')).toBeNull()
    act(() => {
      ;[...box!.querySelectorAll('button')]
        .find((b) => b.textContent === 'Agenda')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-calendar-list]')).not.toBeNull()
  })

  it('shows the team the same calendar, plus one button to the team calendar (SCAN-1344)', () => {
    const visitor = mount(<CalendarWorkspace {...props()} />)
    expect(visitor.querySelector('[data-calendar-team-link]')).toBeNull()
    expect(visitor.textContent).not.toContain('Open team calendar')

    const team = remount(<CalendarWorkspace {...props({ showTeamLink: true })} />)
    const link = team.querySelector<HTMLAnchorElement>('a[data-calendar-team-link]')
    expect(link?.getAttribute('href')).toBe('/spaces/lab/settings/calendar')
    expect(link?.textContent).toContain('Open team calendar')
    // The rest is the guest calendar, exactly: no second team calendar, no console, no Vera.
    expect(team.querySelector('[data-calendar-view="guest"]')).not.toBeNull()
    expect(team.textContent).not.toContain('Guest preview')
    expect(team.querySelector('[data-calendar-console-open]')).toBeNull()
    expect(team.querySelector('[data-vera-calendar-box]')).toBeNull()
    expect(team.querySelectorAll('[data-calendar-root]').length).toBe(1)
  })

  it('features the Up next band above the control bar, and nothing at all when it is empty', () => {
    const el = mount(<CalendarWorkspace {...props({ upcoming: <section data-space-upcoming-feed>Up next</section> })} />)
    const band = el.querySelector('[data-space-upcoming-feed]')
    const bar = el.querySelector('[data-calendar-page-header]')
    expect(band).not.toBeNull()
    expect(bar).not.toBeNull()
    expect(band!.compareDocumentPosition(bar!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const bare = remount(<CalendarWorkspace {...props()} />)
    expect(bare.querySelector('[data-space-upcoming-feed]')).toBeNull()
    expect(bare.textContent).not.toContain('Up next')
  })

  it('draws the member layer filter only when the Space has more than one layer', () => {
    const one = mount(<CalendarWorkspace {...props({ memberLayers: [] })} />)
    expect(one.querySelector('[data-calendar-page-layers]')).toBeNull()

    const two = remount(<CalendarWorkspace {...props({ memberLayers: ['events', 'unavailable'] })} />)
    const chips = two.querySelector('[data-calendar-page-layers]')
    expect(chips).not.toBeNull()
    expect([...chips!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Events', 'Unavailable'])
  })

  it('gives a visitor the month, its paging and a way to change view, each drawn once', () => {
    const el = mount(<CalendarWorkspace {...props()} />)
    const bar = el.querySelector<HTMLElement>('[data-calendar-page-header]')!
    expect(bar.querySelector('[data-calendar-page-month] button [aria-live="polite"]')?.textContent).toBe('September 2026')
    expect(bar.querySelector('[aria-label="Previous month"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="Next month"]')).not.toBeNull()
    // The grid it steers draws none of them itself, so there is exactly one of each.
    expect(el.querySelectorAll('[aria-label="Previous month"]').length).toBe(1)
    expect(el.querySelectorAll('[aria-label="How to see the calendar"]').length).toBe(1)

    act(() => {
      bar.querySelector('[aria-label="Next month"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bar.querySelector('[data-calendar-page-month] button [aria-live="polite"]')?.textContent).toBe('October 2026')
  })

  it('hydrates the grid in place, with one build', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar')
    const p = props({ showTeamLink: true })
    vi.stubGlobal('window', undefined)
    let html: string
    try {
      html = renderToString(<CalendarWorkspace {...p} />)
    } finally {
      vi.unstubAllGlobals()
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html
    const serverGrid = container.querySelector('[data-calendar-root]')!
    const recoverable: unknown[] = []
    grid.mounts = 0
    await act(async () => {
      root = hydrateRoot(container!, <CalendarWorkspace {...p} />, { onRecoverableError: (e) => recoverable.push(e) })
    })
    expect(recoverable).toEqual([])
    expect(container.querySelector('[data-calendar-root]')).toBe(serverGrid)
    expect(grid.mounts).toBe(1)
  })
})
