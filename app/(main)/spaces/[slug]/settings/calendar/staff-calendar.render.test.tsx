// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StaffCalendar } from './staff-calendar'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { EntryInput } from '@/lib/calendar/entries'

// LIVE-467, findings 3, 7 and 9, in the entry drawer:
//   3. "Cancel this date" on a Plan-linked date is the Plan's exit (entry-actions escalates a stage
//      change to transitionPlanStage, whose Cancelled row is `archived: true`), so it now says so;
//   7. "Start a Plan" and "Join a Plan" had no pending guard, so a double tap made two Plans;
//   9. "+" and "Pencil it in" always made a Plan, because the short form had no Type: Unavailable
//      time could only be made by pencilling a Plan and switching afterwards, and the Plan stayed.

const mocks = vi.hoisted(() => ({
  saveCalendarEntry: vi.fn(async (..._args: unknown[]) => ({ data: undefined })),
  createPenciledPlan: vi.fn(async (..._args: unknown[]) => ({ data: { id: 'plan-1', entryId: 'entry-1' } })),
  startPlanFromEntry: vi.fn(async (..._args: unknown[]) => ({ data: { id: 'plan-1' } })),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))
vi.mock('./entry-actions', () => ({
  saveCalendarEntry: mocks.saveCalendarEntry,
  deleteCalendarEntry: async () => ({ data: undefined }),
  findEntryClashes: async () => [],
  loadStaffCalendarMonth: async () => [],
  pickPencilDate: async () => ({ data: undefined }),
  skipPencilDate: async () => ({ data: undefined }),
}))
vi.mock('./plan-actions', () => ({
  createPenciledPlan: mocks.createPenciledPlan,
  startPlanFromEntry: mocks.startPlanFromEntry,
  joinEntryToPlan: async () => ({ data: undefined }),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mocks.saveCalendarEntry.mockClear()
  mocks.createPenciledPlan.mockClear()
  mocks.startPlanFromEntry.mockReset()
  mocks.startPlanFromEntry.mockResolvedValue({ data: { id: 'plan-1' } })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
}

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function entryInput(over: Partial<EntryInput> = {}): EntryInput {
  return {
    kind: 'pencil',
    title: 'Open house',
    holdExpiresOn: '',
    candidateDates: [],
    stage: 'pencil',
    description: '',
    notes: '',
    location: '',
    allDay: true,
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    startTime: '09:00',
    endTime: '10:00',
    timeZone: 'UTC',
    status: 'tentative',
    blocksTime: false,
    showPublicly: false,
    planId: null,
    repeat: '',
    exceptionDates: [],
    ...over,
  }
}

function pencilItem(over: Partial<CalendarEvent> = {}): CalendarEvent {
  const input = entryInput({ planId: over.planId ?? null })
  return {
    slug: 'entry-1',
    title: 'Open house',
    dayKey: '2026-09-20',
    timeLabel: 'All day',
    whenLabel: 'Sun, Sep 20',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'pencil',
    stage: 'pencil',
    entryId: 'entry-1',
    entryInput: input,
    ...over,
  }
}

const calendar = (events: CalendarEvent[] = []) => (
  <StaffCalendar slug="lab" spaceId="space-1" events={events} initialYear={2026} initialMonth1={9} canEdit plans={[]} />
)

/** Open the saved entry's drawer the way a person does: the grid chip, then Edit in the preview. */
async function openEdit() {
  await act(async () => (document.querySelector('button[title="Open house"]') as HTMLButtonElement).click())
  await act(async () => button('Edit')!.click())
}

describe('StaffCalendar: the short form offers the Type, and only an event on its way gets a Plan', () => {
  it('Unavailable time from "Pencil it in" saves an entry with no Plan', async () => {
    await mount(calendar())
    await act(async () => button('Pencil it in')!.click())
    const kind = document.querySelector('#entry-kind') as HTMLSelectElement
    expect(kind).not.toBeNull()
    await act(async () => changeSelect(kind, 'unavailable'))
    expect(document.querySelector('#calendar-entry-title')?.textContent).toBe('Add to calendar')
    expect(button('Add it')).toBeDefined()
    await act(async () => setInput(document.querySelector('#entry-start-date') as HTMLInputElement, '2026-09-21'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mocks.createPenciledPlan).not.toHaveBeenCalled()
    expect(mocks.saveCalendarEntry).toHaveBeenCalledTimes(1)
    const [, entryId, input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string | null, EntryInput]
    expect(entryId).toBeNull()
    expect(input).toMatchObject({ kind: 'unavailable', title: 'Unavailable', planId: null })
  })

  it('an event on its way still pencils a Plan through the one RPC path', async () => {
    await mount(calendar())
    await act(async () => button('Pencil it in')!.click())
    expect(document.querySelector('#calendar-entry-title')?.textContent).toBe('Pencil a date')
    await act(async () => setInput(document.querySelector('#entry-title') as HTMLInputElement, 'Solstice'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mocks.createPenciledPlan).toHaveBeenCalledTimes(1)
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
  })

  it('switching a Plan-linked date to Private drops the Plan link', async () => {
    await mount(calendar([pencilItem({ planId: 'plan-1' })]))
    await openEdit()
    await act(async () => changeSelect(document.querySelector('#entry-kind') as HTMLSelectElement, 'private'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const [, , input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string | null, EntryInput]
    expect(input).toMatchObject({ kind: 'private', planId: null, stage: null })
  })
})

describe('StaffCalendar: the Cancelled exit says what it reaches', () => {
  it('on a date that belongs to a Plan it reads "Cancel the Plan" and says every date goes', async () => {
    await mount(calendar([pencilItem({ planId: 'plan-1' })]))
    await openEdit()
    expect(button('Cancel the Plan')).toBeDefined()
    expect(button('Cancel this date')).toBeUndefined()
    expect(document.querySelector('#entry-cancel-plan-hint')?.textContent).toContain('every date on it')
  })

  it('on a date with no Plan it stays "Cancel this date"', async () => {
    await mount(calendar([pencilItem()]))
    await openEdit()
    expect(button('Cancel this date')).toBeDefined()
    expect(button('Cancel the Plan')).toBeUndefined()
    // The footer's plain Cancel keeps its exact name (operator-calendar.spec.ts pins it).
    expect(button('Cancel')).toBeDefined()
  })
})

describe('StaffCalendar: Start a Plan waits for its round trip', () => {
  it('is disabled while the Plan is being started, so a second tap cannot start another', async () => {
    let release!: () => void
    mocks.startPlanFromEntry.mockReturnValue(new Promise((res) => { release = () => res({ data: { id: 'plan-1' } }) }))
    await mount(calendar([pencilItem()]))
    await openEdit()
    const start = button('Start a Plan')!
    expect(start.disabled).toBe(false)
    await act(async () => start.click())
    expect(start.disabled).toBe(true)
    await act(async () => start.click())
    expect(mocks.startPlanFromEntry).toHaveBeenCalledTimes(1)
    await act(async () => { release(); await Promise.resolve() })
  })
})
