// A ZONED INSTANT VERSUS A BARE WALL TIME (SCAN-702).
//
// An <input type="datetime-local"> gives back "YYYY-MM-DDTHH:mm": the wall time the person picked, with
// no zone. `new Date(raw)` reads such a string in the MACHINE's zone, so the same string is one instant
// on the owner's laptop and another on a UTC server. A campaign scheduled for 2:30 PM in Los Angeles
// that reached the server unconverted was stored as 14:30Z and went out at 7:30 AM. The rule, in two
// halves: the CLIENT turns the wall time into an instant (it is the only side that knows the zone), and
// the SERVER refuses any string that still has no zone, so the mistake can never reach a row again.
//
// PURE and import-free, so it is the same in a browser, on a server and in a test.

/** A trailing Z or a +hh:mm / -hhmm offset: the string names its zone. */
const ZONED_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i

/** True when `raw` carries a zone suffix (Z or an offset). A bare datetime-local value does not. */
export function hasZoneSuffix(raw: string): boolean {
  return ZONED_SUFFIX.test(raw.trim())
}

/**
 * A client-supplied datetime string -> an ISO instant, or null. Fails closed on anything that is not
 * a string, cannot be parsed, or carries NO zone suffix: a zone-less wall time would be read in the
 * server's zone, which is never the person's.
 */
export function parseZonedInstant(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed || !hasZoneSuffix(trimmed)) return null
  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * The client half: a datetime-local value ("YYYY-MM-DDTHH:mm", the browser's own zone) -> an ISO
 * instant with a Z. Empty for a blank or unparseable value, so a caller can gate on it the way it
 * gates on the raw value. Runs on the client, where `new Date(local)` IS the person's zone.
 */
export function localInputToIso(value: string): string {
  if (!value) return ''
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}
