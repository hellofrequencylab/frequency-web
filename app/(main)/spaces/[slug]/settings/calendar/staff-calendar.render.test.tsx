// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StaffCalendar } from './staff-calendar'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { EntryInput } from '@/lib/calendar/entries'

// LIVE-467, findings 3, 7 and 9, in the entry drawer:
//   3. "Cancel this date" on a Plan-linked date is the Plan's exit (entry-actions escalates a stage
//      change to transitionPlanStage, whose Cancelled row is `archived: true`), so it now says so;
//   7. "Start a plan" and "Join a Plan" had no pending guard, so a double tap made two Plans;
//   9. "+" and "Pencil it in" always made a Plan, because the short form had no Type: Unavailable
//      time could only be made by pencilling a Plan and switching afterwards, and the Plan stayed.

const mocks = vi.hoisted(() => ({
  saveCalendarEntry: vi.fn(async (..._args: unknown[]): Promise<{ data: undefined } | { error: string }> => ({ data: undefined })),
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

describe('StaffCalendar: Start a plan waits for its round trip', () => {
  it('is disabled while the Plan is being started, so a second tap cannot start another', async () => {
    let release!: () => void
    mocks.startPlanFromEntry.mockReturnValue(new Promise((res) => { release = () => res({ data: { id: 'plan-1' } }) }))
    await mount(calendar([pencilItem()]))
    await openEdit()
    const start = button('Start a plan')!
    expect(start.disabled).toBe(false)
    await act(async () => start.click())
    expect(start.disabled).toBe(true)
    await act(async () => start.click())
    expect(mocks.startPlanFromEntry).toHaveBeenCalledTimes(1)
    await act(async () => { release(); await Promise.resolve() })
  })
})

// MOVING A DATE BY HAND (PROG-CAL15). The console's one direct edit: pick a Pencil up and put it on
// another day, by drag or by Shift with an arrow. Both hands end at the same seam (saveCalendarEntry,
// which re-anchors the Plan's to-dos), and every attempt leaves exactly one line.

/** The console, in miniature: it owns the result line, hands it back to the grid to announce, and
 *  would show the same sentence in its header. */
function MoveHost({ events }: { events: CalendarEvent[] }) {
  const [line, setLine] = useState('')
  return (
    <>
      <p data-host-line>{line}</p>
      <StaffCalendar
        slug="lab"
        spaceId="space-1"
        events={events}
        initialYear={2026}
        initialMonth1={9}
        canEdit
        plans={[]}
        moveByDrag
        moveNotice={line}
        onMoveResult={setLine}
      />
    </>
  )
}

const chip = (title = 'Open house') => document.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!
const cell = (day: string) => document.querySelector<HTMLElement>(`[data-day-cell="${day}"]`)!
const spoken = () => document.querySelector('[data-calendar-move-live]')?.textContent ?? ''
const hostLine = () => document.querySelector('[data-host-line]')?.textContent ?? ''

function fire(el: Element, type: string, init: Record<string, unknown> = {}) {
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), init))
}

function press(el: Element, key: string, shiftKey: boolean) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
}

describe('StaffCalendar: a date moves by Shift and an arrow', () => {
  it('moves a day sideways through the entry seam and says so, once', async () => {
    await mount(<MoveHost events={[pencilItem({ planId: 'plan-1' })]} />)
    await act(async () => press(chip(), 'ArrowRight', true))
    expect(mocks.saveCalendarEntry).toHaveBeenCalledTimes(1)
    const [slug, entryId, input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string, EntryInput]
    expect([slug, entryId]).toEqual(['lab', 'entry-1'])
    expect(input).toMatchObject({ startDate: '2026-09-21', endDate: '2026-09-21', planId: 'plan-1', title: 'Open house' })
    expect(hostLine()).toBe('Moved Open house to Mon, Sep 21.')
    expect(spoken()).toBe('Moved Open house to Mon, Sep 21.')
  })

  it('moves a week with Shift and Down', async () => {
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => press(chip(), 'ArrowDown', true))
    const [, , input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string, EntryInput]
    expect(input.startDate).toBe('2026-09-27')
  })

  it('leaves a bare arrow to the month, so paging still belongs to the grid', async () => {
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => press(chip(), 'ArrowRight', false))
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
    expect(hostLine()).toBe('')
  })

  it('puts the date on its new day at once, so a second press moves it a second day', async () => {
    let land!: () => void
    mocks.saveCalendarEntry.mockReturnValueOnce(new Promise((res) => { land = () => res({ data: undefined }) }))
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => press(chip(), 'ArrowRight', true))
    // Held on the 21st while the write is in flight, not snapped back to the 20th.
    expect(cell('2026-09-21').contains(chip())).toBe(true)
    await act(async () => press(chip(), 'ArrowRight', true))
    const [, , second] = mocks.saveCalendarEntry.mock.calls[1] as [string, string, EntryInput]
    expect(second.startDate).toBe('2026-09-22')
    await act(async () => { land(); await Promise.resolve() })
  })

  it('says what happened when the write is refused, and nothing is left sitting on the new day', async () => {
    mocks.saveCalendarEntry.mockResolvedValueOnce({ error: 'That date no longer exists.' })
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => press(chip(), 'ArrowRight', true))
    expect(hostLine()).toBe('Nothing moved. That date no longer exists.')
    expect(cell('2026-09-20').contains(chip())).toBe(true)
  })

  it('refuses a date that is already a published event before it writes anything', async () => {
    const published: CalendarEvent = {
      ...pencilItem(),
      title: 'New moon sit',
      slug: 'new-moon-sit',
      layer: 'events',
      stage: null,
      entryId: null,
      entryInput: null,
      eventId: 'evt-1',
    }
    await mount(<MoveHost events={[published]} />)
    await act(async () => press(chip('New moon sit'), 'ArrowRight', true))
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
    expect(hostLine()).toBe('New moon sit is a published event now. Open the event to change its date.')
  })
})

describe('StaffCalendar: a date moves by dragging it', () => {
  it('marks the day under the pointer and writes the drop through the same seam', async () => {
    await mount(<MoveHost events={[pencilItem()]} />)
    expect(chip().getAttribute('draggable')).toBe('true')
    await act(async () => fire(chip(), 'dragstart'))
    await act(async () => fire(cell('2026-09-24'), 'dragover'))
    expect(cell('2026-09-24').getAttribute('data-drop-target')).toBe('true')
    expect(cell('2026-09-25').getAttribute('data-drop-target')).toBeNull()
    await act(async () => fire(cell('2026-09-24'), 'drop'))
    const [, , input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string, EntryInput]
    expect(input.startDate).toBe('2026-09-24')
    expect(hostLine()).toBe('Moved Open house to Thu, Sep 24.')
    // The target let go with the date.
    expect(cell('2026-09-24').getAttribute('data-drop-target')).toBeNull()
  })

  it('refuses a drop on the next month rather than moving a date out of the month on screen', async () => {
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => fire(chip(), 'dragstart'))
    await act(async () => fire(cell('2026-10-01'), 'drop'))
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
    expect(hostLine()).toBe('Thu, Oct 1 is in another month. Open that month first, then move the date.')
  })

  it('puts the date back on Esc, and a drop after that moves nothing', async () => {
    await mount(<MoveHost events={[pencilItem()]} />)
    await act(async () => fire(chip(), 'dragstart'))
    await act(async () => fire(cell('2026-09-24'), 'dragover'))
    expect(cell('2026-09-24').getAttribute('data-drop-target')).toBe('true')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(cell('2026-09-24').getAttribute('data-drop-target')).toBeNull()
    await act(async () => fire(cell('2026-09-24'), 'drop'))
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
    expect(hostLine()).toBe('')
  })

  it('leaves the calendar click-to-open where no host asked for moving', async () => {
    await mount(calendar([pencilItem()]))
    expect(chip().getAttribute('draggable')).toBeNull()
    await act(async () => press(chip(), 'ArrowRight', true))
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
    await act(async () => fire(chip(), 'dragstart'))
    await act(async () => fire(cell('2026-09-24'), 'drop'))
    expect(cell('2026-09-24').getAttribute('data-drop-target')).toBeNull()
    expect(mocks.saveCalendarEntry).not.toHaveBeenCalled()
  })
})

// ── A NEW DATE IS WRITTEN IN THE SPACE'S ZONE (LIVE-471) ────────────────────────────────────────
// The row: a travelling operator pencilled dates in their own browser zone, so Saturday saved from
// an airport in Lisbon landed as Lisbon wall-clock in a calendar the team reads in Pacific Time.

/** Pin what this jsdom "browser" says its zone is, the way the drawer reads it. */
function pinBrowserZone(timeZone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (
    this: Intl.DateTimeFormat,
  ) {
    return { ...real.call(this), timeZone }
  })
}

describe('StaffCalendar: a new date lands in the Space zone', () => {
  afterEach(() => vi.restoreAllMocks())

  it('pencils in the SPACE zone while the operator is in another one', async () => {
    pinBrowserZone('Europe/Lisbon')
    await mount(
      <StaffCalendar
        slug="lab"
        spaceId="space-1"
        events={[]}
        initialYear={2026}
        initialMonth1={9}
        canEdit
        plans={[]}
        spaceTimeZone="America/Los_Angeles"
      />,
    )
    await act(async () => button('Pencil it in')!.click())
    await act(async () => setInput(document.querySelector('#entry-title') as HTMLInputElement, 'Solstice'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const [, , , timeZone] = mocks.createPenciledPlan.mock.calls[0] as [string, string, string, string]
    expect(timeZone).toBe('America/Los_Angeles')
    expect(timeZone).not.toBe('Europe/Lisbon')
  })

  it('writes an Unavailable span in the Space zone too, not only a Pencil', async () => {
    pinBrowserZone('Europe/Lisbon')
    await mount(
      <StaffCalendar
        slug="lab"
        spaceId="space-1"
        events={[]}
        initialYear={2026}
        initialMonth1={9}
        canEdit
        plans={[]}
        spaceTimeZone="America/New_York"
      />,
    )
    await act(async () => button('Pencil it in')!.click())
    await act(async () => changeSelect(document.querySelector('#entry-kind') as HTMLSelectElement, 'unavailable'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const [, , input] = mocks.saveCalendarEntry.mock.calls[0] as [string, string | null, EntryInput]
    expect(input.timeZone).toBe('America/New_York')
  })

  it('falls back to the browser zone ONLY when the Space has never said', async () => {
    pinBrowserZone('Europe/Lisbon')
    await mount(calendar())
    await act(async () => button('Pencil it in')!.click())
    await act(async () => setInput(document.querySelector('#entry-title') as HTMLInputElement, 'Solstice'))
    await act(async () => {
      document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const [, , , timeZone] = mocks.createPenciledPlan.mock.calls[0] as [string, string, string, string]
    expect(timeZone).toBe('Europe/Lisbon')
  })

  it('tells the person which zone in plain words, not as a database key', async () => {
    await mount(calendar([pencilItem({ entryInput: entryInput({ timeZone: 'America/Los_Angeles' }) })]))
    await openEdit()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Times are in Pacific Time.')
    expect(text).not.toContain('America/Los_Angeles')
  })
})
