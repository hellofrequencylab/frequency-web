// ONE PLACE FOR THE SHORT DATES AND TIMES A PERSON READS (SCAN-1241). Over a hundred call sites each wrote
// their own `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`; these four helpers are those
// exact option bags under a name, so a change to the house short date lands everywhere at once.
//
// PURE, native Intl only, and safe in a client component (no tz tables). The zone is the runtime's unless
// the caller passes one. An event's stored wall-clock is UTC parts, so event surfaces pass 'UTC' (see the
// note in lib/utils.ts above formatEventDate); a timestamp the viewer should read in their own zone passes
// nothing.

type DateInput = Date | string | number

function at(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

/** "Jan 5, 2026". */
export function formatDateMedium(value: DateInput, timeZone?: string): string {
  return at(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(timeZone ? { timeZone } : {}) })
}

/** "Jan 5". */
export function formatDateShort(value: DateInput, timeZone?: string): string {
  return at(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) })
}

/** "Mon, Jan 5". */
export function formatDateWeekday(value: DateInput, timeZone?: string): string {
  return at(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) })
}

/** "3:00 PM". */
export function formatTimeShort(value: DateInput, timeZone?: string): string {
  return at(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
}
