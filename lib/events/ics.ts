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
import { HORIZON_DAYS, expandOccurrenceInstants } from '@/lib/event-recurrence'

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

/** Map the simple enum recurrence (ADR-007: daily/weekly/monthly) to an RFC 5545 RRULE value, or null
 *  for a one-time event. `untilInstant` is the TRUE instant of the series end — resolve `recurrence_until`
 *  through the event's own zone (eventInstant) BEFORE passing it, since DTSTART here is a UTC date-time and
 *  RFC 5545 §3.8.5.3 requires UNTIL to match (UTC). PURE. The enum has no BYDAY/INTERVAL, so the RRULE is
 *  the plain cadence; a client expands it from DTSTART, matching the materialized occurrences. */
export function rruleForRecurrence(type: string | null | undefined, untilInstant?: Date | null): string | null {
  const freq =
    type === 'daily' ? 'DAILY' : type === 'weekly' ? 'WEEKLY' : type === 'monthly' ? 'MONTHLY' : null
  if (!freq) return null
  let rule = `FREQ=${freq}`
  if (untilInstant && !Number.isNaN(untilInstant.getTime())) rule += `;UNTIL=${icsStamp(untilInstant)}`
  return rule
}

/** The fields one VEVENT block needs. `start`/`end` are already TRUE instants (via icsEventInstants);
 *  optional text fields are omitted when absent so a masked feed can drop the venue/description. `rrule`
 *  (from rruleForRecurrence) turns a single VEVENT into a recurring series a calendar client expands. */
export interface VeventFields {
  uid: string
  start: Date
  end: Date
  summary: string
  url?: string | null
  location?: string | null
  description?: string | null
  rrule?: string | null
  /** TRUE UTC instants (via icsEventInstants) of occurrences to SUBTRACT from the RRULE expansion —
   *  cancelled or deleted dates the client must not resurrect. Each becomes one `EXDATE` line after the
   *  RRULE. Only meaningful alongside `rrule`; ignored (harmless) on a one-off VEVENT. */
  exdates?: Date[] | null
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
  // RRULE carries the recurrence cadence (structured value, no text escaping); a client expands the
  // series from DTSTART, so the single VEVENT becomes the whole run.
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)
  // EXDATE subtracts specific occurrences from the RRULE expansion (RFC 5545 §3.8.5.1) — one line per
  // cancelled/missing date, each stamped as a UTC instant matching how the client expands DTSTART. Emit
  // after RRULE so a parser reads them as exceptions to the just-declared recurrence.
  if (ev.exdates && ev.exdates.length) {
    for (const ex of ev.exdates) {
      if (!Number.isNaN(ex.getTime())) lines.push(`EXDATE:${icsStamp(ex)}`)
    }
  }
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

/** The anchor shape the EXDATE math needs (stored wall-clock + zone + cadence). */
export interface ExdateAnchor {
  starts_at: string
  recurrence_type: string | null | undefined
  recurrence_until: string | null | undefined
  time_zone: string | null | undefined
}

/** The UTC CALENDAR DAY (YYYY-MM-DD) of a TRUE instant. Occurrences are deduped by day in materialization
 *  (the per-day slug), and a resolved instant can differ by ms / an hour across a DST edge, so the
 *  present-vs-expected match keys on the day, not the exact instant — robust to that hour jitter. */
function instantDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * PURE. Given a recurring ANCHOR and the stored `starts_at` of the occurrences PRESENT in the feed for
 * that series (the anchor's own row + its non-cancelled child rows the feed returned), compute the
 * EXDATE instants: the expected occurrences (the RRULE expansion from the anchor) that are NOT present,
 * so a cancelled or deleted date never RESURRECTS when the client expands the RRULE.
 *
 * ABSOLUTE-SPACE math: DTSTART on the anchor VEVENT is the TRUE instant (via icsEventInstants), and a
 * calendar client expands DTSTART + RRULE in ABSOLUTE (UTC) time. So the expansion here seeds from the
 * anchor's true instant and steps in UTC (occurrenceAt), producing the exact instants the client would
 * generate — that is what an EXDATE must equal to suppress an occurrence. Present rows (stored wall-clock
 * parts) are resolved through the event's zone to their true instants and matched by UTC day, so a
 * cancelled/deleted date drops out and everything else stays. `recurrence_until` resolves through the
 * zone to the same instant the RRULE's UNTIL carries, so EXDATE never runs past the series end.
 *
 * Correctness bound: the expansion runs to the MATERIALIZATION HORIZON (now + HORIZON_DAYS), NOT to the
 * last present occurrence. The feed only carries NON-cancelled rows, so a cancelled tail occurrence is
 * absent from `presentStartsAt`; bounding to the last present date would leave that tail cancellation
 * un-EXDATE'd and it would resurrect (the very failure this exists to prevent). Occurrences BEYOND the
 * horizon are simply not materialized yet — we do NOT EXDATE them, so the RRULE keeps generating the
 * ongoing series; a later poll (after the daily cron materializes them) either finds them present or, if
 * one is then cancelled, EXDATEs it. `now` is injectable for deterministic tests.
 *
 * Returns TRUE UTC instants ready for `exdates`. Non-recurring / unknown-cadence anchors return [].
 */
export function computeFeedExdates(
  anchor: ExdateAnchor,
  presentStartsAt: string[],
  opts: { now?: Date; horizonDays?: number } = {},
): Date[] {
  const type = anchor.recurrence_type
  if (type !== 'daily' && type !== 'weekly' && type !== 'monthly') return []

  const now = opts.now ?? new Date()
  const horizonDays = opts.horizonDays ?? HORIZON_DAYS
  const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000)

  // Everything in absolute (true-instant) space — the space the client expands DTSTART+RRULE in.
  const anchorInstant = icsEventInstants(anchor.starts_at, null, anchor.time_zone).start
  const untilSeries = anchor.recurrence_until ? eventInstant(anchor.recurrence_until, anchor.time_zone) : null

  const expected = expandOccurrenceInstants(
    {
      starts_at: anchorInstant.toISOString(),
      recurrence_type: type,
      recurrence_until: untilSeries ? untilSeries.toISOString() : null,
    },
    until,
  )
  const presentDays = new Set(
    presentStartsAt.map((s) => instantDayKey(icsEventInstants(s, null, anchor.time_zone).start)),
  )

  return expected.filter((d) => !presentDays.has(instantDayKey(d)))
}

/** The minimal recurrence shape the feed grouping reads off each row (the columns the feed RPCs added in
 *  20261203000000). Structural, so a route's fuller row type satisfies it. */
export interface FeedGroupRow {
  id: string
  starts_at: string
  time_zone?: string | null
  recurrence_type?: string | null
  recurrence_until?: string | null
  parent_event_id?: string | null
}

/** One rendering instruction: emit `row` as a VEVENT with this `rrule` (null for a one-off) and these
 *  `exdates` (empty for a one-off). The route maps `row` to its own VEVENT fields. */
export interface FeedRenderPlan<T> {
  row: T
  rrule: string | null
  exdates: Date[]
}

/** True when a row is a recurring SERIES ANCHOR (a real cadence + no parent). */
function isRecurringAnchor(r: FeedGroupRow): boolean {
  const t = r.recurrence_type ?? 'none'
  return r.parent_event_id == null && (t === 'daily' || t === 'weekly' || t === 'monthly')
}

/**
 * PURE. Collapse a flat feed row list into VEVENT rendering instructions (Events EC4). For a recurring
 * ANCHOR present in the feed, emit ONE plan carrying its RRULE (rruleForRecurrence + zone-resolved UNTIL)
 * and the EXDATEs for its cancelled/missing occurrences (computeFeedExdates over the anchor + its
 * in-feed children), and SKIP those child rows (the RRULE covers them). Everything else — a non-recurring
 * event, or an ORPHAN child whose anchor is NOT in the feed (the anchor went private/cancelled/out of
 * window) — stays its OWN standalone VEVENT (rrule null, no exdates), so a child is never dropped just
 * because its parent is absent. Input order is preserved. `now` is injectable for deterministic tests.
 */
export function planCalendarFeed<T extends FeedGroupRow>(
  rows: T[],
  opts: { now?: Date; horizonDays?: number } = {},
): FeedRenderPlan<T>[] {
  // Anchors present in THIS feed, and each anchor's in-feed child occurrence start times.
  const anchorIds = new Set<string>()
  for (const r of rows) if (isRecurringAnchor(r)) anchorIds.add(r.id)

  const childStartsByAnchor = new Map<string, string[]>()
  for (const r of rows) {
    const pid = r.parent_event_id
    if (pid && anchorIds.has(pid)) {
      const list = childStartsByAnchor.get(pid) ?? []
      list.push(r.starts_at)
      childStartsByAnchor.set(pid, list)
    }
  }

  const plans: FeedRenderPlan<T>[] = []
  for (const r of rows) {
    // A child covered by an in-feed anchor is folded into that anchor's RRULE — skip it here.
    if (r.parent_event_id && anchorIds.has(r.parent_event_id)) continue

    if (isRecurringAnchor(r)) {
      const untilInstant = r.recurrence_until ? eventInstant(r.recurrence_until, r.time_zone) : null
      const rrule = rruleForRecurrence(r.recurrence_type, untilInstant)
      const present = [r.starts_at, ...(childStartsByAnchor.get(r.id) ?? [])]
      const exdates = computeFeedExdates(
        {
          starts_at: r.starts_at,
          recurrence_type: r.recurrence_type,
          recurrence_until: r.recurrence_until,
          time_zone: r.time_zone,
        },
        present,
        opts,
      )
      plans.push({ row: r, rrule, exdates })
      continue
    }

    // Non-recurring event OR an orphan child whose anchor is not in the feed — its own VEVENT.
    plans.push({ row: r, rrule: null, exdates: [] })
  }
  return plans
}
