import {
  DEFAULT_CARDS_PER_SERIES,
  DEFAULT_RAIL_DATES,
  DEFAULT_INDEXED_OCCURRENCES,
} from './series'

// The CLIENT-SAFE half of the operator knobs (ADR-897 §7.1-§7.2), split out of
// lib/events/series-config.ts (which is `server-only`) so the admin form — a client component —
// can bound its number inputs with the same constants the server clamps against, without pulling
// the platform_settings IO into the browser bundle. series-config.ts re-exports every symbol
// here, so existing SERVER importers are unchanged.
//
// 🔴 WHY THIS FILE EXISTS AT ALL, so nobody merges it back: the knob's console
// (app/(main)/admin/events/series-display-section.tsx) imported MIN_/MAX_ straight from the
// server-only module. `pnpm exec tsc --noEmit` passed and the full vitest run passed — vitest
// aliases `server-only` to a stub (vitest.config.ts:13) precisely so server modules can be
// unit-tested — and `pnpm build` failed with "'server-only' cannot be imported from a Client
// Component module". That is the tsc/build gap this repo has been bitten by twice. A drift guard
// in series-config.test.ts now pins that no client component imports the server-only module.
//
// This module imports ONLY the pure fold (lib/events/series.ts, itself zero-import). Keep it that
// way: the moment it reaches for the Supabase client or `next/headers`, the split has stopped
// paying for itself.

export const MIN_CARDS_PER_SERIES = 1
/** 60 is the materialisation horizon's bound: setting it shows every date again, which is what
 *  makes this setting a TRUE kill switch rather than a mitigation. */
export const MAX_CARDS_PER_SERIES = 60
export const MIN_RAIL_DATES = 1
export const MAX_RAIL_DATES = 20
/** 0 is legal: "the series page only, no occurrence URLs" is a coherent crawl posture. */
export const MIN_INDEXED_OCCURRENCES = 0
export const MAX_INDEXED_OCCURRENCES = 10

export interface SeriesDisplayConfig {
  /** Cards one repeating series may occupy on a browse surface. */
  cardsPerSeries: number
  /** Dates offered on an event page's series rail. */
  railDates: number
  /** Occurrences past the series page that get their own indexed URL. */
  indexedOccurrences: number
}

/** IMPORTED from the pure fold module, never re-declared. Two copies of a default is precisely the
 *  drift this repo keeps paying for, and the fold's tests assert against these same constants. */
export const DEFAULT_SERIES_DISPLAY: SeriesDisplayConfig = {
  cardsPerSeries: DEFAULT_CARDS_PER_SERIES,
  railDates: DEFAULT_RAIL_DATES,
  indexedOccurrences: DEFAULT_INDEXED_OCCURRENCES,
}

/** A stored value arrives as TEXT. Parse it here rather than at every call site, so the whole
 *  coercion table (a blank row, `not json at all`, `"5"`, `[1,2]`) is one function's contract and
 *  is testable without a database. Never throws. */
function parseStored(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

/** One field: ABSENT OR UNUSABLE -> the code default; PRESENT AND USABLE -> clamped into range.
 *  A string of digits counts as usable, because an HTML number input posts strings and a form round
 *  trip must not silently reset the operator's value. */
function clampField(value: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(n)) return fallback
  // Math.floor, never round: a 2.7 the operator typed means "at most 2", and rounding up would
  // hand back more than was asked for.
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/**
 * Coerce a stored (possibly partial, malformed, or absent) blob onto the defaults. NEVER THROWS.
 *
 * Anything that is not an object falls back WHOLESALE (a bare number, a string, an array, null);
 * an object merges FIELD BY FIELD, so `{"cardsPerSeries":2}` keeps the shipped railDates and
 * indexedOccurrences.
 *
 * 🔴 THE ONE ASYMMETRY, and its reason. This layer sends an UNUSABLE value to the DEFAULT (3),
 * while clampPerSeries inside the pure fold (lib/events/series.ts) sends an explicitly passed bad
 * number to the FLOOR (1). They are not inconsistent: here the operator said nothing intelligible,
 * so use the recommendation; there a caller handed the fold garbage, so do the least surprising
 * thing and never widen past what was asked. Do not "harmonise" them. Between the two, a malformed
 * value cannot escape both.
 *
 * The failure direction, stated once: a broken read shows FEWER DUPLICATES, never zero events.
 */
export function coerceSeriesDisplay(raw: unknown): SeriesDisplayConfig {
  const parsed = parseStored(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_SERIES_DISPLAY }
  const o = parsed as Record<string, unknown>
  return {
    cardsPerSeries: clampField(
      o.cardsPerSeries,
      DEFAULT_SERIES_DISPLAY.cardsPerSeries,
      MIN_CARDS_PER_SERIES,
      MAX_CARDS_PER_SERIES,
    ),
    railDates: clampField(o.railDates, DEFAULT_SERIES_DISPLAY.railDates, MIN_RAIL_DATES, MAX_RAIL_DATES),
    indexedOccurrences: clampField(
      o.indexedOccurrences,
      DEFAULT_SERIES_DISPLAY.indexedOccurrences,
      MIN_INDEXED_OCCURRENCES,
      MAX_INDEXED_OCCURRENCES,
    ),
  }
}
