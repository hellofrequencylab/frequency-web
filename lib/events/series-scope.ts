// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "THIS EVENT, OR THE WHOLE SERIES?" (ADR-1307)
//
// Owner, 2026-09-10: *"If a user edits an event in the series, it should ask them if they want to
// change the future schedule or just that event."*
//
// A recurring event is ONE thing to a host and MANY rows to the database (ADR-007: occurrences are
// materialised, not virtual). Every calendar application resolves that mismatch the same way, by
// asking. Until now this repo never asked, and the two silent answers it gave were both wrong in
// one direction each:
//
//   · editing the ANCHOR pushed its content onto every upcoming date, whether the host meant to or
//     not (ADR-884);
//   · editing a DATE could not change the series at all, and setting a repeat on one 500'd on the
//     `events_occurrence_not_recurring` CHECK (ADR-1306).
//
// PURE. No React, no Supabase, no clock. The whole decision is a function of two facts — what kind
// of row is being edited, and what the host chose — so it is decided here, once, and both the
// control and the action read the same answer.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** What a host chose to apply their edit to. */
export type SeriesScope = 'this' | 'future'

export const SERIES_SCOPES: readonly SeriesScope[] = ['this', 'future']

/** The default, and it is deliberately the NARROW one. A host who does not read the control gets
 *  the change they can see, on the date they are looking at; the wide answer is the one that
 *  silently rewrites dates off screen, so it is the one that has to be chosen. */
export const DEFAULT_SERIES_SCOPE: SeriesScope = 'this'

/** Total. Anything unrecognised is the narrow scope, never the wide one. */
export function parseSeriesScope(raw: unknown): SeriesScope {
  return raw === 'future' ? 'future' : DEFAULT_SERIES_SCOPE
}

/** What is being edited. */
export interface SeriesShape {
  /** The row the host opened. */
  id: string
  /** Its anchor, when the row is one materialised date OF a series. Null when it is not. */
  parentEventId: string | null
  /** Whether the row is itself a series anchor: it carries the repeat rule and owns the dates. */
  isAnchor: boolean
}

export interface SeriesWritePlan {
  /** True when this row belongs to a series at all, so the control has a question to ask. */
  inSeries: boolean
  /** Where the repeat rule may be written, or null when this save must not touch it.
   *
   *  🔴 NEVER the row itself when that row is a date of a series: the DB CHECK
   *  `parent_event_id IS NULL OR recurrence_type = 'none'` forbids it, and the rule is the
   *  series' property in any case. */
  ruleTarget: string | null
  /** Whether the repeat editor may be used under this scope at all. */
  ruleEditable: boolean
  /** Push this row's content onto the LATER dates of its series. */
  propagateForward: boolean
  /** The anchor to reconcile (retire the dates the rule no longer makes, mint the ones it now
   *  does) after the save, or null when nothing about the schedule can have changed. */
  reconcile: string | null
}

/**
 * PURE. What one save is allowed to touch.
 *
 * The rule that ties it together: **the repeat pattern is the SERIES' property, so it is only
 * editable under the wide scope.** That is true on a date of the series (where the database
 * forbids writing it at all) and equally true on the anchor, where writing it would change every
 * date while the host had just said "this event". One rule, no special case, and the control can
 * disable the editor from the same answer the action enforces.
 */
export function seriesWritePlan(shape: SeriesShape, scope: SeriesScope): SeriesWritePlan {
  const inSeries = shape.parentEventId !== null || shape.isAnchor

  // A standalone event has no series to disagree with. The scope is not asked and not read: the
  // rule is its own, and turning a repeat ON is exactly how it stops being standalone, so it still
  // reconciles.
  if (!inSeries) {
    return { inSeries: false, ruleTarget: shape.id, ruleEditable: true, propagateForward: false, reconcile: shape.id }
  }

  const anchorId = shape.parentEventId ?? shape.id

  if (scope === 'this') {
    return { inSeries: true, ruleTarget: null, ruleEditable: false, propagateForward: false, reconcile: null }
  }

  return { inSeries: true, ruleTarget: anchorId, ruleEditable: true, propagateForward: true, reconcile: anchorId }
}
