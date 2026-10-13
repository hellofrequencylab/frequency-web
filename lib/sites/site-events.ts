// THE SITE'S OWN DATES, IN THEIR OWN ZONE (LIVE-905, owner 2026-10-13: "Every Circle Night / meetup date
// must appear on the wheel", and the live site's "Next Circle Night" reading "Wed Nov 4 · 2:00 AM" for an
// event at 6:00 PM in Los Angeles).
//
// Two pure jobs a Space website's readers share, so the chrome's date line, the page sections and the
// Wildheart blocks cannot disagree about when a gathering is:
//
//   1. THE ZONE. A row the Wildheart seed wrote (scripts/seed-wildheart.sql) is a TRUE INSTANT (`timestamp
//      '2026-11-03 18:00' at time zone 'America/Los_Angeles'` = 2026-11-04T02:00Z) beside its own
//      `time_zone`. Every renderer on the site reads a timestamp's UTC parts as the wall clock (the product's
//      storage convention, lib/time/zone.ts), which is how 6:00 PM read as 2:00 AM the next day. The fold
//      here turns the instant into the wall clock IN THE EVENT'S OWN ZONE (falling back to the Space's, then
//      to Los Angeles) with Intl.DateTimeFormat, once, at the read boundary, so the one formatter every
//      surface already uses (lib/sites/menswork-page.ts dateLabel) prints "Tue Nov 3 · 6:00 PM".
//
//   2. THE SERIES. A recurring anchor (`recurrence_rule` 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU') is one row; the
//      daily cron materialises sixty days of children (lib/event-recurrence.ts). The wheel shows a year, so
//      the series is expanded across the asked window here, through the ONE rule engine
//      (lib/events/repeat-rule.ts expandRepeat, never a second copy of the maths), in the event's zone:
//      the anchor's wall clock is handed to the engine as the UTC parts it expects, and each landing is
//      resolved back to an instant through the zone, so a fortnightly Tuesday stays a Tuesday at 6:00 PM
//      across a DST change. A day a materialised child already holds is not minted twice; a cancelled
//      child's day is left empty; cancelled rows never reach the page.
//
// PURE: no React, no Next, no database, no clock of its own (the caller passes `now`). Imported by the
// site readers (lib/sites/menswork-data.ts, server) and by the Wildheart block (components/page-editor/
// blocks/wildheart.tsx, a Server Component). Never by a client island.

import { expandRepeat, repeatFor } from '@/lib/events/repeat-rule'
import { HOME_TZ, isValidTimeZone, zonedWallClockToInstant } from '@/lib/time/zone'

/** The columns a site event carries for the zone fold and the series expansion. Every field but the
 *  identity and the start is optional, so the lean metadata shapes (lib/spaces/content-data.ts
 *  SpaceEventItem, lib/sites/menswork-data.ts MwEvent) satisfy it as they are. */
export interface SiteEventRow {
  id: string
  slug?: string | null
  title: string
  startsAt: string
  endsAt?: string | null
  /** The event's own IANA zone (events.time_zone). */
  timeZone?: string | null
  recurrenceType?: string | null
  recurrenceRule?: string | null
  recurrenceUntil?: string | null
  parentEventId?: string | null
  isCancelled?: boolean | null
}

/** The zone a site event's times are read in: its own `time_zone`, else the Space's, else home
 *  (America/Los_Angeles, lib/time/zone.ts HOME_TZ). */
export function siteEventZone(eventZone: string | null | undefined, spaceZone?: string | null): string {
  if (isValidTimeZone(eventZone)) return eventZone
  if (isValidTimeZone(spaceZone)) return spaceZone
  return HOME_TZ
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A stored timestamp as a true instant. A naive value (no Z, no offset) is read as UTC, never as the
 *  machine's zone (LIVE-377). Null when it cannot be read. */
export function siteInstant(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || !iso.trim()) return null
  const trimmed = iso.trim()
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`
  const d = new Date(withZone)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The wall-clock parts of an instant as seen in `timeZone`, through Intl.DateTimeFormat. */
function wallPartsInZone(instant: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instant)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    const p = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') === 24 ? 0 : get('hour'), minute: get('minute'), second: get('second') }
    return Object.values(p).some((n) => Number.isNaN(n)) ? null : p
  } catch {
    return null
  }
}

/** A stored instant as the wall clock in `timeZone`, as a naive ISO string ("2026-11-03T18:00:00"): the
 *  shape every site formatter reads as the local time. The input comes back unchanged when it cannot be
 *  read, so a bad row prints what it holds rather than nothing. */
export function wallClockInZone(iso: string, timeZone: string): string {
  const instant = siteInstant(iso)
  if (!instant) return iso
  const p = wallPartsInZone(instant, timeZone)
  if (!p) return iso
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

/** The calendar day ("2026-11-03") of a stored instant in `timeZone`. */
export function dayInZoneOf(iso: string, timeZone: string): string {
  return wallClockInZone(iso, timeZone).slice(0, 10)
}

/** THE date label for a site event, in the event's own zone: "Tue Nov 3" and "6:00 PM", through
 *  Intl.DateTimeFormat with `timeZone`. Midnight reads as an all-day event (no time), the way every site
 *  surface already treats it. */
export function zonedDateLabel(iso: string, timeZone: string): { day: string; time: string | null } {
  const instant = siteInstant(iso)
  if (!instant) return { day: iso, time: null }
  try {
    const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(instant).replace(',', '')
    const p = wallPartsInZone(instant, timeZone)
    if (!p || (p.hour === 0 && p.minute === 0)) return { day, time: null }
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant)
    return { day, time }
  } catch {
    return { day: iso, time: null }
  }
}

/** Fold one row's times into the wall clock of its own zone (the stored instant read in `time_zone`),
 *  so every downstream formatter prints the local time. The zone rides along for a surface that needs it. */
export function foldSiteEvent<T extends SiteEventRow>(row: T, spaceZone?: string | null): Omit<T, 'timeZone'> & { timeZone: string } {
  const zone = siteEventZone(row.timeZone, spaceZone)
  return { ...row, startsAt: wallClockInZone(row.startsAt, zone), endsAt: row.endsAt ? wallClockInZone(row.endsAt, zone) : row.endsAt ?? null, timeZone: zone }
}

interface ExpandSiteSeriesOptions {
  /** The last instant an occurrence may start, inclusive. */
  through: Date
  /** Occurrences before this instant are not minted (the anchor and the rows given always stay). */
  from?: Date | null
  /** The Space's zone, for a row with no `time_zone` of its own. */
  spaceZone?: string | null
  /** The most occurrences one anchor mints. A fortnightly series makes 26 a year; the bound stops a
   *  malformed rule from spinning. */
  max?: number
}

/** How many occurrences one anchor may mint across a window. Two years of a weekly series. */
const MAX_SITE_OCCURRENCES = 120

const isAnchor = (row: SiteEventRow) => !row.parentEventId && !!row.recurrenceType && row.recurrenceType !== 'none'

/**
 * The rows a site shows for a window: the rows given (cancelled ones dropped) plus every occurrence each
 * recurring anchor's rule lands on through `through`, minted in the anchor's own zone and skipped where a
 * child row (live or cancelled) already holds the day. A minted occurrence carries the anchor's title,
 * note and slug (its page is the series' page), `parentEventId` the anchor, and an id of the anchor's
 * plus the day. The result is sorted by start.
 */
export function expandSiteSeries<T extends SiteEventRow>(rows: readonly T[], opts: ExpandSiteSeriesOptions): T[] {
  const max = Math.max(1, Math.min(opts.max ?? MAX_SITE_OCCURRENCES, MAX_SITE_OCCURRENCES))
  const fromMs = opts.from && !Number.isNaN(opts.from.getTime()) ? opts.from.getTime() : null
  const out: T[] = rows.filter((r) => !r.isCancelled)
  for (const anchor of rows) {
    if (!isAnchor(anchor) || anchor.isCancelled) continue
    const zone = siteEventZone(anchor.timeZone, opts.spaceZone)
    const start = siteInstant(anchor.startsAt)
    if (!start) continue
    // The engine reads UTC parts as the wall clock: hand it the anchor's wall clock in its zone (the rule's
    // weekday too, when a row carries only the coarse cadence), and read each landing back through the
    // zone, so the weekday and the hour hold across a DST change.
    const wall = wallClockInZone(anchor.startsAt, zone)
    const rule = repeatFor({ starts_at: `${wall}Z`, recurrence_type: anchor.recurrenceType, recurrence_rule: anchor.recurrenceRule ?? null })
    if (!rule) continue
    const wallThrough = wallClockInZone(opts.through.toISOString(), zone)
    const untilInstant = anchor.recurrenceUntil ? siteInstant(anchor.recurrenceUntil) : null
    const landings = expandRepeat(`${wall}Z`, rule, {
      through: new Date(`${wallThrough}Z`),
      until: untilInstant ? new Date(`${wallClockInZone(untilInstant.toISOString(), zone)}Z`) : null,
      includeAnchor: false,
      max,
    })
    const end = anchor.endsAt ? siteInstant(anchor.endsAt) : null
    const durationMs = end ? Math.max(0, end.getTime() - start.getTime()) : null
    // The days this series already holds: the anchor's own, and every child row's (a cancelled child
    // leaves its day empty rather than minting a replacement).
    const taken = new Set<string>([dayInZoneOf(anchor.startsAt, zone)])
    for (const r of rows) {
      const child = r.parentEventId === anchor.id || (!!anchor.slug && !!r.slug && r.id !== anchor.id && r.slug.startsWith(`${anchor.slug}-`))
      if (child) taken.add(dayInZoneOf(r.startsAt, siteEventZone(r.timeZone, opts.spaceZone)))
    }
    for (const landing of landings) {
      const instant = zonedWallClockToInstant(landing.getUTCFullYear(), landing.getUTCMonth() + 1, landing.getUTCDate(), landing.getUTCHours(), landing.getUTCMinutes(), landing.getUTCSeconds(), zone)
      if (fromMs !== null && instant.getTime() < fromMs) continue
      const day = dayInZoneOf(instant.toISOString(), zone)
      if (taken.has(day)) continue
      taken.add(day)
      out.push({
        ...anchor,
        id: `${anchor.id}:${day}`,
        startsAt: instant.toISOString(),
        endsAt: durationMs !== null ? new Date(instant.getTime() + durationMs).toISOString() : null,
        recurrenceType: 'none',
        recurrenceRule: null,
        recurrenceUntil: null,
        parentEventId: anchor.id,
        isCancelled: false,
      })
    }
  }
  return out.sort((a, b) => (siteInstant(a.startsAt)?.getTime() ?? 0) - (siteInstant(b.startsAt)?.getTime() ?? 0))
}
