// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalendarWorkflowView } from './calendar-workflow-view'
import { workflowBoard } from '@/lib/calendar/workflow-board'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { SpacePlan } from '@/lib/calendar/plans'

const { transitionPlanStage } = vi.hoisted(() => ({
  transitionPlanStage: vi.fn(async () => ({})),
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
})

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
})