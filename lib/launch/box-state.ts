// THE LAUNCH BOX VIEW (VLS-08). What the members header needs to draw the launch box, as a plain
// serializable object: a progress count, the step the person is on, and the nine steps grouped by stage with
// their state. PURE over a snapshot (lib/launch/state.ts), so the pill, the sheet and a probe all read one
// answer. Nothing here is a person's own words: step labels come from the registry, never from their answers.

import { LAUNCH_STAGES, orderedLaunchSteps, type LaunchStepId } from './steps.ts'
import { isSettled, launchPhase, resumeStep, type LaunchSnapshot } from './state.ts'

type LaunchBoxRowState = 'done' | 'skipped' | 'now' | 'todo'

interface LaunchBoxRow {
  id: LaunchStepId
  label: string
  required: boolean
  state: LaunchBoxRowState
}

interface SetupBoxView {
  done: number
  total: number
  left: number
  /** 0 to 100, for the ring. */
  pct: number
  sections: { id: string; title: string; done: number; total: number }[]
  /** What is still to do, the next one first. At most six, so the sheet stays a glance. */
  todo: { id: string; label: string; href: string; photo: boolean; skipped: boolean }[]
}

export interface LaunchBoxView {
  total: number
  /** Steps that exist (published). A skipped step is settled but not counted as made. */
  done: number
  /** 0 to 100, for the ring. */
  pct: number
  minimized: boolean
  /** True while a stop was asked for and is waiting for the typed word. */
  stopAsked: boolean
  current: { id: LaunchStepId; label: string } | null
  /** After Publish the same pill becomes "Finish setup" over the Get Started list (lib/launch/setup-box.ts); null before. */
  setup?: SetupBoxView | null
  stages: { id: string; label: string; rows: LaunchBoxRow[] }[]
}

/** The box for one launch. Total: a junk steps record reads as nothing done. */
export function boxView(l: LaunchSnapshot, now: Date): LaunchBoxView {
  const ordered = orderedLaunchSteps(l.niche, l.intents)
  const nowId = resumeStep(l.niche, l.intents, l.steps)
  const rows: (LaunchBoxRow & { stage: string })[] = ordered.map((s) => {
    const e = l.steps[s.id]
    const state: LaunchBoxRowState = e?.status === 'published' ? 'done' : e?.status === 'skipped' ? 'skipped' : s.id === nowId ? 'now' : 'todo'
    return { id: s.id, label: s.label, required: s.required, state, stage: s.stage }
  })
  const done = rows.filter((r) => r.state === 'done').length
  const settled = ordered.filter((s) => isSettled(l.steps[s.id])).length
  const current = nowId ? { id: nowId, label: ordered.find((s) => s.id === nowId)!.label } : null
  return {
    total: rows.length,
    done,
    pct: rows.length ? Math.round((settled / rows.length) * 100) : 0,
    minimized: l.minimized,
    stopAsked: launchPhase(l, now) === 'cancel_requested',
    current,
    setup: null,
    stages: LAUNCH_STAGES.map((st) => ({ id: st.id, label: st.label, rows: rows.filter((r) => r.stage === st.id).map(({ stage: _s, ...r }) => r) })),
  }
}
