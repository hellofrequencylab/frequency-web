// Shared ICS (RFC 5545) building blocks for every calendar surface — the per-event export
// (app/events/[slug]/event.ics), the member feed (app/events/calendar/[token]), and the public
// per-space feed (app/spaces/[slug]/calendar.ics). Before this, each route carried its OWN copy of
// icsStamp/icsEscape/fold + a hand-rolled VEVENT, and they DRIFTED: the per-event route resolved the
// true UTC instant through the event's zone while the feed route stamped the raw wall-clock digits as
// UTC (a 7pm-PT event landed 7-8h off in every subscriber's calendar). Centralizing it here means the
// timezone fix lives in ONE place and every feed emits the correct absolute moment.
//
// THE TIMEZONE CONTRACT (lib/time/zone.ts): events.starts_at/ends_at store the host's wall-clock kept
// as UTC PARTS (7:00 PM -> 2026-07-01T19:00:00Z), interpreted in the event's own `time_zone`. To emit a
// calendar stamp a client will show at the correct absolute moment, you MUST resolve the true instant
// via eventInstant(storedIso, tz) FIRST — never stamp the stored string directly. `icsEventInstants`
// does exactly that; callers should always go through it rather than `new Date(row.starts_at)`.

import { eventInstant, resolveZone } from '@/lib/time/zone'

/** Format a JS Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function icsStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

/** Escape a text value per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. Any line break
 *  (CRLF, lone LF, OR lone CR) collapses to a literal `\n` so a malicious title/description can never
 *  smuggle a raw line ending that a lenient parser would treat as a new property or VEVENT. */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Fold a content line at 75 octets per RFC 5545 §3.1 (continuation lines start with a space).
 *  Our payload is ASCII/punctuation-heavy so a 75-CHAR split approximates the octet rule closely. */
export function foldLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let i = 0
  while (i < line.length) {
    chunks.push(line.slice(i, i + 75))
    i += 75
  }
  return chunks.join('\r\n ')
}

/** Resolve an event row's stored wall-clock (+ its zone) to the TRUE UTC {start,end} instants a
 *  calendar client should show. `end` defaults to start + 1h when absent. This is the ONE seam that
 *  applies the timezone contract; feeds must build their DTSTART/DTEND from these Dates. */
export function icsEventInstants(
  startsAt: string,
  endsAt: string | null | undefined,
  timeZone: string | null | undefined,
): { start: Date; end: Date } {
  const tz = resolveZone(timeZone)
  const start = eventInstant(startsAt, tz) ?? new Date(startsAt)
  const end = (endsAt ? eventInstant(endsAt, tz) : null) ?? new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

/** The fields one VEVENT block needs. `start`/`end` are already TRUE instants (via icsEventInstants);
 *  optional text fields are omitted when absent so a masked feed can drop the venue/description. */
export interface VeventFields {
  uid: string
  start: Date
  end: Date
  summary: string
  url?: string | null
  location?: string | null
  description?: string | null
  cancelled?: boolean
}

/** Build one VEVENT block (BEGIN..END) as an array of already-folded lines. DTSTAMP is stamped from
 *  `now` (defaulted, injectable for deterministic tests). */
export function buildVevent(ev: VeventFields, now: Date = new Date()): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${ev.uid}@frequency`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART:${icsStamp(ev.start)}`,
    `DTEND:${icsStamp(ev.end)}`,
    foldLine(`SUMMARY:${icsEscape(ev.summary)}`),
  ]
  if (ev.url) lines.push(foldLine(`URL:${icsEscape(ev.url)}`))
  if (ev.location) lines.push(foldLine(`LOCATION:${icsEscape(ev.location)}`))
  if (ev.description) lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`))
  if (ev.cancelled) lines.push('STATUS:CANCELLED')
  lines.push('END:VEVENT')
  return lines
}

/** Wrap VEVENT blocks in a VCALENDAR envelope and render the final `text/calendar` body (CRLF line
 *  endings + trailing CRLF, per RFC 5545). `name`/`description` add the X-WR-CALNAME/CALDESC hints a
 *  feed shows as the subscribed calendar's title; omit them for a single-event export. */
export function renderCalendar(opts: {
  vevents: string[][]
  name?: string
  description?: string
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frequency//Community Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  if (opts.name) lines.push(foldLine(`X-WR-CALNAME:${icsEscape(opts.name)}`))
  if (opts.description) lines.push(foldLine(`X-WR-CALDESC:${icsEscape(opts.description)}`))
  for (const block of opts.vevents) lines.push(...block)
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
