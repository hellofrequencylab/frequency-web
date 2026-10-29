import { icsEventInstants, icsLocalWallTimes, rruleForRepeat, type VeventFields } from '@/lib/events/ics'
import { resolveZone } from '@/lib/time/zone'
import { normaliseExceptionDates, seriesRule } from './pencil-series'
import { monthDayLabel } from './planner/days'

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
  /** 'pencil' for a held date. Absent reads as a plain date. */
  kind?: string | null
  /** The day the Plan's hold lapses, when the row's Plan holds one. The route joins it on `plan_id`. */
  holdUntil?: string | null
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
  // A HELD DATE (a Pencil) reads as a hold on a subscriber's phone: tentative, named Hold, and, when
  // its Plan has a hold date, saying until when. A cancelled one stays cancelled.
  const held = ev.kind === 'pencil' && ev.status !== 'cancelled'
  const holdLine = held && ev.holdUntil ? `Held until ${monthDayLabel(ev.holdUntil)}. Released if nobody confirms.` : null
  const common = {
    uid: ev.id,
    summary: held ? `Hold: ${ev.title}` : ev.title,
    url,
    location: ev.location,
    description: [holdLine, ev.notes].filter(Boolean).join('\n\n') || null,
    cancelled: ev.status === 'cancelled',
    ...(held ? { tentative: true } : {}),
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

/** A to-do as the feed reads it. The columns are the CrmTask's own, so the route hands a task straight in. */
interface FeedTodo {
  id: string
  title: string
  dueAt: string | null
  planId: string | null
  startMinute?: number | null
  estMinutes?: number | null
}

/** A to-do with no estimate counts as half an hour, the same as the team load (lib/calendar/planner/team-load.ts). */
const DEFAULT_TODO_MINUTES = 30

/**
 * One to-do as a VEVENT. A to-do with a start time (crm_tasks.start_minute, a minute of the day in the
 * Space's zone) lands as a block of its estimate on that day, as a true instant through the zone; one
 * with only a day keeps the instant it always had, so a subscriber's calendar does not move it. A to-do
 * with no readable day has no place on a calendar and returns null.
 */
export function todoFeedFields(task: FeedTodo, zone: string | null | undefined, url: string): VeventFields | null {
  const due = Date.parse(task.dueAt ?? '')
  const day = (task.dueAt ?? '').slice(0, 10)
  if (Number.isNaN(due) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const common = {
    uid: `todo-${task.id}`,
    summary: task.title,
    url,
    location: null,
    description: task.planId ? 'Plan to-do' : null,
    cancelled: false,
  }
  const at = task.startMinute
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > 1439) {
    const start = new Date(due)
    return { ...common, start, end: start }
  }
  const [y, m, d] = day.split('-').map(Number)
  const wall = (minutes: number) => new Date(Date.UTC(y!, m! - 1, d!, 0, minutes)).toISOString()
  const length = task.estMinutes && task.estMinutes > 0 ? task.estMinutes : DEFAULT_TODO_MINUTES
  const { start, end } = icsEventInstants(wall(at), wall(at + length), zone)
  return { ...common, start, end }
}
