// WHICH DAYS THIS SPACE IS ALREADY BUSY (ADR-1386 P6, PROG-CAL6). The pure mapping from the
// Space's own calendar rows to the day keys `suggestDates` (lib/calendar/vera-plan.ts) must skip.
//
// Vera's date suggestion reads availability from four things the row names: Unavailable time,
// existing events, Pencils, and day notes. The first three occupy days; a day note describes one
// ("Quiet hours", "Retreat & rental") and is treated as a day not to offer, because the team
// wrote it down for a reason. Pure: no React, no Supabase. The caller reads the rows on its own
// session and hands them in, so no data from another Space can reach a suggestion unless the
// caller fetched it, and the caller fetches by space id.
//
// TIME. Calendar entries and events both store their WALL CLOCK as UTC parts (lib/calendar/
// entries.ts, lib/time/zone.ts), so the day a row occupies is read straight off the stored value,
// in the row's own zone, the same way the month grid does (`entryDaySpan`, `eventDayKey`). No zone
// conversion happens here on purpose: converting would move a 7 PM Lisbon event onto the wrong day
// for a Space in Lisbon.

import { entryDaySpan, spanDayKeys, type EntryRow } from './entries'
import { notesForDay, type DayNote } from './day-notes'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** The columns of a Space event the busy-day rule reads. */
export interface BusyEventRow {
  starts_at: string | null
  ends_at: string | null
  is_cancelled: boolean | null
}

/** The columns of a private entry the busy-day rule reads (a subset of EntryRow). */
export type BusyEntryRow = Pick<EntryRow, 'starts_at' | 'ends_at' | 'all_day' | 'status'>

/** Suggestions look at most 60 days past the start day (`suggestDates`), so 90 covers them with room. */
export const AVAILABILITY_WINDOW_DAYS = 90

function dayMs(dayKey: string): number | null {
  if (!DATE_RE.test(dayKey)) return null
  const [y, m, d] = dayKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** [fromDay, toDay) as the entry store reads it: `toDay` is exclusive. */
export function availabilityWindow(fromDay: string, days: number = AVAILABILITY_WINDOW_DAYS): { fromDay: string; toDay: string } {
  const start = dayMs(fromDay)
  if (start === null) return { fromDay, toDay: fromDay }
  const span = Math.max(1, Math.floor(days))
  return { fromDay, toDay: isoDay(start + span * DAY_MS) }
}

/**
 * The day keys inside [fromDay, toDay) that something on this Space's calendar already claims.
 *
 * - A private entry (Pencil, Unavailable time, any kind) claims every day of its span unless its
 *   status is cancelled. `blocks_time` is not consulted: a Pencil does not block bookings, but it is
 *   still a date the team is holding, which is exactly what a date suggestion must not collide with.
 * - An event claims every day from its start to its end (or just its start day), unless cancelled.
 * - A day note claims each day it applies to.
 *
 * Sorted and de-duplicated, so the output is stable for a test and for a `Set`.
 */
export function busyDayKeysFor(input: {
  entries: readonly BusyEntryRow[]
  events: readonly BusyEventRow[]
  dayNotes: readonly DayNote[]
  fromDay: string
  toDay: string
}): string[] {
  const start = dayMs(input.fromDay)
  const end = dayMs(input.toDay)
  if (start === null || end === null || end <= start) return []
  const inWindow = (key: string) => key >= input.fromDay && key < input.toDay
  const busy = new Set<string>()

  for (const row of input.entries) {
    if (row.status === 'cancelled') continue
    if (!row.starts_at || !row.ends_at) continue
    const span = entryDaySpan(row)
    for (const key of spanDayKeys(span.dayKey, span.endDayKey)) if (inWindow(key)) busy.add(key)
  }

  for (const ev of input.events) {
    if (ev.is_cancelled) continue
    if (!ev.starts_at) continue
    // An event's end at exactly 00:00 belongs to the day before, the same rule as an all-day entry.
    const span = entryDaySpan({ starts_at: ev.starts_at, ends_at: ev.ends_at ?? ev.starts_at, all_day: false })
    for (const key of spanDayKeys(span.dayKey, span.endDayKey)) if (inWindow(key)) busy.add(key)
  }

  if (input.dayNotes.length) {
    for (let ms = start; ms < end; ms += DAY_MS) {
      const key = isoDay(ms)
      if (notesForDay(input.dayNotes, key).length) busy.add(key)
    }
  }

  return [...busy].sort()
}
