// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkspace } from './calendar-workspace'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  moveCalendarProjectStage: async () => ({}),
  loadStaffCalendarMonth: async () => [],
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-actions', () => ({
  listPlanTodos: async () => [],
  planReadiness: async () => ({ gaps: [], href: '/events/new?plan=plan-1' }),
  saveSpacePlan: async () => ({ data: undefined }),
  transitionPlanStage: async () => ({}),
  // The repair door (PROG-CAL3): the drawer lists the Space's events on open so a broken
  // events.plan_id can be re-attached in the app. Empty here; the render is what this pins.
  listPlanLinkableEvents: async () => [],
  attachEventToPlan: async () => ({ data: undefined }),
}))

vi.mock('@/components/events/event-share-button', () => ({
  EventShareButton: ({ title }: { title: string }) => <button type="button">Share {title}</button>,
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
  planId: 'plan-1',
}

const plan: SpacePlan = {
  id: 'plan-1',
  spaceId: 'space-1',
  title: 'New moon production',
  stage: 'plan',
  notes: null,
  links: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
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
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[sit]}
        dayNotes={[]}
        plans={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    const labels = [...el.querySelectorAll('[aria-label="Calendar views"] button')].map((n) => n.textContent)
    expect(labels).toEqual(['Calendar', 'List', 'Workflow'])
    expect(el.querySelector('[data-calendar-view="admin"]')).not.toBeNull()
    expect(el.querySelector('[data-calendar-admin-grid]')).not.toBeNull()
    expect(el.querySelector('[data-calendar-pm-console]')).toBeNull()
    expect(el.querySelector('a[href*="view=list"]')).toBeNull()
    act(() => {
      el.querySelectorAll('[aria-label="Calendar views"] button')[1]?.dispatchEvent(
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
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[]}
        dayNotes={[]}
        plans={[]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    expect(el.querySelector('[data-calendar-view="guest"]')).not.toBeNull()
    expect(el.querySelector('[aria-label="Calendar views"]')).toBeNull()
  })

  it('opens the shared Plan drawer from List and synchronizes its URL state', async () => {
    window.history.replaceState(null, '', '/spaces/lab/calendar?view=list')
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="list"
        initialListItem={null}
        initialPlanId={null}
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[sit]}
        guestFirstUse={false}
        adminEvents={[sit]}
        dayNotes={[]}
        plans={[plan]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    await act(async () => {
      ;[...el.querySelectorAll('button')].find((button) => button.textContent === 'Open Plan')?.click()
      await Promise.resolve()
    })
    expect(document.querySelector('[data-plan-production-summary]')?.textContent).toContain('New moon production')
    expect(document.querySelector('[data-plan-production-summary]')?.textContent).toContain('Readiness')
    expect(window.location.search).toContain('view=list')
    expect(window.location.search).toContain('plan=plan-1')
  })

  it('reconciles a Plan drawer stage save across Workflow and List immediately', async () => {
    const planningEntry: CalendarEvent = {
      ...sit,
      eventId: undefined,
      entryId: 'entry-1',
      layer: 'pencil',
      stage: 'planning',
      sourceLabel: 'Planning',
    }
    const el = mount(
      <CalendarWorkspace
        slug="lab"
        spaceId="space-1"
        brandName="Frequency Lab"
        adminAllowed
        canManage
        initialView="admin"
        initialListItem={null}
        initialPlanId="plan-1"
        initialYear={2026}
        initialMonth1={9}
        guestEvents={[]}
        guestFirstUse={false}
        adminEvents={[planningEntry]}
        dayNotes={[]}
        plans={[plan]}
        subscribe={null}
        loadGuestMonth={async () => []}
      />,
    )
    await act(async () => {
      const stage = document.querySelector<HTMLSelectElement>('#plan-stage')!
      stage.value = 'production'
      stage.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector<HTMLFormElement>('[data-plan-production-summary]')!.closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    act(() => {
      el.querySelectorAll('[aria-label="Calendar views"] button')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-workflow-column="production"] [data-workflow-card="plan-1"]')).not.toBeNull()
    act(() => {
      el.querySelectorAll('[aria-label="Calendar views"] button')[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(el.querySelector('[data-calendar-list-viewer]')?.textContent).toContain('Production')
  })
})
