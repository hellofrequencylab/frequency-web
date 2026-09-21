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
export type TimelineStepKey = (typeof STAGE_PIPELINE)[number] | typeof PUBLISH_STEP

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

/** The Spark opens FROM a saved date (`?pencil=<entryId>`), so a date that has never been saved has
 *  nothing to open from. The step says so rather than doing nothing when it is pressed. */
export const UNSAVED_REASON = 'Save this date first. Publish opens the Spark from the saved date.'

export const PUBLISH_LABEL = 'Publish'

export function stageTimeline(opts: {
  /** The stage in the form state (what the select used to write). */
  stage: string | null | undefined
  /** True when the row still has candidate siblings (`option_group` is set). */
  oneOfSeveral: boolean
  /** True when this date exists in the table. A date the drawer has not saved yet has no id, so
   *  the Production door has nothing to open; the step is refused instead of doing nothing. */
  saved: boolean
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

  const ready = current.stage === 'production' && opts.saved
  const publishReason = ready
    ? null
    : opts.oneOfSeveral
      ? ONE_OF_SEVERAL_REASON
      : current.stage === 'production'
        ? UNSAVED_REASON
        : PUBLISH_NOT_YET_REASON
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

/** The Production door: the event Spark, prefilled from this entry (`lib/calendar/production-prefill.ts`
 *  reads `pencil`, and `plan` when the date belongs to one). */
export function productionDoorHref(spaceId: string, entryId: string, planId?: string | null): string {
  const q = new URLSearchParams({ space: spaceId, pencil: entryId })
  if (planId) q.set('plan', planId)
  return `/events/new?${q.toString()}`
}
