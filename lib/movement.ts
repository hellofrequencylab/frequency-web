// Movement — the timed-movement engine (WEBSITE-CHANGES-PLAN §4 C.6). A sibling of
// the breath/sit timer in lib/on-air.ts, but for moving: a Walk, a Run, a Yoga flow,
// Strength intervals, a Stretch, or open Play. Pure timer math + presets only — no
// economy, no DOM, no audio.
// A Movement session ends through the SAME completeSession -> logPractice path the
// sit uses (the timer is a stage, not a second economy), so nothing in here writes.
//
// The shape: every mode compiles to ONE flat phase array + a rounds count. The live
// component walks elapsed seconds against it with phaseAt(); the engine never holds
// time itself. That keeps the whole thing unit-testable and frame-cheap.
//
// VOICE (docs/CONTENT-VOICE.md): every member-facing label is plain, warm, and
// instruction-light. No em or en dashes. Proper nouns (Tabata, EMOM) carry the magic.

/** The six ways a member moves. Walk = one block + optional reminders; Run = a brisk
 *  block + optional reminders; Yoga = a hold/transition loop; Strength = the interval
 *  work/rest engine; Stretch = a steady mobility timer with gentle side cues; Play =
 *  an open count-up. */
export type MovementMode = 'walk' | 'run' | 'yoga' | 'strength' | 'stretch' | 'play'

export const MOVEMENT_MODES: { mode: MovementMode; label: string; blurb: string }[] = [
  { mode: 'walk', label: 'Walk', blurb: 'One timed block, with gentle reminders if you want them.' },
  { mode: 'run', label: 'Run', blurb: 'A steady run for one timed block, with split cues if you want them.' },
  { mode: 'yoga', label: 'Yoga', blurb: 'Hold and move through a flow, one pose at a time.' },
  { mode: 'strength', label: 'Strength', blurb: 'Rounds of work and rest. Tabata, EMOM, AMRAP, or a circuit.' },
  { mode: 'stretch', label: 'Stretch', blurb: 'An easy mobility timer with soft cues to switch sides.' },
  { mode: 'play', label: 'Play', blurb: 'An open count-up. Start, move, stop when you are done.' },
]

/** One stretch of the timeline. `kind` colors the live screen (prepare neutral,
 *  work success, rest warning). `seconds` 0 = an open count-up phase (Play). */
export type PhaseKind = 'prepare' | 'work' | 'rest'

export interface MovementPhase {
  kind: PhaseKind
  /** Seconds this phase runs. 0 means open-ended (count up until the member stops). */
  seconds: number
  /** Member-facing cue. Plain words. */
  label: string
}

/** A built session: the flat per-round phase list plus how many times it loops.
 *  `rounds` already folds into a single pass for Walk/Run/Yoga/Stretch/Play (they
 *  pre-expand), so only Strength uses rounds > 1 against a small repeating block. */
export interface MovementPlan {
  mode: MovementMode
  /** The repeating block. Walked `rounds` times by phaseAt. */
  phases: MovementPhase[]
  rounds: number
  /** A short, voice-compliant label for the chosen shape (the setup read-out). */
  label: string
  /** True when the plan never ends on its own (Play): the live screen counts up
   *  and the only control is the member's Stop. */
  openEnded: boolean
}

// --- helpers ----------------------------------------------------------------

const PREPARE = (s: number, label = 'Get ready'): MovementPhase => ({ kind: 'prepare', seconds: s, label })
const WORK = (s: number, label = 'Work'): MovementPhase => ({ kind: 'work', seconds: s, label })
const REST = (s: number, label = 'Rest'): MovementPhase => ({ kind: 'rest', seconds: s, label })

/** Clamp a seconds value to a sane band (1s..4h), integer. Shared guard so a bad
 *  preset or custom input can never produce a runaway or negative phase. */
export function clampSeconds(s: number, lo = 1, hi = 4 * 60 * 60): number {
  if (!Number.isFinite(s)) return lo
  return Math.min(hi, Math.max(lo, Math.round(s)))
}

/** Clamp a rounds count to 1..99. */
export function clampRounds(r: number): number {
  if (!Number.isFinite(r)) return 1
  return Math.min(99, Math.max(1, Math.round(r)))
}

/** The standard 3s lead-in every guided plan opens with, so a 3-2-1 lands before
 *  the first work phase. Walk/Run/Yoga/Strength/Stretch share it; Play has no countdown. */
const PREPARE_SECONDS = 3

// --- Strength presets (the interval engine) ---------------------------------

/** A Strength shape the member picks (or customizes). `kind` drives how it compiles
 *  to phases; the numbers are the defaults the setup screen seeds + lets them tune. */
export type StrengthPresetKind = 'tabata' | 'emom' | 'amrap' | 'circuit'

export interface StrengthPreset {
  kind: StrengthPresetKind
  label: string
  blurb: string
  /** Seconds of work per round (AMRAP uses it as the whole-session block). */
  workSec: number
  /** Seconds of rest per round (0 for EMOM/AMRAP, which have no separate rest). */
  restSec: number
  rounds: number
}

export const STRENGTH_PRESETS: StrengthPreset[] = [
  { kind: 'tabata', label: 'Tabata', blurb: '20 seconds on, 10 off, eight rounds.', workSec: 20, restSec: 10, rounds: 8 },
  { kind: 'emom', label: 'EMOM', blurb: 'Every minute on the minute. Work, then wait for the next.', workSec: 60, restSec: 0, rounds: 10 },
  { kind: 'amrap', label: 'AMRAP', blurb: 'As many rounds as possible in one timed block.', workSec: 10 * 60, restSec: 0, rounds: 1 },
  { kind: 'circuit', label: 'Circuit', blurb: 'Classic stations: 45 on, 15 off, six rounds.', workSec: 45, restSec: 15, rounds: 6 },
]

export function strengthPresetByKind(kind: string | null | undefined): StrengthPreset {
  return STRENGTH_PRESETS.find((p) => p.kind === kind) ?? STRENGTH_PRESETS[0]
}

/** Back-compat alias. The old engine called these Workout; stored configs +
 *  existing imports still use the Workout kind name, so keep it pointing at Strength. */
export type WorkoutPresetKind = StrengthPresetKind

// --- Yoga presets (hold + transition flow) ----------------------------------

/** A Yoga flow style: how long each pose is held and the breath/transition between. */
export type YogaPresetKind = 'yin' | 'vinyasa' | 'gentle'

export interface YogaPreset {
  kind: YogaPresetKind
  label: string
  blurb: string
  /** Seconds to hold each pose. */
  holdSec: number
  /** Seconds to transition to the next pose. */
  transitionSec: number
  /** How many poses in the flow. */
  poses: number
}

export const YOGA_PRESETS: YogaPreset[] = [
  { kind: 'yin', label: 'Yin', blurb: 'Long, still holds. Settle into each shape.', holdSec: 3 * 60, transitionSec: 20, poses: 6 },
  { kind: 'vinyasa', label: 'Vinyasa', blurb: 'Shorter holds, flowing pose to pose with the breath.', holdSec: 40, transitionSec: 10, poses: 12 },
  { kind: 'gentle', label: 'Gentle', blurb: 'Easy holds with room to breathe between.', holdSec: 90, transitionSec: 15, poses: 8 },
]

export function yogaPresetByKind(kind: string | null | undefined): YogaPreset {
  return YOGA_PRESETS.find((p) => p.kind === kind) ?? YOGA_PRESETS[0]
}

// --- Stretch presets (a steady mobility timer with gentle side cues) ---------

/** Common stretch lengths in minutes (the setup chips). The stepper covers any length. */
export const STRETCH_DURATION_PRESETS = [5, 10, 15, 20] as const

/** Side-switch cue choices for a Stretch (minutes between soft "switch sides"
 *  chimes). 0 = none. The cue fires on the minute like a Walk reminder, not as an
 *  extra phase, so the block stays one steady countdown. */
export const STRETCH_INTERVAL_PRESETS = [
  { value: 0, label: 'None' },
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
] as const

// --- Walk presets (one block + optional interval reminders) -----------------

/** Common walk lengths in minutes (the setup chips). The stepper covers any length. */
export const WALK_DURATION_PRESETS = [10, 20, 30, 45, 60] as const

/** Interval-reminder choices for a Walk (minutes between gentle chimes). 0 = none. */
export const WALK_INTERVAL_PRESETS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
] as const

// --- Run presets (one brisk block + optional split cues) --------------------

/** Common run lengths in minutes (the setup chips). The stepper covers any length. */
export const RUN_DURATION_PRESETS = [10, 20, 30, 45] as const

/** Split-cue choices for a Run (minutes between gentle chimes). 0 = none. */
export const RUN_INTERVAL_PRESETS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
] as const

// --- builders ---------------------------------------------------------------

/** Walk = a single timed block (one work phase) plus the 3s lead-in. Interval
 *  reminders are a cue the live screen fires on the minute (intervalMin), not extra
 *  phases, so the block stays one clean countdown. */
export function buildWalk(opts: { minutes: number; intervalMin?: number }): MovementPlan {
  const seconds = clampSeconds(opts.minutes * 60)
  return {
    mode: 'walk',
    phases: [PREPARE(PREPARE_SECONDS, 'Get going'), WORK(seconds, 'Walk')],
    rounds: 1,
    label: `${Math.round(seconds / 60)} min walk`,
    openEnded: false,
  }
}

/** Run = a single brisk timed block (one work phase) plus the 3s lead-in. Same
 *  shape as Walk; split cues fire on the minute (intervalMin) as a live-screen cue,
 *  not extra phases, so the block stays one clean countdown. */
export function buildRun(opts: { minutes: number; intervalMin?: number }): MovementPlan {
  const seconds = clampSeconds(opts.minutes * 60)
  return {
    mode: 'run',
    phases: [PREPARE(PREPARE_SECONDS, 'Get going'), WORK(seconds, 'Run')],
    rounds: 1,
    label: `${Math.round(seconds / 60)} min run`,
    openEnded: false,
  }
}

/** Yoga = a hold/transition loop, pre-expanded into one flat pass (rounds = 1) so
 *  each pose can carry its own count in the phase list. Opens with the 3s lead-in. */
export function buildYoga(preset: YogaPreset): MovementPlan {
  const hold = clampSeconds(preset.holdSec)
  const transition = clampSeconds(preset.transitionSec)
  const poses = clampRounds(preset.poses)
  const phases: MovementPhase[] = [PREPARE(PREPARE_SECONDS, 'Find your mat')]
  for (let i = 0; i < poses; i++) {
    phases.push(WORK(hold, `Pose ${i + 1}`))
    // No transition trailing the last pose — the flow ends on a hold.
    if (i < poses - 1) phases.push(REST(transition, 'Flow to the next'))
  }
  return {
    mode: 'yoga',
    phases,
    rounds: 1,
    label: `${preset.label} flow, ${poses} poses`,
    openEnded: false, // Yoga is timed (holds + transitions), not an open count-up.
  }
}

/** Stretch = a steady, gentle mobility block: one timed work phase plus the 3s
 *  lead-in. Soft "switch sides" cues fire on the minute (intervalMin) as a
 *  live-screen cue, not extra phases, so the block stays one calm countdown. */
export function buildStretch(opts: { minutes: number; intervalMin?: number }): MovementPlan {
  const seconds = clampSeconds(opts.minutes * 60)
  return {
    mode: 'stretch',
    phases: [PREPARE(PREPARE_SECONDS, 'Settle in'), WORK(seconds, 'Stretch')],
    rounds: 1,
    label: `${Math.round(seconds / 60)} min stretch`,
    openEnded: false,
  }
}

/** Play = a single open-ended count-up. One work phase with seconds 0 (phaseAt
 *  reports it as never-ending), no countdown, no rounds. */
export function buildPlay(): MovementPlan {
  return {
    mode: 'play',
    phases: [WORK(0, 'Play')],
    rounds: 1,
    label: 'Open play',
    openEnded: true,
  }
}

/** Strength = the prepare -> (work -> rest) x rounds interval engine. The block is
 *  ONE work (+ rest when restSec > 0) repeated `rounds` times by phaseAt; the lead-in
 *  is its own one-shot phase outside the loop, so it never repeats. */
export function buildStrength(preset: StrengthPreset): MovementPlan {
  const work = clampSeconds(preset.workSec)
  const rest = Math.max(0, Math.round(preset.restSec))
  const rounds = clampRounds(preset.rounds)
  const block: MovementPhase[] = [WORK(work, 'Work')]
  if (rest > 0) block.push(REST(clampSeconds(rest), 'Rest'))
  return {
    mode: 'strength',
    // The lead-in rides as round 0's prepare; the repeating block is work(+rest).
    // phaseAt below treats index 0 as the one-shot prepare and loops the rest.
    phases: [PREPARE(PREPARE_SECONDS, 'Get ready'), ...block],
    rounds,
    label:
      preset.kind === 'amrap'
        ? `AMRAP, ${Math.round(work / 60)} min`
        : `${preset.label}, ${rounds} rounds`,
    openEnded: false,
  }
}

/** Build the plan for any mode from a small, serializable config (mirrors the
 *  movement_config JSON stored on a practice). The single front door the setup
 *  screen + the practice route both call. */
export interface MovementConfig {
  /** The current mode. A stored config may still carry the legacy `'workout'`
   *  string at runtime; buildPlan maps that to `'strength'` (see below) so old
   *  practice rows resolve without a DB migration. The public type stays the clean
   *  six-mode union so UI props reading `config.mode` don't have to widen. */
  mode: MovementMode
  /** Walk. */
  walkMinutes?: number
  walkIntervalMin?: number
  /** Run. */
  runMinutes?: number
  runIntervalMin?: number
  /** Yoga. */
  yogaKind?: YogaPresetKind
  /** Stretch. */
  stretchMinutes?: number
  stretchIntervalMin?: number
  /** Strength preset. `workoutKind` is the legacy key, still read for back-compat. */
  strengthKind?: StrengthPresetKind
  workoutKind?: WorkoutPresetKind
  /** Strength custom overrides (when the member tunes a preset). */
  workSec?: number
  restSec?: number
  rounds?: number
}

export function buildPlan(config: MovementConfig): MovementPlan {
  // Legacy back-compat: a stored `'workout'` mode (the engine's old name for
  // Strength) is read off the JSON as that literal string even though the type no
  // longer admits it, so map it here before routing. No DB migration needed.
  const mode: MovementMode = (config.mode as string) === 'workout' ? 'strength' : config.mode
  switch (mode) {
    case 'walk':
      return buildWalk({ minutes: config.walkMinutes ?? 20, intervalMin: config.walkIntervalMin })
    case 'run':
      return buildRun({ minutes: config.runMinutes ?? 20, intervalMin: config.runIntervalMin })
    case 'yoga':
      return buildYoga(yogaPresetByKind(config.yogaKind))
    case 'stretch':
      return buildStretch({ minutes: config.stretchMinutes ?? 10, intervalMin: config.stretchIntervalMin })
    case 'play':
      return buildPlay()
    case 'strength': {
      const base = strengthPresetByKind(config.strengthKind ?? config.workoutKind)
      // A custom override (the setup screen's steppers) replaces the preset numbers.
      const preset: StrengthPreset = {
        ...base,
        workSec: config.workSec ?? base.workSec,
        restSec: config.restSec ?? base.restSec,
        rounds: config.rounds ?? base.rounds,
      }
      return buildStrength(preset)
    }
    default:
      return buildPlay()
  }
}

// --- the runtime read -------------------------------------------------------

/** Where `elapsedSec` lands in a plan. PURE — the live component calls this every
 *  tick against a wall-clock elapsed, so the engine never holds time.
 *
 *  Model: phases[0] is an optional one-shot lead-in (prepare); the REST of the
 *  array is the repeating block, walked `rounds` times. An open-ended work phase
 *  (seconds 0, Play) never completes — remaining stays null and the screen counts up.
 */
export interface MovementPosition {
  /** The phase the member is in right now. */
  phase: MovementPhase
  /** 1-based round (1..rounds). Always 1 for single-pass plans. */
  round: number
  /** Seconds left in THIS phase, or null for an open-ended phase (count up). */
  remaining: number | null
  /** Seconds elapsed within the current phase. */
  phaseElapsed: number
  /** True once the whole plan is finished (past the last phase of the last round). */
  done: boolean
  /** The next phase's label, or null at the end (for the "next up" line). */
  nextLabel: string | null
}

export function phaseAt(plan: MovementPlan, elapsedSec: number): MovementPosition {
  const phases = plan.phases
  const rounds = clampRounds(plan.rounds)
  const t = Math.max(0, elapsedSec)

  // Split phases[0] (the one-shot lead-in) from the repeating block. A plan with no
  // prepare phase (none start with 'prepare') loops the whole array.
  const hasLeadIn = phases.length > 0 && phases[0].kind === 'prepare'
  const leadIn = hasLeadIn ? phases[0] : null
  const block = hasLeadIn ? phases.slice(1) : phases

  // Open-ended plan (Play): the single work phase never ends. Always round 1.
  if (block.length === 1 && block[0].seconds === 0) {
    return {
      phase: block[0],
      round: 1,
      remaining: null,
      phaseElapsed: t,
      done: false,
      nextLabel: null,
    }
  }

  // Walk the timeline. Build the flat sequence: [leadIn?, block x rounds].
  const sequence: { phase: MovementPhase; round: number }[] = []
  if (leadIn) sequence.push({ phase: leadIn, round: 1 })
  for (let r = 1; r <= rounds; r++) {
    for (const p of block) sequence.push({ phase: p, round: r })
  }

  let acc = 0
  for (let i = 0; i < sequence.length; i++) {
    const { phase, round } = sequence[i]
    const end = acc + phase.seconds
    if (t < end) {
      const phaseElapsed = t - acc
      return {
        phase,
        round,
        remaining: Math.max(0, phase.seconds - phaseElapsed),
        phaseElapsed,
        done: false,
        nextLabel: sequence[i + 1]?.phase.label ?? null,
      }
    }
    acc = end
  }

  // Past the end — the plan is done. Report the final phase, fully elapsed.
  const lastEntry = sequence[sequence.length - 1]
  const last = lastEntry?.phase ?? block[block.length - 1] ?? phases[0]
  return {
    phase: last,
    round: lastEntry?.round ?? rounds,
    remaining: 0,
    phaseElapsed: last?.seconds ?? 0,
    done: true,
    nextLabel: null,
  }
}

/** Total seconds a plan runs (sum of the lead-in plus the block x rounds). Returns
 *  null for an open-ended plan (Play). Used by the live screen's total + the log. */
export function totalSeconds(plan: MovementPlan): number | null {
  const phases = plan.phases
  const hasLeadIn = phases.length > 0 && phases[0].kind === 'prepare'
  const block = hasLeadIn ? phases.slice(1) : phases
  if (block.length === 1 && block[0].seconds === 0) return null
  const lead = hasLeadIn ? phases[0].seconds : 0
  const blockSeconds = block.reduce((s, p) => s + p.seconds, 0)
  return lead + blockSeconds * clampRounds(plan.rounds)
}
