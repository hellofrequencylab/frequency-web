import { icsEventInstants, icsLocalWallTimes, rruleForRepeat, type VeventFields } from '@/lib/events/ics'
import { resolveZone } from '@/lib/time/zone'
import { normaliseExceptionDates, seriesRule } from './pencil-series'

// THE PRIVATE FEED'S VIEW OF ONE ENTRY (PROG-CAL13). Pure: the VEVENT fields a private calendar entry
// becomes, so app/calendar/private/[token]/route.ts maps rows and lib/events/ics.ts stamps them.
//
// A REPEATING PENCIL IS ONE SERIES HERE TOO. The row is one master anchored on its first date, and
// the feed emits it as ONE VEVENT: the anchor in the TZID local form (the stored parts ARE the wall
// clock in `time_zone`, lib/calendar/entries.ts) plus an RRULE in the dialect events already export
// (`rruleForRepeat`, ADR-1299) and one EXDATE per day in `exception_dates`, each at the master's own
// wall clock on that day and in the SAME form as DTSTART (RFC 5545 §3.8.5.1). A subscriber's calendar
// draws the series itself and keeps the deliberate gap; nothing here emits one VEVENT per landing.
// A one-off keeps the true-instant UTC form every feed uses (`icsEventInstants`).

/** The columns the feed reads off a private entry. `recurrence_rule` and `exception_dates` are
 *  optional so a read that did not project them still renders every row as a one-off. */
export interface FeedEntryRow {
  id: string
  title: string
  notes: string | null
  location: string | null
  starts_at: string
  ends_at: string
  time_zone: string | null
  status: string
  recurrence_rule?: string | null
  exception_dates?: readonly string[] | null
  /** The Plan the entry belongs to, when it does. The private feed keys a co-host's shared dates
   *  on it (LIVE-546); a read that did not project it renders the row as the feed Space's own. */
  plan_id?: string | null
}

// SHARED PLANS ON A GUEST'S PHONES (PROG-CAL7 Together, LIVE-546). A co-host Space's private feed
// carries the dates and to-dos of the Plans shared with it, SHARED PLANS ONLY (the row's own
// default answers PROG-CAL7's open question: never the host's whole private layer), each summary
// prefixed with the host Space's name so a subscriber can tell whose date it is. The route resolves
// the ACCEPTED shares whose guest is the feed Space and reads the host rows keyed by those plan ids;
// this fold prefixes and merges them, own rows first, and drops a shared row whose host it cannot
// name rather than serve a date nobody can place.

/** The summary a shared row reads as on the subscriber's phone. */
export function sharedFeedSummary(hostName: string, title: string): string {
  return `${hostName}: ${title}`
}

/** Own rows first, then the shared rows with their host's name in front, never doubled. */
export function withSharedPlanRows<T extends { id: string; title: string }>(
  own: readonly T[],
  shared: readonly T[],
  hostNameFor: (row: T) => string | null | undefined,
): T[] {
  const seen = new Set(own.map((r) => r.id))
  const out: T[] = [...own]
  for (const row of shared) {
    if (seen.has(row.id)) continue
    const host = hostNameFor(row)
    if (!host) continue
    seen.add(row.id)
    out.push({ ...row, title: sharedFeedSummary(host, row.title) })
  }
  return out
}

/** The wall clock of a skipped day: the master's stored time of day on that date, as UTC parts,
 *  which is what `buildVevent` stamps for a TZID-form EXDATE. */
function exceptionWallTime(day: string, anchor: Date): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds()))
}

/** One entry as VEVENT fields: a one-off as a UTC instant, a repeating one as a single anchor carrying
 *  `rrule`, `tzid` and an `exdates` entry per skipped day. The caller adds `tzid` to the calendar's
 *  VTIMEZONE list whenever `rrule` is set. */
export function entryFeedFields(ev: FeedEntryRow, url: string): VeventFields {
  const common = {
    uid: ev.id,
    summary: ev.title,
    url,
    location: ev.location,
    description: ev.notes,
    cancelled: ev.status === 'cancelled',
  }
  const rule = seriesRule({ recurrence_rule: ev.recurrence_rule ?? null })
  if (!rule) {
    const { start, end } = icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)
    return { ...common, start, end }
  }
  const { start, end } = icsLocalWallTimes(ev.starts_at, ev.ends_at)
  return {
    ...common,
    start,
    end,
    tzid: resolveZone(ev.time_zone),
    // The entry's own rule, re-spelt only where events re-spell theirs (the day-29+ monthly clamp).
    rrule: rruleForRepeat({ starts_at: ev.starts_at, recurrence_rule: ev.recurrence_rule }, null, start.getUTCDate()),
    // THE STORED SKIP, carried to the subscriber: one EXDATE per deliberately skipped day.
    exdates: normaliseExceptionDates(ev.exception_dates).map((day) => exceptionWallTime(day, start)),
  }
}
