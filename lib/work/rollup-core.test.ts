import { describe, it, expect } from 'vitest'
import { buildWorkRollup, planHref } from './rollup-core'
import type { SpacePlan } from '@/lib/calendar/plans'
import type { CrmTask } from '@/lib/crm/tasks-core'

const NOW = Date.parse('2026-11-24T20:00:00Z')
const freq = { id: 's-root', slug: 'frequency', name: 'Frequency' }
const yoga = { id: 's-yoga', slug: 'sunset-yoga', name: 'Sunset Yoga' }

function plan(id: string, stage: SpacePlan['stage'], extra: Partial<SpacePlan> = {}): SpacePlan {
  return {
    id, spaceId: 's', title: `Plan ${id}`, stage, notes: null, links: [], files: [], targetKind: 'event',
    playbookId: null, ownerProfileId: null, createdBy: null, archivedAt: null, createdAt: '', updatedAt: '', ...extra,
  } as SpacePlan
}

function task(id: string, extra: Partial<CrmTask> = {}): CrmTask {
  return {
    id, spaceId: 's', contactId: null, assigneeProfileId: null, title: `To-do ${id}`, notes: null, dueAt: null,
    status: 'open', createdBy: null, createdAt: '', updatedAt: '', planId: null, dueOffsetDays: null, ...extra,
  }
}

describe('buildWorkRollup', () => {
  const r = buildWorkRollup(
    [
      {
        space: freq,
        plans: [plan('p1', 'pencil'), plan('p2', 'production'), plan('p3', 'plan', { archivedAt: '2026-11-01' })],
        tasks: [
          task('t1', { assigneeProfileId: 'me', dueAt: '2026-11-30T00:00:00Z', planId: 'p2' }),
          task('t2', { assigneeProfileId: 'me', dueAt: '2026-11-20T00:00:00Z' }),
          task('t3', { assigneeProfileId: 'me' }),
          task('t4', { planId: 'p2' }),
          task('t5', { assigneeProfileId: 'someone-else' }),
          task('t6', { assigneeProfileId: 'me', status: 'done' }),
        ],
      },
      // The same shared to-do read again from a second Space counts once.
      { space: yoga, plans: [plan('p4', 'plan')], tasks: [task('t1', { assigneeProfileId: 'me' })] },
    ],
    'me',
    NOW,
  )

  it('lists my open to-dos overdue first, then by due date, undated last', () => {
    expect(r.mine.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
    expect(r.mine[0].overdue).toBe(true)
    expect(r.mine[1].planTitle).toBe('Plan p2')
    expect(r.mine[1].href).toBe('/spaces/frequency/settings/calendar?plan=p2')
  })

  it("keeps unclaimed to-dos apart and leaves other people's and done ones out", () => {
    expect(r.unassigned.map((t) => t.id)).toEqual(['t4'])
    expect(r.counts).toEqual({ mine: 3, overdue: 1, unassigned: 1, plans: 3 })
  })

  it('orders live Plans production, plan, pencil and skips archived ones', () => {
    expect(r.plans.map((p) => p.id)).toEqual(['p2', 'p4', 'p1'])
    expect(r.plans[0].openTodos).toBe(2)
  })

  it('links a to-do with no Plan to the calendar itself', () => {
    expect(planHref('frequency', null)).toBe('/spaces/frequency/settings/calendar')
  })
})

describe('a Pencil whose dates all passed (SCAN-1340)', () => {
  it('leaves the live Plans and is counted instead', () => {
    const r = buildWorkRollup(
      [{
        space: freq,
        plans: [plan('old', 'pencil'), plan('soon', 'pencil'), plan('nodate', 'pencil'), plan('run', 'plan')],
        tasks: [],
        pencilDays: { old: ['2026-09-22', '2026-09-24'], soon: ['2026-09-22', '2026-12-01'], run: ['2026-09-01'] },
        todayKey: '2026-11-25',
      }],
      'me',
      NOW,
    )
    expect(r.plans.map((p) => p.id).sort()).toEqual(['nodate', 'run', 'soon'])
    expect(r.datesPassed).toBe(1)
  })
})
