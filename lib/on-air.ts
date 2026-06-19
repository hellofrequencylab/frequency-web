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
  /** Full how-to for the in-session info popup. Plain, voice-compliant, no em dashes. */
  instructions: string
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
    instructions:
      'Breathe in for 4, hold for 4, breathe out for 4, hold for 4. Keep every count even and unhurried. The square rhythm steadies you under pressure and brings focus back. A favorite of athletes and first responders before a big moment.',
    phases: [IN(4), HOLD(4), OUT(4), HOLD(4)],
  },
  {
    slug: 'cohere',
    name: 'Coherence',
    blurb: 'Five in, five out. Steady the heart.',
    instructions:
      'Breathe in for 5 and out for 5, with no holds, in one smooth wave. That is about six breaths a minute, the pace where the heart and breath fall into sync. The everyday balancer: a few minutes settles the nervous system and clears the head.',
    phases: [IN(5), OUT(5)],
  },
  {
    slug: 'triangle',
    name: 'Triangle',
    blurb: 'In, hold, out. A simple steadier.',
    instructions:
      'Breathe in for 4, hold for 4, then breathe out for 4. One pause at the top, then let it all go. Three even sides, no second hold. A clean, simple loop for a steady head when you do not want to think about counts.',
    phases: [IN(4), HOLD(4), OUT(4)],
  },
  {
    // The physiological sigh, cyclic: a big inhale, a short top-up, one long
    // exhale. The rings grow in two stacked steps (fromScale/toScale).
    slug: '3x',
    name: '3X',
    blurb: 'Big breath in, sip a little more, one long letting go. The body\u2019s fastest reset.',
    instructions:
      'Take a full breath in through the nose, then sip a little more air on top to fill all the way, then one long slow exhale through the mouth. Repeat two or three times. This is the physiological sigh, the body\u2019s quickest reset when stress spikes.',
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
    instructions:
      'Breathe in quietly through the nose for 4, hold for 7, then breathe out slowly through the mouth for 8. The long exhale does the work. Use it to wind down at night or to come off the edge of anxiety. Start with four rounds.',
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
    instructions:
      'Your own counts. Set the inhale, the hold, and the exhale to whatever feels right today. Even and balanced steadies you; a longer exhale settles you down.',
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

/** Breath-mode length presets — a shorter, calmer set than Meditate's (owner ask). The
 *  free-form stepper still lets a member pick any length under them. */
export const BREATH_DURATION_PRESETS = [5, 10, 20] as const

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

// ---------------------------------------------------------------------------
// The session Dispatch from Vera — built from the member's real state at the
// moment a sit ends (ADR-229, Mindless #9/#10). Pure so it stays unit-testable
// and the client can import the type; the server action does the reads
// (getPracticesToLogToday + getNextGathering) and hands the facts in.
//
// VOICE (docs/CONTENT-VOICE.md): one short, warm, specific line. Proper nouns
// (Practices, the feed) carry it; the sentence stays plain. Never narrate the
// member's feelings. No em dashes. The close button (label + href) always
// matches what the line mentions:
//   * practices still to log today  → a gentle reminder    → "See your practices" /practices
//   * done + an RSVP'd gathering     → congratulate + name  → "View event"        /events/{slug}
//   * done, nothing pending          → congratulate          → "Back to feed"      /feed
// ---------------------------------------------------------------------------

export interface SessionDispatchState {
  /** Titles of the member's adopted practices NOT yet logged today (any order). */
  practicesLeft: string[]
  /** The next gathering the member RSVP'd to (going/maybe), if any. */
  gathering: { title: string; slug: string } | null
}

export function buildSessionDispatch(state: SessionDispatchState): {
  copy: string
  actionHref: string
  actionLabel: string
} {
  const left = state.practicesLeft.filter((t) => t && t.trim().length > 0)

  // Still practices to log today — a gentle reminder, naming how many / which.
  if (left.length > 0) {
    const copy =
      left.length === 1
        ? `Good sit. ${left[0]} is still on today's list. One more and you're caught up.`
        : `Good sit. ${left.length} Practices still on today's list, starting with ${left[0]}. Pick them off when you can.`
    return { copy, actionHref: '/practices', actionLabel: 'See your practices' }
  }

  // Done for the day, with a gathering they're going to — congratulate + name it.
  if (state.gathering) {
    return {
      copy: `That's everything logged today. Next up is ${state.gathering.title}. See you in the room.`,
      actionHref: `/events/${state.gathering.slug}`,
      actionLabel: 'View event',
    }
  }

  // Done for the day, nothing pending — congratulate, send them back.
  return {
    copy: "That's everything logged for today. Nice work. Same time tomorrow.",
    actionHref: '/feed',
    actionLabel: 'Back to feed',
  }
}
