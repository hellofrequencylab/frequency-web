import type { CalendarEvent } from './item'
import type { EntryInput } from './entries'
import { shortDateLabel } from './short-date'

// MOVING A DATE BY HAND (PROG-CAL15). The pure half of "pick a date up and put it on another day",
// which the Calendar console does two ways: a pointer drag and, equally, Shift with an arrow key on
// a focused chip. Nothing here touches the DOM, React or Supabase, so the one question that decides
// a move ("which day does this land on, and may it?") is answered by a function a test can call.
//
// IT DOES NOT WRITE. A planned move hands back the SAME `EntryInput` the drawer edits, with its two
// day fields shifted, so the write goes through the existing seam (saveCalendarEntry in
// app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts). That seam is what re-anchors a
// Plan's to-dos when the date it belongs to slips (ADR-1386 P5), so a dragged date carries its prep
// list exactly as a date changed in the drawer does, and gets the same server-side refusals.
//
// EVERY REFUSAL CARRIES ITS LINE. The console says one thing per move, moved or not, and never
// nothing: the caller shows `line` whichever arm it got back.

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function dayMs(dayKey: string): number | null {
  if (typeof dayKey !== 'string' || !DAY_KEY.test(dayKey)) return null
  const ms = Date.parse(`${dayKey}T00:00:00.000Z`)
  // `Date.parse` rolls an impossible day over rather than refusing it ("2026-02-30" is March 2),
  // which would hand a caller a day nobody named. Only a key that survives the round trip is a day.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== dayKey) return null
  return ms
}

/** `dayKey` moved by whole days, as a day key. Null when either side is not a real day. */
export function shiftDayKey(dayKey: string, days: number): string | null {
  const ms = dayMs(dayKey)
  if (ms === null || !Number.isInteger(days)) return null
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`, negative when `to` is earlier. Null when either is not a day. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayMs(from)
  const b = dayMs(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/** THE KEYBOARD IS THE EQUAL PATH. Shift with Left / Right is a day, Shift with Up / Down is a
 *  week, which is the same distance the eye travels on the grid. Without Shift the arrows still
 *  belong to the month (the console pages with them), so an unshifted arrow is never a move. */
export function keyboardMoveDelta(key: string, shiftKey: boolean): number | null {
  if (!shiftKey) return null
  switch (key) {
    case 'ArrowLeft':
      return -1
    case 'ArrowRight':
      return 1
    case 'ArrowUp':
      return -7
    case 'ArrowDown':
      return 7
    default:
      return null
  }
}

export type MoveRefusal = 'bad-day' | 'other-month' | 'repeats' | 'published' | 'not-an-entry' | 'same-day'

export type PlannedMove = {
  ok: true
  entryId: string
  title: string
  fromDayKey: string
  toDayKey: string
  /** The drawer's own input, with the date moved and its length kept. Feed it to saveCalendarEntry. */
  input: EntryInput
  /** What the console says once the write lands. */
  line: string
}

export type RefusedMove = { ok: false; reason: MoveRefusal; line: string }

export type EntryMove = PlannedMove | RefusedMove

const refuse = (reason: MoveRefusal, line: string): RefusedMove => ({ ok: false, reason, line })

function monthPrefix(month: { year: number; month1: number }): string {
  return `${month.year}-${String(month.month1).padStart(2, '0')}-`
}

/**
 * Where a picked-up date would land, and whether it may.
 *
 * `shownMonth` is the month the grid is showing. A month grid draws the tail of the month before and
 * the head of the month after, and dragging BETWEEN months is deliberately not in this row: a drop
 * on one of those edge cells is refused with the page-first line rather than silently moving a date
 * out of the month the person is looking at.
 */
export function planEntryMove(
  item: CalendarEvent,
  toDayKey: string,
  shownMonth?: { year: number; month1: number } | null,
): EntryMove {
  const title = item.title || 'That date'
  if (dayMs(toDayKey) === null) return refuse('bad-day', 'That is not a day on this calendar, so nothing moved.')
  if (shownMonth && !toDayKey.startsWith(monthPrefix(shownMonth))) {
    return refuse('other-month', `${shortDateLabel(toDayKey)} is in another month. Open that month first, then move the date.`)
  }
  // One occurrence of a repeating Pencil carries the MASTER's id and form, so dropping it would move
  // the whole series. The drawer owns that change (PROG-CAL5), and says so.
  if (item.occurrenceDate) return refuse('repeats', `${title} repeats. Open it to change when the series runs.`)
  if (!item.entryId || !item.entryInput) {
    return item.eventId
      ? refuse('published', `${title} is a published event now. Open the event to change its date.`)
      : refuse('not-an-entry', 'Only a Pencil or a Plan date moves this way.')
  }
  if (item.dayKey === toDayKey) return refuse('same-day', `${title} is already on ${shortDateLabel(toDayKey)}.`)
  const input = item.entryInput
  // The date keeps its length: a two-day hold dropped on Friday is Friday and Saturday.
  const span = daysBetween(input.startDate, input.endDate)
  const endDate = shiftDayKey(toDayKey, span !== null && span > 0 ? span : 0) ?? toDayKey
  return {
    ok: true,
    entryId: item.entryId,
    title,
    fromDayKey: item.dayKey,
    toDayKey,
    // `candidateDates` stays empty: a drag moves THIS date, it never adds another one to a Pencil.
    input: { ...input, startDate: toDayKey, endDate, candidateDates: [] },
    line: `Moved ${title} to ${shortDateLabel(toDayKey)}.`,
  }
}

/**
 * THE DATE IS ON THE NEW DAY BEFORE THE SERVER SAYS SO. A move that waited for the round trip
 * before the chip moved would be a drag that snaps back for half a second, and worse on the
 * keyboard: a second Shift press would be measured from the OLD day and land on the same square as
 * the first, so two presses moved a date one day.
 *
 * So the grid holds the moved day itself until the month comes back, and this is the item it draws
 * meanwhile: the same item on its new days, form and all. The when-labels are the server's and are
 * left alone, because they are zone-formatted there and are replaced by the refetch this is waiting
 * for. Not a fallback that can hide a failure: the host bumps the grid's `refreshKey` whether the
 * write succeeded or failed, which drops every held day and takes the answer from the server.
 */
export function withMovedDay(item: CalendarEvent, toDayKey: string): CalendarEvent {
  if (!DAY_KEY.test(toDayKey) || item.dayKey === toDayKey) return item
  const delta = daysBetween(item.dayKey, toDayKey)
  if (delta === null) return item
  const endDayKey = item.endDayKey ? shiftDayKey(item.endDayKey, delta) : null
  const input = item.entryInput
  return {
    ...item,
    dayKey: toDayKey,
    endDayKey,
    entryInput: input
      ? {
          ...input,
          startDate: shiftDayKey(input.startDate, delta) ?? input.startDate,
          endDate: shiftDayKey(input.endDate, delta) ?? input.endDate,
        }
      : input,
  }
}
