import type { WorkflowStage } from '../workflow-board'
import { stageLabel } from './board'
import { hostSpaceId } from './day-items'
import type { PlanStage, PlannerPlan } from './types'

// DROPPING A PLAN ON A STAGE. The Kanban's one drag: a Plan card onto a column writes the Plan's stage
// through the existing plan stage action (transitionPlanStage), and the Plan's own dates follow it.
// Like a date's move (./drop.ts) it is a PLAN: what the board draws until the server answers, the one
// write that makes it true, and the one write that takes it back. Nothing here touches the DOM, React
// or the network.
//
// Rulings (Daniel, 2026-10-28): Production stays open until the event is done, and Go live is what
// launches it, so a card does not land in Published by being dragged there, and a live Plan does not
// drop back to an earlier stage. Cancelled keeps its own column and its cards, with Undo.

/** Where a Plan card landed: a stage column. */
export interface StageTarget {
  zone: 'stage'
  stage: PlanStage
}

interface StageMove {
  planId: string
  from: PlanStage
  to: PlanStage
  /** The single write that makes the move true. */
  write: { planId: string; stage: WorkflowStage }
  /** The single write that puts the Plan back. */
  undo: { planId: string; stage: WorkflowStage }
  /** What the toast says once it is saved. */
  line: string
}

type StageOutcome = { kind: 'refused'; line: string } | { kind: 'noop' } | { kind: 'ready'; move: StageMove }

/** The stage the server stores for a column. Published is a Production the team launched, so putting
 *  a Plan back to where it was means writing Production. */
export function workflowStageOf(stage: PlanStage): WorkflowStage {
  return stage === 'planning' ? 'plan' : stage === 'event' ? 'production' : stage
}

/** What dropping a Plan on a stage column does. `ownSpaceId` is the Space looking at its own board; empty
 *  means the caller does not know it, and then the host is not checked. */
export function planStageDrop(
  plan: Pick<PlannerPlan, 'id' | 'title' | 'stage' | 'spaces'>,
  to: PlanStage,
  ownSpaceId: string,
): StageOutcome {
  const title = plan.title || 'That Plan'
  const from = plan.stage
  if (from === to) return { kind: 'noop' }
  const host = hostSpaceId(plan as PlannerPlan)
  if (ownSpaceId && host && host !== ownSpaceId) return { kind: 'refused', line: `${title} is hosted by another Space, so their team moves it.` }
  if (to === 'event') return { kind: 'refused', line: `${title} goes live with Go live, not by dragging. It stays in Production until then.` }
  if (from === 'event' && to !== 'cancelled') {
    return { kind: 'refused', line: `${title} is live. It stays in Production until the event is done.` }
  }
  const line =
    to === 'cancelled'
      ? `Cancelled ${title}. It stays on the team calendar, struck through.`
      : from === 'cancelled'
        ? `Brought ${title} back to ${stageLabel(to)}.`
        : `Moved ${title} to ${stageLabel(to)}.`
  return {
    kind: 'ready',
    move: {
      planId: plan.id,
      from,
      to,
      write: { planId: plan.id, stage: workflowStageOf(to) },
      undo: { planId: plan.id, stage: workflowStageOf(from) },
      line,
    },
  }
}

/** The Plans with their moved stages laid over them. Ids not in `over` are untouched. */
export function overlayPlans<T extends { id: string; stage: PlanStage }>(plans: readonly T[], over: Readonly<Record<string, PlanStage>>): T[] {
  return plans.map((p) => (over[p.id] ? { ...p, stage: over[p.id] } : p))
}

/** The stage write a runner needs, bound to one Space. */
export interface StageDeps {
  setStage: (planId: string, stage: WorkflowStage) => Promise<{ error: string } | { data?: unknown }>
}

/** Runs one stage write. Resolves to the error sentence, or null when it saved. */
export async function runStageWrite(call: { planId: string; stage: WorkflowStage }, deps: Partial<StageDeps>): Promise<string | null> {
  if (!deps.setStage) return 'Moving a Plan is not available here.'
  try {
    const res = await deps.setStage(call.planId, call.stage)
    return 'error' in res ? res.error : null
  } catch {
    return 'Something went wrong. Try again.'
  }
}
