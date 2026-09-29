// THE STORED-TIME CONVENTION, MADE CHECKABLE (LIVE-514).
//
// `space_calendar_entries.starts_at` / `ends_at` hold the Space's WALL CLOCK as UTC PARTS, read in
// the row's own `time_zone` (supabase/migrations/20270345005200_private_calendar_layer.sql,
// lib/calendar/entries.ts, lib/time/zone.ts). '2026-10-23T18:30:00Z' with `America/Los_Angeles` is
// 6:30 PM in Vista, and NOTHING converts it.
//
// 🔴 WHY THIS MODULE EXISTS. A wall clock and a true instant are the same TYPE, the same column and
// the same ISO spelling, so writing the wrong one is invisible to tsc, to a code review and to every
// test that compares Dates instead of strings. On 2026-09-25 twenty-five Royal Temple pencils were
// written as TRUE INSTANTS by hand-run SQL (`'2026-10-23 18:30 America/Los_Angeles'::timestamptz`
// rather than the literal `'2026-10-23T18:30:00Z'`). Nothing noticed. The calendar drew a 6:30 PM
// fire circle at 1:30 AM the NEXT day, and the only visible tell was that the time-of-day of a
// monthly series moved by an hour across the PDT/PST boundary — which a wall-clock series never does.
//
// So the distinction gets a name, a predicate and pinned strings. `wallClockOfInstant` is the exact
// inverse of `eventInstant`: given a value stored by mistake as an instant, it returns the wall clock
// that value MEANT. `instantShapedSpan` is the narrow, provable test for "this row is that mistake",
// and it is deliberately narrow — see its own note on what it cannot decide.
//
// The repair migration (20270345008500_calendar_entries_stored_as_instants.sql) is this predicate and
// this shift, written in SQL. The two are meant to agree row for row; wall-clock.test.ts pins the
// twenty-five production values both of them have to produce.

import { resolveZone, zoneOffsetMinutes } from '@/lib/time/zone'

/** The columns the audit reads. Any row of `space_calendar_entries` satisfies it. */
export interface StoredSpan {
  starts_at: string
  ends_at: string
  all_day: boolean
  time_zone: string | null | undefined
}

/** A repair: the wall clock the row should have stored, in the convention's spelling. */
interface WallClockSpan {
  starts_at: string
  ends_at: string
}

const MINUTE_MS = 60_000

/** A stored value's milliseconds. Naive ISO is UTC PARTS, never the machine's zone (LIVE-377), so a
 *  missing offset is spelled in rather than left to the ES5 local-time rule. */
function storedMs(storedIso: string | null | undefined): number | null {
  if (!storedIso) return null
  const trimmed = storedIso.trim()
  if (!trimmed) return null
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed.replace(' ', 'T')}Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/**
 * THE INVERSE OF `eventInstant`. Read `storedIso` as the true instant it would be if someone had
 * (wrongly) written one, and return the wall clock that instant shows in `timeZone`, spelled as the
 * convention stores a wall clock. This is Postgres `starts_at at time zone time_zone`, and it is what
 * turns '2026-10-24T01:30:00Z' back into '2026-10-23T18:30:00.000Z'.
 *
 * Null on an unparseable value.
 */
export function wallClockOfInstant(storedIso: string | null | undefined, timeZone: string | null | undefined): string | null {
  const ms = storedMs(storedIso)
  if (ms === null) return null
  const offset = zoneOffsetMinutes(new Date(ms), resolveZone(timeZone))
  return new Date(ms + offset * MINUTE_MS).toISOString()
}

/** The hour and minute a stored value names, read the way the convention says: as UTC parts. */
export function storedWallClock(storedIso: string | null | undefined): { hour: number; minute: number } | null {
  const ms = storedMs(storedIso)
  if (ms === null) return null
  const d = new Date(ms)
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() }
}

/** The stored hour below which no Space schedules anything (00:00–05:59 local). */
const DEAD_OF_NIGHT_END_HOUR = 6
/** The hour an evening gathering starts at the earliest, once the value is read as an instant. */
const EVENING_START_HOUR = 16

/**
 * IS THIS ROW A TRUE INSTANT WEARING A WALL CLOCK'S COLUMN? Returns the wall clock it meant, or null.
 *
 * 🔴 WHAT THIS CANNOT DECIDE, said plainly: a row genuinely held at 1:30 AM local and a 6:30 PM row
 * written as an instant are THE SAME BYTES. No predicate separates them, which is why this one is not
 * a constraint and refuses nothing — a Space may legitimately pencil an all-night sit. All four of
 * these have to hold before a row is called instant-shaped:
 *
 *   1. it is timed (an all-day span is 00:00 to 00:00 and carries no time to get wrong);
 *   2. read as the wall clock it claims to be, it lands in the dead of night (00:00–05:59), which is
 *      where an instant-shaped write of a US evening always lands and where programming never is;
 *   3. read as a true instant in the row's OWN zone instead, it lands in the evening (16:00 or later)
 *      on an exact quarter hour — an intended start time, not a coincidence;
 *   4. the same reading keeps the end after the start.
 *
 * Even together they are evidence, not proof, for ONE row. What made the 2026-09-25 set certain was
 * the series tell: thirteen monthly rows whose stored time-of-day was 01:30 under PDT and 02:30 under
 * PST, when a wall-clock series holds one time-of-day for ever. `instantShapedSeriesTell` is that
 * check, for a set.
 *
 * ⚠️ MIDNIGHT IS A FALSE POSITIVE, and it is a real one. A TIMED span that genuinely starts at 00:00
 * local, in a zone BEHIND UTC, reads as a 17:00 evening start when read as an instant -- so it
 * satisfies every condition above and gets flagged. Two rows of `public.events` are exactly that
 * ("A Plant-Honoring Ceremony", "Saffron Harvest & Cultural Festivals -- Fall Journey", both genuine
 * multi-day journeys stored 00:00 to 23:59, checked 2026-09-27) and neither is the bug. The LIVE-514
 * migration is unaffected because it excludes `all_day` rows and every 00:00 row in
 * `space_calendar_entries` is either all-day or `time_zone = 'UTC'` (offset 0, so it reads as 00:00
 * and never flags). A CALLER sweeping another table has to rule midnight out for itself.
 *
 * ⚠️ A zone EAST of UTC is outside this net: an instant-shaped 7:00 PM in Europe/Berlin stores 17:00,
 * which is an ordinary afternoon and indistinguishable. Every row in this table is
 * America/Los_Angeles or UTC (checked 2026-09-27), so the net covers the data that exists; a Space in
 * Berlin would need the series tell instead.
 */
export function instantShapedSpan(row: StoredSpan): WallClockSpan | null {
  if (row.all_day) return null
  const stored = storedWallClock(row.starts_at)
  if (!stored || stored.hour >= DEAD_OF_NIGHT_END_HOUR) return null
  const starts_at = wallClockOfInstant(row.starts_at, row.time_zone)
  const ends_at = wallClockOfInstant(row.ends_at, row.time_zone)
  if (!starts_at || !ends_at) return null
  const meant = storedWallClock(starts_at)
  if (!meant || meant.hour < EVENING_START_HOUR || meant.minute % 15 !== 0) return null
  if (Date.parse(ends_at) <= Date.parse(starts_at)) return null
  return { starts_at, ends_at }
}

/**
 * THE SERIES TELL. A wall-clock series holds ONE time-of-day for ever; a series of true instants
 * moves by the zone's DST delta. Hand a set of rows that are meant to be the same recurring date
 * (same title, same zone) and this says whether their stored time-of-day moves — which is proof no
 * single row can give.
 *
 * Returns the distinct stored HH:MM the set holds, when there is more than one. Null for a set that
 * holds one time-of-day (wall-clock-correct, or too small to tell).
 */
export function instantShapedSeriesTell(rows: readonly StoredSpan[]): string[] | null {
  const times = new Set<string>()
  for (const row of rows) {
    if (row.all_day) continue
    const wall = storedWallClock(row.starts_at)
    if (!wall) continue
    times.add(`${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`)
  }
  return times.size > 1 ? [...times].sort() : null
}
