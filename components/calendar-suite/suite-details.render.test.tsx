// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EntryInput } from '@/lib/calendar/entries'
import type { SuiteItem, SuitePlan, SuiteTask } from '@/lib/calendar/planner/adapters'
import { findClashes } from '@/lib/calendar/planner/clash'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { SuiteDetails } from './suite-details'
import type { DetailsActions, RecordLoad } from './suite-details-actions'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE DETAILS PANEL, EDITED. The real panel with the calendar's writes replaced by recorders: a title
// saves when the person leaves it, a repeating date asks which dates the change reaches, Cancel and
// Delete are the moves the record allows, a to-do ticks, moves and is handed over, the Plan card adds a
// to-do and picks a held date, and the record reads and posts through the right subject (a Plan, or a
// standalone date's own thread). A person who can only read sees no control at all.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const INPUT: EntryInput = {
  kind: 'pencil',
  title: 'Supper club',
  notes: 'Bring plates',
  allDay: false,
  startDate: '2026-10-21',
  endDate: '2026-10-21',
  startTime: '18:00',
  endTime: '20:00',
  timeZone: 'America/Los_Angeles',
  stage: 'pencil',
  blocksTime: false,
  showPublicly: false,
  candidateDates: [],
  repeat: '',
  exceptionDates: [],
}

function item(over: Partial<SuiteItem> = {}, input: Partial<EntryInput> = {}): SuiteItem {
  return {
    id: 'entry-a:2026-10-21',
    title: 'Supper club',
    kind: 'pencil',
    date: '2026-10-21',
    end: null,
    startMin: 18 * 60,
    durMin: 120,
    plan: null,
    whenLabel: '',
    location: null,
    notes: 'Bring plates',
    eventHref: null,
    note: '',
    hostLabel: null,
    entryId: 'entry-a',
    entryInput: { ...INPUT, ...input },
    occurrenceDate: null,
    ...over,
  }
}

const PLAN: SuitePlan = {
  id: 'p1',
  title: 'Supper club',
  stage: 'pencil',
  target: 'Event',
  targetLabel: 'Event',
  owner: 'u1',
  team: ['u1'],
  hold: '2026-10-27',
  spaces: [
    { id: 's1', role: 'Host', status: 'accepted' },
    { id: 's2', role: 'Co-host', status: 'pending' },
  ],
  notes: null,
}

const task = (over: Partial<SuiteTask> = {}): SuiteTask => ({
  id: 't1',
  title: 'Order mats',
  due: '2026-10-19',
  done: false,
  plan: 'p1',
  owner: null,
  phase: 'Before',
  dueOffsetDays: -3,
  sharedFrom: null,
  ...over,
})

const LOAD: RecordLoad = {
  activity: [1, 2, 3, 4].map((n) => ({
    id: `a${n}`,
    planId: 'p1',
    kind: 'field' as const,
    summary: `Edit number ${n}.`,
    createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
    actorProfileId: null,
    actorName: 'Dana Reyes',
    spaceName: 'Ocean House',
    mine: false,
  })),
  comments: [],
}

type Reply = Promise<{ error: string } | { data?: undefined }>
function actionsOf(over: Partial<DetailsActions> = {}) {
  const yes = async (..._a: unknown[]): Reply => ({ data: undefined })
  return {
    saveEntry: vi.fn(yes),
    saveOccurrence: vi.fn(yes),
    skipDate: vi.fn(yes),
    deleteEntry: vi.fn(yes),
    pickDate: vi.fn(yes),
    editPlan: vi.fn(yes),
    setPlanStage: vi.fn(yes),
    addTodo: vi.fn(yes),
    setTodoDone: vi.fn(yes),
    renameTodo: vi.fn(yes),
    moveTodo: vi.fn(yes),
    assignTodo: vi.fn(yes),
    deleteTodo: vi.fn(yes),
    loadRecord: vi.fn(async (..._a: unknown[]) => LOAD),
    postComment: vi.fn(yes),
    ...over,
  } satisfies DetailsActions
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

interface Mount {
  sel: SuiteSelection
  items?: SuiteItem[]
  tasks?: SuiteTask[]
  plans?: SuitePlan[]
  canEdit?: boolean
  actions?: DetailsActions
}

async function mount(m: Mount) {
  const items = m.items ?? []
  const tasks = m.tasks ?? []
  const plans = m.plans ?? []
  const data: PlannerData = { items, tasks, plans, hidden: {} }
  const ctx: SuiteContext = {
    ownSpaceId: 's1',
    ownName: 'Ocean House',
    today: '2026-10-21',
    canEdit: m.canEdit ?? true,
    spaceNames: { s2: "Swami's Beach" },
    clashes: findClashes(items),
    teamById: new Map([
      ['u1', { id: 'u1', name: 'Dana Reyes', avatarUrl: null }],
      ['u2', { id: 'u2', name: 'Marcus Webb', avatarUrl: null }],
    ]),
    planById: new Map(plans.map((p) => [p.id, p])),
    itemById: new Map(items.map((i) => [i.id, i])),
    taskById: new Map(tasks.map((t) => [t.id, t])),
  }
  const say = vi.fn()
  const onSelect = vi.fn()
  const onClose = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<SuiteDetails sel={m.sel} data={data} ctx={ctx} actions={m.actions ?? actionsOf()} say={say} onSelect={onSelect} onClose={onClose} />)
  })
  return { say, onSelect, onClose }
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)
const field = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)!
const button = (text: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => {
    const name = b.getAttribute('aria-label') ?? b.textContent ?? ''
    return typeof text === 'string' ? name.trim() === text : text.test(name)
  })!

/** Types into a field the way a person does. */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function leave(el: Element) {
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}
async function press(el: Element, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}
async function click(el: Element) {
  await act(async () => (el as HTMLElement).click())
}

describe('a date', () => {
  const sel: SuiteSelection = { kind: 'item', id: 'entry-a:2026-10-21' }

  it('renames in place when the person leaves the title, and not when nothing changed', async () => {
    const actions = actionsOf()
    await mount({ sel, items: [item()], actions })
    await leave(field('Title'))
    expect(actions.saveEntry).not.toHaveBeenCalled()
    await type(field('Title') as HTMLInputElement, 'Supper club, late')
    await leave(field('Title'))
    expect(actions.saveEntry).toHaveBeenCalledTimes(1)
    expect(vi.mocked(actions.saveEntry).mock.calls[0][0]).toBe('entry-a')
    expect(vi.mocked(actions.saveEntry).mock.calls[0][1]).toMatchObject({ title: 'Supper club, late' })
  })

  it('shows the fields with their lists, the notes placeholder and the buttons', async () => {
    await mount({ sel, items: [item()] })
    expect([...document.querySelectorAll('.cal-drow dt')].map((d) => d.textContent)).toEqual(['Date', 'Starts', 'Length'])
    expect(field('Starts').querySelectorAll('option')).toHaveLength(37)
    expect((field('Length') as HTMLSelectElement).value).toBe('120')
    expect(field('Notes for the team').getAttribute('placeholder')).toBe('Doors, setup, who brings what')
    const words = [...document.querySelectorAll('.cal-actions button')].map((b) => b.textContent)
    expect(words).toEqual(['Copy to next week', 'Cancel', 'Delete'])
  })

  it('changes the start and the length through the entry write', async () => {
    const actions = actionsOf()
    await mount({ sel, items: [item()], actions })
    await act(async () => {
      const s = field('Starts') as HTMLSelectElement
      s.value = String(19 * 60)
      s.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(vi.mocked(actions.saveEntry).mock.calls[0][1]).toMatchObject({ startTime: '19:00', endTime: '21:00' })
  })

  it('moves a Plan date with the stage control and cancels through the same write', async () => {
    const actions = actionsOf()
    await mount({ sel, items: [item({ plan: 'p1' })], plans: [PLAN], actions })
    await click(button('Production'))
    expect(vi.mocked(actions.saveEntry).mock.calls[0][1]).toMatchObject({ stage: 'production' })
    await click(button('Cancel'))
    expect(vi.mocked(actions.saveEntry).mock.calls[1][1]).toMatchObject({ stage: 'cancelled' })
  })

  it('copies to next week as a new date and says so', async () => {
    const actions = actionsOf()
    const { say } = await mount({ sel, items: [item()], actions })
    await click(button('Copy to next week'))
    expect(vi.mocked(actions.saveEntry).mock.calls[0][0]).toBeNull()
    expect(vi.mocked(actions.saveEntry).mock.calls[0][1]).toMatchObject({ startDate: '2026-10-28', endDate: '2026-10-28' })
    expect(say).toHaveBeenCalledWith('Copied Supper club to Wed, Oct 28.', 'success')
  })

  it('asks before it deletes, and deletes only on the second press', async () => {
    const actions = actionsOf()
    const { onClose } = await mount({ sel, items: [item()], actions })
    await click(button('Delete'))
    expect(actions.deleteEntry).not.toHaveBeenCalled()
    expect($('.cal-confirm')?.textContent).toContain('Delete Supper club?')
    await click(button('Keep it'))
    expect($('.cal-confirm')).toBeNull()
    await click(button('Delete'))
    await click($('.cal-confirm')!.querySelector('button')!)
    expect(actions.deleteEntry).toHaveBeenCalledWith('entry-a')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the server sentence when a write is refused', async () => {
    const actions = actionsOf({ saveEntry: vi.fn(async () => ({ error: 'This is one of several possible dates. Keep one date before you move it past Pencil.' })) })
    await mount({ sel, items: [item()], actions })
    await click(button('Production'))
    expect($('[role="alert"]')?.textContent).toContain('Keep one date before you move it past Pencil.')
  })

  it('asks which dates a repeating date reaches, then splits it on This date only', async () => {
    const actions = actionsOf()
    const craft = item(
      { id: 'entry-c:2026-10-19', entryId: 'entry-c', date: '2026-10-19', occurrenceDate: '2026-10-19', series: true, title: 'Craft night' },
      { title: 'Craft night', repeat: 'FREQ=WEEKLY', startDate: '2026-10-05', endDate: '2026-10-05' },
    )
    await mount({ sel: { kind: 'item', id: craft.id }, items: [craft], actions })
    await type(field('Title') as HTMLInputElement, 'Craft and tea')
    await leave(field('Title'))
    expect(actions.saveEntry).not.toHaveBeenCalled()
    expect($('[data-series-choice="save"]')?.textContent).toContain('This date repeats')
    await click([...$('[data-series-choice="save"]')!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('This date only'))!)
    expect(actions.saveEntry).not.toHaveBeenCalled()
    expect(vi.mocked(actions.saveOccurrence).mock.calls[0].slice(0, 2)).toEqual(['entry-c', '2026-10-19'])
    expect(vi.mocked(actions.saveOccurrence).mock.calls[0][2]).toMatchObject({ title: 'Craft and tea' })
  })

  it('offers Go live on a production and Go to event on an event, as links', async () => {
    await mount({ sel, items: [item({ kind: 'production' }, { stage: 'production' })] })
    expect($('a[href^="/events/new?"]')?.textContent).toBe('Go live')
    expect($('a[href*="pencil=entry-a"]')).not.toBeNull()
    act(() => root?.unmount())
    host?.remove()
    await mount({ sel: { kind: 'item', id: 'sound:2026-10-21' }, items: [item({ id: 'sound:2026-10-21', kind: 'event', entryId: null, entryInput: null, eventHref: '/events/sound' })] })
    expect($('a[href="/events/sound"]')?.textContent).toBe('Go to event')
    expect(document.querySelector('[aria-label="Title"]')).toBeNull()
  })

  it('shows a person who can only read the same panel with no control in it', async () => {
    await mount({ sel, items: [item()], canEdit: false })
    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(document.querySelectorAll('.cal-actions button')).toHaveLength(0)
    expect($('.cal-dtitle')?.textContent).toBe('Supper club')
  })
})

describe('a to-do', () => {
  const sel: SuiteSelection = { kind: 'todo', id: 't1' }

  it('ticks, moves to today, renames, and is handed to someone', async () => {
    const actions = actionsOf()
    const { say } = await mount({ sel, tasks: [task()], plans: [PLAN], actions })
    await click(button('Do today'))
    expect(actions.moveTodo).toHaveBeenCalledWith('t1', '2026-10-21')
    expect(say).toHaveBeenCalledWith('Moved to today.', 'success')

    await type(field('Title') as HTMLInputElement, 'Order four mats')
    await leave(field('Title'))
    expect(actions.renameTodo).toHaveBeenCalledWith('t1', 'Order four mats')

    await act(async () => {
      const o = field('Owner') as HTMLSelectElement
      o.value = 'u2'
      o.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(actions.assignTodo).toHaveBeenCalledWith('t1', 'u2')

    await click(button('Mark done'))
    expect(actions.setTodoDone).toHaveBeenCalledWith('t1', true)
    expect($('.cal-actions')?.textContent).toContain('Mark done')
  })

  it('clears the due date when the field is emptied', async () => {
    const actions = actionsOf()
    await mount({ sel, tasks: [task()], plans: [PLAN], actions })
    await act(async () => {
      const d = field('Due') as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '')
      d.dispatchEvent(new Event('input', { bubbles: true }))
      d.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(actions.moveTodo).toHaveBeenCalledWith('t1', null)
  })

  it('deletes only after the second press', async () => {
    const actions = actionsOf()
    const { onClose } = await mount({ sel, tasks: [task({ plan: null, phase: null })], actions })
    await click(button('Delete'))
    expect(actions.deleteTodo).not.toHaveBeenCalled()
    await click($('.cal-confirm')!.querySelector('button')!)
    expect(actions.deleteTodo).toHaveBeenCalledWith('t1')
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves a to-do from another Space alone', async () => {
    await mount({ sel, tasks: [task({ sharedFrom: "Swami's Beach" })], plans: [PLAN] })
    for (const label of ['Title', 'Due', 'Owner']) expect(document.querySelector(`[aria-label="${label}"]`)).toBeNull()
    expect(document.querySelector('.cal-actions')).toBeNull()
    expect(document.body.textContent).toContain("Swami's Beach")
  })
})

describe('a Plan', () => {
  const sel: SuiteSelection = { kind: 'plan', id: 'p1' }
  const two = [item({ plan: 'p1', option: 'A' }), item({ id: 'entry-b:2026-10-23', entryId: 'entry-b', date: '2026-10-23', plan: 'p1', option: 'B' })]

  it('renames the Plan and moves its stage through the Plan door', async () => {
    const actions = actionsOf()
    await mount({ sel, items: two, tasks: [task()], plans: [PLAN], actions })
    await type(field('Plan title') as HTMLInputElement, 'Supper club, autumn')
    await leave(field('Plan title'))
    expect(actions.editPlan).toHaveBeenCalledWith('p1', { title: 'Supper club, autumn' })
    await click(button('Planning'))
    expect(actions.setPlanStage).toHaveBeenCalledWith('p1', 'plan')
  })

  it('draws the card: Spaces, the hold, the held dates, and the to-dos by phase with how far from the date', async () => {
    await mount({ sel, items: two, tasks: [task(), task({ id: 't2', title: 'Set up', phase: 'Day of', dueOffsetDays: 0, due: '2026-10-21' })], plans: [PLAN] })
    const card = $('.cal-pcard')!
    expect(card.textContent).toContain('Holding until Tue, Oct 27 · 6 days left')
    expect(card.textContent).toContain('Ocean House')
    expect(card.textContent).toContain('Host')
    expect(card.textContent).toContain("Swami's Beach")
    expect(card.textContent).toContain('Invited')
    expect(card.querySelector('section[aria-label="Spaces"]')).not.toBeNull()
    expect([...card.querySelectorAll('.cal-ghead')].map((e) => e.textContent)).toEqual(['Before', 'Day of'])
    expect(card.textContent).toContain('Mon, Oct 19 · 3 days before')
    expect(card.textContent).toContain('Wed, Oct 21 · on the day')
    expect(card.textContent).toContain('Option A')
    expect(card.textContent).toContain('Option B')
  })

  it('picks a held date, adds a to-do three days before, and toggles one done', async () => {
    const actions = actionsOf()
    await mount({ sel, items: two, tasks: [task()], plans: [PLAN], actions })
    const picks = [...document.querySelectorAll('.cal-opt button')].filter((b) => b.textContent === 'Pick this')
    expect(picks).toHaveLength(2)
    await click(picks[1])
    expect(actions.pickDate).toHaveBeenCalledWith('entry-b')

    await type(field('Add a to-do') as HTMLInputElement, 'Buy candles')
    await press(field('Add a to-do'), 'Enter')
    expect(actions.addTodo).toHaveBeenCalledWith('p1', 'Buy candles', -3)

    await click($('[aria-label="Toggle done"]')!)
    expect(actions.setTodoDone).toHaveBeenCalledWith('t1', true)
  })

  it('says what a pending invite is and keeps the card read only', async () => {
    const invited: SuitePlan = { ...PLAN, spaces: [{ id: 's2', role: 'Host', status: 'accepted' }, { id: 's1', role: 'Co-host', status: 'pending' }] }
    await mount({ sel, plans: [invited] })
    expect($('.cal-invite')?.textContent).toContain("Swami's Beach wants to co-host")
    expect($('.cal-invite')?.textContent).toContain('Say yes and it lands on your calendar, and both teams can edit it.')
    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0)
  })
})

describe('the edit history and the thread', () => {
  it('shows three rows, then every edit, newest first', async () => {
    const actions = actionsOf()
    await mount({ sel: { kind: 'plan', id: 'p1' }, plans: [PLAN], actions })
    expect(actions.loadRecord).toHaveBeenCalledWith({ kind: 'plan', id: 'p1' })
    const rows = () => [...document.querySelectorAll('.cal-logrow .cal-logtext')].map((e) => e.textContent)
    expect(rows()).toEqual(['Edit number 1.', 'Edit number 2.', 'Edit number 3.'])
    await click(button('Show all 4 edits'))
    expect(rows()).toHaveLength(4)
    await click(button('Show less'))
    expect(rows()).toHaveLength(3)
    expect($('.cal-dlast')?.textContent).toContain('Dana Reyes')
  })

  it('posts a note to the Plan and reloads the record', async () => {
    const actions = actionsOf()
    await mount({ sel: { kind: 'plan', id: 'p1' }, plans: [PLAN], actions })
    await type(field('Leave a note for both teams') as HTMLInputElement, 'Kitchen is free that Saturday')
    await click(button('Post comment'))
    expect(actions.postComment).toHaveBeenCalledWith({ kind: 'plan', id: 'p1' }, 'Kitchen is free that Saturday')
    expect(vi.mocked(actions.loadRecord).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('a date on no Plan keeps its own thread, through the entry arm', async () => {
    const actions = actionsOf()
    await mount({ sel: { kind: 'item', id: 'entry-a:2026-10-21' }, items: [item()], actions })
    expect(actions.loadRecord).toHaveBeenCalledWith({ kind: 'entry', id: 'entry-a' })
    await type(field('Leave a note for both teams') as HTMLInputElement, 'Plates are in the shed')
    await press(field('Leave a note for both teams'), 'Enter')
    expect(actions.postComment).toHaveBeenCalledWith({ kind: 'entry', id: 'entry-a' }, 'Plates are in the shed')
  })

  it('has no record for a published event or a to-do with no Plan', async () => {
    const actions = actionsOf()
    await mount({ sel: { kind: 'todo', id: 't1' }, tasks: [task({ plan: null, phase: null })], actions })
    expect(actions.loadRecord).not.toHaveBeenCalled()
    expect($('.cal-rec')).toBeNull()
  })

  it('shows the sentence when the record cannot load, and no composer for a reader', async () => {
    const actions = actionsOf({ loadRecord: vi.fn(async () => ({ error: 'You do not have access to this calendar.' })) })
    await mount({ sel: { kind: 'plan', id: 'p1' }, plans: [PLAN], actions, canEdit: false })
    expect($('.cal-rec [role="alert"]')?.textContent).toBe('You do not have access to this calendar.')
    expect(document.querySelector('[aria-label="Leave a note for both teams"]')).toBeNull()
  })
})
