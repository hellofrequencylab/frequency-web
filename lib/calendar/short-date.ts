// ONE SHORT DATE (LIVE-468). Every calendar surface that named a single day by hand picked its own
// format: the raw day key ("2026-10-04") on Skip this date, to-do dues and Vera's moves, and "10/04"
// on the lapse badge, beside the "Mon, Jul 20" the when-labels already used. This is the one
// formatter for a day a person reads, and it matches the when-label's date style so a date reads the
// same on a chip, a badge and a button.
//
// Native Intl only: this runs in client components (the month grid, the drawers), so it must not
// pull lib/time/zone and its tz tables into the browser graph (see lib/calendar/public-month.ts).

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The calendar day of an instant in a zone, as YYYY-MM-DD. Null when either cannot be read. */
function dayKeyInZone(instantIso: string, timeZone: string): string | null {
  const d = new Date(instantIso)
  if (Number.isNaN(d.getTime())) return null
  try {
    // en-CA is the one locale whose numeric date is already YYYY-MM-DD.
    const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    return DAY_KEY.test(key) ? key : null
  } catch {
    return null
  }
}

/** "Sun, Oct 4" for a day. `day` is a YYYY-MM-DD day key, or an ISO instant whose first ten
 *  characters are the day (a `date` column read back as midnight UTC, a to-do's due_at). Pass
 *  `timeZone` only for a true instant that should be read in that zone; a day key has no zone.
 *  Never throws: an unreadable value comes back as it was, so a label is never blank. */
export function shortDateLabel(day: string, timeZone?: string): string {
  if (typeof day !== 'string' || !day) return ''
  const key = timeZone && day.length > 10 ? (dayKeyInZone(day, timeZone) ?? day.slice(0, 10)) : day.slice(0, 10)
  if (!DAY_KEY.test(key)) return day
  const at = new Date(`${key}T00:00:00.000Z`)
  if (Number.isNaN(at.getTime())) return day
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(at)
  } catch {
    return day
  }
}
