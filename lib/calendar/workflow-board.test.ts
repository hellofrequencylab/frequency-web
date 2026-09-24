import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './item'
import type { SpacePlan } from './plans'
import { planStageTransition, workflowBoard } from './workflow-board'
import { readFileSync } from 'node:fs'

const makePlan = (id: string, title: string, stage: SpacePlan['stage']): SpacePlan => ({
  id, spaceId: 'space-1', title, stage, notes: null, links: [], files: [], targetKind: 'event',
  playbookId: null, ownerProfileId: null, createdBy: null, archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})
const makeEvent = (planId: string, dayKey: string): CalendarEvent => ({
  slug: `entry-${planId}`, title: 'Date', dayKey, timeLabel: '7:00 PM', whenLabel: dayKey,
  startInstantIso: `${dayKey}T19:00:00.000Z`, location: null, goingCount: 0, coverUrl: null,
  isCancelled: false, planId,
})

describe('workflowBoard', () => {
  it('creates one card per active Plan and attaches linked dates', () => {
    const columns = workflowBoard(
      [
        makePlan('p1', 'Open house', 'production'),
        makePlan('p2', 'Future', 'pencil'),
        { ...makePlan('old', 'Old', 'plan'), archivedAt: '2026-08-01T00:00:00Z' },
      ],
      [makeEvent('p1', '2026-09-24'), makeEvent('p1', '2026-09-20'), makeEvent('unlinked', '2026-09-19')],
    )
    expect(columns.flatMap((column) => column.cards).map((card) => card.plan.id)).toEqual(['p2', 'p1'])
    expect(columns.find((column) => column.stage === 'production')?.cards[0]?.events.map((e) => e.dayKey)).toEqual(['2026-09-20', '2026-09-24'])
  })

  it('preserves persisted event plan ids through the admin adapter', () => {
    const store = readFileSync('lib/events/store.ts', 'utf8')
    const adapter = readFileSync('lib/calendar/admin-calendar.ts', 'utf8')
    expect(store).toContain('is_cancelled, plan_id')
    expect(adapter).toContain('planId: ev.plan_id ?? null')
  })

  it('defines one Plan-led mapping for pencil, planning, production, and cancellation', () => {
    expect(planStageTransition('pencil')).toMatchObject({ planStage: 'pencil', entryStage: 'pencil', archived: false })
    expect(planStageTransition('plan')).toMatchObject({ planStage: 'plan', entryStage: 'planning', archived: false })
    expect(planStageTransition('production')).toMatchObject({ planStage: 'production', entryStage: 'production', archived: false })
    expect(planStageTransition('cancelled')).toMatchObject({ planStage: 'plan', entryStage: 'cancelled', archived: true })
  })
})