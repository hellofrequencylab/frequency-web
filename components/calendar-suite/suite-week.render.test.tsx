// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EntryInput } from '@/lib/calendar/entries'
import type { AdaptedCalendar, SuiteItem } from '@/lib/calendar/planner/adapters'
import { findClashes } from '@/lib/calendar/planner/clash'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { SuiteWeek } from './suite-week'
import type { SuiteContext } from './suite-types'
import { useSuiteMoves, type SuiteActions } from './use-suite-moves'

// THE WEEK, DRAGGED. The real time grid and the real moves hook, with the calendar's three writes
// replaced by recorders: a card dropped on a time asks the write for exactly that time on the 15
// minute grid, the grid shows it at once, the toast offers Undo, and Undo is one write that restores
// the snapshot. A repeating date asks which dates first, a refused write puts the card back, and a
// person who can only read cannot pick a card up.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const INPUT: EntryInput = {
  kind: 'private',
  title: 'Staff sync',
  allDay: false,
  startDate: '2026-10-21',
  endDate: '2026-10-21',
  startTime: '10:00',
  endTime: '11:00',
  timeZone: 'America/Los_Angeles',
  blocksTime: false,
  showPublicly: false,
  candidateDates: [],
  repeat: '',
  exceptionDates: [],
}

function item(over: Partial<SuiteItem>): SuiteItem {
  return {
    id: 'entry-1:2026-10-21',
    title: 'Staff sync',
    kind: 'private',
    date: '2026-10-21',
    end: null,
    startMin: 600,
    durMin: 60,
    plan: null,
    whenLabel: '',
    location: null,
    notes: null,
    eventHref: null,
    note: '',
    hostLabel: null,
    entryId: 'entry-1',
    entryInput: INPUT,
    occurrenceDate: null,
    ...over,
  }
}

const CRAFT = item({
  id: 'entry-2:2026-10-21',
  title: 'Craft night',
  kind: 'pencil',
  entryId: 'entry-2',
  startMin: 18 * 60,
  series: true,
  occurrenceDate: '2026-10-21',
  entryInput: { ...INPUT, kind: 'pencil', title: 'Craft night', startTime: '18:00', endTime: '19:00', repeat: 'FREQ=WEEKLY' },
})

const BASE: AdaptedCalendar = { items: [item({}), CRAFT], tasks: [], plans: [], spaceNames: {} }

function Host({ base, actions, canEdit }: { base: AdaptedCalendar; actions: SuiteActions; canEdit: boolean }) {
  const moves = useSuiteMoves({ base, actions, canEdit })
  const data: PlannerData = { items: moves.data.items, tasks: moves.data.tasks, plans: moves.data.plans, hidden: {} }
  const ctx: SuiteContext = {
    ownSpaceId: 's1',
    ownName: 'Ocean House',
    today: '2026-10-21',
    spaceNames: {},
    clashes: findClashes(moves.data.items),
    teamById: new Map(),
    planById: new Map(),
    itemById: new Map(moves.data.items.map((i) => [i.id, i])),
    taskById: new Map(moves.data.tasks.map((t) => [t.id, t])),
  }
  return (
    <div className="cal-suite">
      <SuiteWeek data={data} ctx={ctx} sel={null} cursor="2026-10-21" days={7} nowMin={864} sky={[]} dnd={moves.dnd} zoneShort="PDT" onSelect={() => {}} />
      {moves.layer}
    </div>
  )
}

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

function actionsOf(over: Partial<SuiteActions> = {}) {
  return {
    saveEntry: vi.fn(async (..._a: unknown[]) => ({ data: undefined }) as { data: undefined } | { error: string }),
    saveOccurrence: vi.fn(async (..._a: unknown[]) => ({ data: undefined }) as { data: undefined } | { error: string }),
    moveTodo: vi.fn(async (..._a: unknown[]) => ({ data: undefined }) as { data: undefined } | { error: string }),
    ...over,
  } satisfies SuiteActions
}

async function mount(actions: SuiteActions, canEdit = true) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<Host base={BASE} actions={actions} canEdit={canEdit} />)
  })
}

function fire(el: Element, type: string, props: Record<string, unknown> = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientY: 0, relatedTarget: null, dataTransfer: { setData() {}, effectAllowed: '', dropEffect: '' } }, props)
  el.dispatchEvent(ev)
}

const card = (title: string) => document.querySelector<HTMLElement>(`.cal-card[aria-label*="${title}"]`)
const col = (day: string) => document.querySelector<HTMLElement>(`.cal-tg-col[data-day="${day}"]`)!
/** Pixels below the top of the grid for a clock time, with 7 AM at the top. */
const px = (h: number, m = 0) => (h - 7) * 52 + (m / 60) * 52

async function dragTo(el: HTMLElement, day: string, y: number) {
  await act(async () => {
    fire(el, 'dragstart')
    fire(col(day), 'dragover', { clientY: y })
    fire(col(day), 'drop', { clientY: y })
  })
}

describe('the Week as a time grid', () => {
  it('draws 7 AM to 11 PM at 52px an hour with the now line on today', async () => {
    await mount(actionsOf())
    expect(document.querySelectorAll('.cal-tg-hour')).toHaveLength(16)
    expect((document.querySelector('.cal-tg-body') as HTMLElement).style.height).toBe(`${16 * 52}px`)
    expect(col('2026-10-21').querySelector('.cal-now')).not.toBeNull()
    expect((col('2026-10-21').querySelector('.cal-now') as HTMLElement).style.top).toBe(`${px(14, 24)}px`)
    expect(col('2026-10-22').querySelector('.cal-now')).toBeNull()
    expect(card('Staff sync')?.textContent).toContain('10 AM to 11 AM')
  })
})

describe('dragging a card onto a time', () => {
  it('writes the snapped time once, shows it at once, and Undo is one write that puts it back', async () => {
    const actions = actionsOf()
    await mount(actions)
    // 2:08 PM on Thursday snaps to 2:15 PM.
    await dragTo(card('Staff sync')!, '2026-10-22', px(14, 8))
    expect(actions.saveEntry).toHaveBeenCalledTimes(1)
    const [id, input] = vi.mocked(actions.saveEntry).mock.calls[0] as [string, EntryInput]
    expect(id).toBe('entry-1')
    expect(input).toMatchObject({ startDate: '2026-10-22', endDate: '2026-10-22', startTime: '14:15', endTime: '15:15' })
    expect(col('2026-10-22').querySelector('.cal-card')?.textContent).toContain('2:15 PM to 3:15 PM')
    expect(col('2026-10-21').textContent).not.toContain('Staff sync')
    expect(document.querySelector('.cal-toast')?.textContent).toContain('Moved Staff sync to Thu, Oct 22, 2:15 PM.')

    const undo = [...document.querySelectorAll('.cal-toast button')].find((b) => b.textContent === 'Undo') as HTMLElement
    await act(async () => undo.click())
    expect(actions.saveEntry).toHaveBeenCalledTimes(2)
    expect(vi.mocked(actions.saveEntry).mock.calls[1]).toEqual(['entry-1', INPUT])
    expect(col('2026-10-21').textContent).toContain('Staff sync')
    expect(col('2026-10-22').textContent).not.toContain('Staff sync')
  })

  it('puts the card back and says why when the server refuses', async () => {
    const actions = actionsOf({ saveEntry: vi.fn(async () => ({ error: 'That date no longer exists.' })) })
    await mount(actions)
    await dragTo(card('Staff sync')!, '2026-10-23', px(9))
    expect(col('2026-10-21').textContent).toContain('Staff sync')
    expect(col('2026-10-23').textContent).not.toContain('Staff sync')
    expect(document.querySelector('.cal-toast')?.textContent).toContain('Nothing moved. That date no longer exists.')
    expect([...document.querySelectorAll('.cal-toast button')].some((b) => b.textContent === 'Undo')).toBe(false)
  })

  it('asks which dates a repeating card reaches before it writes anything', async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(card('Craft night')!, '2026-10-23', px(19))
    expect(actions.saveEntry).not.toHaveBeenCalled()
    expect(actions.saveOccurrence).not.toHaveBeenCalled()
    const dialog = document.querySelector('[data-series-choice="save"]')
    expect(dialog?.textContent).toContain('This date repeats')

    const thisDate = [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('This date only')) as HTMLElement
    await act(async () => thisDate.click())
    expect(actions.saveEntry).not.toHaveBeenCalled()
    expect(actions.saveOccurrence).toHaveBeenCalledTimes(1)
    expect(vi.mocked(actions.saveOccurrence).mock.calls[0].slice(0, 2)).toEqual(['entry-2', '2026-10-21'])
    expect(vi.mocked(actions.saveOccurrence).mock.calls[0][2]).toMatchObject({ startDate: '2026-10-23', startTime: '19:00' })
  })

  it('leaves a read-only calendar alone', async () => {
    const actions = actionsOf()
    await mount(actions, false)
    expect(card('Staff sync')?.getAttribute('draggable')).toBeNull()
    await dragTo(card('Staff sync')!, '2026-10-22', px(14))
    expect(actions.saveEntry).not.toHaveBeenCalled()
  })
})
