import { describe, expect, it } from 'vitest'
import type { SpacePlan } from '../plans'
import { adaptCalendar } from './adapters'
import { planStats } from './board'
import { SUITE_VIEWS, isPlanView } from './suite-model'
import type { PlannerPlan } from './types'

// The three Plan views (List, Kanban, Timeline) and the Cancelled column's data.

describe('isPlanView', () => {
  it('is the views that hold every Plan instead of a stretch of time', () => {
    expect(SUITE_VIEWS.filter(isPlanView)).toEqual(['list', 'board', 'timeline'])
  })
})

const stored = (over: Partial<SpacePlan>): SpacePlan => ({
  id: 'p1',
  spaceId: 's1',
  title: 'Dance night',
  stage: 'plan',
  notes: null,
  links: [],
  files: [],
  targetKind: 'event',
  playbookId: null,
  ownerProfileId: null,
  createdBy: null,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
})

describe('a Plan that was put away', () => {
  it('is Cancelled in the suite, whatever stage the row kept', () => {
    const out = adaptCalendar({
      ownSpaceId: 's1',
      events: [],
      todos: [],
      plans: [stored({ id: 'live' }), stored({ id: 'gone', archivedAt: '2026-10-15T00:00:00Z', stage: 'production' })],
    })
    expect(out.plans.map((p) => [p.id, p.stage])).toEqual([
      ['live', 'planning'],
      ['gone', 'cancelled'],
    ])
  })

  it('reads Cancelled, not Needs a date, when it has no dates left', () => {
    const plan: PlannerPlan = { id: 'p', title: 'Dance night', stage: 'cancelled', target: 'Event', team: [], spaces: [] }
    expect(planStats(plan, { items: [], tasks: [] }, '2026-10-21').health.label).toBe('Cancelled')
  })
})
