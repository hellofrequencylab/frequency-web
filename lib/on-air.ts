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
  /** Optional ring-scale range for the phase, 0..1 across the MIN..MAX band.
   *  Defaults: 'in' 0→1, 'out' 1→0. Lets stacked breaths (3X's double inhale)
   *  grow in two steps instead of resetting between phases. */
  fromScale?: number
  toScale?: number
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
    // The physiological sigh, cyclic: a big inhale, a short top-up, one long
    // exhale. The rings grow in two stacked steps (fromScale/toScale).
    slug: '3x',
    name: '3X',
    blurb: 'Big breath in, sip a little more, one long letting go. The body\u2019s fastest reset.',
    phases: [
      { kind: 'in', label: 'Breathe in', seconds: 4, toScale: 0.82 },
      { kind: 'in', label: 'Sip in', seconds: 1, fromScale: 0.82 },
      { kind: 'out', label: 'Let go', seconds: 7 },
    ],
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

/** Custom pattern slider bounds (P3): in/out 3–8s; hold 0–8s, 0 = no hold. */
export const CUSTOM_PHASE_MIN = 3
export const CUSTOM_PHASE_MAX = 8

/** Build the member's own pattern from per-phase seconds. Pure. In and out
 *  clamp to 3–8; hold clamps to 0–8, and a 0 hold drops the phase entirely
 *  (in → out, no pause at the top). */
export function buildCustomPattern(inSec: number, holdSec: number, outSec: number): BreathPattern {
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isNaN(v) ? lo : Math.min(hi, Math.max(lo, v))
  const hold = clamp(holdSec, 0, CUSTOM_PHASE_MAX)
  const phases: BreathPhase[] = [IN(clamp(inSec, CUSTOM_PHASE_MIN, CUSTOM_PHASE_MAX))]
  if (hold > 0) phases.push(HOLD(hold))
  phases.push(OUT(clamp(outSec, CUSTOM_PHASE_MIN, CUSTOM_PHASE_MAX)))
  return {
    slug: 'custom',
    name: 'Custom',
    blurb: 'Your counts. Set each phase to what fits.',
    phases,
  }
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
  const band = (x: number) => MIN + (MAX - MIN) * x
  if (phase.kind === 'in') {
    const from = phase.fromScale ?? 0
    const to = phase.toScale ?? 1
    return band(from + (to - from) * ease(phaseProgress))
  }
  if (phase.kind === 'out') {
    const from = phase.fromScale ?? 1
    const to = phase.toScale ?? 0
    return band(from + (to - from) * ease(phaseProgress))
  }
  // Hold: stay wherever the previous moving phase left us. A hold directly after
  // an inhale rests full; after an exhale it rests small. Find the previous phase.
  const idx = pattern.phases.indexOf(phase)
  const prev = pattern.phases[(idx - 1 + pattern.phases.length) % pattern.phases.length]
  return band(prev.toScale ?? (prev.kind === 'out' ? 0 : 1))
}

/** Session duration presets (minutes). The 2-minute floor is deliberate: a
 *  sustainable daily sit beats an ambitious abandoned one. */
export const DURATION_PRESETS = [2, 5, 10, 15, 20, 30] as const

export type SessionMode = 'timer' | 'breath' | 'log'

// Bell tones (P5): one soft synthesized strike per cue, three voices. `freqs` is the
// partial stack — a fundamental plus a few overtones that give each voice its bell/bowl
// body (the synth fades higher partials down + adds a soft attack so there's no click);
// `decay` is the ring-out seconds. Tuned warm and low (not piercing) for a calm sit.
export interface BellTone {
  slug: string
  name: string
  freqs: number[]
  decay: number
}

export const BELL_TONES: BellTone[] = [
  // Warm singing-bowl-leaning voices: a low fundamental + harmonic shimmer, long ring.
  { slug: 'soft', name: 'Soft', freqs: [528, 1056], decay: 1.8 },
  { slug: 'low', name: 'Warm', freqs: [320, 480, 640], decay: 2.6 },
  { slug: 'amber', name: 'Amber', freqs: [256, 384, 512, 768], decay: 3.0 },
  { slug: 'bowl', name: 'Bowl', freqs: [288, 432, 519, 864], decay: 3.6 },
]

export function bellToneBySlug(slug: string | null | undefined): BellTone {
  return BELL_TONES.find((t) => t.slug === slug) ?? BELL_TONES[0]
}

/** Bell loudness: scales the synth peak. Quiet/Loud sit either side of the
 *  default. Kept well under earbud-hostile levels even at Loud. */
export type BellVolume = 'quiet' | 'medium' | 'loud'

export function bellVolumeScale(v: BellVolume | null | undefined): number {
  return v === 'quiet' ? 0.6 : v === 'loud' ? 1.5 : 1
}

/** Interval-bell choices for Meditate mode (minutes between strikes). 0 = off. */
export const BELL_INTERVALS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
] as const

/** Free-form session length (the stepper): 1–120 minutes. */
export function clampMinutes(m: number): number {
  if (!Number.isFinite(m)) return 5
  return Math.min(120, Math.max(1, Math.round(m)))
}

export interface OnAirPrefs {
  mode: SessionMode
  pattern: string
  minutes: number
  /** Custom pattern seconds (P3). In/out 3–8; hold 0–8 where 0 = no hold. */
  customIn?: number
  customHold?: number
  customOut?: number
  /** Soft bell on phase changes (breath) / minute marks (timer). Default off. */
  bell?: boolean
  /** Which bell voice (P5): soft | low | amber | bowl. */
  bellTone?: string
  /** Bell loudness — scales the synth peak. Default medium. */
  bellVolume?: BellVolume
  /** The closing double-strike at the end of a sit. Default on. */
  endBell?: boolean
  /** Meditate-mode interval bell: strike every N minutes. 0 = off, default 1
   *  (the original every-minute behavior). Ignored in breath mode (phase cues). */
  bellEveryMin?: number
  /** Vibration on phase changes, where the device supports it. Default off. */
  haptics?: boolean
}

export const DEFAULT_PREFS: OnAirPrefs = {
  mode: 'breath',
  pattern: 'box',
  minutes: 5,
  bellVolume: 'medium',
  endBell: true,
  bellEveryMin: 1,
}

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
