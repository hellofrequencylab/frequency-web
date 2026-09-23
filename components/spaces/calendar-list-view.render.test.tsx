// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarListView } from './calendar-list-view'

vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
}))
import { listIndexItems, type ListIndexItem } from '@/lib/calendar/list-index'
import { CALENDAR_PRESENTATIONS } from '@/lib/calendar/registry'

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

const sit: ListIndexItem = {
  key: 'sit|2026-09-22',
  dayKey: '2026-09-22',
  title: 'New moon sit',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  stageLabel: 'Production',
  stageTone: 'success',
  href: '/events/sit',
  editHref: '/events/sit/manage?section=settings',
  publicSlug: 'sit',
  isCancelled: false,
  eventId: 'evt-1',
  entryId: null,
  location: 'The loft',
  description: null,
  notes: null,
  goingCount: 4,
  coverUrl: null,
  startInstantIso: '2026-09-22T19:00:00.000Z',
  stage: null,
  planId: null,
}

describe('CalendarListView', () => {
  it('puts the index on the left and the selected gathering in the viewer', () => {
    const el = mount(
      <CalendarListView
        items={[sit]}
        selected={sit}
        onSelect={() => {}}
      />,
    )
    expect(el.querySelector('[data-calendar-list-view]')).not.toBeNull()
    // The index is the kit's segmented box, stacked, inside the rail column (HYG-105).
    const rail = el.querySelector('[aria-label="Gatherings"]')
    expect(rail?.getAttribute('role')).toBe('group')
    expect(rail?.parentElement?.className).toContain('lg:w-52')
    const viewer = el.querySelector('[data-calendar-list-viewer]')
    const header = viewer?.querySelector('header')
    expect(header?.textContent).toContain('New moon sit')
    expect(header?.textContent).toContain('Production')
    expect(el.textContent).toContain('The loft')
    expect(el.textContent).toContain('Share')
    expect(el.textContent).toContain('Going')
    expect(el.textContent).toContain('Go to event')
    expect(el.textContent).not.toContain('Manage')
    expect(el.textContent).not.toContain('—')
  })

  it('shows only the number it has: Going for an event, and no glance at all for a Pencil (LIVE-468)', () => {
    const el = mount(<CalendarListView items={[sit]} selected={sit} onSelect={() => {}} />)
    expect(el.textContent).toContain('At a glance')
    expect(el.textContent).toContain('Going')
    // These were hard-coded to 0 under every row; the index never reads them, so it never shows them.
    for (const madeUp of ['Interested', 'Waitlist', 'Checked in', 'Sold', 'Revenue', 'Capacity']) {
      expect(el.textContent).not.toContain(madeUp)
    }
    const pencil: ListIndexItem = {
      ...sit,
      key: 'entry-2|2026-09-30',
      title: 'Harvest sit',
      stageLabel: 'Pencil',
      stageTone: 'neutral',
      stage: 'pencil',
      href: null,
      editHref: null,
      publicSlug: null,
      eventId: null,
      entryId: 'entry-2',
      goingCount: 0,
    }
    const el2 = mount(<CalendarListView items={[pencil]} selected={pencil} onSelect={() => {}} />)
    expect(el2.textContent).not.toContain('At a glance')
    expect(el2.textContent).not.toContain('Going')
  })

  it('uses the kit empty when there is nothing to run', () => {
    const el = mount(<CalendarListView items={[]} selected={null} onSelect={() => {}} />)
    expect(el.textContent).toContain('Nothing to run yet.')
  })

  // The owner's report, 2026-09-21: "I just cancelled a plan in the calendar. It shows cancelled but the
  // calendar listing still shows blue." The List view auto-selects the earliest row, and the selected
  // style was the brand fill, which painted over the strike. A cancelled row is grey and struck through
  // whether or not it is selected; selection is then its edge alone (lib/calendar/registry.ts).
  it('keeps a selected cancelled row grey and struck through, never the brand fill', () => {
    const calledOff: ListIndexItem = {
      ...sit,
      key: 'entry-1|2026-09-20',
      title: 'Called off',
      stageLabel: 'Cancelled',
      stageTone: 'danger',
      stage: 'cancelled',
      isCancelled: true,
      href: null,
      editHref: null,
      publicSlug: null,
      eventId: null,
      entryId: 'entry-1',
    }
    const el = mount(<CalendarListView items={[calledOff, sit]} selected={calledOff} onSelect={() => {}} />)
    const row = el.querySelector('[data-calendar-list-row="cancelled"]') as HTMLButtonElement
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(row.className).toContain('line-through')
    expect(row.className).toContain('text-muted')
    expect(row.className).not.toContain('bg-primary')
    expect(row.className).not.toContain('text-primary-strong')
    expect(row.textContent).toContain('Cancelled.')
    const live = el.querySelector('[data-calendar-list-row="event"]') as HTMLButtonElement
    expect(live.className).not.toContain('line-through')
    const heading = el.querySelector('#calendar-list-viewer')
    expect(heading?.className).toContain('line-through')
    expect(heading?.className).toContain('text-muted')
    const header = el.querySelector('[data-calendar-list-viewer] header')
    expect(header?.textContent).toContain('Cancelled')
  })

  it('takes the stage badge tone from the registry, not from the label string', () => {
    const planning: ListIndexItem = { ...sit, key: 'p|2026-09-23', title: 'Planned', stageLabel: 'Planning', stageTone: 'info', stage: 'planning' }
    const el = mount(<CalendarListView items={[planning]} selected={planning} onSelect={() => {}} />)
    const header = el.querySelector('[data-calendar-list-viewer] header')
    const chip = [...(header?.querySelectorAll('span') ?? [])].find((n) => n.textContent === 'Planning')
    expect(chip?.className).toContain('bg-info-bg')
    expect(chip?.className).not.toContain('signal')
    const live = el.querySelector('[data-calendar-list-row="planning"]') as HTMLButtonElement
    expect(live.className).toContain('bg-primary-bg')
  })

  it('brings the console to the tap when the two are stacked (LIVE-469)', () => {
    // A phone stacks the index above the console, so a pick used to re-render a screen below the
    // fold and look like nothing happened. Stacked, the console takes focus and scrolls itself in.
    const matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, writable: true, configurable: true })
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled as unknown as Element['scrollIntoView']
    try {
      const el = mount(<CalendarListView items={[sit]} selected={null} onSelect={() => {}} />)
      const viewer = el.querySelector<HTMLElement>('section[aria-labelledby="calendar-list-viewer"]')!
      act(() => root!.render(<CalendarListView items={[sit]} selected={sit} onSelect={() => {}} />))
      expect(document.activeElement).toBe(viewer)
      expect(scrolled).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: original, writable: true, configurable: true })
    }
  })

  it('says the stage word in the registry\'s tone, the same one the grid chip takes (LIVE-470)', () => {
    const planning = listIndexItems([
      {
        slug: 'entry-9',
        title: 'Solstice',
        dayKey: '2026-12-21',
        timeLabel: '7:00 PM',
        whenLabel: 'Mon, Dec 21, 7:00 PM PST',
        startInstantIso: '2026-12-21T19:00:00.000Z',
        location: null,
        goingCount: 0,
        coverUrl: null,
        isCancelled: false,
        layer: 'pencil',
        stage: 'planning',
        entryId: 'entry-9',
      },
    ])[0]
    expect(planning.stageLabel).toBe(CALENDAR_PRESENTATIONS.planning.word)
    expect(planning.stageTone).toBe(CALENDAR_PRESENTATIONS.planning.tone)
    const el = mount(<CalendarListView items={[planning]} selected={planning} onSelect={() => {}} />)
    const pill = el.querySelector('[data-calendar-list-viewer] header span:last-child')
    expect(pill?.textContent).toBe('Planning')
    expect(pill?.className).toContain('bg-info-bg')
  })

  it('leaves the page alone when the index and console sit side by side (LIVE-469)', () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, writable: true, configurable: true })
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled as unknown as Element['scrollIntoView']
    try {
      mount(<CalendarListView items={[sit]} selected={null} onSelect={() => {}} />)
      act(() => root!.render(<CalendarListView items={[sit]} selected={sit} onSelect={() => {}} />))
      expect(scrolled).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(document.body)
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: original, writable: true, configurable: true })
    }
  })
})
