// The Mindless timer's ONE settings model (LIVE-2232). Every member-chosen setting of both
// engines (the Be Still sit and the Get Moving run) lives here, in one shape, saved the moment
// it changes: to localStorage at once, and to profiles.meta.onAir through saveOnAirPrefs
// (app/(main)/on-air/actions.ts) so another device opens the same way.
//
// Before this module each engine kept its own localStorage key, and the server copy was written
// only when a sit COMPLETED, from the session's own numbers. That is how a Just Log stored a
// remembered length of 1 minute, a Get Moving finish reset the saved breath pattern to Box, and
// a cancelled sit lost every cue change. The engines now read and write through here only; the
// door (components/on-air/compact-setup.tsx) and any future UI render from the same object.
//
// Pure where it can be: the storage functions take an optional Storage so tests run in node.

import {
  DEFAULT_PREFS,
  clampMinutes,
  clampWarmupSec,
  coerceAmbientVolume,
  coerceBellVolume,
  type OnAirPrefs,
} from '@/lib/on-air'
import { sanitizeMovementConfig, type MovementConfig } from '@/lib/movement'

/** The one minute band for a member-chosen length, on the door and in both engines. Authored
 *  (creator) configs clamp separately in lib/movement.ts. */
export const MINUTE_MIN = 1
export const MINUTE_MAX = 120

/** localStorage key for the merged model. The two legacy keys are read once and folded in. */
export const TIMER_SETTINGS_KEY = 'fq_timer_settings'
const LEGACY_STILL_KEY = 'fq_mindless_setup'
const LEGACY_MOVE_KEY = 'fq_movement_setup'

/** The Be Still choices that make up a setup: what to breathe and for how long. */
export interface StillSetup {
  patternSlug: string
  /** The remembered OPEN length (a practice with its own length ignores it). */
  minutes: number
  customIn: number
  customHold: number
  customOut: number
}

/** Cues shared by both engines: sound, feel and the warm-up. */
export interface CueSettings {
  bell: boolean
  bellTone: string
  bellVolume: number
  endBell: boolean
  bellEveryMin: number
  haptics: boolean
  ambientTrack: string | null
  ambientVolume: number
  warmupSec: number
}

export interface TimerSettings {
  still: StillSetup
  /** The last Get Moving configuration the member ran unattached (Free Practice memory). */
  move: MovementConfig | null
  cues: CueSettings
}

export type TimerSettingsPatch = {
  still?: Partial<StillSetup>
  move?: MovementConfig | null
  cues?: Partial<CueSettings>
}

/** A storage shaped like window.localStorage; tests pass a Map-backed one. */
export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function phaseSec(v: unknown, lo: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(8, Math.max(lo, Math.round(v))) : dflt
}

function minutesOrDefault(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? clampMinutes(v) : dflt
}

/** Clamp a free-text or typed length into the band; NaN stays NaN so a form can show its error. */
export function clampMemberMinutes(v: number): number {
  if (!Number.isFinite(v)) return NaN
  return Math.min(MINUTE_MAX, Math.max(MINUTE_MIN, Math.round(v)))
}

export function isValidMemberMinutes(v: number): boolean {
  return Number.isInteger(v) && v >= MINUTE_MIN && v <= MINUTE_MAX
}

/** The server copy, read into the model. Missing keys take the product defaults. */
export function settingsFromPrefs(prefs: Partial<OnAirPrefs> | null | undefined): TimerSettings {
  const p = prefs ?? {}
  return {
    still: {
      patternSlug: typeof p.pattern === 'string' && p.pattern ? p.pattern : DEFAULT_PREFS.pattern,
      minutes: minutesOrDefault(p.minutes, DEFAULT_PREFS.minutes),
      customIn: phaseSec(p.customIn, 3, 4),
      customHold: phaseSec(p.customHold, 0, 4),
      customOut: phaseSec(p.customOut, 3, 6),
    },
    move: p.move ? sanitizeMovementConfig(p.move) : null,
    cues: {
      // The engines' effective defaults for a member who never touched a cue: sound off, the soft
      // voice, no vibration (DEFAULT_PREFS documents the product intent; the engine behaviour wins
      // until the owner rules otherwise, so nothing changes under anyone on this PR).
      bell: typeof p.bell === 'boolean' ? p.bell : false,
      bellTone: typeof p.bellTone === 'string' && p.bellTone ? p.bellTone : 'soft',
      bellVolume: coerceBellVolume(p.bellVolume),
      endBell: typeof p.endBell === 'boolean' ? p.endBell : (DEFAULT_PREFS.endBell ?? true),
      bellEveryMin:
        typeof p.bellEveryMin === 'number' && Number.isFinite(p.bellEveryMin)
          ? Math.max(0, Math.round(p.bellEveryMin))
          : (DEFAULT_PREFS.bellEveryMin ?? 0),
      haptics: typeof p.haptics === 'boolean' ? p.haptics : false,
      ambientTrack: p.ambientTrack === undefined ? (DEFAULT_PREFS.ambientTrack ?? null) : p.ambientTrack,
      ambientVolume: coerceAmbientVolume(p.ambientVolume),
      warmupSec: clampWarmupSec(p.warmupSec),
    },
  }
}

/** The patch a settings change sends to the server: only prefs keys, nothing the economy reads. */
export function prefsPatchFromSettings(patch: TimerSettingsPatch): Partial<OnAirPrefs> {
  const out: Partial<OnAirPrefs> = {}
  if (patch.still) {
    const s = patch.still
    if (s.patternSlug !== undefined) out.pattern = s.patternSlug
    if (s.minutes !== undefined) out.minutes = s.minutes
    if (s.customIn !== undefined) out.customIn = s.customIn
    if (s.customHold !== undefined) out.customHold = s.customHold
    if (s.customOut !== undefined) out.customOut = s.customOut
  }
  if (patch.move !== undefined) out.move = patch.move
  if (patch.cues) Object.assign(out, patch.cues)
  return out
}

/** Server-side guard for saveOnAirPrefs: only known keys, every value clamped, unknown dropped.
 *  Returns null when nothing survives, so a junk request writes nothing. */
export function sanitizePrefsPatch(input: unknown): Partial<OnAirPrefs> | null {
  if (!isRecord(input)) return null
  const out: Partial<OnAirPrefs> = {}
  if (typeof input.pattern === 'string' && input.pattern.length > 0 && input.pattern.length <= 40) out.pattern = input.pattern
  if (typeof input.minutes === 'number' && Number.isFinite(input.minutes)) out.minutes = clampMinutes(input.minutes)
  if (input.customIn !== undefined) out.customIn = phaseSec(input.customIn, 3, 4)
  if (input.customHold !== undefined) out.customHold = phaseSec(input.customHold, 0, 4)
  if (input.customOut !== undefined) out.customOut = phaseSec(input.customOut, 3, 6)
  if (typeof input.bell === 'boolean') out.bell = input.bell
  if (typeof input.bellTone === 'string' && input.bellTone.length > 0 && input.bellTone.length <= 20) out.bellTone = input.bellTone
  if (typeof input.bellVolume === 'number' && Number.isFinite(input.bellVolume)) out.bellVolume = Math.min(1, Math.max(0, input.bellVolume))
  if (typeof input.endBell === 'boolean') out.endBell = input.endBell
  if (typeof input.bellEveryMin === 'number' && Number.isFinite(input.bellEveryMin)) out.bellEveryMin = Math.max(0, Math.round(input.bellEveryMin))
  if (typeof input.haptics === 'boolean') out.haptics = input.haptics
  // null = the member turned the loop off (persist that); undefined = untouched.
  if (input.ambientTrack === null) out.ambientTrack = null
  else if (typeof input.ambientTrack === 'string' && input.ambientTrack.length > 0 && input.ambientTrack.length <= 20) out.ambientTrack = input.ambientTrack
  if (typeof input.ambientVolume === 'number' && Number.isFinite(input.ambientVolume)) out.ambientVolume = Math.min(1, Math.max(0, input.ambientVolume))
  if (input.warmupSec === 3 || input.warmupSec === 5 || input.warmupSec === 10) out.warmupSec = input.warmupSec
  if (input.move === null) out.move = null
  else if (isRecord(input.move)) out.move = sanitizeMovementConfig(input.move)
  return Object.keys(out).length > 0 ? out : null
}

function storage(given?: SettingsStorage | null): SettingsStorage | null {
  if (given) return given
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

/** Merge a local patch over a base. `move` replaces whole (a config is one shape per mode). */
export function mergeTimerSettings(base: TimerSettings, patch: TimerSettingsPatch): TimerSettings {
  return {
    still: { ...base.still, ...(patch.still ?? {}) },
    move: patch.move === undefined ? base.move : patch.move,
    cues: { ...base.cues, ...(patch.cues ?? {}) },
  }
}

/** The member's local copy over the server copy. Reads the merged key, else the two legacy keys
 *  (the sit's and the run's old memories), so nothing a member set before this model is lost. */
export function readTimerSettings(server: TimerSettings, store?: SettingsStorage | null): TimerSettings {
  const s = storage(store)
  if (!s) return server
  const merged = parse(s.getItem(TIMER_SETTINGS_KEY))
  if (merged) {
    return settingsFromPrefs({ ...flattenForPrefs(server), ...sanitizePrefsPatch(merged) })
  }
  const legacyStill = parse(s.getItem(LEGACY_STILL_KEY))
  const legacyMove = parse(s.getItem(LEGACY_MOVE_KEY))
  if (!legacyStill && !legacyMove) return server
  const patch: TimerSettingsPatch = {}
  if (legacyStill) {
    patch.still = {}
    if (typeof legacyStill.patternSlug === 'string') patch.still.patternSlug = legacyStill.patternSlug
    if (typeof legacyStill.minutes === 'number') patch.still.minutes = minutesOrDefault(legacyStill.minutes, server.still.minutes)
    if (legacyStill.customIn !== undefined) patch.still.customIn = phaseSec(legacyStill.customIn, 3, server.still.customIn)
    if (legacyStill.customHold !== undefined) patch.still.customHold = phaseSec(legacyStill.customHold, 0, server.still.customHold)
    if (legacyStill.customOut !== undefined) patch.still.customOut = phaseSec(legacyStill.customOut, 3, server.still.customOut)
  }
  if (legacyMove) patch.move = sanitizeMovementConfig(legacyMove)
  return mergeTimerSettings(server, patch)
}

/** The local copy as the prefs shape the merged key stores (one shape on disk and on the server). */
function flattenForPrefs(s: TimerSettings): Partial<OnAirPrefs> {
  return {
    pattern: s.still.patternSlug,
    minutes: s.still.minutes,
    customIn: s.still.customIn,
    customHold: s.still.customHold,
    customOut: s.still.customOut,
    move: s.move,
    ...s.cues,
  }
}

/** Write a patch into the local copy. Best-effort: storage failures never throw. Returns the
 *  prefs patch to send to the server (the same keys, already clamped). */
export function writeTimerSettings(patch: TimerSettingsPatch, store?: SettingsStorage | null): Partial<OnAirPrefs> {
  const prefsPatch = sanitizePrefsPatch(prefsPatchFromSettings(patch)) ?? {}
  const s = storage(store)
  if (!s) return prefsPatch
  try {
    const current = parse(s.getItem(TIMER_SETTINGS_KEY)) ?? {}
    s.setItem(TIMER_SETTINGS_KEY, JSON.stringify({ ...current, ...prefsPatch }))
  } catch {
    // remembering a setting is a nicety, never a blocker
  }
  return prefsPatch
}

/** The fields of `next` that differ from `prev`, as a patch, or null when nothing changed. The
 *  save-on-change hook calls this every render so a settings write carries only what moved. */
export function diffSettings(prev: TimerSettingsPatch, next: TimerSettingsPatch): TimerSettingsPatch | null {
  const out: TimerSettingsPatch = {}
  if (next.still) {
    const changed: Partial<StillSetup> = {}
    for (const key of Object.keys(next.still) as (keyof StillSetup)[]) {
      const value = next.still[key]
      if (value !== undefined && value !== prev.still?.[key]) (changed as Record<string, unknown>)[key] = value
    }
    if (Object.keys(changed).length) out.still = changed
  }
  if (next.cues) {
    const changed: Partial<CueSettings> = {}
    for (const key of Object.keys(next.cues) as (keyof CueSettings)[]) {
      const value = next.cues[key]
      if (value !== undefined && value !== prev.cues?.[key]) (changed as Record<string, unknown>)[key] = value
    }
    if (Object.keys(changed).length) out.cues = changed
  }
  if (next.move !== undefined && JSON.stringify(next.move) !== JSON.stringify(prev.move)) out.move = next.move
  return Object.keys(out).length ? out : null
}
