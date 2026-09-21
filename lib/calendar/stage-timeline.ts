import { PLAN_STAGES, PLAN_STAGE_DEFS, planStageDef, type PlanStage } from './plans'
import { ENTRY_STAGES, entryStage, type EntryStage } from './registry'

// THE STAGE TIMELINE (ADR-1504). The entry drawer walks an event on its way through four steps,
// left to right: Pencil, Planning, Production, Publish. The first three are the stages ADR-1388
// keeps in the `stage` column; the fourth is not a stage at all but the door to the event Spark
// ("Make it a Production", docs/NAMING.md), because nothing becomes public without a person
// pressing publish there (ADR-1386 invariant 1). Cancelled is an exit, never a step: a pipeline
// and its exit must not share a control, so it stays a separate, quieter action in the drawer.
//
// Pure: no React, no Supabase. The drawer feeds it the form state and renders what comes back.

/** The three stages the row walks, in order. Cancelled is deliberately absent. */
export const STAGE_PIPELINE: readonly EntryStage[] = ['pencil', 'planning', 'production'] as const

export const PUBLISH_STEP = 'publish' as const
/** What a step writes back when it is pressed: an entry stage, the Publish door, or — on the Plan
 *  side of the same stepper, below — a Plan stage. One key type because one `StageTimelinePlan`
 *  feeds one `components/ui/stage-timeline.tsx`. */
export type TimelineStepKey = (typeof STAGE_PIPELINE)[number] | typeof PUBLISH_STEP | PlanStage

export type TimelineStepState = 'done' | 'current' | 'upcoming'

export interface TimelineStep {
  key: TimelineStepKey
  /** The step name staff see (docs/NAMING.md). */
  label: string
  state: TimelineStepState
  /** True when the step cannot be taken from here; `reason` says why, in the hint, never a tooltip. */
  disabled: boolean
  reason: string | null
}

export interface StageTimelinePlan {
  steps: TimelineStep[]
  /** The line under the row: what the current stage means (the registry's hint), or the exit's. */
  hint: string
  /** Why the disabled steps are disabled, deduplicated, in row order. */
  reasons: string[]
  /** True when the entry is Cancelled: no step is current, and Pencil brings it back. */
  cancelled: boolean
}

/** ADR-1388 §3: a date that is one of several candidates may not leave Pencil until one is kept.
 *  The same sentence the save action refuses with, so the drawer says it before the server does. */
export const ONE_OF_SEVERAL_REASON = 'This is one of several possible dates. Keep one date before you move it past Pencil.'

/** Publish is the Production door, so it opens only once the date is a Production. */
export const PUBLISH_NOT_YET_REASON = 'Make it a Production first. Publish opens from there.'

export const PUBLISH_LABEL = 'Publish'

export function stageTimeline(opts: {
  /** The stage in the form state (what the select used to write). */
  stage: string | null | undefined
  /** True when the row still has candidate siblings (`option_group` is set). */
  oneOfSeveral: boolean
}): StageTimelinePlan {
  const current = entryStage(opts.stage) ?? ENTRY_STAGES[0]
  const cancelled = current.stage === 'cancelled'
  const at = cancelled ? -1 : STAGE_PIPELINE.indexOf(current.stage)

  const steps: TimelineStep[] = STAGE_PIPELINE.map((key, i) => {
    const def = entryStage(key)!
    const state: TimelineStepState = at < 0 ? 'upcoming' : i < at ? 'done' : i === at ? 'current' : 'upcoming'
    const pastPencil = key !== 'pencil'
    const disabled = state !== 'current' && opts.oneOfSeveral && pastPencil
    return { key, label: def.label, state, disabled, reason: disabled ? ONE_OF_SEVERAL_REASON : null }
  })

  const ready = current.stage === 'production'
  const publishReason = ready ? null : opts.oneOfSeveral ? ONE_OF_SEVERAL_REASON : PUBLISH_NOT_YET_REASON
  steps.push({
    key: PUBLISH_STEP,
    label: PUBLISH_LABEL,
    // A door is never "where you are": it stays upcoming until it is walked through.
    state: 'upcoming',
    disabled: !ready,
    reason: publishReason,
  })

  const reasons = [...new Set(steps.map((s) => s.reason).filter((r): r is string => !!r))]
  return { steps, hint: current.hint, reasons, cancelled }
}

// THE PLAN SIDE OF THE SAME STEPPER. The Plan drawer taught the same concept with a <select>
// while the entry drawer taught it with a row of steps, which is the drift this repo names. It
// renders the SAME `components/ui/stage-timeline.tsx` from the SAME `StageTimelinePlan` shape, so
// there is one stepper in the product and not two.
//
// The planner is separate rather than shared because the two pipelines genuinely differ, and
// pretending otherwise would put a lie in the model:
//   · PLAN_STAGES is three values, not four, and `plan` (read "Planning") is its own word;
//   · a Plan has no Cancelled exit at all — it leaves through `archived_at` — so `cancelled` is
//     always false and the drawer grows no exit button to match the entry drawer's;
//   · there is no Publish step: a Plan's production door is `PLAN_TARGET_DEFS.createHref`, which
//     the drawer already renders as its own "Make it a Production" button, and a second control
//     for the same door is exactly the parallel system AGENTS.md forbids;
//   · no step is ever refused. ADR-1388 §3's candidate-date rule is a property of ONE date, and a
//     Plan holds many; its stage is derived from those dates where it can be (`derivePlanStage`),
//     so the stepper is the operator's override of that derivation, never a gate on it.

/** The Plan's three steps, from `PLAN_STAGE_DEFS`. Every label and hint is the registry's. */
export function planStageTimeline(opts: { stage: string | null | undefined }): StageTimelinePlan {
  const current = planStageDef(opts.stage)
  const at = PLAN_STAGES.indexOf(current.stage)
  const steps: TimelineStep[] = PLAN_STAGE_DEFS.map((def, i) => ({
    key: def.stage,
    label: def.label,
    state: i < at ? 'done' : i === at ? 'current' : 'upcoming',
    disabled: false,
    reason: null,
  }))
  return { steps, hint: current.hint, reasons: [], cancelled: false }
}

/** The Production door: the event Spark, prefilled from this entry (`lib/calendar/production-prefill.ts`
 *  reads `pencil`, and `plan` when the date belongs to one). */
export function productionDoorHref(spaceId: string, entryId: string, planId?: string | null): string {
  const q = new URLSearchParams({ space: spaceId, pencil: entryId })
  if (planId) q.set('plan', planId)
  return `/events/new?${q.toString()}`
}
