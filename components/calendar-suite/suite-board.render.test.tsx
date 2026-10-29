// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdaptedCalendar, SuitePlan } from '@/lib/calendar/planner/adapters'
import { findClashes } from '@/lib/calendar/planner/clash'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { SuiteBoard } from './suite-board'
import { SuiteList } from './suite-list'
import type { SuiteContext } from './suite-types'
import { useSuiteMoves, type SuiteActions } from './use-suite-moves'

// THE KANBAN, DRAGGED. The real board and the real moves hook with the stage write replaced by a
// recorder: a card dropped on a column writes that stage once through the plan stage action, the board
// shows it at once, the toast offers Undo, and Cancelled keeps the card with its own Undo. A refused
// write puts the card back, Published cannot be dragged into, and a person who can only read cannot
// pick a card up.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OWN = 's1'
const plan = (id: string, title: string, stage: SuitePlan['stage'], over: Partial<SuitePlan> = {}): SuitePlan => ({
  id,
  title,
  stage,
  target: 'Event',
  targetLabel: 'Event',
  owner: null,
  team: [],
  hold: null,
  spaces: [{ id: OWN, role: 'Host', status: 'accepted' }],
  notes: null,
  ...over,
})

const BASE: AdaptedCalendar = {
  items: [],
  tasks: [],
  plans: [
    plan('p-supper', 'Supper club', 'pencil', { hold: '2026-10-27' }),
    plan('p-retreat', 'Autumn retreat', 'planning'),
    plan('p-swim', 'Full moon swim', 'production'),
    plan('p-bath', 'Sound bath', 'event'),
    plan('p-dance', 'Dance night', 'cancelled'),
    plan('p-beach', 'Beach clean', 'planning', {
      spaces: [
        { id: 's-other', role: 'Host', status: 'accepted' },
        { id: OWN, role: 'Co-host', status: 'accepted' },
      ],
    }),
  ],
  spaceNames: { 's-other': "Swami's Beach" },
}

function Host({ actions, canEdit, view = 'board' }: { actions: SuiteActions; canEdit: boolean; view?: 'board' | 'list' }) {
  const moves = useSuiteMoves({ base: BASE, actions, canEdit, ownSpaceId: OWN })
  const data: PlannerData = { items: moves.data.items, tasks: moves.data.tasks, plans: moves.data.plans, hidden: {} }
  const ctx: SuiteContext = {
    ownSpaceId: OWN,
    ownName: 'Ocean House',
    today: '2026-10-21',
    spaceNames: moves.data.spaceNames,
    clashes: findClashes(moves.data.items),
    teamById: new Map(),
    planById: new Map(moves.data.plans.map((p) => [p.id, p])),
    itemById: new Map(),
    taskById: new Map(),
  }
  return (
    <div className="cal-suite">
      {view === 'board' ? (
        <SuiteBoard data={data} ctx={ctx} sel={null} dnd={moves.dnd} onSelect={() => {}} onRestore={moves.restore} />
      ) : (
        <SuiteList data={data} ctx={ctx} sel={null} onSelect={() => {}} />
      )}
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
    setStage: vi.fn(async (..._a: unknown[]) => ({ data: undefined }) as { data: undefined } | { error: string }),
    ...over,
  } satisfies SuiteActions
}

async function mount(actions: SuiteActions, canEdit = true, view: 'board' | 'list' = 'board') {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<Host actions={actions} canEdit={canEdit} view={view} />)
  })
}

function fire(el: Element, type: string, props: Record<string, unknown> = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientY: 0, relatedTarget: null, dataTransfer: { setData() {}, effectAllowed: '', dropEffect: '' } }, props)
  el.dispatchEvent(ev)
}

const col = (stage: string) => document.querySelector<HTMLElement>(`.cal-col[data-stage="${stage}"]`)!
const cardIn = (stage: string, title: string) => [...col(stage).querySelectorAll<HTMLElement>('.cal-pcard-k')].find((c) => c.textContent?.includes(title)) ?? null
const toast = () => document.querySelector('.cal-toast')?.textContent ?? ''

async function dragTo(el: HTMLElement, stage: string) {
  await act(async () => {
    fire(el, 'dragstart')
    fire(col(stage), 'dragover')
    fire(col(stage), 'drop')
  })
}

describe('the Kanban', () => {
  it('has the five columns, each Plan in its stage, and Undo on the Cancelled card', async () => {
    await mount(actionsOf())
    expect([...document.querySelectorAll('.cal-col .cal-col-t')].map((h) => h.textContent)).toEqual([
      'Pencil',
      'Planning',
      'Production',
      'Published',
      'Cancelled',
    ])
    expect(cardIn('pencil', 'Supper club')?.textContent).toContain('Holding until Oct 27 · 6 days left')
    expect(cardIn('event', 'Sound bath')).not.toBeNull()
    expect(cardIn('cancelled', 'Dance night')?.querySelector('.cal-pk-foot button')?.textContent).toBe('Undo')
    expect(cardIn('planning', 'Autumn retreat')?.querySelector('.cal-pk-foot button')).toBeNull()
  })
})

describe('dragging a Plan between stages', () => {
  it('writes the stage once, shows it at once, and Undo is one write that puts it back', async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(cardIn('pencil', 'Supper club')!, 'planning')
    expect(actions.setStage).toHaveBeenCalledTimes(1)
    expect(actions.setStage).toHaveBeenCalledWith('p-supper', 'plan')
    expect(cardIn('planning', 'Supper club')).not.toBeNull()
    expect(cardIn('pencil', 'Supper club')).toBeNull()
    expect(toast()).toContain('Moved Supper club to Planning.')

    const undo = [...document.querySelectorAll('.cal-toast button')].find((b) => b.textContent === 'Undo') as HTMLElement
    await act(async () => undo.click())
    expect(actions.setStage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(actions.setStage!).mock.calls[1]).toEqual(['p-supper', 'pencil'])
    expect(cardIn('pencil', 'Supper club')).not.toBeNull()
  })

  it('keeps a cancelled Plan in its column with Undo, and Undo on the card puts it back where it came from', async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(cardIn('production', 'Full moon swim')!, 'cancelled')
    expect(actions.setStage).toHaveBeenCalledWith('p-swim', 'cancelled')
    const cancelled = cardIn('cancelled', 'Full moon swim')!
    expect(cancelled.getAttribute('data-called')).not.toBeNull()
    expect(toast()).toContain('Cancelled Full moon swim. It stays on the team calendar, struck through.')

    const cardUndo = cancelled.querySelector('.cal-pk-foot button') as HTMLElement
    await act(async () => cardUndo.click())
    expect(vi.mocked(actions.setStage!).mock.calls[1]).toEqual(['p-swim', 'production'])
    expect(cardIn('production', 'Full moon swim')).not.toBeNull()
  })

  it('brings back a Plan cancelled in an earlier visit to Planning', async () => {
    const actions = actionsOf()
    await mount(actions)
    await act(async () => (cardIn('cancelled', 'Dance night')!.querySelector('.cal-pk-foot button') as HTMLElement).click())
    expect(actions.setStage).toHaveBeenCalledWith('p-dance', 'plan')
    expect(cardIn('planning', 'Dance night')).not.toBeNull()
  })

  it('does not publish by dragging: Go live launches', async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(cardIn('production', 'Full moon swim')!, 'event')
    expect(actions.setStage).not.toHaveBeenCalled()
    expect(cardIn('production', 'Full moon swim')).not.toBeNull()
    expect(toast()).toContain('goes live with Go live')
  })

  it('keeps a live Plan in Production until the event is done', async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(cardIn('event', 'Sound bath')!, 'planning')
    expect(actions.setStage).not.toHaveBeenCalled()
    expect(toast()).toContain('stays in Production until the event is done')
  })

  it("leaves another Space's Plan to that Space", async () => {
    const actions = actionsOf()
    await mount(actions)
    await dragTo(cardIn('planning', 'Beach clean')!, 'production')
    expect(actions.setStage).not.toHaveBeenCalled()
    expect(toast()).toContain('hosted by another Space')
  })

  it('puts the card back and says why when the server refuses', async () => {
    const actions = actionsOf({ setStage: vi.fn(async () => ({ error: 'That Plan no longer exists.' })) })
    await mount(actions)
    await dragTo(cardIn('pencil', 'Supper club')!, 'production')
    expect(cardIn('pencil', 'Supper club')).not.toBeNull()
    expect(cardIn('production', 'Supper club')).toBeNull()
    expect(toast()).toContain('Nothing moved. That Plan no longer exists.')
  })

  it('moves a focused card one stage with Shift and the arrow keys', async () => {
    const actions = actionsOf()
    await mount(actions)
    const el = cardIn('planning', 'Autumn retreat')!
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }))
    })
    expect(actions.setStage).toHaveBeenCalledWith('p-retreat', 'production')
  })

  it('leaves a read-only calendar alone', async () => {
    const actions = actionsOf()
    await mount(actions, false)
    const el = cardIn('pencil', 'Supper club')!
    expect(el.getAttribute('draggable')).toBeNull()
    await dragTo(el, 'planning')
    expect(actions.setStage).not.toHaveBeenCalled()
    expect(cardIn('cancelled', 'Dance night')?.querySelector('.cal-pk-foot button')).toBeNull()
  })
})

describe('the List', () => {
  const titles = () => [...document.querySelectorAll('.cal-lbody .cal-at')].map((t) => t.textContent)

  it('groups the Plans under their stage and sorts inside a group by the column pressed', async () => {
    await mount(actionsOf(), true, 'list')
    expect([...document.querySelectorAll('.cal-lgroup-head .cal-col-t')].map((h) => h.textContent)).toEqual([
      'Pencil',
      'Planning',
      'Production',
      'Published',
      'Cancelled',
    ])
    // Planning holds Autumn retreat and Beach clean; both have no date, so the title decides.
    expect(titles().slice(1, 3)).toEqual(['Autumn retreat', 'Beach clean'])
    const head = document.querySelector('[data-col="plan"] .cal-lsort') as HTMLElement
    await act(async () => head.click())
    expect(head.parentElement?.getAttribute('aria-sort')).toBe('ascending')
    await act(async () => head.click())
    expect(head.parentElement?.getAttribute('aria-sort')).toBe('descending')
    expect(titles().slice(1, 3)).toEqual(['Beach clean', 'Autumn retreat'])
  })
})
