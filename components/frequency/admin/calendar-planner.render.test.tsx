// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarPlanner } from './calendar-planner'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { CrmTask } from '@/lib/crm/tasks-core'

// THE FREQUENCY CALENDAR PLANNER: one toolbar whose layer chips count the month and toggle, a day grid a
// keyboard can walk, a quick add that asks what before it opens a form, and a side bar built only from
// real rows whose to-do box goes through the existing action.

const mocks = vi.hoisted(() => ({
  setSpaceTaskDone: vi.fn(async (..._args: unknown[]) => ({ data: undefined })),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/entry-actions', () => ({
  saveCalendarEntry: async () => ({ data: undefined }),
  deleteCalendarEntry: async () => ({ data: undefined }),
  findEntryClashes: async () => [],
  loadStaffCalendarMonth: async () => [],
  pickPencilDate: async () => ({ data: undefined }),
  skipPencilDate: async () => ({ data: undefined }),
  saveCalendarEntryOccurrence: async () => ({ data: undefined }),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-actions', () => ({
  createPenciledPlan: async () => ({ data: { id: 'plan-1', entryId: 'entry-1' } }),
  startPlanFromEntry: async () => ({ data: { id: 'plan-1' } }),
  joinEntryToPlan: async () => ({ data: undefined }),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-drawer', () => ({ PlanDrawer: () => null }))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/task-actions', () => ({ setSpaceTaskDone: mocks.setSpaceTaskDone }))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  mocks.setSpaceTaskDone.mockClear()
})

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    slug: 'open-house',
    title: 'Open house',
    dayKey: '2026-09-20',
    timeLabel: '7 PM',
    whenLabel: 'Sun, Sep 20',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'events',
    ...over,
  }
}

const todo: CrmTask = {
  id: 'task-1',
  spaceId: 'space-1',
  contactId: null,
  assigneeProfileId: null,
  title: 'Book the sound tech',
  notes: null,
  dueAt: null,
  status: 'open',
  createdBy: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  planId: null,
  dueOffsetDays: null,
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      <CalendarPlanner
        slug="lab"
        spaceId="space-1"
        brandName="Lab"
        events={[event()]}
        initialYear={2026}
        initialMonth1={9}
        todayKey="2026-09-16"
        canEdit
        spaceTimeZone="America/Los_Angeles"
        dayNotes={[]}
        skyMarkers={[]}
        plans={[]}
        pencilByPlan={{}}
        upNext={[{ id: 'e1', title: 'Open house', whenLabel: 'Sun, Sep 20, 7 PM', href: '/events/open-house/manage', isDraft: false }]}
        todos={[todo]}
        upcomingCount={1}
        newEventHref="/events/new?space=space-1"
        httpsUrl="https://example.test/spaces/lab/calendar.ics"
        webcalUrl="webcal://example.test/spaces/lab/calendar.ics"
      />,
    ),
  )
}

const chip = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label^="${name},"]`)
const day = (key: string) => document.querySelector<HTMLElement>(`[data-grid-day="${key}"]`)

describe('the calendar planner', () => {
  it('counts the month on each layer chip and toggles it', async () => {
    await mount()
    expect(chip('Events')?.getAttribute('aria-label')).toBe('Events, 1 this month')
    expect(chip('Events')?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => chip('Events')!.click())
    expect(chip('Events')?.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('button[title="Open house"]')).toBeNull()
  })

  it('draws the month as a grid a keyboard can walk, today holding the tab stop', async () => {
    await mount()
    expect(document.querySelector('[role="grid"]')).not.toBeNull()
    expect(day('2026-09-16')?.getAttribute('tabindex')).toBe('0')
    expect(day('2026-09-16')?.hasAttribute('data-day-today')).toBe(true)
    expect(day('2026-09-15')?.hasAttribute('data-day-past')).toBe(true)
    expect(day('2026-09-19')?.hasAttribute('data-day-weekend')).toBe(true)
    day('2026-09-16')!.focus()
    await act(async () => day('2026-09-16')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.activeElement).toBe(day('2026-09-23'))
    expect(day('2026-09-23')?.getAttribute('tabindex')).toBe('0')
  })

  it('asks what to add before it opens a form, on Enter or a click on the day', async () => {
    await mount()
    day('2026-09-22')!.focus()
    await act(async () => day('2026-09-22')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    const dialog = document.querySelector('[data-calendar-quick-add]')
    expect(dialog?.textContent).toContain('Add on Tue, Sep 22')
    const names = [...dialog!.querySelectorAll('a, button')].map((el) => el.firstChild?.textContent?.trim())
    expect(names).toEqual(['New event', 'Pencil it in', 'Unavailable', 'Private entry'])
    await act(async () => [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Unavailable'))!.click())
    expect(document.getElementById('calendar-entry-title')?.textContent).toBe('Add to calendar')
  })

  it('lists Up next and the open to-dos, and ticks a to-do through the existing action', async () => {
    await mount()
    const side = document.getElementById('calendar-planning')!
    expect(side.textContent).toContain('Up next')
    expect(side.textContent).toContain('Book the sound tech')
    expect(side.textContent).not.toContain('In the works')
    const box = side.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => box.click())
    expect(mocks.setSpaceTaskDone).toHaveBeenCalledWith('lab', 'task-1', true)
  })
})
