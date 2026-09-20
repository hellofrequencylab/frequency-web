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
  title: 'New moon sit',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  stageLabel: 'Production',
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
})
