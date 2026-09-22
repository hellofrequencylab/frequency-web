import { expandRepeat, formatRepeat, parseRepeat, type RepeatRule } from '@/lib/events/repeat-rule'

// REPEATING PENCILS WITH EXPLICIT EXCEPTIONS (PROG-CAL5, ADR-1386 phase 5). The pure generator: given
// a master entry (its stored wall clock, its rule, its skipped dates) and a grid window, the dates the
// series lands on inside that window. No React, no Supabase, no clock, no timezone lib.
//
// ── ONE DIALECT, ONE PARSER ──────────────────────────────────────────────────────────────────────
// `space_calendar_entries.recurrence_rule` is reserved in the SAME bounded RFC 5545 subset as
// `events.recurrence_rule` (ADR-1385 §4, ADR-1299), so this file owns no grammar and no stepping:
// `parseRepeat` reads the rule and `expandRepeat` walks it. A rule outside the subset parses to null
// and the entry is treated as a one-off, never half-honoured (ADR-1299 §1).
//
// ── THE ENTRY'S OWN TIME ZONE, BY CONSTRUCTION ───────────────────────────────────────────────────
// `starts_at` / `ends_at` hold the Space's wall clock as UTC PARTS (lib/calendar/entries.ts), so the
// date portion of every occurrence's `starts_at` IS its calendar day in `time_zone`, and stepping in
// UTC arithmetic keeps a 7pm series at 7pm across a DST boundary. Every day key here is that
// YYYY-MM-DD, compared as a string.
//
// ── 🔴 EXCEPTIONS ARE STORED, NEVER INFERRED ─────────────────────────────────────────────────────
// A biweekly series with a deliberately skipped date has to keep that skip every time the series is
// regenerated, and a generator that only knows the rule would put the date straight back. So the
// skip lives in `exception_dates` (one day key per skipped occurrence, the EXDATE idea) and this
// function DROPS those days from the walk. Nothing here looks at a gap and decides it was a skip,
// nothing re-bases the cadence around a skip (the occurrence after a skipped biweekly date is still
// four weeks after the one before it), and the only way a skipped date comes back is a person
// removing it from the list. `pencil-series.test.ts` pins all three.

/** The columns the generator reads from a master row. */
export interface SeriesMaster {
  starts_at: string
  ends_at: string
  recurrence_rule: string | null
  /** YYYY-MM-DD day keys the series deliberately skips. Postgres returns a `date[]` as these. */
  exception_dates: readonly string[] | null | undefined
}

/** One landing of a series: the master's span shifted to that day. */
export interface SeriesOccurrence {
  /** YYYY-MM-DD, the occurrence's first calendar day in the entry's zone. */
  dayKey: string
  starts_at: string
  ends_at: string
}

/** A grid window, [fromDay, toDay) in day keys (lib/calendar/month-window.ts). */
export interface SeriesWindow {
  fromDay: string
  toDay: string
}

/** The most occurrences one window will ever be handed. A daily series over the six-week month grid
 *  is 42; this is a bound against a malformed rule, not a budget. */
export const MAX_WINDOW_OCCURRENCES = 500

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dayMs(day: string): number | null {
  const m = DATE_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(ms)
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null
  return ms
}

/** A stored day key, or null for anything that is not one. Postgres hands a `date` back as
 *  YYYY-MM-DD; a form hands the same; anything else (an instant, a typo) is refused. */
export function asDayKey(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const key = v.slice(0, 10)
  return dayMs(key) === null ? null : key
}

/** The skipped days as the row should store them: valid, unique, ascending. Total. */
export function normaliseExceptionDates(input: readonly unknown[] | null | undefined): string[] {
  const out = new Set<string>()
  for (const v of input ?? []) {
    const key = asDayKey(v)
    if (key) out.add(key)
  }
  return [...out].sort()
}

/** The list with one more skipped day. Idempotent. */
export function withExceptionDate(dates: readonly string[] | null | undefined, dayKey: string): string[] {
  return normaliseExceptionDates([...(dates ?? []), dayKey])
}

/** The list with one skipped day put back. The ONLY way an occurrence returns to a series. */
export function withoutExceptionDate(dates: readonly string[] | null | undefined, dayKey: string): string[] {
  return normaliseExceptionDates(dates).filter((d) => d !== dayKey)
}

/** The parsed rule of a master, or null when it does not repeat (no rule, or one outside the
 *  ADR-1299 subset, which is treated as absent rather than half-honoured). */
export function seriesRule(master: Pick<SeriesMaster, 'recurrence_rule'>): RepeatRule | null {
  return parseRepeat(master.recurrence_rule)
}

/** A rule as the row should store it: the canonical spelling of anything the parser accepts, or null.
 *  `UNTIL` is dropped by the canonical form on purpose: a Pencil series has no end column and the
 *  picker's cadences never carry one. */
export function pencilRepeatRule(input: string | null | undefined): string | null {
  const rule = parseRepeat(input)
  return rule ? formatRepeat(rule) : null
}

/**
 * Every occurrence of `master` that overlaps [fromDay, toDay), ascending, with every skipped day
 * removed. A master with no rule yields exactly itself when it overlaps the window, so a caller can
 * hand every row through here without branching.
 *
 * The walk is bounded by the window (`through`) and by `from` less the entry's own length, so an
 * occurrence that starts before the window but runs into it is still returned; the anchor counts as
 * occurrence one whether or not the rule's own pattern would land on it (RFC 5545 DTSTART).
 */
export function expandPencilSeries(master: SeriesMaster, window: SeriesWindow): SeriesOccurrence[] {
  const fromMs = dayMs(window.fromDay)
  const toMs = dayMs(window.toDay)
  const start = new Date(master.starts_at)
  const end = new Date(master.ends_at)
  if (fromMs === null || toMs === null || toMs <= fromMs) return []
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return []
  const length = end.getTime() - start.getTime()
  const skipped = new Set(normaliseExceptionDates(master.exception_dates))

  const rule = seriesRule(master)
  const landings = rule
    ? expandRepeat(master.starts_at, rule, {
        through: new Date(toMs - 1),
        from: new Date(fromMs - length),
        includeAnchor: true,
        max: MAX_WINDOW_OCCURRENCES,
      })
    : [start]

  const out: SeriesOccurrence[] = []
  for (const d of landings) {
    const s = d.getTime()
    const e = s + length
    if (s >= toMs || e <= fromMs) continue
    const dayKey = d.toISOString().slice(0, 10)
    // THE STORED SKIP. The occurrence is dropped here and nowhere else, and only because its day is
    // in the list; the cadence carries on from the rule as if the day had landed.
    if (skipped.has(dayKey)) continue
    out.push({ dayKey, starts_at: d.toISOString(), ends_at: new Date(e).toISOString() })
  }
  return out
}

// ── The drawer's cadences ────────────────────────────────────────────────────────────────────────
// Four choices in five words each, the way components/events/repeat-picker.tsx asks the question
// (ADR-1299 §4, as amended the day it shipped). Each is a canonical rule string of the subset; the
// weekday and the day of the month come from the anchor, so "Every month" on a Pencil dated the
// 14th lands on the 14th (clamped in a short month, the product's own departure from RFC 5545).

export const PENCIL_REPEAT_CHOICES = [
  { value: 'none', label: 'Does not repeat', rule: null },
  { value: 'weekly', label: 'Every week', rule: 'FREQ=WEEKLY' },
  { value: 'biweekly', label: 'Every 2 weeks', rule: 'FREQ=WEEKLY;INTERVAL=2' },
  { value: 'monthly', label: 'Every month', rule: 'FREQ=MONTHLY' },
] as const

export type PencilRepeatChoice = (typeof PENCIL_REPEAT_CHOICES)[number]['value']

/** Which choice a stored rule is, or 'custom' for a valid rule the menu does not offer (one written
 *  by hand or by a later picker), so an edit never silently drops it. */
export function pencilRepeatChoice(rule: string | null | undefined): PencilRepeatChoice | 'custom' {
  const canonical = pencilRepeatRule(rule)
  if (!canonical) return 'none'
  return PENCIL_REPEAT_CHOICES.find((c) => c.rule === canonical)?.value ?? 'custom'
}

/** The rule a choice stores. Unknown values store nothing. */
export function pencilRuleForChoice(choice: string): string | null {
  return PENCIL_REPEAT_CHOICES.find((c) => c.value === choice)?.rule ?? null
}
