// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarListView } from './calendar-list-view'

vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
}))
import type { ListIndexItem } from '@/lib/calendar/list-index'

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
    expect(el.querySelector('[aria-label="Gatherings"]')?.className).toContain('lg:w-52')
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
})
