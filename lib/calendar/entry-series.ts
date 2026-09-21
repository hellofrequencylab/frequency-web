import {
  expandRepeat,
  parseRepeat,
  repeatUntilDate,
  type RepeatRule,
} from '@/lib/events/repeat-rule'

// REPEATING PENCILS, WITH THE GAPS THE OPERATOR MEANT (ADR-1386 phase 5, ADR-1511). The pure half:
// given one `space_calendar_entries` row that carries a `recurrence_rule`, which calendar days its
// series lands on inside a window, and which days it DELIBERATELY SKIPS.
//
// ── ONE EXPANSION ENGINE, NOT A SECOND ONE ────────────────────────────────────────────────────
// Every date below comes out of `expandRepeat` (lib/events/repeat-rule.ts), the same walk the event
// materialiser, the Repeats strip and the .ics feeds use, reached through its new `exceptDays`
// option. This module is the ADAPTER: it reads the row's columns, turns them into that engine's
// options, and shifts the entry's own span onto each landing. It contains no cadence arithmetic of
// its own, deliberately — three copies of the enum maths is exactly what ADR-1299 collapsed, and a
// fourth living in the calendar would drift the same way.
//
// ── THE SKIP IS STORED, NEVER INFERRED ────────────────────────────────────────────────────────
// A biweekly series with an intentionally skipped Tuesday is NOT a series with a different cadence.
// The rule keeps producing every other Tuesday; `exception_dates` subtracts the one the operator
// took out. That ordering (RFC 5545 §3.8.5.1, and `exceptDays` in the engine) is what stops the gap
// being normalised away on the next read: nothing here ever looks at the shape of the dates and
// concludes a rule from them.
//
// ── UNTIL LIVES IN THE RULE STRING HERE ───────────────────────────────────────────────────────
// `events` splits the picker's transport string into `recurrence_rule` + `recurrence_until`.
// `space_calendar_entries` has no second column, and adding one would be a migration for a value
// `parseRepeat` already accepts-and-drops and `repeatUntilDate` already reads back. So a Pencil
// stores the ONE string the picker emits, `UNTIL` included, and this module resolves it. There is
// still exactly one place the end of a series is written, which is the property that mattered.
//
// WALL CLOCK AS UTC PARTS, like every other calendar module here (lib/calendar/entries.ts): the
// date portion of `starts_at` IS the Space-local day, so days compare as strings and no timezone
// library is involved. That is also what keeps this file importable from the client.

/** The columns a series expansion reads. Structural on purpose: `EntryRow` satisfies it, and this
 *  module never imports the row type back, so there is no cycle with lib/calendar/entries.ts. */
export interface EntrySeriesRow {
  starts_at: string
  ends_at: string
  recurrence_rule: string | null
  exception_dates?: readonly string[] | null
}

/** One date a series lands on. A virtual row: only the anchor exists in the database, and every
 *  other date is computed on read, which is why nothing here carries an id. */
export interface EntryOccurrence {
  /** YYYY-MM-DD, the Space-local day this date falls on. */
  dayKey: string
  /** The entry's stored wall clock, moved onto this date. */
  starts_at: string
  ends_at: string
  /** True for the series' own row, the one date that is really in the table. */
  isAnchor: boolean
  /** True for a date the operator deliberately skipped (never set by `expandEntrySeries`). */
  skipped: boolean
}

/** A window of days, `fromDay` inclusive and `toDay` EXCLUSIVE — the shape every calendar read here
 *  already speaks (lib/calendar/month-window.ts). */
export interface EntryWindow {
  fromDay: string
  toDay: string
}

/** The most dates one series may contribute to one window. A month grid is six weeks, so an honest
 *  daily series contributes 42; this is a bound against a malformed rule, not a budget. */
export const MAX_SERIES_DATES_IN_WINDOW = 200

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a `YYYY-MM-DD` that is a real calendar day (2026-02-31 is not). */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

/**
 * The rule a date repeats on, or null when it does not repeat.
 *
 * 🔴 NULL IS THE ANSWER FOR AN UNREADABLE RULE TOO, and callers must treat it as "this is a single
 * date". A row whose `recurrence_rule` is garbage still has a real `starts_at`, and rendering it as
 * the one date it is beats dropping it off the calendar entirely.
 */
export function entryRepeatRule(row: Pick<EntrySeriesRow, 'recurrence_rule'>): RepeatRule | null {
  return parseRepeat(row.recurrence_rule)
}

/** The stored skips, normalised: real days only, unique, ascending. Tolerates a `date[]` that
 *  arrives as `null`, as timestamps, or with duplicates, because a column is not a type. */
export function entryExceptionDays(row: Pick<EntrySeriesRow, 'exception_dates'>): string[] {
  const out = new Set<string>()
  for (const raw of row.exception_dates ?? []) {
    if (typeof raw !== 'string') continue
    const day = raw.slice(0, 10)
    if (isDayKey(day)) out.add(day)
  }
  return [...out].sort()
}

/** `days` with `dayKey` added: the operator skipped that date. Pure, sorted, idempotent. */
export function withExceptionDay(days: readonly string[], dayKey: string): string[] {
  if (!isDayKey(dayKey)) return [...days]
  return [...new Set([...days, dayKey])].sort()
}

/** `days` with `dayKey` removed: the operator put that date back. Pure, sorted, idempotent. */
export function withoutExceptionDay(days: readonly string[], dayKey: string): string[] {
  return days.filter((d) => d !== dayKey)
}

/** The engine options a row resolves to, shared by the live walk and the skipped-date walk so the
 *  two can never disagree about where the series lands. Null when the row is not a series. */
function seriesWalk(
  row: EntrySeriesRow,
  window: EntryWindow,
): { rule: RepeatRule; spanMs: number; through: Date; from: Date; until: Date | null } | null {
  const rule = entryRepeatRule(row)
  if (!rule) return null
  const startMs = Date.parse(row.starts_at)
  const endMs = Date.parse(row.ends_at)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null
  const spanMs = Math.max(0, endMs - startMs)
  const fromMs = Date.parse(`${window.fromDay}T00:00:00.000Z`)
  const toMs = Date.parse(`${window.toDay}T00:00:00.000Z`)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) return null
  // A date that STARTED before the window but runs into it still belongs on the grid, so the walk
  // opens one span early. `toDay` is exclusive, so the last instant the window holds is 1ms before it.
  const untilDay = repeatUntilDate(row.recurrence_rule)
  return {
    rule,
    spanMs,
    through: new Date(toMs - 1),
    from: new Date(fromMs - spanMs),
    // An `UNTIL` day is inclusive: a series "until 2026-12-30" keeps its 7 pm date ON the 30th.
    until: untilDay ? new Date(`${untilDay}T23:59:59.999Z`) : null,
  }
}

function occurrenceAt(row: EntrySeriesRow, at: Date, spanMs: number, skipped: boolean): EntryOccurrence {
  const starts = at.toISOString()
  return {
    dayKey: starts.slice(0, 10),
    starts_at: starts,
    ends_at: new Date(at.getTime() + spanMs).toISOString(),
    isAnchor: starts === row.starts_at,
    skipped,
  }
}

/**
 * THE GENERATOR. Every date this series lands on inside `window`, ascending — with every day in
 * `exception_dates` LEFT OUT.
 *
 * 🔴 A SKIPPED DATE IS NOT RETURNED HERE AT ALL, and that is the promise phase 5 makes. The skip
 * does not shift the cadence either: the engine walks and counts the excepted landing before
 * dropping it, so the date after a skipped one is the date it always was. Removing the day from
 * `exception_dates` brings it back with no other change.
 *
 * [] for a row that does not repeat, whose rule does not parse, or whose window is empty. A
 * non-series row is rendered by its caller as the single date it is.
 */
export function expandEntrySeries(row: EntrySeriesRow, window: EntryWindow): EntryOccurrence[] {
  const walk = seriesWalk(row, window)
  if (!walk) return []
  const dates = expandRepeat(row.starts_at, walk.rule, {
    through: walk.through,
    from: walk.from,
    until: walk.until,
    exceptDays: entryExceptionDays(row),
    max: MAX_SERIES_DATES_IN_WINDOW,
  })
  return dates.map((d) => occurrenceAt(row, d, walk.spanMs, false))
}

/**
 * The deliberate gaps inside `window`: the dates the rule DOES land on and `exception_dates` takes
 * out. The calendar draws these so a skip is a visible thing an operator can undo, rather than a
 * date that silently vanished and can only be recovered by retyping the series.
 *
 * A stored exception the rule no longer lands on (the series moved, or the cadence changed) is not
 * returned: it is stale, not a gap. It stays in the column, harmless, because deleting an operator's
 * stated intent on a read is how a skip comes back from the dead the next time a date moves.
 */
export function skippedEntrySeriesDates(row: EntrySeriesRow, window: EntryWindow): EntryOccurrence[] {
  const walk = seriesWalk(row, window)
  if (!walk) return []
  const skips = new Set(entryExceptionDays(row))
  if (skips.size === 0) return []
  const dates = expandRepeat(row.starts_at, walk.rule, {
    through: walk.through,
    from: walk.from,
    until: walk.until,
    max: MAX_SERIES_DATES_IN_WINDOW,
  })
  const out: EntryOccurrence[] = []
  for (const d of dates) {
    if (skips.has(d.toISOString().slice(0, 10))) out.push(occurrenceAt(row, d, walk.spanMs, true))
  }
  return out
}
