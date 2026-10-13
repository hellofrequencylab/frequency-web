// A SITE'S RECURRING SERIES ACROSS THE YEAR IT DRAWS (LIVE-905, owner 2026-10-13: "Every Circle Night /
// meetup date must appear on the wheel").
//
// A recurring anchor (`recurrence_rule` 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU') is one row; the daily cron
// materialises sixty days of children (lib/event-recurrence.ts). A Space website draws a whole year, so
// it expands the anchor across the asked window here, through the ONE rule engine (lib/events/
// repeat-rule.ts expandRepeat, never a second copy of the maths). A day a materialised child already
// holds is not minted twice; a cancelled child's day is left empty; cancelled rows never reach the page.
//
// THE STORED CONVENTION IS THE ONLY CONVENTION (lib/time/zone.ts): `starts_at` holds the host's wall
// clock as UTC parts (6:00 PM in Los Angeles is 2026-11-03T18:00:00Z), read in `events.time_zone`. The
// engine steps those parts by the rule and the occurrence is stored the same way, so no zone round trip
// touches an occurrence; the zone matters only when a start is compared against NOW (eventInstant).
//
// PURE: no React, no Next, no database, no clock of its own. Imported by the site reader (lib/sites/
// menswork-data.ts, server) and by the Wildheart block (a Server Component). Never by a client island.

import { expandRepeat, repeatFor } from '@/lib/events/repeat-rule'

/** The columns a site event carries for the expansion. Every field but the identity and the start is
 *  optional, so the lean metadata shapes (lib/spaces/content-data.ts SpaceEventItem, lib/sites/
 *  menswork-data.ts MwEvent) satisfy it as they are. */
export interface SiteEventRow {
  id: string
  slug?: string | null
  title: string
  /** The wall clock as UTC parts (lib/time/zone.ts). */
  startsAt: string
  endsAt?: string | null
  /** The event's own IANA zone (events.time_zone), for a reader comparing against now. */
  timeZone?: string | null
  recurrenceType?: string | null
  recurrenceRule?: string | null
  recurrenceUntil?: string | null
  parentEventId?: string | null
  isCancelled?: boolean | null
}

/** A stored wall clock as a Date whose UTC parts are the wall clock. A naive value (no Z, no offset) is
 *  read as UTC parts, never as the machine's zone (LIVE-377). Null when it cannot be read. */
export function storedWallClock(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || !iso.trim()) return null
  const trimmed = iso.trim()
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`
  const d = new Date(withZone)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The calendar day ("2026-11-03") a stored wall clock falls on. */
export const storedDay = (iso: string): string => storedWallClock(iso)?.toISOString().slice(0, 10) ?? iso.slice(0, 10)

interface ExpandSiteSeriesOptions {
  /** The last wall clock (as UTC parts) an occurrence may start on, inclusive. */
  through: Date
  /** Occurrences before this wall clock (as UTC parts) are not minted; the rows given always stay. */
  from?: Date | null
  /** The most occurrences one anchor mints. A fortnightly series makes 26 a year; the bound stops a
   *  malformed rule from spinning. */
  max?: number
}

/** How many occurrences one anchor may mint across a window. Two years of a weekly series. */
const MAX_SITE_OCCURRENCES = 120

const isAnchor = (row: SiteEventRow) => !row.parentEventId && !!row.recurrenceType && row.recurrenceType !== 'none'

/**
 * The rows a site shows for a window: the rows given (cancelled ones dropped) plus every occurrence each
 * recurring anchor's rule lands on through `through`, skipped where a child row (live or cancelled)
 * already holds the day. A minted occurrence carries the anchor's title, note and slug (its page is the
 * series' page), `parentEventId` the anchor, and an id of the anchor's plus the day. Sorted by start.
 */
export function expandSiteSeries<T extends SiteEventRow>(rows: readonly T[], opts: ExpandSiteSeriesOptions): T[] {
  const max = Math.max(1, Math.min(opts.max ?? MAX_SITE_OCCURRENCES, MAX_SITE_OCCURRENCES))
  const out: T[] = rows.filter((r) => !r.isCancelled)
  for (const anchor of rows) {
    if (!isAnchor(anchor) || anchor.isCancelled) continue
    const start = storedWallClock(anchor.startsAt)
    if (!start) continue
    const rule = repeatFor({ starts_at: start.toISOString(), recurrence_type: anchor.recurrenceType, recurrence_rule: anchor.recurrenceRule ?? null })
    if (!rule) continue
    const landings = expandRepeat(start.toISOString(), rule, {
      through: opts.through,
      until: anchor.recurrenceUntil ? storedWallClock(anchor.recurrenceUntil) : null,
      from: opts.from ?? null,
      includeAnchor: false,
      max,
    })
    const end = anchor.endsAt ? storedWallClock(anchor.endsAt) : null
    const durationMs = end ? Math.max(0, end.getTime() - start.getTime()) : null
    // The days this series already holds: the anchor's own, and every child row's (a cancelled child
    // leaves its day empty rather than minting a replacement).
    const taken = new Set<string>([storedDay(anchor.startsAt)])
    for (const r of rows) {
      const child = r.parentEventId === anchor.id || (!!anchor.slug && !!r.slug && r.id !== anchor.id && r.slug.startsWith(`${anchor.slug}-`))
      if (child) taken.add(storedDay(r.startsAt))
    }
    for (const landing of landings) {
      const day = landing.toISOString().slice(0, 10)
      if (taken.has(day)) continue
      taken.add(day)
      out.push({
        ...anchor,
        id: `${anchor.id}:${day}`,
        startsAt: landing.toISOString(),
        endsAt: durationMs !== null ? new Date(landing.getTime() + durationMs).toISOString() : null,
        recurrenceType: 'none',
        recurrenceRule: null,
        recurrenceUntil: null,
        parentEventId: anchor.id,
        isCancelled: false,
      })
    }
  }
  return out.sort((a, b) => (storedWallClock(a.startsAt)?.getTime() ?? 0) - (storedWallClock(b.startsAt)?.getTime() ?? 0))
}
