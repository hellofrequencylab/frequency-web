// The Repeats strip for the master month grid (/events/calendar, LIVE-081) — pure, no clock, no
// React, no database. Given the calendar feed rows plus the ANCHOR rows the caller fetched, it
// answers three questions the grid needs and nothing else:
//
//   1. which loaded rows belong to a series, and which single date of each series is "next"
//      (that one keeps its card; every later date collapses to a dot);
//   2. what each series is called and how often it lands, for the chips above the grid;
//   3. which FUTURE dates a series lands on beyond the materialised rows, so a weekly series is
//      still visible a year out instead of stopping dead at the 60-day horizon.
//
// ── THE TWO TRAPS THIS MODULE EXISTS TO SURVIVE ───────────────────────────────────────────────
//
// (1) `parent_event_id` IS THE GROUPING KEY, NOT `recurrence_type`. A materialised occurrence is a
//     real `events` row whose `recurrence_type` is the string 'none' (a DB CHECK forbids a child
//     from carrying a cadence, lib/event-recurrence.ts); only the anchor knows the cadence.
//     Grouping on cadence finds nothing at all. This module keys on seriesKey() from
//     lib/events/series.ts — `parent_event_id ?? id` — exactly like every other folding surface.
//
// (2) THE ANCHOR IS NOT IN THE FEED. `public_calendar_feed()` floors at `now() - 1 day`, so an
//     established series' anchor row aged out of the feed months ago and EVERY row the calendar
//     page holds reads `recurrence_type: 'none'`, `recurrence_until: null`. Measured against
//     production on 2026-08-24: both live weekly series (Breathe Connect Expand, Meld - Community
//     Cowork) had 0 of their anchors in the feed and 8 child rows each. So the cadence cannot be
//     recovered from the feed at all — the caller has to READ the anchors by id
//     (listSeriesAnchors, lib/events/store.ts) and hand them in. `missingAnchorIds()` below is the
//     list to read; `seriesAnchorIsLive()` is the gate to re-apply on what comes back.
//
// ── DISPLAY-ONLY FUTURE DATES ─────────────────────────────────────────────────────────────────
//
// Occurrences are materialised only HORIZON_DAYS (60) ahead, so "show a year of events" and
// "show repeating events" contradict each other today. The owner's ruling (LIVE-081) is to COMPUTE
// the later dates from the anchor's cadence for DISPLAY, and to say plainly in the UI that they are
// not open yet. `pendingDayKeys` is that set, and it is kept SEPARATE from `liveDayKeys` for
// exactly one reason: a computed date has no event row, so it has no page, no RSVP and no ticket,
// and the grid must never link a member into nothing. The materialiser is untouched.
//
// DAY KEYS, NOT INSTANTS. `events.starts_at` stores the host's wall clock as UTC PARTS, so the date
// portion of the string IS the event-local calendar day (lib/events/calendar-grid.ts). Every date
// here is that YYYY-MM-DD key, compared as a string (lexicographic order is chronological order for
// a zero-padded ISO day) and stepped with UTC arithmetic. No timezone library is involved, which is
// also what keeps this module importable from the client grid.

import { isSeriesCadence, seriesKey, type SeriesRow } from './series'

/** A calendar feed row, as the master feed RPC returns it (the fields this module reads). */
export interface RepeatFeedRow extends SeriesRow {
  title: string
  starts_at: string
}

/** An anchor row read back by id, with the columns its live-gate needs. */
export interface RepeatAnchorRow {
  id: string
  /** Nullable because `events.starts_at` is: a dateless draft can never be an anchor, and
   *  computeSeriesDayKeys returns nothing for one rather than inventing a start. */
  starts_at: string | null
  recurrence_type?: string | null
  recurrence_until?: string | null
  is_cancelled?: boolean | null
  status?: string | null
  visibility?: string | null
  removed_at?: string | null
  is_demo?: boolean | null
}

/** One chip in the Repeats strip. Plain primitives only: this crosses the RSC boundary. */
export interface CalendarRepeatSeries {
  /** parent_event_id ?? id — stable while the anchor is out of the window. */
  key: string
  /** The series name, taken from its next loaded date (never the word "anchor"; NAMING.md). */
  name: string
  /** How often it lands, in member words: "Thursdays", "Every day", "Monthly". */
  cadenceLabel: string
  /** The next date's page, or null when that row has no slug. */
  href: string | null
  /** Day keys that ARE real event rows (openable, RSVP-able). Earliest first. */
  liveDayKeys: string[]
  /** Day keys computed from the cadence past the materialised horizon. DISPLAY ONLY. */
  pendingDayKeys: string[]
}

export interface CalendarRepeatsPlan {
  /** One entry per series, ordered by its next date. */
  series: CalendarRepeatSeries[]
  /** Event ids that are a LATER date of their series: dot in the grid, not a card. */
  laterDateIds: string[]
  /** Event id -> its series key, for the highlight. Only ids that belong to a series. */
  seriesKeyByEventId: Record<string, string>
}

/** How far ahead the strip computes dates. A year, matching the operator listing horizon. */
export const REPEAT_LOOKAHEAD_DAYS = 365

/** Guard so a malformed anchor can never spin: 4000 steps mirrors lib/events/recurrence.ts. */
const MAX_STEPS = 4000

/** The date portion of a stored `starts_at` (the event-local day), or null when unusable. */
export function dayKeyOf(startsAt: string | null | undefined): string | null {
  if (typeof startsAt !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startsAt)
  return m ? m[1] : null
}

function keyToUTC(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`)
}

function utcToKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Days in a UTC month (month is 0-indexed) — mirrors the materialiser's monthly maths. */
function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** The day key `step` cadence-steps after `startKey`. Monthly clamps to the target month's length
 *  from the ORIGINAL day, so a 31st anchor lands Feb 28 and then Mar 31 again (never Mar 3). */
function stepKey(startKey: string, cadence: string, step: number): string {
  const start = keyToUTC(startKey)
  if (cadence === 'daily' || cadence === 'weekly') {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + step * (cadence === 'weekly' ? 7 : 1))
    return utcToKey(d)
  }
  // monthly
  const originalDay = start.getUTCDate()
  const totalMonths = start.getUTCMonth() + step
  const year = start.getUTCFullYear() + Math.floor(totalMonths / 12)
  const month = ((totalMonths % 12) + 12) % 12
  const day = Math.min(originalDay, daysInUTCMonth(year, month))
  return utcToKey(new Date(Date.UTC(year, month, day)))
}

const WEEKDAY_PLURALS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/**
 * The cadence half of a chip label, in member words. Weekly names the weekday it lands on
 * ("Thursdays") because that is what a member recognises; the internal words "occurrence" and
 * "anchor" never appear (NAMING.md §Events). A series whose anchor could not be read still gets a
 * chip, labelled "Repeats", rather than being dropped from the strip.
 */
export function cadenceChipLabel(cadence: string | null | undefined, referenceDayKey: string | null): string {
  if (cadence === 'daily') return 'Every day'
  if (cadence === 'monthly') return 'Monthly'
  if (cadence === 'weekly' && referenceDayKey) {
    const d = keyToUTC(referenceDayKey)
    if (!Number.isNaN(d.getTime())) return WEEKDAY_PLURALS[d.getUTCDay()]
  }
  return 'Repeats'
}

/**
 * The future day keys a series lands on, computed from its anchor. Returns keys STRICTLY AFTER
 * `afterDayKey` and at or before `throughDayKey`, stopping at `recurrence_until`. Empty for a
 * cadence this model does not have, an unparseable anchor, or a series that has already ended.
 */
export function computeSeriesDayKeys(
  anchor: Pick<RepeatAnchorRow, 'starts_at' | 'recurrence_type' | 'recurrence_until'>,
  opts: { afterDayKey: string; throughDayKey: string },
): string[] {
  const cadence = anchor.recurrence_type
  if (!isSeriesCadence(cadence)) return []
  const startKey = dayKeyOf(anchor.starts_at)
  if (!startKey) return []
  const untilKey = dayKeyOf(anchor.recurrence_until ?? null)
  const out: string[] = []
  for (let step = 0; step <= MAX_STEPS; step++) {
    const key = stepKey(startKey, cadence as string, step)
    if (key > opts.throughDayKey) break
    if (untilKey && key > untilKey) break
    if (key > opts.afterDayKey) out.push(key)
  }
  return out
}

/**
 * The anchor ids a caller must READ to label the strip: every `parent_event_id` on the rows that is
 * not itself one of the rows. Trap (2) in one function — on the master calendar this is normally
 * EVERY series, because the anchor's own date has long passed out of the feed window.
 */
export function missingAnchorIds(rows: RepeatFeedRow[]): string[] {
  const present = new Set<string>()
  for (const r of rows) if (r?.id) present.add(r.id)
  const want = new Set<string>()
  for (const r of rows) {
    const pid = r?.parent_event_id
    if (pid && !present.has(pid)) want.add(pid)
  }
  return [...want]
}

/**
 * The gate re-applied on an anchor read back by id, so a series that was ended, cancelled, hidden,
 * unpublished or staff-removed can never keep projecting dates onto a public calendar. Mirrors
 * masterCalendarIncludes (lib/events/store.ts) MINUS its date floor, which is the whole point: an
 * anchor is fetched precisely because its own date is in the past.
 */
export function seriesAnchorIsLive(a: RepeatAnchorRow): boolean {
  return (
    !!a &&
    !a.is_cancelled &&
    (a.status ?? 'published') === 'published' &&
    a.visibility === 'public' &&
    !a.removed_at &&
    a.is_demo !== true &&
    isSeriesCadence(a.recurrence_type)
  )
}

function instant(value: string | null | undefined): number {
  return typeof value === 'string' ? Date.parse(value) : NaN
}

/**
 * Plan the Repeats strip + the card/dot split for one loaded window of calendar rows.
 *
 * `rows` are the feed rows the grid already holds (upcoming, gated by the RPC). `anchors` are the
 * rows read back for `missingAnchorIds()`, already live-gated. `now` seeds the lookahead window and
 * is passed in so this stays pure.
 */
export function planCalendarRepeats(
  rows: RepeatFeedRow[],
  opts: { anchors?: RepeatAnchorRow[]; now: Date; lookaheadDays?: number },
): CalendarRepeatsPlan {
  const anchorById = new Map<string, RepeatAnchorRow>()
  for (const a of opts.anchors ?? []) if (a?.id) anchorById.set(a.id, a)

  const lookahead =
    typeof opts.lookaheadDays === 'number' && opts.lookaheadDays > 0
      ? Math.floor(opts.lookaheadDays)
      : REPEAT_LOOKAHEAD_DAYS
  const through = new Date(opts.now)
  through.setUTCDate(through.getUTCDate() + lookahead)
  const throughDayKey = utcToKey(through)

  // Bucket by series key, first-appearance order preserved.
  const order: string[] = []
  const buckets = new Map<string, RepeatFeedRow[]>()
  for (const row of rows) {
    if (!row || !row.id || Number.isNaN(instant(row.starts_at))) continue
    const key = seriesKey(row)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else {
      buckets.set(key, [row])
      order.push(key)
    }
  }

  const series: CalendarRepeatSeries[] = []
  const laterDateIds: string[] = []
  const seriesKeyByEventId: Record<string, string> = {}

  for (const key of order) {
    const bucket = buckets.get(key)!
    const anchorInRows = bucket.find((r) => r.parent_event_id == null && isSeriesCadence(r.recurrence_type)) ?? null
    const anchor: RepeatAnchorRow | null = anchorInRows ?? anchorById.get(key) ?? null
    // A row is part of a series when it carries a parent, or it IS an anchor with a real cadence.
    // The parent test is what survives trap (1): the children say 'none' and still belong.
    const recurring = bucket.some((r) => r.parent_event_id != null) || anchorInRows != null
    if (!recurring) continue

    // Earliest first by instant; ties break on id so the order is total.
    const byDate = [...bucket].sort((a, b) => {
      const d = instant(a.starts_at) - instant(b.starts_at)
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    const next = byDate[0]
    const liveDayKeys: string[] = []
    for (const r of byDate) {
      seriesKeyByEventId[r.id] = key
      const dk = dayKeyOf(r.starts_at)
      if (dk) liveDayKeys.push(dk)
    }
    // The NEXT date keeps its card. Every later date of the same series becomes a dot.
    for (const r of byDate.slice(1)) laterDateIds.push(r.id)

    const lastLive = liveDayKeys.length > 0 ? liveDayKeys[liveDayKeys.length - 1] : (dayKeyOf(next.starts_at) ?? '')
    const pendingDayKeys = anchor
      ? computeSeriesDayKeys(anchor, { afterDayKey: lastLive, throughDayKey })
      : []

    series.push({
      key,
      name: next.title,
      cadenceLabel: cadenceChipLabel(anchor?.recurrence_type ?? null, dayKeyOf(next.starts_at)),
      href: next.slug ? `/events/${next.slug}` : null,
      liveDayKeys,
      pendingDayKeys,
    })
  }

  series.sort((a, b) => {
    const ak = a.liveDayKeys[0] ?? ''
    const bk = b.liveDayKeys[0] ?? ''
    return ak < bk ? -1 : ak > bk ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  return { series, laterDateIds, seriesKeyByEventId }
}
