import type { CalendarEvent } from './item'
import { planStageLabel, type PlanStage, type SpacePlan } from './plans'
import type { EntryStage } from './registry'

export type WorkflowStage = PlanStage | 'cancelled'

export type PlanStageTransition = {
  stage: WorkflowStage
  planStage: PlanStage
  entryStage: EntryStage
  archived: boolean
  label: string
}

// Every `label` here is planStageLabel's, which is the calendar registry's (LIVE-470). This file
// used to spell the four words out, which made it the fourth of five places they could drift.
export const PLAN_STAGE_TRANSITIONS: readonly PlanStageTransition[] = [
  { stage: 'pencil', planStage: 'pencil', entryStage: 'pencil', archived: false, label: planStageLabel('pencil') },
  { stage: 'plan', planStage: 'plan', entryStage: 'planning', archived: false, label: planStageLabel('plan') },
  { stage: 'production', planStage: 'production', entryStage: 'production', archived: false, label: planStageLabel('production') },
  { stage: 'cancelled', planStage: 'plan', entryStage: 'cancelled', archived: true, label: planStageLabel('cancelled') },
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
  { stage: 'pencil', label: planStageLabel('pencil') },
  { stage: 'plan', label: planStageLabel('plan') },
  { stage: 'production', label: planStageLabel('production') },
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