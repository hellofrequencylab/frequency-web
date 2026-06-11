// On Air — the practice timer mini-app (ADR-229, docs/ON-AIR.md).
//
// Pure timer + breath-pattern math for the session surface. The economy never
// lives here: a session ends by calling the existing logPractice() path. This
// module owns what a CLIENT needs every animation frame — pattern definitions
// and "where am I in the breath cycle" — so it stays pure and unit-tested.
//
// Pattern grammar (the settled visualizer convention): a shape grows on the
// inhale, holds, settles on the exhale. Counts are member-adjustable later
// (P3 custom slider); these three cover the daily cases.

export type BreathKind = 'in' | 'hold' | 'out'

export interface BreathPhase {
  kind: BreathKind
  /** Member-facing cue. Plain words, no instruction-speak. */
  label: string
  seconds: number
}

export interface BreathPattern {
  slug: string
  name: string
  /** One-line of what it's for (setup screen). */
  blurb: string
  phases: BreathPhase[]
}

const IN = (s: number): BreathPhase => ({ kind: 'in', label: 'Breathe in', seconds: s })
const HOLD = (s: number): BreathPhase => ({ kind: 'hold', label: 'Hold', seconds: s })
const OUT = (s: number): BreathPhase => ({ kind: 'out', label: 'Let go', seconds: s })

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    slug: 'box',
    name: 'Box',
    blurb: 'Four counts each way. Steady under pressure.',
    phases: [IN(4), HOLD(4), OUT(4), HOLD(4)],
  },
  {
    slug: 'coherent',
    name: 'Coherent',
    blurb: 'Five and a half in, five and a half out. The long-haul rhythm.',
    phases: [IN(5.5), OUT(5.5)],
  },
  {
    slug: '478',
    name: '4-7-8',
    blurb: 'Long exhale. For winding down.',
    phases: [IN(4), HOLD(7), OUT(8)],
  },
]

export function patternBySlug(slug: string | null | undefined): BreathPattern {
  return BREATH_PATTERNS.find((p) => p.slug === slug) ?? BREATH_PATTERNS[0]
}

export function cycleSeconds(pattern: BreathPattern): number {
  return pattern.phases.reduce((s, p) => s + p.seconds, 0)
}

export interface BreathPosition {
  phase: BreathPhase
  /** Seconds into the current phase. */
  phaseElapsed: number
  /** 0..1 through the current phase. */
  phaseProgress: number
}

/** Where `elapsed` seconds lands in the repeating breath cycle. Pure. */
export function breathPositionAt(pattern: BreathPattern, elapsed: number): BreathPosition {
  const cycle = cycleSeconds(pattern)
  let t = cycle > 0 ? ((elapsed % cycle) + cycle) % cycle : 0
  for (const phase of pattern.phases) {
    if (t < phase.seconds) {
      return { phase, phaseElapsed: t, phaseProgress: phase.seconds > 0 ? t / phase.seconds : 1 }
    }
    t -= phase.seconds
  }
  const last = pattern.phases[pattern.phases.length - 1]
  return { phase: last, phaseElapsed: last.seconds, phaseProgress: 1 }
}

/** The visualizer's ring scale for a breath position: grows through the inhale,
 *  rests full on hold-after-in, settles through the exhale, rests small on
 *  hold-after-out. Eased so the motion reads as breath, not a metronome. */
export function ringScaleAt(pattern: BreathPattern, elapsed: number): number {
  const MIN = 0.62
  const MAX = 1
  const { phase, phaseProgress } = breathPositionAt(pattern, elapsed)
  const ease = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2 // cosine ease-in-out
  if (phase.kind === 'in') return MIN + (MAX - MIN) * ease(phaseProgress)
  if (phase.kind === 'out') return MAX - (MAX - MIN) * ease(phaseProgress)
  // Hold: stay wherever the previous moving phase left us. A hold directly after
  // an inhale rests full; after an exhale it rests small. Find the previous phase.
  const idx = pattern.phases.indexOf(phase)
  const prev = pattern.phases[(idx - 1 + pattern.phases.length) % pattern.phases.length]
  return prev.kind === 'out' ? MIN : MAX
}

/** Session duration presets (minutes). The 2-minute floor is deliberate: a
 *  sustainable daily sit beats an ambitious abandoned one. */
export const DURATION_PRESETS = [2, 5, 10, 20] as const

export type SessionMode = 'timer' | 'breath' | 'log'

export interface OnAirPrefs {
  mode: SessionMode
  pattern: string
  minutes: number
}

export const DEFAULT_PREFS: OnAirPrefs = { mode: 'breath', pattern: 'box', minutes: 5 }

// ---------------------------------------------------------------------------
// The reveal payload — everything the post-session screens show, gathered once
// by the completeSession action. Lives here (pure module) so the client can
// import the type without pulling server code into the bundle.
// ---------------------------------------------------------------------------

export interface RevealBonus {
  label: string
  kind: 'zaps' | 'gems'
  amount: number
}

export interface RevealPayload {
  /** False = this practice was already logged today (session still recorded). */
  logged: boolean
  zapsAwarded: number
  bonuses: RevealBonus[]
  welcomeBack: boolean
  practiceTitle: string
  /** Daily streak after this log. */
  streak: {
    current: number
    longest: number
    freezeTokens: number
    nextMilestone: { day: number; label: string } | null
    toNext: number
  }
  stats: {
    sessionSeconds: number
    todaySeconds: number
    totalSeconds: number
    lifetimeLogs: number
    nextDepthMark: number | null
    amplitude: number
    amplitudeLevel: number
  }
  dispatch: {
    copy: string
    actionHref: string | null
    actionLabel: string
  }
}
