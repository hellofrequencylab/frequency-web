// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  moveCalendarProjectStage: async () => ({}),
}))
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarProjectsView } from './calendar-projects-view'
import { projectBoard } from '@/lib/calendar/project-board'
import type { CalendarEvent } from '@/lib/calendar/item'

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

const pencil: CalendarEvent = {
  slug: 'entry-1',
  title: 'New moon sit',
  dayKey: '2026-09-22',
  timeLabel: '7:00 PM',
  whenLabel: 'Tue, 2026-09-22, 7:00 PM PDT',
  startInstantIso: '2026-09-22T19:00:00.000Z',
  location: null,
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
  stage: 'pencil',
  layer: 'pencil',
  entryId: 'aaaa',
}

describe('CalendarProjectsView', () => {
  it('lays Pencil, Planning, Production, and Cancelled as columns', () => {
    const el = mount(
      <CalendarProjectsView
        slug="lab"
        columns={projectBoard([pencil, { ...pencil, slug: 'show', title: 'Published sit', stage: null, layer: 'events', entryId: null }])}
        canManage
      />,
    )
    expect(el.querySelector('[data-calendar-projects-view]')).not.toBeNull()
    expect(el.querySelector('[data-project-column="pencil"]')?.textContent).toContain('New moon sit')
    expect(el.querySelector('[data-project-column="production"]')?.textContent).toContain('Published sit')
    expect(el.querySelector('[data-project-column="planning"]')).not.toBeNull()
    expect(el.querySelector('[data-project-column="cancelled"]')).not.toBeNull()
    expect(el.textContent).not.toContain('—')
  })
})
