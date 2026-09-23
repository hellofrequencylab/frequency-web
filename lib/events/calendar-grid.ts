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
 *  parts, which ARE the event-local day). Returns null for a missing/invalid start (a draft with no date).
 *  The calendar page uses this to pre-compute each event's `dayKey`; the client grid buckets by it. */
export function eventDayKey(startsAt: string | null | undefined): string | null {
  if (!startsAt) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startsAt)
  return m ? m[1] : null
}

/** The weekday column headers for a Sunday-start grid. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// ── THE GRID'S TWO HOST DECISIONS (PROG-CAL13, corrected by LIVE-475) ─────────────────────────
//
// Both used to be inline ternaries in components/events/event-calendar.tsx, which meant the only way
// to check either one was to read the source and hope the spelling had not moved. They are pure
// decisions, so they live here with the rest of the grid's pure math, the component reads them, and
// the backlog probe that guards them can RUN them instead of grepping for them.

/** What the grid draws for itself, given a host that says it owns the chrome. */
export interface CalendarChrome {
  /** The month title (and the aria-live that reads it). The console header draws its own. */
  monthTitle: boolean
  /** Previous / Today / Next. The console header draws its own. */
  paging: boolean
  /** THIS grid's grid-vs-list switcher. Not the workspace's four-panel toggle: no host draws it. */
  viewSwitch: boolean
  /** The month-and-year jump. No host draws one, and one month per press is not a substitute. */
  monthJump: boolean
}

/**
 * 🔴 A HOST OWNS THE MONTH, NEVER THE EXIT (LIVE-475). The first cut of `hostChrome` dropped the
 * grid's WHOLE header, and the two controls in it that no host draws went with it. That shipped a
 * reachable dead end: switch the page grid to List, press Fullscreen, and you were in list mode
 * inside a full-screen console with no way back to the month and no way to move more than one month
 * at a time — closing the console was the only exit. The duplicated chrome (the month label and the
 * paging cluster) is what the console was paying for twice, and that is all `hostChrome` takes.
 */
export function calendarChrome(hostChrome: boolean): CalendarChrome {
  return { monthTitle: !hostChrome, paging: !hostChrome, viewSwitch: true, monthJump: true }
}

/**
 * The day cell's height floor. A FILLING GRID HAS NO FLOOR (PROG-CAL13): six week rows share the
 * height the host gives them, so a cell that insists on 20/28 units of its own is what pushed the
 * last two weeks of the month off the bottom of the console. On the page the grid sizes to its
 * content and the floor is what keeps a cell from collapsing to its day pill.
 */
export function cellFloorClass(fill: boolean): string {
  return fill ? 'min-h-0' : 'min-h-20 sm:min-h-28'
}
