// WHAT ACTUALLY DREW PEOPLE (PROG-CAL11 slice 4, LIVE-539). When the ask is "pick a good day" and
// names none, Vera reads this Space's OWN attendance history and prefers the weekday and hour that
// drew people. This module is the fold and nothing else: pure, no React, no Next, no Supabase, so a
// backlog probe can run it and a test can hand it four rows.
//
// THE INPUT IS THE PROG-CAL6 RECAP PATH, one row per past event: the event's stored `starts_at`
// and the count `attendanceCount` (lib/events/attendance.ts) gives its record, host marks and
// verified self check-ins, one person once, NULL when the record is empty. Null is not zero: a
// room can be full and the host never touch the roster, so an unrecorded event is left out of
// every bucket rather than dragging its weekday down. When nothing has a record the answer is
// null, never a weekday nobody came on.
//
// WEEKDAY AND HOUR ARE READ OFF THE STORED WALL CLOCK. `events.starts_at` keeps the wall clock in
// the event's own zone as UTC parts (the LIVE-377 / LIVE-512 convention, the same digits
// `eventInstant` starts from), and "Saturday at 7" is what the team means and what a pencil
// change writes, so the digits are read as they are and no machine zone is consulted. A late
// Saturday stays Saturday on a Pacific laptop and on a UTC server alike.
//
// ONLY THIS SPACE. The caller (vera-calendar-actions.ts) reads the rows keyed by the Space the
// editor resolved; nothing here can widen that, because nothing here reads anything.
//
// Every sentence a person may read passes through `voiceLine`, the mechanical half of the house
// voice (the PROG-CAL6 invariant, the same import lib/calendar/vera-plan.ts carries).

import { voiceLine } from '@/lib/ai/voice'
import { WEEKDAY_NAMES } from './day-notes'

/** The most past events the history reads, newest first: enough to see a pattern, bounded because
 *  the check-in ledger is read per event. */
export const MAX_HISTORY_EVENTS = 50

interface AttendedEventRow {
  /** `events.starts_at` as stored: the wall clock in the event's zone, as UTC parts. */
  startsAt: string | null
  /** The event's attendance record, or null when it has none. */
  attendance: number | null
}

interface AttendanceBucket {
  /** Events with a record in this bucket. */
  events: number
  /** People counted present across them. */
  people: number
}

interface AttendanceBest {
  /** 0 is Sunday, as `WEEKDAY_NAMES` and day notes count. */
  weekday: number
  /** The starting hour, 0 to 23, within that weekday that drew the most people. */
  hour: number
  /** The people and events the weekday rests on. */
  people: number
  events: number
}

export interface AttendanceHistory {
  /** Events that carried a record and a readable start. */
  recordedEvents: number
  /** The weekday and hour that drew the most people, or null when nothing has a record. */
  best: AttendanceBest | null
  /** Every weekday with a record, most people first. */
  byWeekday: ({ weekday: number } & AttendanceBucket)[]
  /** Every starting hour with a record, most people first. */
  byHour: ({ hour: number } & AttendanceBucket)[]
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

/** The weekday and starting hour a stored wall clock names, or null when it is not one. Read as
 *  digits, never through `new Date(string)`, which is local for a naive ISO in the ES5 spec. */
export function wallClockSlot(startsAt: string | null | undefined): { weekday: number; hour: number } | null {
  if (typeof startsAt !== 'string') return null
  const m = WALL_CLOCK.exec(startsAt.trim())
  if (!m) return null
  const [y, mo, d, h] = m.slice(1).map(Number)
  const at = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(at.getTime()) || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d || h > 23) return null
  return { weekday: at.getUTCDay(), hour: h }
}

function add(buckets: Map<number, AttendanceBucket>, n: number, people: number): void {
  const b = buckets.get(n) ?? { events: 0, people: 0 }
  b.events += 1
  b.people += people
  buckets.set(n, b)
}

/** Most people first, then most events, then the earlier slot: a stable order for a tie. */
function ranked(buckets: Map<number, AttendanceBucket>): { n: number; events: number; people: number }[] {
  return [...buckets.entries()]
    .map(([n, b]) => ({ n, ...b }))
    .sort((a, b) => b.people - a.people || b.events - a.events || a.n - b.n)
}

/**
 * The fold. The best weekday is the one that drew the most people in total; the best hour is the
 * starting hour WITHIN that weekday that drew the most, because "Saturdays at 7 PM" is one answer
 * and the busiest hour across the whole week could name a Tuesday.
 */
export function attendanceHistory(rows: readonly AttendedEventRow[]): AttendanceHistory {
  const byWeekday = new Map<number, AttendanceBucket>()
  const byHour = new Map<number, AttendanceBucket>()
  const hoursByWeekday = new Map<number, Map<number, AttendanceBucket>>()
  let recordedEvents = 0
  for (const row of rows) {
    if (typeof row.attendance !== 'number' || !Number.isFinite(row.attendance) || row.attendance < 0) continue
    const slot = wallClockSlot(row.startsAt)
    if (!slot) continue
    recordedEvents += 1
    add(byWeekday, slot.weekday, row.attendance)
    add(byHour, slot.hour, row.attendance)
    const hours = hoursByWeekday.get(slot.weekday) ?? new Map<number, AttendanceBucket>()
    add(hours, slot.hour, row.attendance)
    hoursByWeekday.set(slot.weekday, hours)
  }
  const weekdays = ranked(byWeekday).map(({ n, events, people }) => ({ weekday: n, events, people }))
  const hours = ranked(byHour).map(({ n, events, people }) => ({ hour: n, events, people }))
  const top = weekdays[0]
  const topHours = top ? hoursByWeekday.get(top.weekday) : undefined
  const best: AttendanceBest | null =
    top && topHours ? { weekday: top.weekday, hour: ranked(topHours)[0].n, people: top.people, events: top.events } : null
  return { recordedEvents, best, byWeekday: weekdays, byHour: hours }
}

/** "7 PM", "10 AM", "12 PM": the hour as a person says it, the same spelling the proposal line uses. */
export function hourWords(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}

/** "Saturdays at 7 PM". */
export function slotWords(slot: Pick<AttendanceBest, 'weekday' | 'hour'>): string {
  return `${WEEKDAY_NAMES[slot.weekday] ?? 'Days'}s at ${hourWords(slot.hour)}`
}

/** The sentence the server says about the history: the tool result the model reads, and the
 *  reason a proposal line carries once LIVE-540 lands. Plain, with the count it rests on, because
 *  a person decides on it. */
export function attendanceHistoryWords(history: AttendanceHistory): string {
  const b = history.best
  if (!b) return voiceLine('No attendance has been recorded here yet, so there is nothing to prefer between days.')
  return voiceLine(`${slotWords(b)} have drawn the most people here: ${b.people} over ${b.events} event${b.events === 1 ? '' : 's'}.`)
}
