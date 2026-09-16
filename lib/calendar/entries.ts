import type { CalendarEvent } from './item'
import { entryKind, ENTRY_STATUSES, type EntryKind, type EntryStatus, type EntryVisibility } from './registry'

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
}

export const ENTRY_COLS =
  'id, space_id, kind, title, notes, location, all_day, starts_at, ends_at, time_zone, status, blocks_time, visibility'

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
  blocksTime: boolean
  showPublicly: boolean
}

/** The columns a create or update writes. */
export type EntryWrite = Omit<EntryRow, 'id' | 'space_id'>

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
  if (!def) return { error: 'Choose what kind of entry this is.' }
  const title = trimOrNull(input.title, 200)
  if (!title) return { error: 'Give the entry a title.' }
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

  const status = (ENTRY_STATUSES as readonly string[]).includes(input.status ?? '')
    ? (input.status as EntryStatus)
    : 'confirmed'
  const timeZone = (input.timeZone ?? '').trim()
  if (!timeZone) return { error: 'The entry needs a time zone.' }

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
    },
  }
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
    blocksTime: row.blocks_time,
    showPublicly: row.visibility === 'public_unavailable',
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
export function entryToCalendarItem(row: EntryRow, fmt: EntryFormatters, opts: { editable: boolean }): CalendarEvent {
  const def = entryKind(row.kind)
  const { dayKey, endDayKey } = entryDaySpan(row)
  const lastDayIso = `${endDayKey}T00:00:00.000Z`
  const whenLabel = row.all_day
    ? endDayKey === dayKey
      ? `${fmt.dateLabel(row.starts_at, row.time_zone)}, all day`
      : `${fmt.dateLabel(row.starts_at, row.time_zone)} to ${fmt.dateLabel(lastDayIso, row.time_zone)}, all day`
    : `${fmt.whenLabel(row.starts_at, row.time_zone)} to ${fmt.timeLabel(row.ends_at, row.time_zone)}`
  const badges = [row.status === 'tentative' ? 'Tentative' : null, row.visibility === 'public_unavailable' ? 'Shown publicly' : null]
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
    sourceLabel: def?.label ?? null,
    statusLabel: badges || null,
    isCancelled: row.status === 'cancelled',
    layer: def?.layer ?? 'private',
    entryId: opts.editable ? row.id : null,
    entryInput: opts.editable ? entryToInput(row) : null,
    notes: row.notes,
  }
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
