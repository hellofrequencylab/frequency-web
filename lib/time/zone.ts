// Canonical timezone model — ONE place, so events, listings, reminders, and the
// member's local experience all agree on what a stored timestamp means.
//
// HOME is America/Los_Angeles (PST/PDT). Everything defaults to HOME when a more
// specific zone is unknown.
//
// EVENT STORAGE CONVENTION (unchanged from lib/events/datetime.ts): an event's
// starts_at/ends_at hold the wall-clock the host entered, kept as UTC PARTS
// (7:00 PM -> 2026-07-01T19:00:00Z). That value is now interpreted as wall-clock in
// the event's OWN `time_zone` (events.time_zone, IANA, default HOME). So:
//   - to render in the event's zone: show the stored UTC parts + the zone's abbrev
//     (the parts already ARE the event-local wall clock);
//   - to render in a viewer's zone, or to compare against "now": resolve the stored
//     wall-clock + the event's zone to a TRUE UTC instant first (eventInstant).
// This adds an explicit zone per event without rewriting any existing timestamp.

import tzlookup from 'tz-lookup'

/** The home timezone. Everything falls back to this when a specific zone is unknown. */
export const HOME_TZ = 'America/Los_Angeles'

const IANA_TZ_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/

/** True when `tz` is a non-empty IANA zone the runtime tz database can resolve. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || tz.length > 64 || !IANA_TZ_RE.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Coerce any input to a usable IANA zone, falling back to HOME. */
export function resolveZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : HOME_TZ
}

/** The wall-clock parts of a UTC instant AS SEEN in an IANA zone (Intl, no tz lib). */
function wallPartsInZone(date: Date, timezone: string) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    let hour = get('hour')
    if (hour === 24) hour = 0 // some engines emit 24 for midnight
    const p = { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute'), second: get('second') }
    if (Object.values(p).some((n) => Number.isNaN(n))) return null
    return p
  } catch {
    return null
  }
}

/** Minutes `timezone` is ahead of UTC at the instant `date`. */
export function zoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = wallPartsInZone(date, timezone)
  if (!parts) return 0
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** A local wall-clock (calendar Y/M/D H:M:S) in `timezone` -> the absolute UTC instant.
 *  Two-pass offset solve so DST transitions resolve correctly. */
export function zonedWallClockToInstant(
  year: number, month: number, day: number, hour: number, minute: number, second: number, timezone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const off1 = zoneOffsetMinutes(new Date(guess), timezone)
  const corrected = guess - off1 * 60000
  const off2 = zoneOffsetMinutes(new Date(corrected), timezone)
  const finalMs = off2 === off1 ? corrected : guess - off2 * 60000
  return new Date(finalMs)
}

/** A stored event timestamp (wall-clock kept as UTC parts) + the event's zone -> the
 *  TRUE UTC instant the event actually happens. Use for "is it past?" and for
 *  rendering in a DIFFERENT zone than the event's own. null on empty/invalid input. */
export function eventInstant(storedIso: string | null | undefined, timezone: string | null | undefined): Date | null {
  if (!storedIso) return null
  const d = new Date(storedIso)
  if (Number.isNaN(d.getTime())) return null
  const tz = resolveZone(timezone)
  // The stored UTC parts ARE the intended wall-clock in `tz`.
  return zonedWallClockToInstant(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), tz,
  )
}

/** True when the event (ends_at if present, else starts_at) is in the past RIGHT NOW,
 *  resolving the stored wall-clock through the event's own zone. */
export function isEventPast(
  startsAtIso: string | null | undefined,
  endsAtIso: string | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const inst = eventInstant(endsAtIso || startsAtIso, timezone)
  return inst ? inst.getTime() < now.getTime() : false
}

/** The short zone abbreviation (PST/PDT/EST…) for an event's zone at its instant. */
export function zoneAbbrev(storedIso: string | null | undefined, timezone: string | null | undefined): string {
  const tz = resolveZone(timezone)
  const inst = eventInstant(storedIso, tz) ?? new Date()
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(inst)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** A stored event timestamp + its zone -> the ISO 8601 string to PUBLISH: the wall clock the
 *  host chose, carrying that zone's UTC offset at that moment. `2026-08-27T18:30:00-07:00`.
 *
 *  🔴 THIS IS THE ONLY CORRECT FORM FOR AN EVENT TIME LEAVING THIS SYSTEM, and the reason is the
 *  storage convention every function above is built around: `events.starts_at` holds the WALL CLOCK
 *  as UTC parts, so the raw stored string (`2026-08-27T18:30:00Z`) is not an instant — it is a local
 *  time wearing a `Z`. Anything that reads it as an instant lands seven or eight hours early in North
 *  America. That has already been shipped twice: once in SQL, where the guest RSVP door closed before
 *  lunch (SCAN-101, 20270328000000), and once in the Event JSON-LD, where every public event's rich
 *  result advertised the wrong time to Google (SCAN-207) — measured on production 2026-08-25, e.g. a
 *  6:30pm Pacific event published as 11:30am.
 *
 *  Both halves matter. The OFFSET makes it a true instant, so a calendar or an answer engine resolves
 *  it correctly. Keeping the WALL CLOCK (rather than converting to UTC) means the string still reads
 *  as the local time a human was told, which is what schema.org's own Event examples do and what a
 *  reader comparing the page to its markup expects.
 *
 *  Returns null on empty/invalid input, so a caller can omit the field rather than publish a guess. */
export function eventIsoWithOffset(
  storedIso: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  if (!storedIso) return null
  const stored = new Date(storedIso)
  if (Number.isNaN(stored.getTime())) return null
  const tz = resolveZone(timezone)
  const instant = eventInstant(storedIso, tz)
  if (!instant) return null
  // ⚠️ THE OFFSET IS DERIVED FROM `eventInstant`'S OWN ANSWER, not read independently with
  // `zoneOffsetMinutes`. Wall-clock minus instant is exact by construction, so this string can never
  // disagree with the function that decides whether an event has started — and the first version of
  // this line, which read the offset at the instant, did disagree by an hour. Its own test caught it:
  // a wall clock inside the spring-forward gap (02:30 on a US DST morning) does not exist, and
  // `zonedWallClockToInstant` resolves it forward while a fresh offset read resolved it back. Both
  // answers are defensible; two different answers from one system are not.
  const offset = Math.round((stored.getTime() - instant.getTime()) / 60000)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  const wall =
    `${stored.getUTCFullYear()}-${pad(stored.getUTCMonth() + 1)}-${pad(stored.getUTCDate())}` +
    `T${pad(stored.getUTCHours())}:${pad(stored.getUTCMinutes())}:${pad(stored.getUTCSeconds())}`
  return `${wall}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Calendar day (YYYY-MM-DD) for `at` as seen in `timezone`. Listing "today" boundary. */
export function dayInZone(at: Date = new Date(), timezone: string | null | undefined = HOME_TZ): string {
  const tz = resolveZone(timezone)
  try {
    return at.toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

type WhenStyle = 'full' | 'date' | 'time' | 'dayTime'

/** Render an event's when-line. By default it shows the event's OWN local wall-clock
 *  (the stored UTC parts) with the event zone's abbrev — "an event happens at 7:00 PM
 *  in its city". Pass `viewerTz` to instead show the time converted into the viewer's
 *  zone (their local experience). Always emits the zone abbrev so the time is unambiguous. */
export function formatEventWhen(
  storedIso: string | null | undefined,
  timezone: string | null | undefined,
  opts: { style?: WhenStyle; viewerTz?: string | null; withZone?: boolean } = {},
): string {
  if (!storedIso) return ''
  const eventTz = resolveZone(timezone)
  const style = opts.style ?? 'full'
  const withZone = opts.withZone ?? true

  // Which zone we render in, and which instant we format (both branches below assign).
  let renderTz: string
  let instant: Date
  const stored = new Date(storedIso)
  if (Number.isNaN(stored.getTime())) return ''
  if (opts.viewerTz && isValidTimeZone(opts.viewerTz) && opts.viewerTz !== eventTz) {
    // Convert to the viewer's zone: resolve the true instant, format in viewer tz.
    renderTz = opts.viewerTz
    instant = eventInstant(storedIso, eventTz) ?? stored
  } else {
    // Show the event's own wall-clock: the stored UTC parts, read back in UTC.
    renderTz = 'UTC'
    instant = stored
  }

  const dateOpts: Intl.DateTimeFormatOptions =
    style === 'time'
      ? { hour: 'numeric', minute: '2-digit' }
      : style === 'date'
        ? { weekday: 'short', month: 'short', day: 'numeric' }
        : style === 'dayTime'
          ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
          : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }

  let out: string
  try {
    out = new Intl.DateTimeFormat('en-US', { timeZone: renderTz, ...dateOpts }).format(instant)
  } catch {
    return ''
  }
  if (withZone && style !== 'date') {
    // Abbrev for the zone we actually rendered in, at this instant.
    const abbrevTz = renderTz === 'UTC' ? eventTz : renderTz
    const abbrevInstant = renderTz === 'UTC' ? (eventInstant(storedIso, eventTz) ?? stored) : instant
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: abbrevTz, timeZoneName: 'short' }).formatToParts(abbrevInstant)
      const abbr = parts.find((p) => p.type === 'timeZoneName')?.value
      if (abbr) out += ` ${abbr}`
    } catch {
      /* no abbrev */
    }
  }
  return out
}

/** IANA zone for a coordinate, via tz-lookup (accurate worldwide). Falls back to HOME
 *  for out-of-range or unresolvable coordinates. */
export function tzFromLatLng(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return HOME_TZ
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return HOME_TZ
  try {
    const tz = tzlookup(lat, lng)
    return isValidTimeZone(tz) ? tz : HOME_TZ
  } catch {
    return HOME_TZ
  }
}
