import { entryKind } from '@/lib/calendar/registry'
import { asDayKey, seriesRule } from '@/lib/calendar/pencil-series'

// 🔴 DELETE ON A REPEATING ENTRY MUST ASK FIRST (LIVE-531, owner data loss 2026-09-28).
//
// THE INCIDENT. The owner opened the October occurrence of a repeating Pencil ("Craft Night", Royal
// Temple) and pressed Delete, meaning that one night. Every date went, past and future, and none of
// it came back.
//
// WHY ONE PRESS TOOK EVERYTHING. A repeating private entry is ONE row in `space_calendar_entries`
// carrying `recurrence_rule` plus an `exception_dates` array (lib/calendar/pencil-series.ts). There
// is no row per occurrence: the occurrences are generated from the rule at read time. So the row IS
// the series, and `deleteCalendarEntryRow` (lib/calendar/entries-store.ts) is a hard `.delete()` on
// a table with no `removed_at` / `deleted_at` / `archived_at` column. No tombstone, no undo.
//
// THE PRIMITIVE ALREADY EXISTED. `skipPencilDate` writes the occurrence's day into
// `exception_dates`, which is exactly "delete this date only": the rule is untouched, the cadence
// carries on around the gap, and a person can put the day back. The UI simply never offered the
// choice, so the only button in the room was the one that destroyed the row.
//
// WHAT THIS MODULE IS. The whole DECISION, pure and away from React, so it can be probed without a
// DOM: given an entry as the drawer holds it, whether a Delete (or a Save) must ask first, which
// choices to offer, and which write each choice means. The rules it encodes:
//
//   1. A repeating entry NEVER goes straight to the destructive write. `planEntryDelete().immediate`
//      is `nothing` whenever the entry repeats, so there is no path from one press to a lost series.
//   2. `thisDate` resolves to the SKIP and to nothing else. A "this date only" choice that could
//      fall through to `deleteRow` would be the incident with a dialog in front of it.
//   3. A one-off entry keeps its one-step Delete. A dialog where there is no series is noise, and
//      noise is what teaches people to click through the dialog that matters.
//
// The words live here too, beside the decision, because the sentence that was missing is the reason
// the row exists and it must not be re-typed per caller. docs/NAMING.md owns the calendar nouns
// (Pencil, Skip this date); docs/CONTENT-VOICE.md owns the tone, and bans the em dash in copy.

/** An entry as the drawer holds it, reduced to what the decision reads. */
export interface SeriesEntryShape {
  /** The entry kind (`pencil`, `unavailable`, `private`). Only an event on its way can repeat. */
  kind: string
  /** The stored rule, as `EntryInput.repeat` carries it ('' or null when it does not repeat). */
  repeat?: string | null
  /** The day the drawer was opened from, when it was opened from ONE occurrence of a series. */
  occurrenceDate?: string | null
}

/** The write a choice means. `deleteRow` removes the ROW: the whole series for a repeating entry,
 *  and the one date for a one-off, because the row is the same thing in both cases.
 *
 *  Since LIVE-536 that removal is a TOMBSTONE, not a hard delete: deleteCalendarEntryRow stamps
 *  `removed_at` and every reader filters it, so a date deleted by mistake can be brought back with
 *  `set removed_at = null`. That changes how bad the mistake is; it does NOT change the reach of
 *  the press, and the reach is what this module exists to ask about. A repeating entry is still one
 *  row, so `deleteRow` still means every date of it, and still has to be asked for by name. */
export type SeriesDeleteAction = 'skipThisDate' | 'deleteRow' | 'nothing'

/** What the person picked in the delete dialog. */
export type SeriesDeleteChoice = 'thisDate' | 'series' | 'keep'

/** What the person picked in the save dialog. `series` is the only write it offers today. */
export type SeriesSaveChoice = 'series' | 'keep'

export interface SeriesDeletePlan {
  /** Ask before writing anything. True exactly when the entry repeats. */
  ask: boolean
  /** The day a "this date only" choice would skip, or null when the drawer is not standing on one
   *  occurrence. Null does NOT re-enable the destructive default: the dialog then offers the series
   *  delete and the way out, and nothing else. */
  thisDate: string | null
  /** What a bare Delete may do with no question asked. `nothing` whenever `ask` is true. */
  immediate: SeriesDeleteAction
}

export interface SeriesSavePlan {
  /** Ask before writing. True exactly when the entry repeats, because the row is every date. */
  ask: boolean
}

/** The entry's rule, honouring the same condition the WRITE honours: `parseEntryInput` stores
 *  `recurrence_rule` only for an event on its way (`def.isPencil`), so an `unavailable` or
 *  `private` entry carrying a stray rule string does not repeat in the database and must not be
 *  treated as a series here either. A rule outside the ADR-1299 subset parses to null, i.e. a
 *  one-off, which is what the generator does with it. */
export function entrySeriesRule(entry: SeriesEntryShape): string | null {
  if (!entryKind(entry.kind)?.isPencil) return null
  return seriesRule({ recurrence_rule: entry.repeat ?? null }) ? (entry.repeat ?? null) : null
}

/** Does this entry repeat, so that its one row is many dates? */
export function entryRepeats(entry: SeriesEntryShape): boolean {
  return entrySeriesRule(entry) !== null
}

/** What a Delete on this entry must do. */
export function planEntryDelete(entry: SeriesEntryShape): SeriesDeletePlan {
  if (!entryRepeats(entry)) return { ask: false, thisDate: null, immediate: 'deleteRow' }
  return { ask: true, thisDate: asDayKey(entry.occurrenceDate ?? null), immediate: 'nothing' }
}

/** What a Save on this saved entry must do. */
export function planEntrySave(entry: SeriesEntryShape): SeriesSavePlan {
  return { ask: entryRepeats(entry) }
}

/** The write a delete choice means, against the plan it was offered with.
 *
 *  🔴 `thisDate` NEVER RESOLVES TO `deleteRow`. If the plan has no occurrence day to skip, the
 *  choice resolves to `nothing` and the caller writes nothing, because a "this date only" press
 *  that hard-deletes the row is the loss this whole module exists to close. */
export function resolveSeriesDeleteChoice(choice: SeriesDeleteChoice, plan: SeriesDeletePlan): SeriesDeleteAction {
  if (choice === 'series') return 'deleteRow'
  if (choice === 'thisDate') return plan.thisDate ? 'skipThisDate' : 'nothing'
  return 'nothing'
}

/** The write a save choice means. */
export function resolveSeriesSaveChoice(choice: SeriesSaveChoice): 'saveSeries' | 'nothing' {
  return choice === 'series' ? 'saveSeries' : 'nothing'
}

// ── THE WORDS ───────────────────────────────────────────────────────────────────────────────────
// Plain sentences that say what each button reaches, and one that says what cannot be taken back.
// "Skip this date" is the shipped verb for writing an exception date (docs/NAMING.md), so the
// dialog uses the same words as the button on the form rather than inventing a second name for one
// write. The way out is "Keep everything" / "Go back", never "Cancel": Cancelled is a locked
// calendar STAGE (NAMING.md), and a Cancel button in a dialog about a calendar entry would read as
// the stage.

/** The sentence whose absence cost the owner their series. Pinned by the probe. */
export const SERIES_DELETE_UNDO_WARNING = 'This cannot be undone.'

export const SERIES_CHOICE_HEADING = 'This date repeats'

export const SERIES_DELETE_COPY = {
  heading: SERIES_CHOICE_HEADING,
  /** Why the question is being asked at all. */
  lead: (title: string) =>
    `${title.trim() || 'This date'} lands on more than one day. Pick what Delete should reach.`,
  /** "This date only", not "Skip this date": the form already carries a button with that exact
   *  label, and the drawer stays open BEHIND this dialog, so reusing it would put two controls with
   *  one accessible name on screen at once. The verb stays in the sentence under the button. */
  thisDateLabel: 'This date only',
  thisDateNote: (dateLabel: string) =>
    `Skips ${dateLabel} and leaves every other date alone. You can put it back later.`,
  seriesLabel: 'Delete the whole series',
  seriesNote: `Deletes this entry and every date it lands on, past and future. ${SERIES_DELETE_UNDO_WARNING}`,
  keepLabel: 'Keep everything',
} as const

export const SERIES_SAVE_COPY = {
  heading: SERIES_CHOICE_HEADING,
  lead: (title: string) =>
    `${title.trim() || 'This date'} lands on more than one day, and this entry is the whole series.`,
  seriesLabel: 'Save the whole series',
  seriesNote: 'Changes every date it lands on, past and future.',
  /** Honest about the gap rather than hiding it: one-date edits are LIVE-532, not shipped. */
  thisDateGap: 'Changing one date on its own is not possible yet. To take one day out of the series, use Skip this date on the form.',
  keepLabel: 'Go back',
} as const
