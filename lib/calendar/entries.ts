import type { CalendarEvent } from './item'
import { shortDateLabel } from './short-date'
import { repeatChipLabel } from '@/lib/events/repeat-rule'
import { expandPencilSeries, normaliseExceptionDates, pencilRepeatRule, seriesRule, type SeriesWindow } from './pencil-series'
import {
  entryKind,
  entryStage,
  ENTRY_STATUSES,
  type EntryKind,
  type EntryStage,
  type EntryStatus,
  type EntryVisibility,
} from './registry'

// PRIVATE CALENDAR ENTRIES, the pure half (ADR-1385). Form parsing, the row <-> form mapping, the
// calendar item an entry renders as, and the true instant range a blocking entry removes from
// bookings. No Supabase, no React, and no timezone lib: the zone-dependent formatting is injected by
// the server adapter (lib/calendar/entries-store.ts) so this file stays unit-testable.
//
// TIME CONVENTION (the events one, lib/time/zone.ts): starts_at / ends_at store the Space's wall
// clock as UTC parts. All-day entries run 00:00 of the first day to 00:00 of the day AFTER the last.

/** A row of public.space_calendar_entries as the app reads it. */
export interface EntryRow {
  id: string
  space_id: string
  kind: EntryKind
  title: string
  notes: string | null
  location: string | null
  all_day: boolean
  starts_at: string
  ends_at: string
  time_zone: string
  status: EntryStatus
  blocks_time: boolean
  visibility: EntryVisibility
  option_group: string | null
  hold_expires_at: string | null
  /** An event on its way: how far along it is (ADR-1388). Null on every other kind. */
  stage: EntryStage | null
  /** An event on its way: the copy that becomes the published event's description. */
  description: string | null
  /** The Plan this date belongs to (ADR-1386). */
  plan_id: string | null
  /** The Production this Pencil BECAME (PROG-CAL3). Set on publish instead of deleting the row, so
   *  the date keeps its description, Team notes and hold and back-links its event. A row carrying
   *  one no longer renders as its own calendar item: the event card IS this date's card now, which
   *  is what ADR-1386's "rather than sitting beside it as a duplicate" asks for. */
  published_event_id: string | null
  /** REPEATING PENCILS (PROG-CAL5): the RFC 5545 rule in the ADR-1299 dialect, or null for a
   *  one-off. Parsed and expanded by lib/calendar/pencil-series.ts, never here. */
  recurrence_rule: string | null
  /** The day keys a repeating entry deliberately skips. Stored, never inferred: the generator drops
   *  them and only a person removing one brings the date back. Empty on a one-off. */
  exception_dates: string[]
}

export const ENTRY_COLS =
  'id, space_id, kind, title, notes, location, all_day, starts_at, ends_at, time_zone, status, blocks_time, visibility, option_group, hold_expires_at, stage, description, plan_id, published_event_id, recurrence_rule, exception_dates'

/** The staff form, as plain strings and booleans (what a client sends). */
export interface EntryInput {
  kind: string
  title: string
  notes?: string | null
  location?: string | null
  allDay: boolean
  /** YYYY-MM-DD */
  startDate: string
  /** YYYY-MM-DD, inclusive last day. */
  endDate: string
  /** HH:MM, ignored when allDay. */
  startTime?: string | null
  endTime?: string | null
  timeZone: string
  status?: string | null
  /** An event on its way: pencil | planning | production | cancelled. */
  stage?: string | null
  /** An event on its way: the public-facing description. */
  description?: string | null
  blocksTime: boolean
  showPublicly: boolean
  /** Pencils: YYYY-MM-DD the pencil lapses on, or empty. */
  holdExpiresOn?: string | null
  /** Pencil stage: more candidate start dates, each the same length as this one. */
  candidateDates?: string[] | null
  /** The Plan this date belongs to, if any. */
  planId?: string | null
  /** Pencils: how the date repeats, as an RRULE value of the ADR-1299 subset ('' or null for a
   *  one-off). The drawer writes one of PENCIL_REPEAT_CHOICES; anything the parser refuses is stored
   *  as null rather than half-honoured. */
  repeat?: string | null
  /** Pencils: the YYYY-MM-DD days the series skips. Round-tripped by the drawer so an ordinary save
   *  never wipes a skip; "Skip this date" appends through its own action. */
  exceptionDates?: string[] | null
}

/** The columns a create or update writes. `option_group` is set by the action, never by the form,
 *  and `published_event_id` only ever by the publish seam (retirePencilToEvent) — leaving it in
 *  this type would let an ordinary edit of the drawer silently un-retire a published date. */
export type EntryWrite = Omit<EntryRow, 'id' | 'space_id' | 'option_group' | 'published_event_id'>

/** The most candidate dates one pencil may carry (the first date included). */
export const MAX_CANDIDATE_DATES = 6

/** The longest description an event on its way may carry (mirrors the table's check). */
export const MAX_DESCRIPTION = 10_000

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY_MS = 86_400_000
/** The longest single entry staff can create (a season-long closure is still one entry). */
export const MAX_ENTRY_DAYS = 366

function dateMs(date: string): number | null {
  const m = DATE_RE.exec(date)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(ms)
  // Reject 2026-02-31 and friends, which Date.UTC silently rolls over.
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null
  return ms
}

function trimOrNull(v: string | null | undefined, max: number): string | null {
  const t = (v ?? '').trim()
  return t ? t.slice(0, max) : null
}

/** Validate the staff form into the columns to write. Errors are plain sentences for the form. */
export function parseEntryInput(input: EntryInput): { data: EntryWrite } | { error: string } {
  const def = entryKind(input.kind)
  if (!def) return { error: 'Choose what kind of date this is.' }
  const title = trimOrNull(input.title, 200)
  if (!title) return { error: 'Give the date a title.' }
  const startDay = dateMs(input.startDate)
  const endDay = dateMs(input.endDate || input.startDate)
  if (startDay === null || endDay === null) return { error: 'Pick a valid date.' }
  if (endDay < startDay) return { error: 'The end date is before the start date.' }
  if ((endDay - startDay) / DAY_MS + 1 > MAX_ENTRY_DAYS) return { error: 'An entry can cover a year at most.' }

  let startsMs: number
  let endsMs: number
  if (input.allDay) {
    startsMs = startDay
    endsMs = endDay + DAY_MS
  } else {
    const st = TIME_RE.exec(input.startTime ?? '')
    const et = TIME_RE.exec(input.endTime ?? '')
    if (!st || !et) return { error: 'Pick a start and end time.' }
    startsMs = startDay + (Number(st[1]) * 60 + Number(st[2])) * 60_000
    endsMs = endDay + (Number(et[1]) * 60 + Number(et[2])) * 60_000
    if (endsMs <= startsMs) return { error: 'The end time is before the start time.' }
  }

  // An event on its way carries a stage, and its status follows the stage (the table's trigger enforces
  // the same pairing, so this only keeps the form and the row in agreement before the write).
  const stageDef = def.isPencil ? (entryStage(input.stage) ?? entryStage('pencil')) : null
  const status = stageDef
    ? stageDef.status
    : (ENTRY_STATUSES as readonly string[]).includes(input.status ?? '')
      ? (input.status as EntryStatus)
      : def.defaultStatus
  // A lapse date only means something while the date is still a Pencil.
  let holdExpiresAt: string | null = null
  if (stageDef?.stage === 'pencil' && input.holdExpiresOn) {
    const lapse = dateMs(input.holdExpiresOn)
    if (lapse === null) return { error: 'Pick a valid date for the pencil to lapse.' }
    holdExpiresAt = new Date(lapse).toISOString()
  }
  const timeZone = (input.timeZone ?? '').trim()
  if (!timeZone) return { error: 'The date needs a time zone.' }

  return {
    data: {
      kind: def.kind,
      title,
      notes: trimOrNull(input.notes, 4000),
      location: trimOrNull(input.location, 300),
      all_day: input.allDay,
      starts_at: new Date(startsMs).toISOString(),
      ends_at: new Date(endsMs).toISOString(),
      time_zone: timeZone,
      status,
      blocks_time: input.blocksTime,
      visibility: def.canShowPublicly && input.showPublicly ? 'public_unavailable' : 'team',
      hold_expires_at: holdExpiresAt,
      stage: stageDef?.stage ?? null,
      description: def.isPencil ? trimOrNull(input.description, MAX_DESCRIPTION) : null,
      plan_id:
        typeof input.planId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.planId)
          ? input.planId
          : null,
      // Only an event on its way repeats (the drawer offers Repeats to nothing else), and the rule is
      // stored in its canonical spelling so two equal rules compare equal as strings.
      recurrence_rule: def.isPencil ? pencilRepeatRule(input.repeat) : null,
      // Skips are kept even when the cadence is switched off: setting a series back to "Does not
      // repeat" by mistake and then restoring it must not lose the dates a person chose to skip.
      exception_dates: normaliseExceptionDates(input.exceptionDates),
    },
  }
}

/** The extra candidate dates of a new pencil as whole writes: the same span shifted to each date.
 *  Deduped, never the first date again, capped at MAX_CANDIDATE_DATES in total. */
export function candidateWrites(first: EntryWrite, dates: readonly string[] | null | undefined): EntryWrite[] | { error: string } {
  const startDay = dateMs(first.starts_at.slice(0, 10))!
  const seen = new Set([first.starts_at.slice(0, 10)])
  const out: EntryWrite[] = []
  for (const d of dates ?? []) {
    if (!d || seen.has(d)) continue
    const ms = dateMs(d)
    if (ms === null) return { error: 'One of the other dates is not a valid date.' }
    seen.add(d)
    const shift = ms - startDay
    out.push({
      ...first,
      starts_at: new Date(new Date(first.starts_at).getTime() + shift).toISOString(),
      ends_at: new Date(new Date(first.ends_at).getTime() + shift).toISOString(),
      // A candidate keeps the cadence (it is the same series, started elsewhere) and none of the
      // skips, which belong to the dates of the first candidate's own run.
      exception_dates: [],
    })
  }
  if (out.length + 1 > MAX_CANDIDATE_DATES) return { error: `A Pencil can carry ${MAX_CANDIDATE_DATES} dates at most.` }
  return out
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
const isoTime = (d: Date) => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`

/** The first and last (inclusive) calendar day an entry covers, from its stored wall clock. */
export function entryDaySpan(row: Pick<EntryRow, 'starts_at' | 'ends_at' | 'all_day'>): { dayKey: string; endDayKey: string } {
  const start = new Date(row.starts_at)
  const end = new Date(row.ends_at)
  // An exclusive end at exactly 00:00 belongs to the day before (all-day entries always do).
  const lastMs = end.getTime() - (end.getUTCHours() === 0 && end.getUTCMinutes() === 0 ? DAY_MS : 0)
  const last = new Date(Math.max(start.getTime(), lastMs))
  return { dayKey: isoDate(start), endDayKey: isoDate(last) }
}

/** The staff form pre-filled from a stored row (the edit drawer). */
export function entryToInput(row: EntryRow): EntryInput {
  const { dayKey, endDayKey } = entryDaySpan(row)
  return {
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    location: row.location,
    allDay: row.all_day,
    startDate: dayKey,
    endDate: row.all_day ? endDayKey : isoDate(new Date(row.ends_at)),
    startTime: row.all_day ? '09:00' : isoTime(new Date(row.starts_at)),
    endTime: row.all_day ? '17:00' : isoTime(new Date(row.ends_at)),
    timeZone: row.time_zone,
    status: row.status,
    stage: row.stage ?? (row.kind === 'pencil' ? 'pencil' : null),
    description: row.description ?? '',
    blocksTime: row.blocks_time,
    showPublicly: row.visibility === 'public_unavailable',
    holdExpiresOn: row.hold_expires_at ? row.hold_expires_at.slice(0, 10) : '',
    candidateDates: [],
    planId: row.plan_id,
    repeat: row.recurrence_rule ?? '',
    exceptionDates: [...(row.exception_dates ?? [])],
  }
}

/** Every day key from `dayKey` to `endDayKey` inclusive, capped so a bad row cannot flood the grid. */
export function spanDayKeys(dayKey: string, endDayKey?: string | null, cap = 62): string[] {
  const start = dateMs(dayKey)
  const end = endDayKey ? dateMs(endDayKey) : start
  if (start === null) return []
  if (end === null || end <= start) return [dayKey]
  const out: string[] = []
  for (let ms = start; ms <= end && out.length < cap; ms += DAY_MS) out.push(isoDate(new Date(ms)))
  return out
}

/** Zone-dependent formatting, injected by the server so this file never imports the tz lib. */
export interface EntryFormatters {
  timeLabel: (storedIso: string, timeZone: string) => string
  whenLabel: (storedIso: string, timeZone: string) => string
  /** "Sat, Sep 19" style date label for all-day spans. */
  dateLabel: (storedIso: string, timeZone: string) => string
  instantIso: (storedIso: string, timeZone: string) => string | null
}

/** A private entry as the staff calendar renders it. */
export function entryToCalendarItem(
  row: EntryRow,
  fmt: EntryFormatters,
  opts: { editable: boolean; /** YYYY-MM-DD, to flag a lapsed pencil. */ now?: string },
): CalendarEvent {
  const def = entryKind(row.kind)
  const { dayKey, endDayKey } = entryDaySpan(row)
  const lastDayIso = `${endDayKey}T00:00:00.000Z`
  const whenLabel = row.all_day
    ? endDayKey === dayKey
      ? `${fmt.dateLabel(row.starts_at, row.time_zone)}, all day`
      : `${fmt.dateLabel(row.starts_at, row.time_zone)} to ${fmt.dateLabel(lastDayIso, row.time_zone)}, all day`
    : `${fmt.whenLabel(row.starts_at, row.time_zone)} to ${fmt.timeLabel(row.ends_at, row.time_zone)}`
  // A stored stage is never dropped: a row that carries one renders by it whatever its kind (the
  // table's trigger keeps stage on pencil-kind rows, so this only matters if that ever loosens).
  // A pencil-kind row with no stage is a Pencil.
  const stage = entryStage(row.stage) ?? (def?.isPencil ? entryStage('pencil') : null)
  const holding = stage?.stage === 'pencil'
  const lapsed = holding && !!row.hold_expires_at && opts.now !== undefined && row.hold_expires_at.slice(0, 10) < opts.now
  const badges = [
    row.status === 'tentative' && !stage ? 'Tentative' : null,
    holding && row.option_group ? 'One of several dates' : null,
    holding && row.hold_expires_at ? (lapsed ? 'Lapsed' : `Lapses ${shortDateLabel(row.hold_expires_at)}`) : null,
    row.visibility === 'public_unavailable' ? 'Shown publicly' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    slug: `entry-${row.id}`,
    title: row.title,
    dayKey,
    endDayKey: endDayKey === dayKey ? null : endDayKey,
    timeLabel: row.all_day ? 'All day' : fmt.timeLabel(row.starts_at, row.time_zone),
    whenLabel,
    startInstantIso: row.all_day ? null : fmt.instantIso(row.starts_at, row.time_zone),
    location: row.location,
    goingCount: 0,
    coverUrl: null,
    // An event on its way is labelled by its stage ("Planning"); other entries by their kind.
    sourceLabel: stage?.label ?? def?.label ?? null,
    statusLabel: badges || null,
    isCancelled: row.status === 'cancelled' || stage?.stage === 'cancelled',
    layer: def?.layer ?? 'private',
    entryId: opts.editable ? row.id : null,
    optionGroup: row.option_group,
    stage: stage?.stage ?? null,
    entryInput: opts.editable ? entryToInput(row) : null,
    notes: row.notes,
    description: row.description,
    planId: row.plan_id,
  }
}

/**
 * THE ITEMS ONE ROW DRAWS IN A GRID WINDOW (PROG-CAL5). A one-off row is one item, as before. A
 * repeating row is one item PER OCCURRENCE inside [fromDay, toDay), each carrying the MASTER's
 * `entryId` and form (so Edit opens the series) plus its own `occurrenceDate` (so "Skip this date"
 * knows which day it is standing on). Skipped days are already gone: the generator dropped them from
 * `exception_dates`, and nothing here puts one back.
 *
 * Slugs are `entry-<id>-<day>` so two occurrences of one series never share a React key, and the
 * label the grid shows says how often the series lands.
 */
export function entryItemsInWindow(
  row: EntryRow,
  fmt: EntryFormatters,
  opts: { editable: boolean; now?: string },
  window: SeriesWindow,
): CalendarEvent[] {
  const rule = seriesRule(row)
  if (!rule) return [entryToCalendarItem(row, fmt, opts)]
  const cadence = repeatChipLabel(rule, row.starts_at)
  const master = opts.editable ? entryToInput(row) : null
  return expandPencilSeries(row, window).map((o) => {
    const item = entryToCalendarItem({ ...row, starts_at: o.starts_at, ends_at: o.ends_at }, fmt, opts)
    return {
      ...item,
      slug: `entry-${row.id}-${o.dayKey}`,
      statusLabel: [item.statusLabel, cadence].filter(Boolean).join(' · ') || null,
      entryInput: master,
      occurrenceDate: o.dayKey,
    }
  })
}

/** A public "Unavailable" span (from public.space_public_unavailable): times only, never details. */
export function publicUnavailableToItem(
  row: Pick<EntryRow, 'starts_at' | 'ends_at' | 'all_day' | 'time_zone'>,
  fmt: EntryFormatters,
  index: number,
): CalendarEvent {
  const { dayKey, endDayKey } = entryDaySpan(row)
  const lastDayIso = `${endDayKey}T00:00:00.000Z`
  return {
    slug: `unavailable-${dayKey}-${index}`,
    title: 'Unavailable',
    dayKey,
    endDayKey: endDayKey === dayKey ? null : endDayKey,
    timeLabel: row.all_day ? 'All day' : fmt.timeLabel(row.starts_at, row.time_zone),
    whenLabel: row.all_day
      ? endDayKey === dayKey
        ? `${fmt.dateLabel(row.starts_at, row.time_zone)}, all day`
        : `${fmt.dateLabel(row.starts_at, row.time_zone)} to ${fmt.dateLabel(lastDayIso, row.time_zone)}, all day`
      : `${fmt.whenLabel(row.starts_at, row.time_zone)} to ${fmt.timeLabel(row.ends_at, row.time_zone)}`,
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    layer: 'unavailable',
  }
}

/** The true [startMs, endMs) a blocking entry takes out of bookings. `toInstant` converts a stored
 *  wall clock in a zone to the real instant (lib/time/zone.ts eventInstant). Null = does not block. */
export function blockingRange(
  row: Pick<EntryRow, 'starts_at' | 'ends_at' | 'time_zone' | 'blocks_time' | 'status'>,
  toInstant: (storedIso: string, timeZone: string) => Date | null,
): { startMs: number; endMs: number } | null {
  if (!row.blocks_time || row.status === 'cancelled') return null
  const s = toInstant(row.starts_at, row.time_zone)
  const e = toInstant(row.ends_at, row.time_zone)
  if (!s || !e || e.getTime() <= s.getTime()) return null
  return { startMs: s.getTime(), endMs: e.getTime() }
}
