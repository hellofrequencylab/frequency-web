// The READ side of event recurrence — "what is the next date this series lands on, and what do we
// call its cadence?" — for the event page, the cards, and the listings.
//
// ── THIS FILE USED TO CARRY ITS OWN COPY OF THE MATHS. IT NO LONGER DOES (ADR-1299). ─────────────
// Until the rule engine landed, the cadence was a four-value enum (none/daily/weekly/monthly,
// ADR-007) whose stepping was written out THREE times — here, in lib/event-recurrence.ts (the write
// side) and in lib/events/calendar-repeats.ts (the calendar strip) — with a parity gate standing
// between the copies to notice when they disagreed. All three now delegate to
// lib/events/repeat-rule.ts, which is also what made "every other Wednesday" and "the third
// Thursday" expressible at all: a rule the materialiser understands and this file did not would put
// a real event row on a date the card announces differently.
//
// The parity gate (lib/events/recurrence-parity.test.ts) still runs, and is still the thing that
// would catch a fourth copy creeping back in.
//
// Framework-free, clock-free pure functions (the caller passes `now`), and no database reads: the
// materialised-occurrence machinery lives in lib/event-recurrence.ts.

import {
  coarseRecurrence,
  describeRepeat,
  formatRepeat,
  repeatUntilDate,
  nextRepeatOccurrence,
  parseRepeat,
  repeatChipLabel,
  repeatFor,
  type RepeatRule,
} from './repeat-rule'

/** The coarse cadence column, `events.recurrence_type`. 'yearly' joined the CHECK with the rule
 *  column (ADR-1299); every row written before that carries one of the original four. */
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

// `recurrenceLabel(type)` USED TO LIVE HERE — the "Repeats weekly" line, built from the coarse
// column alone. It is deleted rather than deprecated: all three of its callers (the event page's
// cadence line, the event card, and the Event Details module) moved to `recurrenceLineFor` in the
// same change, so keeping it would have left an export whose only remaining caller was its own
// test, carrying a docstring that said three surfaces still used it. A cadence label built from the
// enum cannot tell a weekly series from a fortnightly one, and there is no longer any surface for
// which that is the best available answer.

/** The columns a repeat-aware read needs. `recurrence_rule` is nullable and absent on every row
 *  written before ADR-1299, which is exactly what `repeatFor` falls back for. */
export interface RecurrenceRow {
  starts_at: string | null | undefined
  recurrence_type?: string | null
  recurrence_until?: string | null
  recurrence_rule?: string | null
}

/**
 * THE cadence line for a row that carries the rule: "Every 2 weeks on Wednesday", "Monthly on the
 * third Thursday", "Every weekday". Null for a one-time event.
 *
 * This is what `recurrenceLabel` becomes once a read carries `recurrence_rule`, and the difference
 * is the whole point of the rule column: the enum could only ever name the FREQ.
 */
export function recurrenceLineFor(row: RecurrenceRow): string | null {
  const rule = repeatFor(row)
  return rule ? describeRepeat(rule, row.starts_at) : null
}

/** The SHORT cadence label for a card or a chip ("Every 2 weeks", "Thursdays", "Third Thursday").
 *  Null for a one-time event. */
export function recurrenceChipFor(row: RecurrenceRow): string | null {
  return repeatChipLabel(repeatFor(row), row.starts_at)
}

/** The anchor fields the read helpers need. */
export interface RecurrenceAnchor {
  /** The series start (the anchor event's `starts_at`), ISO. */
  startsAt: string
  recurrenceType: RecurrenceType | null | undefined
  /** The series end (`recurrence_until`), ISO, or null for indefinite. */
  recurrenceUntil?: string | null
  /** The RRULE value on `events.recurrence_rule`, when the read carried it. Absent falls back to
   *  the coarse cadence above, which is what every pre-ADR-1299 row has. */
  recurrenceRule?: string | null
}

/**
 * The next occurrence of a recurring event at or after `now`, as a Date — so a recurring event
 * whose anchor date has already passed still surfaces its next upcoming date instead of dropping
 * out of "upcoming" listings.
 *
 * Returns the anchor itself when the anchor is still in the future. Returns null when the event is
 * not recurring, when the series has ended (every occurrence, including the anchor, is before
 * `now`, or the next one would fall after `recurrence_until`), or when the anchor date is
 * unparseable.
 *
 * Pure: `now` is passed in (default `new Date()` for ergonomic call sites), so render and tests get
 * a deterministic answer.
 */
export function nextOccurrence(anchor: RecurrenceAnchor, now: Date = new Date()): Date | null {
  const rule = repeatFor({
    starts_at: anchor.startsAt,
    recurrence_type: anchor.recurrenceType,
    recurrence_rule: anchor.recurrenceRule,
  })
  if (!rule) return null
  const until = anchor.recurrenceUntil ? new Date(anchor.recurrenceUntil) : null
  if (until && Number.isNaN(until.getTime())) return null
  return nextRepeatOccurrence(anchor.startsAt, rule, until, now)
}

/**
 * Validate a `recurrence_until` against the start. Returns an error string (plain voice, no em
 * dashes) when invalid, or null when the cadence/until pair is fine. Used by the create + edit
 * server actions so the rule reads the same everywhere.
 *
 *   - A non-recurring event ignores `until` entirely (always valid).
 *   - `until` is optional (blank = indefinite) and, when set, must be after the start (an end
 *     before the first occurrence would yield zero occurrences).
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

/**
 * Narrow a submitted repeat rule to what may be STORED, and say what the coarse mirror column must
 * carry beside it. ONE function, so the create action, the edit action and the settings rail cannot
 * disagree about what a valid rule is or about keeping `recurrence_type` in step with it.
 *
 * 🔴 THE MIRROR IS DERIVED, NEVER SUBMITTED. `events.recurrence_type` is what the occurrence cron's
 * anchor filter, the partial index, and the child-row DB CHECK all read; if a form could post it
 * independently of the rule, the two would drift and the series would either stop materialising or
 * start materialising the wrong dates. So a caller submits the RULE and takes both values back.
 */
export function resolveSubmittedRepeat(
  raw: string | null | undefined,
): { rule: string | null; type: RecurrenceType; untilDate: string | null } {
  const parsed: RepeatRule | null = parseRepeat(raw)
  if (!parsed) return { rule: null, type: 'none', untilDate: null }
  // The CANONICAL spelling is what is stored, not the bytes that arrived: one rule has one string,
  // so an equality check between two rules is a string compare and a round trip is stable. The
  // picker's "ends on" date rides in on the same string and is SPLIT OUT here — it belongs in
  // `events.recurrence_until`, never in the rule (see the engine's header).
  return {
    rule: formatRepeat(parsed),
    type: coarseRecurrence(parsed),
    untilDate: repeatUntilDate(raw),
  }
}
