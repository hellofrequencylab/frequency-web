// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkflowView, CANCEL_PLAN_CONFIRM } from './calendar-workflow-view'
import { workflowBoard } from '@/lib/calendar/workflow-board'
import type { CalendarEvent } from '@/lib/calendar/item'
import { planStagePresentation, type SpacePlan } from '@/lib/calendar/plans'

const { transitionPlanStage } = vi.hoisted(() => ({
  transitionPlanStage: vi.fn(async (..._args: unknown[]) => ({})),
}))
vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/plan-actions', () => ({
  transitionPlanStage,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  transitionPlanStage.mockReset()
  transitionPlanStage.mockResolvedValue({})
  vi.restoreAllMocks()
})

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const plan: SpacePlan = {
  id: 'plan-1',
  spaceId: 'space-1',
  title: 'Open house',
  stage: 'production',
  notes: null,
  links: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const event: CalendarEvent = {
  slug: 'open-house',
  title: 'Open house',
  dayKey: '2026-09-24',
  timeLabel: '7:00 PM',
  whenLabel: 'Thu, Sep 24, 7:00 PM',
  startInstantIso: '2026-09-24T19:00:00.000Z',
  location: null,
  goingCount: 0,
  coverUrl: null,
  isCancelled: false,
  planId: 'plan-1',
}

describe('CalendarWorkflowView', () => {
  it('shows one canonical Plan card with linked calendar context', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(<CalendarWorkflowView columns={workflowBoard([plan], [event])} />))
    expect(container.querySelector('[data-calendar-workflow-view]')).not.toBeNull()
    expect(container.querySelectorAll('[data-workflow-card="plan-1"]')).toHaveLength(1)
    expect(container.textContent).toContain('Open house')
    expect(container.textContent).toContain('Thu, Sep 24, 7:00 PM')
  })

  it('moves the Plan and reports the change for immediate sibling-view synchronization', async () => {
    const changed = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(
      <CalendarWorkflowView
        columns={workflowBoard([{ ...plan, stage: 'plan' }], [event])}
        slug="lab"
        canManage
        onStageChanged={changed}
      />,
    ))
    await act(async () => {
      const select = container!.querySelector('select')!
      select.value = 'production'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(transitionPlanStage).toHaveBeenCalledWith('lab', 'plan-1', 'production')
    expect(changed).toHaveBeenCalledWith('plan-1', 'production')
  })

  // LIVE-467, finding 8. One `pending` flag disabled EVERY card's select while any one moved, with
  // nothing on the moving card to say so; and choosing Cancelled archived the Plan (a Cancelled
  // transition is `archived: true` in lib/calendar/workflow-board.ts) with no confirm, while the
  // drawer's Archive asks first.
  it('a move disables only the card that is moving, and says so on that card', async () => {
    let release!: () => void
    transitionPlanStage.mockReturnValue(new Promise<Record<string, never>>((res) => { release = () => res({}) }))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const other: SpacePlan = { ...plan, id: 'plan-2', title: 'Retreat', stage: 'plan' }
    act(() => root!.render(
      <CalendarWorkflowView columns={workflowBoard([{ ...plan, stage: 'plan' }, other], [event])} slug="lab" canManage />,
    ))
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    const moving = selects.find((s) => s.getAttribute('aria-label') === 'Move Open house')!
    const still = selects.find((s) => s.getAttribute('aria-label') === 'Move Retreat')!
    await act(async () => { changeSelect(moving, 'production') })
    expect(moving.disabled).toBe(true)
    expect(still.disabled).toBe(false)
    expect(container.querySelector('[data-workflow-card="plan-1"]')?.textContent).toContain('Moving')
    expect(container.querySelector('[data-workflow-card="plan-2"]')?.textContent).not.toContain('Moving')
    await act(async () => { release(); await Promise.resolve() })
    expect(moving.disabled).toBe(false)
  })

  it('Cancelled asks first, and a declined ask changes nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(
      <CalendarWorkflowView columns={workflowBoard([{ ...plan, stage: 'plan' }], [event])} slug="lab" canManage />,
    ))
    const select = container.querySelector('select') as HTMLSelectElement
    await act(async () => { changeSelect(select, 'cancelled') })
    expect(confirm).toHaveBeenCalledWith(CANCEL_PLAN_CONFIRM)
    expect(CANCEL_PLAN_CONFIRM).toContain('leaves Workflow')
    expect(transitionPlanStage).not.toHaveBeenCalled()
    expect(select.value).toBe('plan')

    confirm.mockReturnValue(true)
    await act(async () => { changeSelect(select, 'cancelled') })
    expect(transitionPlanStage).toHaveBeenCalledWith('lab', 'plan-1', 'cancelled')
  })

  it('an ordinary move never asks', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(
      <CalendarWorkflowView columns={workflowBoard([{ ...plan, stage: 'plan' }], [event])} slug="lab" canManage />,
    ))
    await act(async () => { changeSelect(container!.querySelector('select') as HTMLSelectElement, 'production') })
    expect(confirm).not.toHaveBeenCalled()
    expect(transitionPlanStage).toHaveBeenCalledWith('lab', 'plan-1', 'production')
  })

  it('says the stage in the registry\'s word and colour, not by column alone (LIVE-470)', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(
      <CalendarWorkflowView columns={workflowBoard([plan, { ...plan, id: 'plan-2', title: 'Solstice', stage: 'plan' }], [event])} />,
    ))
    const pills = [...container!.querySelectorAll('[data-workflow-card-stage]')]
    // Before this row a Workflow card carried no stage styling at all, so the only thing saying
    // where a Plan stood was which column it happened to sit in.
    expect(pills.map((n) => n.getAttribute('data-workflow-card-stage'))).toEqual(['planning', 'production'])
    expect(pills.map((n) => n.textContent)).toEqual([
      planStagePresentation('plan').word,
      planStagePresentation('production').word,
    ])
    expect(pills[0].querySelector('span')?.className).toContain('bg-info-bg')
    expect(pills[1].querySelector('span')?.className).toContain('bg-success-bg')
  })

  it('puts focus back on the card it just moved, never the body (LIVE-469)', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    // The real surface re-renders its columns from the same transition, so this mirrors it: the
    // board owns the stage and the view is told about the move through onStageChanged.
    function Board() {
      const [stage, setStage] = useState<'plan' | 'production'>('plan')
      return (
        <CalendarWorkflowView
          columns={workflowBoard([{ ...plan, stage }], [event])}
          slug="lab"
          canManage
          onStageChanged={(_id, next) => setStage(next as 'plan' | 'production')}
        />
      )
    }
    act(() => root!.render(<Board />))
    const select = container!.querySelector<HTMLSelectElement>('[data-workflow-card="plan-1"] select')!
    select.focus()
    await act(async () => {
      select.value = 'production'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    // The card is a different <li> and a different <select> by now; the focus that started the
    // move must land on the card again, not on <body>.
    expect(document.activeElement).not.toBe(document.body)
    expect(container!.contains(document.activeElement)).toBe(true)
  })
})
