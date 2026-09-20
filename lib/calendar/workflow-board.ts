import type { CalendarEvent } from './item'
import type { PlanStage, SpacePlan } from './plans'
import type { EntryStage } from './registry'

export type WorkflowStage = PlanStage | 'cancelled'

export type PlanStageTransition = {
  stage: WorkflowStage
  planStage: PlanStage
  entryStage: EntryStage
  archived: boolean
  label: string
}

export const PLAN_STAGE_TRANSITIONS: readonly PlanStageTransition[] = [
  { stage: 'pencil', planStage: 'pencil', entryStage: 'pencil', archived: false, label: 'Pencil' },
  { stage: 'plan', planStage: 'plan', entryStage: 'planning', archived: false, label: 'Planning' },
  { stage: 'production', planStage: 'production', entryStage: 'production', archived: false, label: 'Production' },
  { stage: 'cancelled', planStage: 'plan', entryStage: 'cancelled', archived: true, label: 'Cancelled' },
]

export function planStageTransition(stage: string): PlanStageTransition | null {
  return PLAN_STAGE_TRANSITIONS.find((transition) => transition.stage === stage) ?? null
}

export type WorkflowCard = {
  key: string
  plan: SpacePlan
  stage: PlanStage
  events: CalendarEvent[]
  primaryEvent: CalendarEvent | null
}
export type WorkflowColumn = { stage: PlanStage; label: string; cards: WorkflowCard[] }
const STAGES: readonly { stage: PlanStage; label: string }[] = [
  { stage: 'pencil', label: 'Pencil' },
  { stage: 'plan', label: 'Planning' },
  { stage: 'production', label: 'Production' },
]

/** One canonical card per active Plan, with linked calendar dates attached. */
export function workflowBoard(plans: readonly SpacePlan[], events: readonly CalendarEvent[]): WorkflowColumn[] {
  const byPlan = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    if (!event.planId) continue
    byPlan.set(event.planId, [...(byPlan.get(event.planId) ?? []), event])
  }
  const columns = STAGES.map(({ stage, label }) => ({ stage, label, cards: [] as WorkflowCard[] }))
  const index = new Map(columns.map((column) => [column.stage, column]))
  for (const plan of plans) {
    if (plan.archivedAt) continue
    const linked = (byPlan.get(plan.id) ?? []).slice().sort((a, b) => a.dayKey.localeCompare(b.dayKey))
    index.get(plan.stage)?.cards.push({ key: plan.id, plan, stage: plan.stage, events: linked, primaryEvent: linked[0] ?? null })
  }
  for (const column of columns) column.cards.sort((a, b) => a.plan.title.localeCompare(b.plan.title) || a.key.localeCompare(b.key))
  return columns
}