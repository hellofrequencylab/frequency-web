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
//
// RECURRING SERIES (the DST + day-31 feed fix, docs/META-SCAN-STATUS.md "ICS timezone rework"): a
// recurring ANCHOR VEVENT is emitted in LOCAL time — `DTSTART;TZID=<zone>:<wall-clock parts>` plus a
// VTIMEZONE block (buildVtimezone, deduped in renderCalendar) — NOT as a UTC instant. A bare UTC
// DTSTART + RRULE expands at one FIXED offset, so after a DST transition every occurrence rendered an
// hour off (a 7pm PST series showed 8pm in PDT); and per RFC 5545 FREQ=MONTHLY from a day-31 DTSTART
// SKIPS short months (Google/Apple both do) while our materializer CLAMPS to the month's last day
// (Jan 31 -> Feb 28), so the clamped occurrence vanished from subscribed calendars. Local-time
// DTSTART (the stored parts ARE the local time) + the BYMONTHDAY/BYSETPOS last-day idiom
// (rruleForRecurrence) + wall-clock EXDATEs (computeFeedExdates) make the client's expansion match
// the DB's materialized rows exactly. Non-recurring and masked VEVENTs keep the true-instant UTC
// form — a single instant has no expansion to drift.

import { eventInstant, resolveZone, zoneOffsetMinutes } from '@/lib/time/zone'
import { HORIZON_DAYS, expandOccurrenceInstants } from '@/lib/event-recurrence'

/** Format a Date's UTC parts as a LOCAL ICS timestamp: YYYYMMDDTHHMMSS (no Z). Used for the
 *  TZID-form DTSTART/DTEND/EXDATE of a recurring VEVENT, where the Date carries the stored
 *  wall-clock AS its UTC parts (the parts already ARE the event-local time). */
export function icsLocalStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  )
}

/** Format a JS Date as an ICS UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function icsStamp(d: Date): string {
  return icsLocalStamp(d) + 'Z'
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

/** The stored wall-clock {start,end} of an event row as Dates whose UTC PARTS are the event-local
 *  time — the values a recurring VEVENT's TZID-form DTSTART/DTEND stamp via icsLocalStamp. `end`
 *  defaults to start + 1h (a wall-clock hour) when absent. Counterpart of icsEventInstants, which
 *  resolves TRUE instants for the one-off UTC form. */
export function icsLocalWallTimes(
  startsAt: string,
  endsAt: string | null | undefined,
): { start: Date; end: Date } {
  const start = new Date(startsAt)
  const endParsed = endsAt ? new Date(endsAt) : null
  const end =
    endParsed && !Number.isNaN(endParsed.getTime()) ? endParsed : new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

/** Map the simple enum recurrence (ADR-007: daily/weekly/monthly) to an RFC 5545 RRULE value, or null
 *  for a one-time event. PURE.
 *
 *  `untilInstant` is the TRUE instant of the series end — resolve `recurrence_until` through the
 *  event's own zone (eventInstant) BEFORE passing it. RFC 5545 §3.8.5.3: whenever DTSTART is not
 *  floating (ours is either UTC or TZID-zoned), UNTIL MUST be a UTC date-time — so it stays a
 *  Z-stamp even on the local-time (TZID) recurring form.
 *
 *  `anchorDay` is the anchor's stored wall-clock day-of-month. A MONTHLY series anchored on day
 *  29/30/31 needs it: plain FREQ=MONTHLY from a day-31 DTSTART SKIPS short months per RFC 5545, but
 *  the materializer (lib/event-recurrence.ts occurrenceAt) CLAMPS to the month's last day (Jan 31 ->
 *  Feb 28). `BYMONTHDAY=<day-3>,<day-2>,<day-1>,<day>;BYSETPOS=-1` is the standard "last day <= N"
 *  idiom: the four candidate days always reach into February (>= 26), and BYSETPOS=-1 picks the
 *  latest one the month actually has — exactly the clamp. Day <= 28 exists in every month, so it
 *  needs no rider; daily/weekly ignore the day entirely. */
export function rruleForRecurrence(
  type: string | null | undefined,
  untilInstant?: Date | null,
  anchorDay?: number | null,
): string | null {
  const freq =
    type === 'daily' ? 'DAILY' : type === 'weekly' ? 'WEEKLY' : type === 'monthly' ? 'MONTHLY' : null
  if (!freq) return null
  let rule = `FREQ=${freq}`
  if (freq === 'MONTHLY' && anchorDay != null && anchorDay >= 29 && anchorDay <= 31) {
    rule += `;BYMONTHDAY=${anchorDay - 3},${anchorDay - 2},${anchorDay - 1},${anchorDay};BYSETPOS=-1`
  }
  if (untilInstant && !Number.isNaN(untilInstant.getTime())) rule += `;UNTIL=${icsStamp(untilInstant)}`
  return rule
}

/** The fields one VEVENT block needs. Two forms, keyed by `tzid`:
 *  - `tzid` ABSENT (one-off / masked): `start`/`end` are TRUE instants (via icsEventInstants),
 *    stamped as UTC (`DTSTART:...Z`).
 *  - `tzid` SET (recurring anchor): `start`/`end` are the stored wall-clock parts (via
 *    icsLocalWallTimes), stamped as `DTSTART;TZID=<tzid>:...` so the client expands the RRULE in the
 *    event's zone (DST-correct). The calendar MUST then include a VTIMEZONE for the zone —
 *    renderCalendar's `tzids` handles that.
 *  Optional text fields are omitted when absent so a masked feed can drop the venue/description. */
export interface VeventFields {
  uid: string
  start: Date
  end: Date
  summary: string
  url?: string | null
  location?: string | null
  description?: string | null
  rrule?: string | null
  /** Resolved IANA zone for the LOCAL-time recurring form (see above). Pass resolveZone(row.time_zone)
   *  alongside `rrule`; leave unset for the one-off UTC form. */
  tzid?: string | null
  /** Occurrences to SUBTRACT from the RRULE expansion — cancelled or deleted dates the client must not
   *  resurrect. Each becomes one `EXDATE` line after the RRULE, in the SAME form as DTSTART (RFC 5545
   *  §3.8.5.1 requires the forms to match): wall-clock Dates + TZID when `tzid` is set (what
   *  computeFeedExdates returns), true UTC instants otherwise. Only meaningful alongside `rrule`;
   *  ignored (harmless) on a one-off VEVENT. */
  exdates?: Date[] | null
  cancelled?: boolean
}

/** Build one VEVENT block (BEGIN..END) as an array of already-folded lines. DTSTAMP is stamped from
 *  `now` (defaulted, injectable for deterministic tests). */
export function buildVevent(ev: VeventFields, now: Date = new Date()): string[] {
  const tzid = ev.tzid || null
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${ev.uid}@frequency`,
    `DTSTAMP:${icsStamp(now)}`,
    // TZID form (recurring): the stored wall-clock parts in the event's zone, so the client expands
    // the series locally and DST never shifts the hour. UTC form (one-off): the true instant.
    tzid ? foldLine(`DTSTART;TZID=${tzid}:${icsLocalStamp(ev.start)}`) : `DTSTART:${icsStamp(ev.start)}`,
    tzid ? foldLine(`DTEND;TZID=${tzid}:${icsLocalStamp(ev.end)}`) : `DTEND:${icsStamp(ev.end)}`,
    foldLine(`SUMMARY:${icsEscape(ev.summary)}`),
  ]
  // RRULE carries the recurrence cadence (structured value, no text escaping); a client expands the
  // series from DTSTART, so the single VEVENT becomes the whole run.
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`)
  // EXDATE subtracts specific occurrences from the RRULE expansion (RFC 5545 §3.8.5.1) — one line per
  // cancelled/missing date, in the SAME form as DTSTART (TZID local or UTC) so it actually matches
  // the instants the client generated. Emit after RRULE so a parser reads them as exceptions to the
  // just-declared recurrence.
  if (ev.exdates && ev.exdates.length) {
    for (const ex of ev.exdates) {
      if (Number.isNaN(ex.getTime())) continue
      lines.push(tzid ? foldLine(`EXDATE;TZID=${tzid}:${icsLocalStamp(ex)}`) : `EXDATE:${icsStamp(ex)}`)
    }
  }
  if (ev.url) lines.push(foldLine(`URL:${icsEscape(ev.url)}`))
  if (ev.location) lines.push(foldLine(`LOCATION:${icsEscape(ev.location)}`))
  if (ev.description) lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`))
  if (ev.cancelled) lines.push('STATUS:CANCELLED')
  lines.push('END:VEVENT')
  return lines
}

/** RFC 5545 UTC-offset value (±HHMM) for a minutes-ahead-of-UTC offset. */
function icsUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.trunc(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
}

/** Day-of-month of the nth Sunday (n >= 1) or the LAST Sunday (n === -1) of a month (0-indexed). */
function sundayOfMonth(year: number, month0: number, n: number): number {
  if (n === -1) {
    const last = new Date(Date.UTC(year, month0 + 1, 0))
    return last.getUTCDate() - last.getUTCDay()
  }
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay()
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7
}

/** True when `tz` switches from exactly `fromOff` to exactly `toOff` minutes at `instantMs`. */
function zoneSwitchesAt(tz: string, instantMs: number, fromOff: number, toOff: number): boolean {
  return (
    zoneOffsetMinutes(new Date(instantMs - 60000), tz) === fromOff &&
    zoneOffsetMinutes(new Date(instantMs), tz) === toOff
  )
}

/**
 * PURE. A minimal-but-correct VTIMEZONE block (array of lines) for an IANA zone, required by every
 * `DTSTART;TZID=...` VEVENT (RFC 5545 §3.6.5 — a TZID must reference a VTIMEZONE in the same
 * calendar). Hand-maintaining tzdata would rot, so the rules are DERIVED by probing the runtime's
 * own Intl tz database (zoneOffsetMinutes) for the probe year (`now`, injectable for tests):
 *
 * - No offset change across the year (UTC, America/Phoenix, fixed-offset zones): one STANDARD block.
 * - Northern-hemisphere DST whose actual transition instants match the US pattern (2nd Sun Mar /
 *   1st Sun Nov at 02:00 local) or the EU pattern (last Sun Mar / last Sun Oct at 01:00 UTC):
 *   the standard RRULE-based DAYLIGHT+STANDARD pair, valid indefinitely.
 * - Anything else (southern hemisphere, bespoke rules): a single STANDARD block at the zone's
 *   offset AT `now` — correct for every occurrence until the zone's next transition; degrades
 *   gracefully instead of emitting a wrong rule.
 */
export function buildVtimezone(tzid: string, now: Date = new Date()): string[] {
  const year = now.getUTCFullYear()
  const janOff = zoneOffsetMinutes(new Date(Date.UTC(year, 0, 15, 12)), tzid)
  const julOff = zoneOffsetMinutes(new Date(Date.UTC(year, 6, 15, 12)), tzid)

  const fixedBlock = (off: number): string[] => [
    'BEGIN:VTIMEZONE',
    `TZID:${tzid}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${icsUtcOffset(off)}`,
    `TZOFFSETTO:${icsUtcOffset(off)}`,
    'END:STANDARD',
    'END:VTIMEZONE',
  ]

  if (janOff === julOff) return fixedBlock(janOff)

  if (julOff > janOff) {
    const std = janOff
    const dst = julOff

    // US pattern: forward 2nd Sunday of March at 02:00 standard, back 1st Sunday of November at
    // 02:00 daylight. Verified against the REAL transition instants for the probe year, so a zone is
    // never mislabeled just for being in the Americas. 1970-03-08 / 1970-11-01 are the conventional
    // epoch-era DTSTART dates every major producer uses for these rules.
    const usSpring = Date.UTC(year, 2, sundayOfMonth(year, 2, 2), 2, 0) - std * 60000
    const usFall = Date.UTC(year, 10, sundayOfMonth(year, 10, 1), 2, 0) - dst * 60000
    if (zoneSwitchesAt(tzid, usSpring, std, dst) && zoneSwitchesAt(tzid, usFall, dst, std)) {
      return [
        'BEGIN:VTIMEZONE',
        `TZID:${tzid}`,
        'BEGIN:DAYLIGHT',
        'DTSTART:19700308T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        `TZOFFSETFROM:${icsUtcOffset(std)}`,
        `TZOFFSETTO:${icsUtcOffset(dst)}`,
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'DTSTART:19701101T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        `TZOFFSETFROM:${icsUtcOffset(dst)}`,
        `TZOFFSETTO:${icsUtcOffset(std)}`,
        'END:STANDARD',
        'END:VTIMEZONE',
      ]
    }

    // EU pattern: both transitions at 01:00 UTC — forward last Sunday of March, back last Sunday of
    // October. The DTSTART wall time is 01:00 UTC shifted by the offset in force BEFORE the change
    // (TZOFFSETFROM), so London springs at 01:00 local and Berlin at 02:00.
    const euSpring = Date.UTC(year, 2, sundayOfMonth(year, 2, -1), 1, 0)
    const euFall = Date.UTC(year, 9, sundayOfMonth(year, 9, -1), 1, 0)
    const springLocalMin = 60 + std
    const fallLocalMin = 60 + dst
    if (
      springLocalMin >= 0 &&
      springLocalMin < 1440 &&
      fallLocalMin >= 0 &&
      fallLocalMin < 1440 &&
      zoneSwitchesAt(tzid, euSpring, std, dst) &&
      zoneSwitchesAt(tzid, euFall, dst, std)
    ) {
      const localTime = (m: number) =>
        `${String(Math.trunc(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`
      return [
        'BEGIN:VTIMEZONE',
        `TZID:${tzid}`,
        'BEGIN:DAYLIGHT',
        `DTSTART:19700329T${localTime(springLocalMin)}`,
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        `TZOFFSETFROM:${icsUtcOffset(std)}`,
        `TZOFFSETTO:${icsUtcOffset(dst)}`,
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        `DTSTART:19701025T${localTime(fallLocalMin)}`,
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        `TZOFFSETFROM:${icsUtcOffset(dst)}`,
        `TZOFFSETTO:${icsUtcOffset(std)}`,
        'END:STANDARD',
        'END:VTIMEZONE',
      ]
    }
  }

  // Neither template (southern hemisphere / bespoke rules): pin the CURRENT offset.
  return fixedBlock(zoneOffsetMinutes(now, tzid))
}

/** Wrap VEVENT blocks in a VCALENDAR envelope and render the final `text/calendar` body (CRLF line
 *  endings + trailing CRLF, per RFC 5545). `name`/`description` add the X-WR-CALNAME/CALDESC hints a
 *  feed shows as the subscribed calendar's title; omit them for a single-event export. `tzids` lists
 *  the resolved IANA zones the TZID-form (recurring) vevents reference — deduped here, each becomes
 *  ONE VTIMEZONE block emitted before the events, as RFC 5545 §3.6.5 requires. `now` seeds the
 *  VTIMEZONE probe year (injectable for deterministic tests). */
export function renderCalendar(opts: {
  vevents: string[][]
  name?: string
  description?: string
  tzids?: (string | null | undefined)[]
  now?: Date
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
  const zones = new Set((opts.tzids ?? []).filter((z): z is string => typeof z === 'string' && z.length > 0))
  for (const z of zones) lines.push(...buildVtimezone(z, opts.now))
  for (const block of opts.vevents) lines.push(...block)
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** The anchor shape the EXDATE math needs (stored wall-clock + cadence). */
export interface ExdateAnchor {
  starts_at: string
  recurrence_type: string | null | undefined
  recurrence_until: string | null | undefined
}

/** The wall-clock CALENDAR DAY (YYYY-MM-DD) of a stored-parts Date. Occurrences are deduped by day in
 *  materialization (the per-day slug), so the present-vs-expected match keys on the day, not the exact
 *  time — robust to a stored timestamp that differs by milliseconds. */
function wallDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * PURE. Given a recurring ANCHOR and the stored `starts_at` of the occurrences PRESENT in the feed for
 * that series (the anchor's own row + its non-cancelled child rows the feed returned), compute the
 * EXDATE values: the expected occurrences (the RRULE expansion from the anchor) that are NOT present,
 * so a cancelled or deleted date never RESURRECTS when the client expands the RRULE.
 *
 * WALL-CLOCK math: the anchor VEVENT's DTSTART is now the LOCAL form (`DTSTART;TZID=<zone>:<stored
 * parts>`), so a client expands the RRULE in wall-clock space — the very space the DB stores and the
 * materializer (lib/event-recurrence.ts) steps in. The expansion here therefore runs occurrenceAt over
 * the RAW stored starts_at (expandOccurrenceInstants), which steps wall-clock parts and clamps a
 * day-29/30/31 monthly into short months EXACTLY like the materialized child rows — so the expected
 * set, the DB rows, and the client's BYMONTHDAY/BYSETPOS expansion all agree, and a Feb-28 clamped
 * occurrence is matched as "present" instead of leaking out as a bogus EXDATE (the old absolute-space
 * version disagreed with the RRULE on those days). Present rows are matched by wall-clock day, and
 * `recurrence_until` is compared raw for the same reason. No zone is needed at all: everything stays
 * in the one shared wall-clock space.
 *
 * Correctness bound: the expansion runs to the MATERIALIZATION HORIZON (now + HORIZON_DAYS), NOT to the
 * last present occurrence. The feed only carries NON-cancelled rows, so a cancelled tail occurrence is
 * absent from `presentStartsAt`; bounding to the last present date would leave that tail cancellation
 * un-EXDATE'd and it would resurrect (the very failure this exists to prevent). Occurrences BEYOND the
 * horizon are simply not materialized yet — we do NOT EXDATE them, so the RRULE keeps generating the
 * ongoing series; a later poll (after the daily cron materializes them) either finds them present or, if
 * one is then cancelled, EXDATEs it. `now` is injectable for deterministic tests.
 *
 * Returns wall-clock Dates (UTC parts = the event-local time) ready for a TZID-form `exdates`
 * (buildVevent stamps them with icsLocalStamp). Non-recurring / unknown-cadence anchors return [].
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

  // Raw stored values in, wall-clock occurrences out — the exact series math the materializer runs
  // (same helper, same clamp), so EXDATE can never disagree with the DB about which days exist.
  const expected = expandOccurrenceInstants(
    {
      starts_at: anchor.starts_at,
      recurrence_type: type,
      recurrence_until: anchor.recurrence_until ?? null,
    },
    until,
  )
  const presentDays = new Set(presentStartsAt.map((s) => wallDayKey(new Date(s))))

  return expected.filter((d) => !presentDays.has(wallDayKey(d)))
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
 *  `exdates` (empty for a one-off; wall-clock Dates for the TZID local form when `rrule` is set). The
 *  route maps `row` to its own VEVENT fields. */
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
 * ANCHOR present in the feed, emit ONE plan carrying its RRULE (rruleForRecurrence + zone-resolved
 * UNTIL + the anchor's day-of-month for the monthly last-day idiom) and the EXDATEs for its
 * cancelled/missing occurrences (computeFeedExdates over the anchor + its in-feed children), and SKIP
 * those child rows (the RRULE covers them). Everything else — a non-recurring event, or an ORPHAN
 * child whose anchor is NOT in the feed (the anchor went private/cancelled/out of window) — stays its
 * OWN standalone VEVENT (rrule null, no exdates), so a child is never dropped just because its parent
 * is absent. Input order is preserved. `now` is injectable for deterministic tests.
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
      // UNTIL must be the TRUE UTC instant (RFC 5545: UTC whenever DTSTART is zoned); the anchor's
      // stored day-of-month drives the monthly short-month idiom in rruleForRecurrence.
      const untilInstant = r.recurrence_until ? eventInstant(r.recurrence_until, r.time_zone) : null
      const rrule = rruleForRecurrence(r.recurrence_type, untilInstant, new Date(r.starts_at).getUTCDate())
      const present = [r.starts_at, ...(childStartsByAnchor.get(r.id) ?? [])]
      const exdates = computeFeedExdates(
        {
          starts_at: r.starts_at,
          recurrence_type: r.recurrence_type,
          recurrence_until: r.recurrence_until,
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
