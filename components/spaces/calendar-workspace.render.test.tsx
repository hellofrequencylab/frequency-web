// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkspace } from './calendar-workspace'
import type { CalendarEvent } from '@/lib/calendar/item'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  moveCalendarProjectStage: async () => ({}),
  loadStaffCalendarMonth: async () => [],
}))

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
}

describe('CalendarWorkspace', () => {
  it('lists Guest first and slides to List without a view Link', () => {
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="admin"
        initialListItem={null}
        initialYear={2026}
        initialMonth1={9}
        timelineYear={2026}
        timelineMonth1={9}
        todayKey="2026-09-19"
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[sit]}
        dayNotes={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    const labels = [...el.querySelectorAll('[aria-label="Calendar views"] button')].map((n) => n.textContent)
    expect(labels).toEqual(['Guest', 'Admin', 'List', 'Timeline', 'Projects'])
    expect(el.querySelector('[data-calendar-view="admin"]')).not.toBeNull()
    expect(el.querySelector('a[href*="view=list"]')).toBeNull()
    act(() => {
      el.querySelectorAll('[aria-label="Calendar views"] button')[2]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(el.querySelector('[data-calendar-view="list"]')).not.toBeNull()
    expect(el.textContent).toContain('New moon sit')
    expect(el.textContent).toContain('Go to event')
    expect(el.textContent).not.toContain('—')
  })

  it('keeps unsigned visitors on Guest with no view control', () => {
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed={false}
        canManage={false}
        initialView="admin"
        initialListItem={null}
        initialYear={2026}
        initialMonth1={9}
        timelineYear={2026}
        timelineMonth1={9}
        todayKey="2026-09-19"
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[]}
        dayNotes={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    expect(el.querySelector('[data-calendar-view="guest"]')).not.toBeNull()
    expect(el.querySelector('[aria-label="Calendar views"]')).toBeNull()
  })
})
