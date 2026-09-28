// WHAT A DELETE REACHES, IN WORDS (LIVE-535). The sentence an operator is owed before they delete an
// event, and the shape that sentence is computed from.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────────
// Event recurrence is MATERIALISED (ADR-007): the anchor row is itself a real occurrence, and every
// other date is its own `events` row carrying `parent_event_id`. That column is
// `REFERENCES events(id) ON DELETE CASCADE` (supabase/migrations/20240208000000_event_recurrence.sql),
// and roughly sixteen tables cascade off `events(id)` in turn, RSVPs, tickets and check-ins among
// them. So deleting the ANCHOR of a series deletes every other date of it, and everything attached
// to each of those dates, in one statement.
//
// Deleting a CHILD is the local thing the operator expects: one row, one date. The trap is only ever
// the anchor, and the anchor is invisible in the UI. It does not say "first date"; it looks exactly
// like any other occurrence, and on a long-running series its own date is usually in the past.
//
// ── 🔴 THE COPY THAT WAS WORSE THAN SILENCE ──────────────────────────────────────────────────────
// The host Manage surface used to promise, in the confirm itself, "If this event is part of a series,
// only this date is deleted." For an anchor that was the exact opposite of what the press did. The
// admin surface said "Permanently removes the event and all its RSVPs and check-ins" and simply never
// mentioned the other dates. An operator deleting a mistaken first Wednesday to tidy up took the
// whole Wednesday series, its attendance history and its ticket records with it, having just read a
// sentence telling them they would not.
//
// ── ZERO IMPORTS, ON PURPOSE ─────────────────────────────────────────────────────────────────────
// A client component renders these sentences, so this module must stay importable from one: no
// Supabase, no server-only helper, nothing that drags an admin client into a browser bundle
// (`pnpm check:client-boundary`). The READ lives next door in lib/events/deletion.ts; this file only
// turns its answer into English. That split is what lets every sentence be unit-tested without a
// database, which matters because these sentences are the safety feature.

/** What a delete would reach. Counts cover the OTHER dates of the series, never the row itself. */
export interface EventDeletePlan {
  /** True when this row is the anchor of a materialised series: it has no `parent_event_id` and at
   *  least one other row points at it. The ONLY shape where a delete is not local. */
  isAnchor: boolean
  /** Other dates the cascade would take. Zero for a one-off and for a child occurrence. */
  otherDates: number
  /** Of `otherDates`, how many have already happened. These carry the attendance history, which is
   *  the part nobody thinks to worry about and the part that cannot be rebuilt. */
  pastDates: number
  /** Of `otherDates`, how many are still to come. */
  futureDates: number
  /** RSVPs sitting on those other dates. A floor, not a total: see `truncated`. */
  rsvpsAtRisk: number
  /** True when the read hit its ceiling, so every count above is "at least this many". */
  truncated: boolean
  /** 🔴 The read FAILED and nothing here is known. A caller must treat this as "may be an anchor",
   *  never as "safe to delete": the whole point of the plan is that the dangerous case is the one
   *  that looks ordinary, so an unreadable plan is the dangerous case until proven otherwise. */
  unknown: boolean
}

/** The plan for a row that is not an anchor: a delete here takes one date, which is what the
 *  operator asked for. Also the shape a child occurrence gets. */
export const LOCAL_DELETE_PLAN: EventDeletePlan = {
  isAnchor: false,
  otherDates: 0,
  pastDates: 0,
  futureDates: 0,
  rsvpsAtRisk: 0,
  truncated: false,
  unknown: false,
}

/** The plan when the read failed. Not an anchor as far as anyone knows, and `unknown` says so. */
export const UNKNOWN_DELETE_PLAN: EventDeletePlan = { ...LOCAL_DELETE_PLAN, unknown: true }

/** True exactly when a delete on this row would take dates the operator did not name. The single
 *  predicate every surface and the action itself branch on, so a surface cannot disagree with the
 *  server about whether a press is local. An unreadable plan counts as reaching further, because
 *  the safe direction for an irreversible cascade is to assume it does. */
export function deleteReachesOtherDates(plan: EventDeletePlan): boolean {
  return plan.unknown || (plan.isAnchor && plan.otherDates > 0)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `at least 13 other dates` / `13 other dates` / `1 other date`. */
function datesPhrase(plan: EventDeletePlan): string {
  const core = plural(plan.otherDates, 'other date', 'other dates')
  return plan.truncated ? `at least ${core}` : core
}

/**
 * The warning shown BEFORE the confirm, for `components/admin/danger-delete.tsx`.
 *
 * For a local delete it is the sentence that was always there. For an anchor it leads with the
 * number, because the number is the whole surprise, and it names what rides along on the dates that
 * already happened. It also points at Cancel, which is reversible and per-date, since an operator
 * reaching for Delete on one bad date almost never wants the series gone.
 *
 * No em dashes (docs/CONTENT-VOICE.md).
 */
export function deleteWarning(plan: EventDeletePlan): string {
  if (plan.unknown) {
    return (
      'We could not check whether this event is the first date of a series, and deleting the first ' +
      'date of a series deletes every other date with it. Reload the page and try again. To take ' +
      'this date off the calendar right now without losing anything, use Cancel instead.'
    )
  }
  if (!plan.isAnchor || plan.otherDates === 0) {
    return (
      'Permanently removes this event and all its RSVPs and check-ins. If it is one date of a ' +
      'series, only this date goes. To take it off the calendar without losing it, use Cancel instead.'
    )
  }
  const bits = [
    `This is the first date of a series, so deleting it also permanently removes ${datesPhrase(plan)} ` +
      'and every RSVP and check-in on them.',
  ]
  if (plan.pastDates > 0) {
    bits.push(
      `${plural(plan.pastDates, 'of those dates has', 'of those dates have')} already happened, so ` +
        'their attendance history goes too.',
    )
  }
  if (plan.rsvpsAtRisk > 0) {
    bits.push(`${plural(plan.rsvpsAtRisk, 'person', 'people')} would lose a booking.`)
  }
  bits.push('This cannot be undone.')
  bits.push(
    'To take the remaining dates off the calendar instead, which refunds paid tickets and can be ' +
      'reversed, use Cancel the rest of this series above.',
  )
  return bits.join(' ')
}

/** The label on the button that really does delete the whole series, so the button says the number
 *  too and not just "Yes, delete". */
export function deleteSeriesButtonLabel(plan: EventDeletePlan): string {
  return `Delete this date and ${datesPhrase(plan)}`
}

/**
 * 🔴 THE SERVER'S REFUSAL. What `deleteEvent` returns when it is handed an anchor without an
 * explicit series scope. This is the actual fail-safe: three surfaces call that action, and only one
 * of them has ever shown the operator a count, so the string below is what the other two say.
 *
 * It has to be a full explanation rather than "Unauthorized", because the operator did nothing wrong
 * and their next move depends on knowing what the press would have reached.
 */
export function deleteRefusal(plan: EventDeletePlan): string {
  if (plan.unknown) {
    return (
      'We could not check whether this event is the first date of a series, so it was not deleted. ' +
      'Nothing has changed. Try again in a moment.'
    )
  }
  return (
    `This is the first date of a series. Deleting it would also permanently remove ${datesPhrase(plan)} ` +
    'and every RSVP and check-in on them, so it was not deleted and nothing has changed. To cancel ' +
    'the remaining dates instead, which refunds paid tickets and can be reversed, open this event ' +
    "and use Cancel the rest of this series. To really delete every date, use the event's own " +
    'settings, where the count is shown before you confirm.'
  )
}
