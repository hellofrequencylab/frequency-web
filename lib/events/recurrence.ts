// Pure recurrence helpers for the events surface — the read side of the simple
// enum recurrence model (ADR-007: none/daily/weekly/monthly, no RFC 5545 RRULE).
//
// These are framework-free, clock-free pure functions (the caller passes `now`),
// so the event page, the cards, and the listing all agree on one answer and the
// unit tests can pin a fixed clock. They DO NOT read or write the database — the
// materialised-occurrence machinery lives in lib/event-recurrence.ts; this module
// only computes, from an anchor + its `until` + `now`, the next date the series
// lands on so a recurring event whose anchor date has passed still surfaces its
// next upcoming occurrence instead of silently dropping out of "upcoming".

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

/** Plain-voice label for a recurrence cadence — the "Repeats weekly" line shown
 *  on the event page and on every event card. Returns null for a one-time event. */
export function recurrenceLabel(type: RecurrenceType | null | undefined): string | null {
  switch (type) {
    case 'daily':
      return 'Repeats daily'
    case 'weekly':
      return 'Repeats weekly'
    case 'monthly':
      return 'Repeats monthly'
    default:
      return null
  }
}

// Days in a given UTC month (month is 0-indexed). Day 0 of the next month is the
// last day of `month`. Mirrors lib/event-recurrence.ts so monthly maths agrees.
function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

// The occurrence start for an anchor at recurrence step `step` (step 0 = the
// anchor itself, step 1 = the first occurrence after it). Daily/weekly are simple
// day arithmetic; monthly counts whole months FROM the series start and CLAMPS the
// day to the target month's length, so a day-29/30/31 anchor never overflows (Jan
// 31 -> Feb 28/29, then Mar 31, Apr 30...). The clamp source is always the ORIGINAL
// anchor day, so a short month never permanently shortens later occurrences.
function occurrenceAt(start: Date, type: RecurrenceType, step: number): Date {
  switch (type) {
    case 'daily': {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + step)
      return d
    }
    case 'weekly': {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + step * 7)
      return d
    }
    case 'monthly': {
      const originalDay = start.getUTCDate()
      const totalMonths = start.getUTCMonth() + step
      const year = start.getUTCFullYear() + Math.floor(totalMonths / 12)
      const month = ((totalMonths % 12) + 12) % 12
      const day = Math.min(originalDay, daysInUTCMonth(year, month))
      return new Date(
        Date.UTC(
          year,
          month,
          day,
          start.getUTCHours(),
          start.getUTCMinutes(),
          start.getUTCSeconds(),
          start.getUTCMilliseconds(),
        ),
      )
    }
    case 'none':
    default:
      return new Date(start)
  }
}

/** The anchor fields the read helpers need. */
export interface RecurrenceAnchor {
  /** The series start (the anchor event's `starts_at`), ISO. */
  startsAt: string
  recurrenceType: RecurrenceType | null | undefined
  /** The series end (`recurrence_until`), ISO, or null for indefinite. */
  recurrenceUntil?: string | null
}

// Hard cap on the search so a malformed anchor can never spin forever. A daily
// series can advance ~10 years of steps before we give up; weekly/monthly reach
// far further per step, so this is comfortably generous for any honest series.
const MAX_STEPS = 4000

/**
 * The next occurrence of a recurring event at or after `now`, as a Date — so a
 * recurring event whose anchor date has already passed still surfaces its next
 * upcoming date instead of dropping out of "upcoming" listings.
 *
 * Returns the anchor itself when the anchor is still in the future. Returns null
 * when the event is not recurring, when the series has ended (every occurrence,
 * including the anchor, is before `now`, or the next one would fall after
 * `recurrence_until`), or when the anchor date is unparseable.
 *
 * Pure: `now` is passed in (default `new Date()` for ergonomic call sites), so
 * render and tests get a deterministic answer.
 */
export function nextOccurrence(anchor: RecurrenceAnchor, now: Date = new Date()): Date | null {
  const { recurrenceType } = anchor
  if (!recurrenceType || recurrenceType === 'none') return null

  const start = new Date(anchor.startsAt)
  if (Number.isNaN(start.getTime())) return null

  const seriesEnd = anchor.recurrenceUntil ? new Date(anchor.recurrenceUntil) : null
  if (seriesEnd && Number.isNaN(seriesEnd.getTime())) return null

  const nowMs = now.getTime()

  for (let step = 0; step <= MAX_STEPS; step++) {
    const cursor = occurrenceAt(start, recurrenceType, step)
    // Past `until` -> the series is over, no upcoming occurrence.
    if (seriesEnd && cursor.getTime() > seriesEnd.getTime()) return null
    // First occurrence at or after now is the answer.
    if (cursor.getTime() >= nowMs) return cursor
  }

  return null
}

/**
 * Validate a `recurrence_until` against the start. Returns an error string (plain
 * voice, no em dashes) when invalid, or null when the cadence/until pair is fine.
 * Used by the create + edit server actions so the rule reads the same everywhere.
 *
 *   - A non-recurring event ignores `until` entirely (always valid).
 *   - `until` is optional (blank = indefinite) and, when set, must be after the
 *     start (an end before the first occurrence would yield zero occurrences).
 */
export function validateRecurrenceUntil(
  recurrenceType: RecurrenceType | null | undefined,
  startsAtIso: string | null | undefined,
  untilIso: string | null | undefined,
): string | null {
  if (!recurrenceType || recurrenceType === 'none') return null
  if (!untilIso) return null // indefinite is allowed

  const until = new Date(untilIso)
  if (Number.isNaN(until.getTime())) return 'The repeat end date is not a valid date.'

  if (startsAtIso) {
    const start = new Date(startsAtIso)
    if (!Number.isNaN(start.getTime()) && until.getTime() <= start.getTime()) {
      return 'The repeat end date must be after the start.'
    }
  }
  return null
}
