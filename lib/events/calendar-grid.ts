// Pure month-grid math for the events calendar (Events EC2). No React, no clock, no timezone lib: given
// a year + month it returns the weeks of day cells a month view renders, and it buckets events onto their
// calendar day. Unit-tested so the grid never drifts.
//
// THE DAY KEY: an event's `starts_at` stores the host's wall-clock as UTC PARTS (lib/time/zone.ts), so the
// stored parts ARE the event-local calendar day. The grid therefore buckets by the date portion of
// `starts_at` directly (no conversion) — a 7pm event shows on the day the host set it, in every viewer's
// grid. (Converting to the viewer's zone is a per-viewer refinement for a later phase.)

/** A single day cell in the month grid. `date` is YYYY-MM-DD; `inMonth` is false for the leading/trailing
 *  days that pad the first/last week (shown greyed). */
export interface DayCell {
  date: string
  inMonth: boolean
}

/** Zero-pad a positive integer to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** The month label, e.g. "July 2026". Pure (no locale IO beyond the month-name table). */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export function monthLabel(year: number, month1: number): string {
  const name = MONTH_NAMES[Math.min(11, Math.max(0, month1 - 1))]
  return `${name} ${year}`
}

/** Shift a {year, month1} by `delta` whole months, normalizing the year. */
export function addMonth(year: number, month1: number, delta: number): { year: number; month1: number } {
  const zero = (year * 12 + (month1 - 1)) + delta
  return { year: Math.floor(zero / 12), month1: (((zero % 12) + 12) % 12) + 1 }
}

/**
 * The weeks of the month grid for `year`/`month1` (month1 is 1-12). Weeks start on Sunday. The grid runs
 * from the Sunday on/before the 1st to the Saturday on/after the last day, so every row is a full 7-day
 * week and the month's days sit in their real weekday columns. Pure + deterministic (no `now`).
 */
export function monthMatrix(year: number, month1: number): DayCell[][] {
  const firstOfMonth = new Date(Date.UTC(year, month1 - 1, 1))
  const lastOfMonth = new Date(Date.UTC(year, month1, 0)) // day 0 of next month = last day of this one
  // Back up to the Sunday starting the first week; advance to the Saturday ending the last week.
  const start = new Date(firstOfMonth)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  const end = new Date(lastOfMonth)
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()))

  const weeks: DayCell[][] = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`
      week.push({ date, inMonth: cursor.getUTCMonth() === month1 - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** The event's calendar day key (YYYY-MM-DD) — the date portion of `starts_at` (the stored wall-clock
 *  parts, which ARE the event-local day). Returns null for a missing/invalid start (a draft with no date). */
export function eventDayKey(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startsAt)
  return m ? m[1] : null
}

/** Bucket events onto their calendar day. Returns a Map keyed by YYYY-MM-DD; events with no start day are
 *  dropped. Within a day the input order is preserved (callers pass them sorted by start). */
export function bucketEventsByDay<T extends { starts_at: string | null }>(events: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>()
  for (const ev of events) {
    const key = eventDayKey(ev.starts_at)
    if (!key) continue
    const bucket = byDay.get(key)
    if (bucket) bucket.push(ev)
    else byDay.set(key, [ev])
  }
  return byDay
}

/** The weekday column headers for a Sunday-start grid. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
