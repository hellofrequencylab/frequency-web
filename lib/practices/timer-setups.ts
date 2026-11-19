// THE PRACTICE TIMER SETUPS (LIVE-2396). One closed catalog of ready-made timer configurations a
// Practice can ship with, the plain-words description of any stored configuration, and the
// offline recommender that ranks the catalog against what the author wrote.
//
// WHY A CATALOG. Before this, creating a Practice never set its timer: the create flow carried a
// timer slot nothing filled, so every new Practice shipped as a silent sit with no length and the
// author had to find the tuning two thirds down the editor. A named setup is one tap, and every
// setup here is a configuration the timer already runs.
//
// VERA NEVER WRITES. The owner ruling stands (ADR-1939, ruling 4): Vera coaches with questions and
// never writes an author's words. A recommendation is therefore an ID from this file plus a reason
// ID from this file. Every word an author reads below was written and reviewed here; a model can
// only choose which ones apply (lib/ai/practice-timer-suggest.ts), and the author taps to apply.
//
// PURE and client-safe: no database, no model, no server-only import. The editor, the create
// flow, the practice page and the Vera spark all read this one file.

import { BREATH_PATTERNS } from '@/lib/on-air'
import {
  buildPlan,
  totalSeconds,
  MOVEMENT_MODES,
  type MovementConfig,
} from '@/lib/movement'

type TimerKindValue = 'mindless' | 'movement' | 'none'
type BeStillMode = 'meditate' | 'breathe' | 'journal' | 'stillness' | 'ritual' | 'log'

/** The timer columns one setup writes. A subset of PracticeEdit, restated here because
 *  lib/practices.ts opens with the server-only admin client. */
interface TimerSetupPatch {
  timer_kind: TimerKindValue
  mindless_mode?: Exclude<BeStillMode, 'log'> | null
  breath_pattern?: string | null
  movement_config?: MovementConfig | null
  duration_min?: number | null
}

interface TimerSetupDef {
  /** The name on the card. A thing you do, in plain words. */
  label: string
  /** One line on what the timer does once it opens. */
  detail: string
  kind: TimerKindValue
  mode?: Exclude<BeStillMode, 'log'>
  breath?: string
  movement?: MovementConfig
  /** The length it ships with, in minutes. Absent for a setup with no single length. */
  minutes?: number
  /** True when the author's own length can replace `minutes` (a sit, a walk, a stretch). */
  flexible?: boolean
}

/** The catalog. Order is the fallback order when nothing in the author's words points anywhere. */
const SETUPS = {
  'quiet-sit': { label: 'Quiet sit', detail: 'A timed sit. The clock counts down and you stay with it.', kind: 'mindless', mode: 'meditate', minutes: 5, flexible: true },
  'box-breathing': { label: 'Box breathing', detail: 'Rings pace each breath: four in, hold four, four out, hold four.', kind: 'mindless', mode: 'breathe', breath: 'box', minutes: 5, flexible: true },
  'even-breathing': { label: 'Even breathing', detail: 'Rings pace each breath: five in, five out, no holds.', kind: 'mindless', mode: 'breathe', breath: 'cohere', minutes: 5, flexible: true },
  'wind-down-breathing': { label: 'Wind-down breathing', detail: 'Rings pace a 4-7-8 breath, with a long slow breath out.', kind: 'mindless', mode: 'breathe', breath: '478', minutes: 5, flexible: true },
  'timed-journal': { label: 'Timed journal', detail: 'A timed sit with a notes field to write in.', kind: 'mindless', mode: 'journal', minutes: 10, flexible: true },
  'long-stillness': { label: 'Long stillness', detail: 'A longer, quieter sit with no cues along the way.', kind: 'mindless', mode: 'stillness', minutes: 20, flexible: true },
  'daily-ritual': { label: 'Daily ritual', detail: 'The same set practice at the same length each time.', kind: 'mindless', mode: 'ritual', minutes: 10, flexible: true },
  'easy-walk': { label: 'Easy walk', detail: 'One timed block for a walk. Add a chime along the way if you want one.', kind: 'movement', movement: { mode: 'walk', walkMinutes: 20, walkIntervalMin: 0 }, minutes: 20, flexible: true },
  'steady-run': { label: 'Steady run', detail: 'One timed block for a run. Add split cues if you want them.', kind: 'movement', movement: { mode: 'run', runMinutes: 20, runIntervalMin: 0 }, minutes: 20, flexible: true },
  'stretch': { label: 'Stretch', detail: 'An easy mobility timer. Add a soft cue to switch sides if you want one.', kind: 'movement', movement: { mode: 'stretch', stretchMinutes: 10, stretchIntervalMin: 0 }, minutes: 10, flexible: true },
  'gentle-yoga': { label: 'Gentle yoga', detail: 'Eight easy holds with room to breathe between each pose.', kind: 'movement', movement: { mode: 'yoga', yogaKind: 'gentle' } },
  'yin-yoga': { label: 'Yin yoga', detail: 'Six long, still holds. Settle into each shape.', kind: 'movement', movement: { mode: 'yoga', yogaKind: 'yin' } },
  'tabata': { label: 'Tabata', detail: 'Eight rounds of 20 seconds on, 10 seconds off.', kind: 'movement', movement: { mode: 'strength', strengthKind: 'tabata', workSec: 20, restSec: 10, rounds: 8 } },
  'circuit': { label: 'Circuit', detail: 'Six rounds of 45 seconds on, 15 seconds off.', kind: 'movement', movement: { mode: 'strength', strengthKind: 'circuit', workSec: 45, restSec: 15, rounds: 6 } },
  'open-play': { label: 'Open play', detail: 'An open count-up. Start, move, stop when you are done.', kind: 'movement', movement: { mode: 'play' } },
  'log-it': { label: 'Log it', detail: 'No timer. One tap marks it done, with room for a note.', kind: 'none' },
} as const satisfies Record<string, TimerSetupDef>

export type TimerSetupId = keyof typeof SETUPS
export const TIMER_SETUP_IDS = Object.keys(SETUPS) as TimerSetupId[]

/** Why a setup is being offered. Reviewed sentences; a model may only pick the key. */
const REASONS = {
  breath: 'You describe breathing, so the timer can pace each breath.',
  sit: 'You describe a quiet sit, so a simple countdown fits.',
  wind_down: 'You describe winding down, so a slow breath out fits.',
  writing: 'You describe writing, so the timer opens with a notes field.',
  ritual: 'You describe a set routine, so the same length each time fits.',
  long: 'You describe a longer session, so a timer with no cues fits.',
  walk: 'You describe a walk, so one timed block fits.',
  run: 'You describe a run, so one timed block with optional splits fits.',
  stretch: 'You describe stretching, so an easy timer with side cues fits.',
  yoga: 'You describe a flow of poses, so the timer moves pose to pose.',
  intervals: 'You describe rounds of effort, so work and rest are timed for you.',
  open: 'You describe free movement, so an open count-up fits.',
  act: 'You describe a real-world act, so one tap to log it fits.',
  general: 'A common place to start. You can change it any time.',
} as const

type TimerReasonId = keyof typeof REASONS
export const TIMER_REASON_IDS = Object.keys(REASONS) as TimerReasonId[]

/** The lengths a recommendation may carry. A closed set, so a model cannot invent one. */
export const TIMER_SUGGESTION_MINUTES = [2, 3, 5, 10, 15, 20, 30, 45, 60] as const

/** One recommendation as chosen: IDs only. This is the whole of what a model may return. */
export interface TimerPick {
  setupId: TimerSetupId
  reasonId: TimerReasonId
  /** The author's own length, when they gave one and the setup can take it. */
  minutes?: number | null
}

/** One recommendation as shown: the reviewed words plus the columns it writes. */
export interface TimerSuggestion {
  id: TimerSetupId
  label: string
  detail: string
  reason: string
  /** The one-line summary a member sees on the card and the practice page. */
  preview: string
  patch: TimerSetupPatch
}

export function isTimerSetupId(value: unknown): value is TimerSetupId {
  return typeof value === 'string' && Object.hasOwn(SETUPS, value)
}

export function isTimerReasonId(value: unknown): value is TimerReasonId {
  return typeof value === 'string' && Object.hasOwn(REASONS, value)
}

function clampMinutes(value: number): number {
  return Math.min(600, Math.max(1, Math.round(value)))
}

/** The plan length of a Get Moving setup in whole minutes, or null for an open count-up. */
function movementMinutes(config: MovementConfig): number | null {
  const total = totalSeconds(buildPlan(config))
  return total != null ? Math.max(1, Math.round(total / 60)) : null
}

/** The columns a setup writes. `minutes` replaces the shipped length where the setup allows it;
 *  anywhere else it is ignored, so a Tabata is always a Tabata. PURE. */
export function timerSetupPatch(id: TimerSetupId, minutes?: number | null): TimerSetupPatch {
  const def: TimerSetupDef = SETUPS[id]
  const length = def.flexible && minutes != null && Number.isFinite(minutes) && minutes > 0
    ? clampMinutes(minutes)
    : def.minutes ?? null
  if (def.kind === 'none') return { timer_kind: 'none', movement_config: null }
  if (def.kind === 'movement' && def.movement) {
    const config: MovementConfig = { ...def.movement }
    if (length != null) {
      if (config.mode === 'walk') config.walkMinutes = length
      if (config.mode === 'run') config.runMinutes = length
      if (config.mode === 'stretch') config.stretchMinutes = length
    }
    return { timer_kind: 'movement', movement_config: config, duration_min: movementMinutes(config) }
  }
  return {
    timer_kind: 'mindless',
    movement_config: null,
    mindless_mode: def.mode ?? null,
    breath_pattern: def.mode === 'breathe' ? def.breath ?? null : null,
    duration_min: length,
  }
}

// ── Plain words for any stored configuration ─────────────────────────────────────────────────

/** A Practice's timer columns, as stored. Every field optional so a partial draft still reads. */
export interface TimerConfigInput {
  timerKind?: string | null
  mindlessMode?: string | null
  breathPattern?: string | null
  movementConfig?: MovementConfig | null
  durationMin?: number | null
  durationLocked?: boolean | null
  warmupSec?: number | null
  warmupMessage?: string | null
}

interface TimerDescription {
  /** Which half of the timer opens: Be Still, Get Moving, or no timer at all. */
  mode: 'Be Still' | 'Get Moving' | 'Log it'
  /** The kit energy the surface wears, so Get Moving reads apart from Be Still at a glance. */
  energy: 'still' | 'charge'
  /** The one-line summary: "Breathe · Box · 5 min". */
  headline: string
  /** What happens when a member starts, one short sentence each. */
  facts: string[]
  /** True when nothing has been chosen yet: the untouched default a new row is born with. */
  unset: boolean
}

const BE_STILL_LABEL: Record<BeStillMode, string> = {
  meditate: 'Meditate',
  breathe: 'Breathe',
  journal: 'Journal',
  stillness: 'Stillness',
  ritual: 'Ritual',
  log: 'Just Log',
}

const BE_STILL_FACT: Record<BeStillMode, string> = {
  meditate: 'A quiet timed sit. The clock counts down.',
  breathe: 'Rings on screen pace each breath.',
  journal: 'A timed sit with a notes field to write in.',
  stillness: 'A longer, quieter sit with no cues.',
  ritual: 'The same set practice at the same length each time.',
  log: 'No timer. One tap marks it done, with room for a note.',
}

function warmupFacts(input: TimerConfigInput): string[] {
  const facts: string[] = []
  if (input.warmupSec && input.warmupSec > 0) facts.push(`Counts in for ${input.warmupSec} seconds before it starts.`)
  if (input.warmupMessage?.trim()) facts.push('Shows a warm-up note while it counts in.')
  return facts
}

/** Describe a stored timer configuration in plain words. PURE and total: any row reads. */
export function describeTimer(input: TimerConfigInput): TimerDescription {
  const kind = input.timerKind ?? 'mindless'
  const minutes = input.durationMin && input.durationMin > 0 ? input.durationMin : null

  if (kind === 'none' || (kind === 'mindless' && input.mindlessMode === 'log')) {
    return { mode: 'Log it', energy: 'still', headline: 'Log it', facts: [BE_STILL_FACT.log], unset: false }
  }

  if (kind === 'movement') {
    const config = input.movementConfig ?? { mode: 'walk' as const }
    const plan = buildPlan(config)
    const total = movementMinutes(config)
    const mode = (config.mode as string) === 'workout' ? 'strength' : config.mode
    const blurb = MOVEMENT_MODES.find((m) => m.mode === mode)?.blurb
    return {
      mode: 'Get Moving',
      energy: 'charge',
      // Walk, Run and Stretch already carry their length in the plan's own label.
      headline: total != null && !/\bmin\b/.test(plan.label) ? `${plan.label} · ${total} min` : plan.label,
      facts: [
        ...(blurb ? [blurb] : []),
        'You can adjust it when you start.',
        ...warmupFacts(input),
      ],
      unset: false,
    }
  }

  const mode = (input.mindlessMode && Object.hasOwn(BE_STILL_LABEL, input.mindlessMode)
    ? input.mindlessMode
    : null) as BeStillMode | null
  const pattern = mode === 'breathe' && input.breathPattern
    ? BREATH_PATTERNS.find((p) => p.slug === input.breathPattern) ?? null
    : null
  const parts: string[] = mode ? [BE_STILL_LABEL[mode]] : []
  if (pattern) parts.push(pattern.name)
  parts.push(minutes ? `${minutes} min` : 'Open length')
  return {
    mode: 'Be Still',
    energy: 'still',
    headline: parts.join(' · '),
    facts: [
      mode ? BE_STILL_FACT[mode] : 'Opens on the mode that fits this practice.',
      ...(mode === 'breathe' && !pattern ? ['Uses your own saved breath pattern.'] : []),
      !minutes
        ? 'No set length. Pick one when you start.'
        : input.durationLocked
          ? 'The length is fixed.'
          : 'You can change the length when you start.',
      ...warmupFacts(input),
    ],
    unset: !mode && !minutes,
  }
}

// ── Recommendations ───────────────────────────────────────────────────────────────────────────

/** Turn chosen IDs into what the author reads and what a tap writes. Unknown IDs drop out, a
 *  repeat keeps its first reason, and the list stops at three. PURE. */
export function resolveTimerPicks(picks: readonly TimerPick[]): TimerSuggestion[] {
  const seen = new Set<string>()
  const out: TimerSuggestion[] = []
  for (const pick of picks) {
    if (!isTimerSetupId(pick.setupId) || seen.has(pick.setupId)) continue
    seen.add(pick.setupId)
    const def: TimerSetupDef = SETUPS[pick.setupId]
    const patch = timerSetupPatch(pick.setupId, pick.minutes)
    const described = describeTimer({
      timerKind: patch.timer_kind,
      mindlessMode: patch.mindless_mode,
      breathPattern: patch.breath_pattern,
      movementConfig: patch.movement_config,
      durationMin: patch.duration_min,
    })
    out.push({
      id: pick.setupId,
      label: def.label,
      detail: def.detail,
      reason: REASONS[isTimerReasonId(pick.reasonId) ? pick.reasonId : 'general'],
      preview: `${described.mode} · ${described.headline}`.replace('Log it · Log it', 'Log it'),
      patch,
    })
    if (out.length === 3) break
  }
  return out
}

/** What the author has written so far. Every field is optional: a blank draft still ranks. */
export interface TimerSignals {
  title?: string | null
  summary?: string | null
  description?: string | null
  body?: string | null
  /** A length the author already gave (the Time field, or the create flow's pace answer). */
  durationMin?: number | null
}

/** A word-boundary match on the author's own text. Each rule names the setups it points to. */
const RULES: readonly { test: RegExp; setups: readonly TimerSetupId[]; reason: TimerReasonId }[] = [
  { test: /\b(4-7-8|478|sleep|bedtime|wind(ing)? down|before bed)\b/, setups: ['wind-down-breathing'], reason: 'wind_down' },
  { test: /\bbox breath/, setups: ['box-breathing'], reason: 'breath' },
  { test: /\b(breath|breathe|breathing|breathwork|inhale|exhale)\b/, setups: ['box-breathing', 'even-breathing'], reason: 'breath' },
  { test: /\b(journal|journaling|write|writing|gratitude list|morning pages|reflect|reflection)\b/, setups: ['timed-journal'], reason: 'writing' },
  { test: /\b(yin)\b/, setups: ['yin-yoga'], reason: 'yoga' },
  { test: /\b(yoga|asana|sun salutation|poses?)\b/, setups: ['gentle-yoga', 'yin-yoga'], reason: 'yoga' },
  { test: /\b(stretch|stretching|mobility|foam roll|loosen)\b/, setups: ['stretch'], reason: 'stretch' },
  { test: /\b(run|running|jog|jogging|sprint)\b/, setups: ['steady-run'], reason: 'run' },
  { test: /\b(walk|walking|hike|hiking|stroll)\b/, setups: ['easy-walk'], reason: 'walk' },
  { test: /\b(tabata|hiit|intervals?)\b/, setups: ['tabata', 'circuit'], reason: 'intervals' },
  { test: /\b(workout|strength|push-?ups?|squats?|kettlebell|lifting|weights|burpees?|circuit|reps|sets)\b/, setups: ['circuit', 'tabata'], reason: 'intervals' },
  { test: /\b(dance|dancing|play|shake|swim|surf|climb|bike|ride|skate)\b/, setups: ['open-play'], reason: 'open' },
  { test: /\b(ritual|routine|candle|altar|tea ceremony|prayer|pray)\b/, setups: ['daily-ritual'], reason: 'ritual' },
  { test: /\b(meditate|meditation|sit|sitting|stillness|quiet|mindful|mindfulness|silence)\b/, setups: ['quiet-sit'], reason: 'sit' },
  { test: /\b(text|call|message|phone a|drink|water|cold shower|cold plunge|make (your|the) bed|cook|tidy|clean|read|say thank|thank you note|compliment)\b/, setups: ['log-it'], reason: 'act' },
]

const DEFAULT_PICKS: readonly TimerSetupId[] = ['quiet-sit', 'easy-walk', 'log-it']

/** A length the author wrote into their own words ("a ten minute sit" is not parsed; "10 min" is). */
function statedMinutes(text: string): number | null {
  const m = /\b(\d{1,3})\s*-?\s*(?:min|mins|minute|minutes)\b/.exec(text)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 600 ? n : null
}

/** Rank the catalog against what the author wrote. No model: this is the answer when Vera is off,
 *  over budget, or has nothing usable to say, and it is what the create flow shows the instant the
 *  review step opens. The name and hook count for more than the guide. PURE. */
export function recommendTimerPicks(signals: TimerSignals): TimerPick[] {
  const head = `${signals.title ?? ''} ${signals.summary ?? ''}`.toLowerCase()
  const rest = `${signals.description ?? ''} ${signals.body ?? ''}`.toLowerCase().slice(0, 4000)
  const scores = new Map<TimerSetupId, { score: number; reason: TimerReasonId }>()
  for (const rule of RULES) {
    const weight = (rule.test.test(head) ? 3 : 0) + (rule.test.test(rest) ? 1 : 0)
    if (!weight) continue
    rule.setups.forEach((id, index) => {
      const prior = scores.get(id)
      // The first setup a rule names is its best fit; later ones trail it by a hair.
      const score = weight - index * 0.25
      if (!prior || score > prior.score) scores.set(id, { score: (prior?.score ?? 0) + score, reason: rule.reason })
      else prior.score += score
    })
  }
  const minutes = signals.durationMin && signals.durationMin > 0
    ? signals.durationMin
    : statedMinutes(`${head} ${rest}`)
  // A long sit reads better with no cues along the way.
  if (minutes && minutes >= 20 && scores.has('quiet-sit')) scores.set('long-stillness', { score: scores.get('quiet-sit')!.score - 0.1, reason: 'long' })

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || TIMER_SETUP_IDS.indexOf(a[0]) - TIMER_SETUP_IDS.indexOf(b[0]))
    .map(([setupId, { reason }]): TimerPick => ({ setupId, reasonId: reason, minutes }))
  for (const setupId of DEFAULT_PICKS) {
    if (ranked.length >= 3) break
    if (!ranked.some((p) => p.setupId === setupId)) ranked.push({ setupId, reasonId: 'general', minutes })
  }
  return ranked.slice(0, 3)
}

/** The catalog as the model sees it: IDs with their reviewed words, nothing else. */
export function timerCatalogForPrompt(): { setups: Record<string, string>; reasons: Record<string, string> } {
  const setups: Record<string, string> = {}
  for (const id of TIMER_SETUP_IDS) setups[id] = `${SETUPS[id].label}: ${SETUPS[id].detail}`
  return { setups, reasons: { ...REASONS } }
}
