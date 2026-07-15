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

/** Session duration presets (minutes) for the silent-timer sit modes (Meditate, Journal,
 *  Stillness, Ritual). Five chips in one clean row, matching Get Moving's Walk presets so
 *  the Be Still and Get Moving setup screens share the same minutes layout. The free-form
 *  stepper below still reaches any length (down to the 1-minute floor). */
export const DURATION_PRESETS = [5, 10, 15, 20, 30] as const

/** Breath-mode length presets — a shorter, calmer set than Meditate's (owner ask). The
 *  free-form stepper still lets a member pick any length under them. */
export const BREATH_DURATION_PRESETS = [5, 10, 20] as const

// The six setup modes (completion-economy redesign). Per the owner decision these are
// "framing + small extras", NOT six engines: Meditate / Stillness / Ritual are the SAME
// silent timed sit ('timer' path), differing only by label, icon, default minutes, and
// subline; Breathe is the guided breath path; Journal is a timed sit that ALSO shows a
// small free-text note; Just Log is the instant log (no countdown) with an optional note.
//
// IMPORTANT (server contract, app/(main)/on-air/actions.ts): completeSession gates the
// economy on `mode !== 'log'` (a timed claim) and only stamps `pattern` when `mode === 'breath'`.
// So every value below except 'log' reads back as a timed sit, and only 'breath' carries a
// pattern. The free-text `mode` column on practice_sessions records the exact value for history.
export type SessionMode = 'timer' | 'stillness' | 'ritual' | 'breath' | 'journal' | 'log'

/** Which underlying path a mode runs on. 'timer' = the silent countdown (Meditate / Stillness /
 *  Ritual / Journal share it); 'breath' = the guided rings; 'log' = the instant log, no countdown. */
export type SessionEngine = 'timer' | 'breath' | 'log'

/** Whether a mode shows the breath visualizer (vs. the plain countdown). */
export function isBreathMode(mode: SessionMode): boolean {
  return mode === 'breath'
}

/** Whether a mode offers the small free-text note field: Journal (during a sit) and
 *  Just Log (capture the interaction). The note is always optional. */
export function modeHasNote(mode: SessionMode): boolean {
  return mode === 'journal' || mode === 'log'
}

/** The engine a mode runs on, for the live screen + the economy gate. */
export function engineForMode(mode: SessionMode): SessionEngine {
  if (mode === 'breath') return 'breath'
  if (mode === 'log') return 'log'
  return 'timer'
}

/** Per-mode framing: the button label, the setup subline, and the default minutes a fresh
 *  pick seeds. Meditate / Stillness / Ritual / Journal are timer variants with their own
 *  copy + default length; the engine they run is the same silent countdown. */
export interface SessionModeMeta {
  mode: SessionMode
  label: string
  /** A short, plain subline shown under the mode row (no narrated feelings, no em dashes). */
  subline: string
  /** Default minutes seeded when a member switches to this mode with no practice length set. */
  defaultMin: number
}

export const SESSION_MODE_META: Record<SessionMode, SessionModeMeta> = {
  timer: {
    mode: 'timer',
    label: 'Meditate',
    subline: 'A quiet timed sit. The clock counts down and you breathe.',
    defaultMin: 10,
  },
  breath: {
    mode: 'breath',
    label: 'Breathe',
    subline: 'Follow the rings. Breathe in as they grow, out as they settle.',
    defaultMin: 5,
  },
  journal: {
    mode: 'journal',
    label: 'Journal',
    subline: 'A timed sit with a notes field. Write a line or two while you sit.',
    defaultMin: 10,
  },
  stillness: {
    mode: 'stillness',
    label: 'Stillness',
    subline: 'A longer, quieter sit. No cues unless you want them.',
    defaultMin: 15,
  },
  ritual: {
    mode: 'ritual',
    label: 'Ritual',
    subline: 'Your set practice, same length each time. Light the candle, then sit.',
    defaultMin: 10,
  },
  log: {
    mode: 'log',
    label: 'Just Log',
    subline: 'Mark it done now. Add a note if you want to remember the moment.',
    defaultMin: 5,
  },
}

/** The mode order the setup row shows: Meditate, Breathe, Journal, Stillness, Ritual, Just Log. */
export const SESSION_MODE_ORDER: SessionMode[] = [
  'timer',
  'breath',
  'journal',
  'stillness',
  'ritual',
  'log',
]

/** Map a practice's stored mindless_mode (lib/practices MindlessMode) to a SessionMode.
 *  'meditate' → the plain timer; the rest map one-to-one. A null falls back to the caller's
 *  default (typically the member's prefs, else Meditate). */
export function modeForMindless(
  mindlessMode: 'meditate' | 'breathe' | 'journal' | 'stillness' | 'ritual' | 'log' | null | undefined,
  fallback: SessionMode = 'timer',
): SessionMode {
  switch (mindlessMode) {
    case 'meditate':
      return 'timer'
    case 'breathe':
      return 'breath'
    case 'journal':
      return 'journal'
    case 'stillness':
      return 'stillness'
    case 'ritual':
      return 'ritual'
    case 'log':
      return 'log'
    default:
      return fallback
  }
}

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

// Ambient loops: an optional soft background that plays for the whole sit. The
// files live in /public/tracks; the player (lib/on-air-ambient.ts) decodes each
// into a seamless crossfade-to-self loop and fades it in. `credit` keeps the
// source on record (these are licensed Epidemic Sound tracks); it's never shown
// to a member.
export interface AmbientTrack {
  slug: string
  /** Member-facing name (setup chip). Plain words. */
  name: string
  /** Public path under /public. */
  src: string
  /** Source / attribution, for licensing records only. */
  credit: string
}

export const AMBIENT_TRACKS: AmbientTrack[] = [
  { slug: 'forest', name: 'Forest', src: '/tracks/forest.mp3', credit: 'Epidemic Sound: Ambience, Forest, Bird Sing, Black Forest Czech Republic' },
  { slug: 'ocean', name: 'Ocean', src: '/tracks/ocean.mp3', credit: 'Epidemic Sound: Water, Wave, Ocean, Waves On Shore, Beach, Close' },
  { slug: 'drift', name: 'Drift', src: '/tracks/drift.mp3', credit: 'Epidemic Sound: Remain (DEX 1200)' },
]

export function ambientTrackBySlug(slug: string | null | undefined): AmbientTrack | null {
  return AMBIENT_TRACKS.find((t) => t.slug === slug) ?? null
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
  /** Ambient background loop slug (AMBIENT_TRACKS), or null/absent for none. */
  ambientTrack?: string | null
  /** The warm-up countdown before a sit begins, in seconds: 3 | 5 | 10. Default 5
   *  (the original pre-roll). Drives the armed pre-roll on the live screen. */
  warmupSec?: number
}

/** The selectable warm-up lengths (seconds). The setup selector offers these three. */
export const WARMUP_PRESETS = [3, 5, 10] as const

/** Clamp a stored / input warm-up to one of the offered presets, defaulting to 5. */
export function clampWarmupSec(v: number | undefined): number {
  return v === 3 || v === 5 || v === 10 ? v : 5
}

// --- Creator-authored warm-up (ADR-592): a message + length shown during the pre-roll ------

/** The longest a creator-authored warm-up message may be (characters). */
export const WARMUP_MESSAGE_MAX = 140

/** The longest a creator-authored warm-up (pre-roll) may run, in seconds. Longer than the
 *  member presets (3/5/10) so an authored message has time to be read. */
export const WARMUP_SEC_MAX = 120

/** The lengths (seconds) the author's warm-up picker offers. `0` means "use the member's
 *  personal pre-roll length" (the default). The others give a message room to land. */
export const AUTHORED_WARMUP_PRESETS = [0, 5, 10, 15, 30] as const

/** Clamp an authored warm-up length to 0..WARMUP_SEC_MAX (integer), or null when unset.
 *  0 is kept (a real choice: fall back to the member's pre-roll length). */
export function clampAuthoredWarmupSec(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.min(WARMUP_SEC_MAX, Math.max(0, Math.round(v)))
}

/** Trim + cap a creator warm-up message; an empty string becomes null (a silent pre-roll). */
export function cleanWarmupMessage(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().slice(0, WARMUP_MESSAGE_MAX)
  return t.length ? t : null
}

/** Resolve the pre-roll length (seconds) for a run. Precedence:
 *   1. an explicit `override` (a caller that knows the length, e.g. a top-up leg passing 0
 *      to skip the second warm-up) always wins, clamped to >= 0;
 *   2. else the creator-authored warm-up (`authoredSec`) when set and positive;
 *   3. else the member's own pre-roll pref (`memberSec`).
 *  Extracted from the engines so both the sit and Get Moving resolve it identically and it can
 *  be unit-tested without rendering the timer. Returns 0 for "no warm-up, start immediately". */
export function resolveWarmupSec(
  authoredSec: number | null | undefined,
  memberSec: number,
  override?: number,
): number {
  if (typeof override === 'number' && Number.isFinite(override)) return Math.max(0, Math.round(override))
  if (authoredSec && authoredSec > 0) return authoredSec
  return Math.max(0, memberSec)
}

export const DEFAULT_PREFS: OnAirPrefs = {
  mode: 'breath',
  pattern: 'box',
  minutes: 5,
  bellVolume: 'medium',
  endBell: true,
  bellEveryMin: 1,
  warmupSec: 5,
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
  /** Completion economy (practice-timer redesign): this log was a PARTIAL timed sit
   *  (>= 50% but < 95% of target) — the day cleared + the streak ticked, but only 1 Zap
   *  paid. The reveal can offer "Finish for the rest." Optional + additive; absent on the
   *  unchanged full / one-tap path, so existing reveal UI is untouched. */
  partial?: boolean
  /** Completion economy: a partial sit was just topped up to complete via "Finish Practice"
   *  (the remaining Zaps were paid). Optional + additive. */
  finished?: boolean
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
    /** The label for the session row, named after the activity done ("This walk" /
     *  "This sit"), so the stats never describe the wrong practice (ADR-443). */
    sessionLabel: string
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
// member's feelings. No em dashes. The opener REFLECTS what was actually
// practiced (a walk vs a sit vs a journal), never a blanket "Good sit"; the
// close button (label + href) always matches what the line mentions:
//   * practices still to log today  → a gentle reminder    → "See your practices" /practices
//   * done + an RSVP'd gathering     → congratulate + name  → "View event"        /events/{slug}
//   * done, nothing pending          → congratulate          → "Back to feed"      /feed
// ---------------------------------------------------------------------------

/** What the member just did, so the Dispatch opener fits the practice. Mindless
 *  modes map straight from SessionMode; Movement modes name the movement kind
 *  (walk / run / yoga / strength / stretch / play). Defaults to a plain sit. */
export type DispatchKind =
  | SessionMode
  | 'walk'
  | 'run'
  | 'yoga'
  | 'strength'
  | 'stretch'
  | 'play'

/** A short, warm opener for what was just practiced (no narrated feelings, no em
 *  dashes). Vera names the thing the member actually did so a walk never reads
 *  "Good sit." Falls back to a neutral "Nicely done." for anything unmapped. */
export function dispatchOpener(kind: DispatchKind | null | undefined): string {
  switch (kind) {
    // Mindless
    case 'timer':
    case 'stillness':
    case 'ritual':
      return 'Good sit.'
    case 'breath':
      return 'Nice breathing.'
    case 'journal':
      return 'Good journal.'
    case 'log':
      return 'Logged.'
    // Movement
    case 'walk':
      return 'Nice walk.'
    case 'run':
      return 'Good run.'
    case 'yoga':
      return 'Nice flow.'
    case 'strength':
      return 'Strong work.'
    case 'stretch':
      return 'Nice stretch.'
    case 'play':
      return 'Good moving.'
    default:
      return 'Nicely done.'
  }
}

/** The stats-card label for THIS session, named after what was actually done so a walk
 *  reads "This walk" and a meditation "This sit" (never crossed). Movement kinds name the
 *  activity; quieter modes fall back to the plain "session". (ADR-443 mode-accuracy.) */
export function statSessionLabel(kind: DispatchKind | null | undefined): string {
  switch (kind) {
    case 'timer':
    case 'stillness':
    case 'ritual':
      return 'This sit'
    case 'walk':
      return 'This walk'
    case 'run':
      return 'This run'
    case 'yoga':
      return 'This yoga'
    case 'stretch':
      return 'This stretch'
    // breath / journal / log / strength / play read most naturally as a plain session.
    default:
      return 'This session'
  }
}

export interface SessionDispatchState {
  /** Titles of the member's adopted practices NOT yet logged today (any order). */
  practicesLeft: string[]
  /** The next gathering the member RSVP'd to (going/maybe), if any. */
  gathering: { title: string; slug: string } | null
  /** What was just practiced, so the opener fits it (a walk, a sit, a journal).
   *  Omitted falls back to a plain, kind-neutral congratulation. */
  kind?: DispatchKind | null
}

export function buildSessionDispatch(state: SessionDispatchState): {
  copy: string
  actionHref: string
  actionLabel: string
} {
  const left = state.practicesLeft.filter((t) => t && t.trim().length > 0)
  // The opener names what the member actually did (task D): a walk reads "Nice
  // walk.", a sit "Good sit.", a journal "Good journal." Never a blanket sit line.
  const opener = dispatchOpener(state.kind)

  // Still practices to log today — a gentle reminder, naming how many / which.
  if (left.length > 0) {
    const copy =
      left.length === 1
        ? `${opener} ${left[0]} is still on today's list. One more and you're caught up.`
        : `${opener} ${left.length} Practices still on today's list, starting with ${left[0]}. Pick them off when you can.`
    return { copy, actionHref: '/practices', actionLabel: 'See your practices' }
  }

  // Done for the day, with a gathering they're going to — congratulate + name it.
  if (state.gathering) {
    return {
      copy: `${opener} That's everything logged today. Next up is ${state.gathering.title}. See you in the room.`,
      actionHref: `/events/${state.gathering.slug}`,
      actionLabel: 'View event',
    }
  }

  // Done for the day, nothing pending — congratulate, send them back.
  return {
    copy: `${opener} That's everything logged for today. Nice work. Same time tomorrow.`,
    actionHref: '/feed',
    actionLabel: 'Back to feed',
  }
}
