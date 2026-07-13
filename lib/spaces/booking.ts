// 1:1 BOOKING for the Practitioner role (ENTITY-SPACES-SYSTEM section 2.4, booking v1). The library
// plus server actions behind the booking surfaces:
//   space_availability: the weekly windows an owner publishes (in the Space's IANA timezone).
//   space_bookings:     a member's confirmed slot against one of those windows.
// Backed by the service-role admin client plus untyped casts (the tables are not in the generated
// DB types yet, ADR-246, mirroring lib/spaces/membership.ts). The server is the authority for
// "which space" and "what may this caller do here" (P5): every write re-checks authorization and
// re-validates the slot server-side; reads fail-safe (empty/null) and writes fail-closed on a
// permission miss.
//
// SHAPE: the PURE slot math (window normalization, slot generation, the tz/UTC conversions) has no
// Supabase/Next imports, so it is fully unit-testable (lib/spaces/booking.test.ts). The IO (the
// admin-client reads/writes) is a thin layer below it, and the ACTION IMPLEMENTATIONS are plain
// async functions here. This module has NO 'use server' directive (so it can ALSO export the pure
// helpers the test needs and the types the surfaces import). The thin 'use server' wrappers the
// CLIENT components call live in lib/spaces/booking-actions.ts (a server-action module must export
// only async functions, so the pure helpers cannot live there). SERVER components import the read
// actions straight from here. Slot generation is the most-tested function: open vs booked vs past,
// window boundaries, slot size, no double-book.
//
// DEFERRED (v1 does not build, by design, see the migration header): calendar sync, buffers beyond
// the slot_minutes window math, a no-show policy, payments/packages, and per-MEMBER timezone
// conversion. v1 keeps ONE timezone per Space and displays slots in that labeled timezone.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One weekly availability window, as the app consumes it (camelCased). weekday 0 = Sunday to 6 =
 *  Saturday; start/end are minutes from local midnight in `timezone`; slotMinutes slices it. */
export interface AvailabilityWindow {
  weekday: number
  startMinute: number
  endMinute: number
  slotMinutes: number
  timezone: string
  /** P1 (ADR-605): optional bind to one service type. null = this window offers EVERY active service;
   *  a set id = this window offers ONLY that service. Absent/undefined is treated as null (offers all). */
  serviceTypeId?: string | null
}

/** A Space's reusable bookable offering (the Calendly "event type", P1). The free path uses only
 *  name + description + durationMinutes; priceCents is display-only until P4 payments. */
export interface ServiceType {
  id: string
  name: string
  description: string | null
  durationMinutes: number
  /** Display-only price in cents (null = free). The free booking path never charges. */
  priceCents: number | null
  active: boolean
  sortOrder: number
}

/** One open slot offered to a member: the absolute UTC instant it starts, plus its length so the
 *  surface can label the duration. Never carries who booked anything (only OPEN slots are emitted). */
export interface OpenSlot {
  /** Absolute UTC instant (ISO 8601) the slot starts at. */
  startsAt: string
  /** Slot length in minutes (the service duration, else the window's slot_minutes). */
  slotMinutes: number
}

/**
 * ADDITIVE, PURE options threaded into the slot generator as the booking ladder grows (ADR-605). Each
 * field defaults to "off", so an absent options object reproduces booking v1 exactly (every existing
 * caller + test is unchanged). Never a fork: the same generateOpenSlots / slotLengthAt honor these.
 *   P1: durationMinutes  — slice every window by the chosen service's duration, not window.slot_minutes.
 * (P2 adds buffers / min-notice / overrides here in the same shape.)
 */
export interface SlotGenOptions {
  /** P1 service duration: when set, slice each window by this length (and stamp it on each slot),
   *  overriding the window's own slot_minutes. When absent, the window's slot_minutes is used. */
  durationMinutes?: number
  /** P2 minimum scheduling notice: drop any slot starting sooner than this many minutes from `now`. */
  minNoticeMinutes?: number
  /** P2 buffer before an existing booking: a candidate is blocked if it ends within this many minutes
   *  of a booked interval's start. Reads `bookedRanges` (buffers alone do nothing without them). */
  bufferBeforeMinutes?: number
  /** P2 buffer after an existing booking: a candidate is blocked if it starts within this many minutes
   *  of a booked interval's end. */
  bufferAfterMinutes?: number
  /** P2 buffer-aware conflict input: the [startMs, endMs) of existing bookings (confirmed + pending),
   *  so a slot too close to one is blocked. The exact-instant set + the DB unique index remain the
   *  final race guard; this only WIDENS the check by the buffers. */
  bookedRanges?: ReadonlyArray<{ startMs: number; endMs: number }>
  /** P2 date overrides (blackouts + one-off open blocks). A date present here is REMOVED from the
   *  normal weekly windows; a non-blackout override with start/end injects its own block for that date. */
  overrides?: readonly SlotOverride[]
  /** P2 timezone the override dates are local to (the schedule tz). Defaults to the first window's tz. */
  overrideTimezone?: string
}

/** One date-specific override on a schedule (P2). `date` is a local YYYY-MM-DD in the schedule tz.
 *  isBlackout removes that day entirely; otherwise start/end (minutes from local midnight) replace
 *  the day's regular hours with a one-off open block (e.g. a holiday's short hours). */
export interface SlotOverride {
  date: string
  isBlackout: boolean
  startMinute?: number | null
  endMinute?: number | null
}

/** The effective slot length for a window under `opts` (the service duration overrides the window's
 *  own slot_minutes when present, P1). Clamped to a sane [5, 480] so a hostile value can't run wild. */
function effectiveSlotMinutes(window: AvailabilityWindow, opts?: SlotGenOptions): number {
  const override = opts?.durationMinutes
  if (typeof override === 'number' && Number.isInteger(override) && override >= 5 && override <= 480) {
    return override
  }
  return window.slotMinutes
}

/** One of the owner's upcoming bookings (the owner-only list). Carries the member id plus their
 *  display name so the owner sees who is on the calendar. */
export interface SpaceBooking {
  id: string
  spaceId: string
  memberProfileId: string
  memberName: string
  startsAt: string
  endsAt: string
  note: string | null
}

// How far ahead a member may book. v1 offers a rolling two-week window of open slots.
const HORIZON_DAYS = 14
// Hard caps so a malformed/hostile availability set can never make slot generation unbounded.
const MAX_WINDOWS = 60
const MAX_SLOTS = 2000

// ── PURE: timezone / UTC conversion (no IO, fully testable) ─────────────────────────────────────

/** The wall-clock parts of a UTC instant AS SEEN in an IANA timezone. Uses Intl (no tz library):
 *  formatToParts gives the local Y/M/D/H/M for `date` in `timezone`. Returns null for an invalid
 *  timezone (fail-safe: the caller falls back to UTC). */
function wallPartsInZone(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(date)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    let hour = get('hour')
    // Intl can emit '24' for midnight in some engines; normalize to 0.
    if (hour === 24) hour = 0
    const year = get('year')
    const month = get('month')
    const day = get('day')
    const minute = get('minute')
    if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) return null
    return { year, month, day, hour, minute }
  } catch {
    return null
  }
}

/** The offset (in minutes) `timezone` is ahead of UTC at the instant `date`. Computed by comparing
 *  the zone's wall-clock to the same fields read as UTC. Positive east of UTC (e.g. +120 for
 *  Europe/Athens in summer), negative west (e.g. -300 for America/New_York in winter). Fail-safe to
 *  0 (UTC) on an invalid zone. */
export function zoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = wallPartsInZone(date, timezone)
  if (!parts) return 0
  // The wall-clock fields interpreted AS IF they were UTC, minus the real instant, is the offset.
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** The absolute UTC instant for a LOCAL wall-clock time (a calendar date plus minutes-from-midnight)
 *  in `timezone`. The robust two-pass offset solve: guess the instant as if the wall time were UTC,
 *  read the zone's offset there, correct, then re-read the offset at the corrected instant (handles
 *  DST transitions where the offset itself shifts). Pure. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  minutesFromMidnight: number,
  timezone: string,
): Date {
  const hour = Math.floor(minutesFromMidnight / 60)
  const minute = minutesFromMidnight % 60
  // First guess: treat the wall time as if it were already UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const offset1 = zoneOffsetMinutes(new Date(guess), timezone)
  const corrected = guess - offset1 * 60000
  // Re-read the offset at the corrected instant; if it changed (a DST edge), apply the new one.
  const offset2 = zoneOffsetMinutes(new Date(corrected), timezone)
  const finalMs = offset2 === offset1 ? corrected : guess - offset2 * 60000
  return new Date(finalMs)
}

// ── PURE: window normalization plus slot generation (no IO, the most-tested function) ───────────

/** Coerce a raw window-ish value to a clean AvailabilityWindow, or null if it cannot be made valid.
 *  Clamps minutes to [0, 1440], requires end > start, defaults a bad slot length to 30, and trims
 *  the timezone (defaulting to 'UTC'). Fail-closed: a malformed row is DROPPED, never trusted. */
export function normalizeWindow(raw: {
  weekday?: unknown
  startMinute?: unknown
  endMinute?: unknown
  slotMinutes?: unknown
  timezone?: unknown
  serviceTypeId?: unknown
}): AvailabilityWindow | null {
  const weekday = Number(raw.weekday)
  const startMinute = Number(raw.startMinute)
  const endMinute = Number(raw.endMinute)
  let slotMinutes = Number(raw.slotMinutes)
  const timezone =
    typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone.trim() : 'UTC'
  // A window may bind to one service (P1). A blank / non-string id means "offers every service" (null).
  const serviceTypeId =
    typeof raw.serviceTypeId === 'string' && raw.serviceTypeId.trim() ? raw.serviceTypeId.trim() : null

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) return null
  if (!Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440) return null
  if (endMinute <= startMinute) return null
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 480) slotMinutes = 30

  return { weekday, startMinute, endMinute, slotMinutes, timezone, serviceTypeId }
}

/** The local YYYY-MM-DD (in `timezone`) of a UTC instant, matching the override date format. */
function localDateKey(date: Date, timezone: string): string | null {
  const parts = wallPartsInZone(date, timezone)
  if (!parts) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/** Index the date overrides by their date key, and the set of ALL override dates (blackout + block),
 *  which are removed from the normal weekly windows (an override governs its date). */
function indexOverrides(overrides: readonly SlotOverride[] | undefined): {
  dates: Set<string>
  byDate: Map<string, SlotOverride>
} {
  const dates = new Set<string>()
  const byDate = new Map<string, SlotOverride>()
  for (const o of overrides ?? []) {
    if (typeof o?.date !== 'string' || !o.date) continue
    dates.add(o.date)
    byDate.set(o.date, o)
  }
  return { dates, byDate }
}

/**
 * ALL boundary candidate slots (ms -> length) a schedule produces over the horizon, BEFORE any
 * past / notice / booked filtering. Pure + shared by generateOpenSlots (which filters) and slotLengthAt
 * (which validates one instant), so the two can never disagree on what a real boundary is. Applies:
 *   • P1 service-duration slicing (effectiveSlotMinutes), trailing partial dropped;
 *   • P2 date overrides: a day with an override is removed from the weekly windows, and a non-blackout
 *     override injects its own [start, end) block for that date (sliced by the same step).
 */
function candidateSlots(
  windows: AvailabilityWindow[],
  now: Date,
  horizonDays: number,
  opts?: SlotGenOptions,
): Map<number, number> {
  const byInstant = new Map<number, number>()
  const { dates: overrideDates, byDate } = indexOverrides(opts?.overrides)
  const overrideTz = opts?.overrideTimezone ?? windows[0]?.timezone ?? 'UTC'

  const push = (ms: number, len: number) => {
    byInstant.set(ms, len)
  }

  // Normal weekly windows, skipping any date an override governs.
  for (const window of windows.slice(0, MAX_WINDOWS)) {
    const step = effectiveSlotMinutes(window, opts)
    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
      const anchor = new Date(now.getTime() + dayOffset * 86400000)
      const parts = wallPartsInZone(anchor, window.timezone)
      if (!parts) continue
      const localWeekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
      if (localWeekday !== window.weekday) continue
      if (overrideDates.size > 0) {
        const key = localDateKey(anchor, window.timezone)
        if (key && overrideDates.has(key)) continue // an override governs this date; skip the weekly hours
      }
      for (let minute = window.startMinute; minute + step <= window.endMinute; minute += step) {
        push(zonedTimeToUtc(parts.year, parts.month, parts.day, minute, window.timezone).getTime(), step)
        if (byInstant.size > MAX_SLOTS) return byInstant
      }
    }
  }

  // Override OPEN blocks: inject each non-blackout override's own [start, end) block on its date.
  if (byDate.size > 0) {
    const step = opts?.durationMinutes && opts.durationMinutes >= 5 ? opts.durationMinutes : 30
    const horizonMs = now.getTime() + (horizonDays + 1) * 86400000
    for (const o of byDate.values()) {
      if (o.isBlackout) continue
      const start = Number(o.startMinute)
      const end = Number(o.endMinute)
      if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) continue
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.date)
      if (!m) continue
      const year = Number(m[1])
      const month = Number(m[2])
      const day = Number(m[3])
      for (let minute = start; minute + step <= end; minute += step) {
        const ms = zonedTimeToUtc(year, month, day, minute, overrideTz).getTime()
        if (ms > horizonMs) continue
        push(ms, step)
        if (byInstant.size > MAX_SLOTS) return byInstant
      }
    }
  }

  return byInstant
}

/** Whether a candidate [startMs, endMs) is blocked by a buffered booking (P2). Reserves each booked
 *  interval widened by the buffers and blocks the candidate if it overlaps any. No-op with no ranges. */
function bufferConflict(startMs: number, endMs: number, opts?: SlotGenOptions): boolean {
  const ranges = opts?.bookedRanges
  if (!ranges || ranges.length === 0) return false
  const before = Math.max(0, opts?.bufferBeforeMinutes ?? 0) * 60000
  const after = Math.max(0, opts?.bufferAfterMinutes ?? 0) * 60000
  for (const r of ranges) {
    const reservedStart = r.startMs - before
    const reservedEnd = r.endMs + after
    if (startMs < reservedEnd && endMs > reservedStart) return true
  }
  return false
}

/**
 * THE slot generator (pure, the most-tested function). Given the availability windows, the set of
 * already-booked start instants, the current time, and a horizon, produce the OPEN slot start
 * instants (UTC), sorted ascending and de-duplicated. A slot is OPEN when it is:
 *   in the FUTURE (strictly after `now`, so past and in-progress slots are dropped), and
 *   NOT already booked (its start instant is not in `bookedStartsAtMs`).
 * Overlapping windows that produce the same start instant collapse to one slot. Returns at most
 * MAX_SLOTS. No IO: the caller supplies booked times plus now, so this is deterministic + testable.
 *
 * P2 (via opts): also drops slots inside `minNoticeMinutes` of now, and blocks a slot that falls within
 * the buffers of a booked interval (`bookedRanges` + buffers). Date overrides are applied in candidateSlots.
 */
export function generateOpenSlots(
  windows: AvailabilityWindow[],
  bookedStartsAtMs: ReadonlySet<number>,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
  opts?: SlotGenOptions,
): OpenSlot[] {
  const nowMs = now.getTime()
  const noticeMs = Math.max(0, opts?.minNoticeMinutes ?? 0) * 60000
  const earliestMs = nowMs + noticeMs
  const byInstant = candidateSlots(windows, now, horizonDays, opts)

  const out: { startsAt: string; slotMinutes: number }[] = []
  for (const [ms, slotMinutes] of byInstant) {
    if (ms <= nowMs) continue // strictly future only: drop past + in-progress slots
    if (ms < earliestMs) continue // P2: inside minimum scheduling notice
    if (bookedStartsAtMs.has(ms)) continue // already taken (exact instant)
    if (bufferConflict(ms, ms + slotMinutes * 60000, opts)) continue // P2: too close to a booking
    out.push({ startsAt: new Date(ms).toISOString(), slotMinutes })
  }
  return out.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0))
}

/** Whether `startsAtMs` is the start of a real, fully-fitting slot in `windows` (used server-side by
 *  createBooking to confirm a posted instant actually lands on a published slot boundary, not just
 *  any timestamp). Returns the slot length when valid, or null. Honors the same P1/P2 opts as the
 *  generator (service duration, date overrides, minimum notice) so the server matches the member view.
 *  Buffer-aware conflict with live bookings is checked separately in createBooking. Pure. */
export function slotLengthAt(
  windows: AvailabilityWindow[],
  startsAtMs: number,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
  opts?: SlotGenOptions,
): number | null {
  const len = candidateSlots(windows, now, horizonDays, opts).get(startsAtMs)
  if (len == null) return null
  const nowMs = now.getTime()
  if (startsAtMs <= nowMs) return null // a past / in-progress boundary is not bookable
  const noticeMs = Math.max(0, opts?.minNoticeMinutes ?? 0) * 60000
  if (startsAtMs < nowMs + noticeMs) return null // inside minimum notice
  return len
}

/** A plain-language read of what a Space currently publishes, derived purely from its windows (no
 *  IO). Used by the owner console to show capacity at a glance: how many weekly slots are offered,
 *  how many distinct weekdays carry a window, and the distinct slot lengths in use. `weeklySlots` is
 *  the count of slots one full week of these windows yields (the same fully-fitting slice the
 *  generator uses), so it tracks what members actually see. Empty windows give an all-zero summary. */
export interface AvailabilitySummary {
  /** Number of availability windows published. */
  windowCount: number
  /** Number of distinct weekdays that carry at least one window. */
  dayCount: number
  /** Total bookable slots one week of these windows yields. */
  weeklySlots: number
  /** The distinct slot lengths (minutes) in use, ascending. */
  slotLengths: number[]
}

/** Summarize a Space's published windows for the owner console (pure, testable). Counts only fully
 *  fitting slots per window (matching the generator's trailing-partial drop), so the weekly total is
 *  the real offered capacity. */
export function summarizeAvailability(windows: AvailabilityWindow[]): AvailabilitySummary {
  const days = new Set<number>()
  const lengths = new Set<number>()
  let weeklySlots = 0
  for (const w of windows) {
    days.add(w.weekday)
    lengths.add(w.slotMinutes)
    // Whole slots that fit in [startMinute, endMinute); a trailing partial is dropped (as the
    // generator drops it), so the count matches what members can actually book.
    weeklySlots += Math.floor((w.endMinute - w.startMinute) / w.slotMinutes)
  }
  return {
    windowCount: windows.length,
    dayCount: days.size,
    weeklySlots,
    slotLengths: [...lengths].sort((a, b) => a - b),
  }
}

// ── IO: the untyped admin-client seams (tables not in generated types yet, ADR-246) ────────────

// Loosely-typed builders for the two not-yet-typed tables, mirroring lib/spaces/membership.ts.
type AvailabilityRow = {
  id: string
  space_id: string
  weekday: number
  start_minute: number
  end_minute: number
  slot_minutes: number
  timezone: string
  service_type_id?: string | null
}
type ServiceTypeRow = {
  id: string
  space_id: string
  name: string
  description: string | null
  duration_minutes: number
  price_cents: number | null
  active: boolean
  sort_order: number
}
type BookingRow = {
  id: string
  space_id: string
  member_profile_id: string
  starts_at: string
  ends_at: string
  status: string
  note: string | null
}

type AvailabilityQuery = {
  select: (cols: string) => AvailabilityQuery
  eq: (col: string, val: string) => AvailabilityQuery
  delete: () => AvailabilityQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  then: (
    resolve: (r: { data: AvailabilityRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}
type BookingQuery = {
  select: (cols: string) => BookingQuery
  eq: (col: string, val: string) => BookingQuery
  in: (col: string, vals: string[]) => BookingQuery
  gte: (col: string, val: string) => BookingQuery
  order: (col: string, opts: { ascending: boolean }) => BookingQuery
  update: (patch: Record<string, unknown>) => BookingQuery
  insert: (rows: Record<string, unknown>[]) => BookingQuery
  maybeSingle: () => Promise<{ data: BookingRow | null; error: unknown }>
  then: (
    resolve: (r: { data: BookingRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

type ServiceTypeQuery = {
  select: (cols: string) => ServiceTypeQuery
  eq: (col: string, val: string) => ServiceTypeQuery
  in: (col: string, vals: string[]) => ServiceTypeQuery
  order: (col: string, opts: { ascending: boolean }) => ServiceTypeQuery
  update: (patch: Record<string, unknown>) => ServiceTypeQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  delete: () => ServiceTypeQuery
  then: (
    resolve: (r: { data: ServiceTypeRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function availabilityTable(): AvailabilityQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => AvailabilityQuery }
  return db.from('space_availability')
}
function bookingsTable(): BookingQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => BookingQuery }
  return db.from('space_bookings')
}
function serviceTypesTable(): ServiceTypeQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => ServiceTypeQuery }
  return db.from('space_service_types')
}

type ScheduleRow = {
  id: string
  space_id: string
  timezone: string
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_minutes: number
  booking_window_days: number
  active: boolean
}
type OverrideRow = {
  id: string
  schedule_id: string
  on_date: string
  is_blackout: boolean
  start_minute: number | null
  end_minute: number | null
}
type ScheduleQuery = {
  select: (cols: string) => ScheduleQuery
  eq: (col: string, val: unknown) => ScheduleQuery
  order: (col: string, opts: { ascending: boolean }) => ScheduleQuery
  limit: (n: number) => ScheduleQuery
  update: (patch: Record<string, unknown>) => ScheduleQuery
  insert: (rows: Record<string, unknown>[]) => ScheduleQuery
  maybeSingle: () => Promise<{ data: ScheduleRow | null; error: unknown }>
  then: (resolve: (r: { data: ScheduleRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
type OverrideQuery = {
  select: (cols: string) => OverrideQuery
  eq: (col: string, val: string) => OverrideQuery
  delete: () => OverrideQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  then: (resolve: (r: { data: OverrideRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
function schedulesTable(): ScheduleQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => ScheduleQuery }
  return db.from('space_availability_schedules')
}
function overridesTable(): OverrideQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => OverrideQuery }
  return db.from('space_availability_overrides')
}

const AVAILABILITY_COLS = 'id, space_id, weekday, start_minute, end_minute, slot_minutes, timezone'
const AVAILABILITY_COLS_P1 = `${AVAILABILITY_COLS}, service_type_id`
const BOOKING_COLS = 'id, space_id, member_profile_id, starts_at, ends_at, status, note'
const SERVICE_TYPE_COLS = 'id, space_id, name, description, duration_minutes, price_cents, active, sort_order'

/** Map a raw availability row to a clean window (drops malformed rows, fail-closed). */
function mapAvailabilityRow(r: AvailabilityRow): AvailabilityWindow | null {
  return normalizeWindow({
    weekday: r.weekday,
    startMinute: r.start_minute,
    endMinute: r.end_minute,
    slotMinutes: r.slot_minutes,
    timezone: r.timezone,
    serviceTypeId: r.service_type_id ?? null,
  })
}

/** Read a Space's availability windows (service-role; FAIL-SAFE to []). Tries the P1 read (with
 *  service_type_id); if that column is absent (pre-migration) the query errors, so it falls back to
 *  the base columns so booking keeps working UNAPPLIED. Malformed rows are dropped (fail-closed). */
async function readWindows(spaceId: string): Promise<AvailabilityWindow[]> {
  const mapMany = (rows: AvailabilityRow[]): AvailabilityWindow[] =>
    rows.flatMap((r) => {
      const w = mapAvailabilityRow(r)
      return w ? [w] : []
    })
  try {
    const ext = await availabilityTable().select(AVAILABILITY_COLS_P1).eq('space_id', spaceId)
    if (!ext.error && ext.data) return mapMany(ext.data)
  } catch {
    /* pre-migration column missing: fall through to the base read */
  }
  try {
    const { data, error } = await availabilityTable().select(AVAILABILITY_COLS).eq('space_id', spaceId)
    if (error || !data) return []
    return mapMany(data)
  } catch {
    return []
  }
}

/** The windows that offer `serviceTypeId` (pure). A window with a null service_type_id offers EVERY
 *  service; a window bound to a specific service offers only that one. When `serviceTypeId` is null
 *  (no service chosen / legacy flat booking), every window applies. */
export function windowsForService(
  windows: AvailabilityWindow[],
  serviceTypeId: string | null,
): AvailabilityWindow[] {
  if (!serviceTypeId) return windows
  return windows.filter((w) => !w.serviceTypeId || w.serviceTypeId === serviceTypeId)
}

function mapServiceTypeRow(r: ServiceTypeRow): ServiceType {
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    description: r.description ?? null,
    durationMinutes:
      Number.isInteger(r.duration_minutes) && r.duration_minutes >= 5 && r.duration_minutes <= 480
        ? r.duration_minutes
        : 30,
    priceCents: typeof r.price_cents === 'number' && r.price_cents >= 0 ? r.price_cents : null,
    active: r.active !== false,
    sortOrder: Number.isInteger(r.sort_order) ? r.sort_order : 0,
  }
}

/** Read a Space's service types (service-role; FAIL-SAFE to [], so a missing table pre-migration is
 *  silent). `activeOnly` filters to bookable ones for the member picker. Sorted by sort_order. */
async function readServiceTypes(
  spaceId: string,
  opts: { activeOnly: boolean },
): Promise<ServiceType[]> {
  try {
    const { data, error } = await serviceTypesTable()
      .select(SERVICE_TYPE_COLS)
      .eq('space_id', spaceId)
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    const mapped = data.map(mapServiceTypeRow)
    return opts.activeOnly ? mapped.filter((s) => s.active) : mapped
  } catch {
    return []
  }
}

/** Resolve the target slot duration for a booking flow: the chosen active service's duration, or
 *  null when no service was chosen / the id does not resolve (legacy flat booking on window slots).
 *  FAIL-SAFE to null so a bad id can never widen the surface. */
async function resolveServiceDuration(
  spaceId: string,
  serviceTypeId: string | null | undefined,
): Promise<number | null> {
  if (!serviceTypeId) return null
  const services = await readServiceTypes(spaceId, { activeOnly: true })
  const svc = services.find((s) => s.id === serviceTypeId)
  return svc ? svc.durationMinutes : null
}

// ── P2: availability schedules (buffers / notice / window / overrides / timezone) ────────────────

/** A Space's scheduling rules (P2). The DEFAULTS reproduce booking v1 exactly (no buffers, no notice,
 *  a 14-day window), so a Space with no schedule row behaves as before. */
export interface ScheduleSettings {
  id: string | null
  timezone: string | null
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  bookingWindowDays: number
}

/** The neutral defaults used when a Space has no schedule row (or the P2 table is absent). */
export const DEFAULT_SCHEDULE: ScheduleSettings = {
  id: null,
  timezone: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 0,
  bookingWindowDays: HORIZON_DAYS,
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function mapScheduleRow(r: ScheduleRow): ScheduleSettings {
  return {
    id: r.id,
    timezone: typeof r.timezone === 'string' && r.timezone.trim() ? r.timezone.trim() : null,
    bufferBeforeMinutes: clampInt(r.buffer_before_minutes, 0, 480, 0),
    bufferAfterMinutes: clampInt(r.buffer_after_minutes, 0, 480, 0),
    minNoticeMinutes: clampInt(r.min_notice_minutes, 0, 43200, 0),
    bookingWindowDays: clampInt(r.booking_window_days, 1, 365, HORIZON_DAYS),
  }
}

/** The Space's single active schedule (service-role; FAIL-SAFE to the neutral DEFAULT_SCHEDULE, so a
 *  missing table pre-migration or an unconfigured Space simply uses booking v1 behavior). */
async function readSchedule(spaceId: string): Promise<ScheduleSettings> {
  try {
    const { data, error } = await schedulesTable()
      .select('id, space_id, timezone, buffer_before_minutes, buffer_after_minutes, min_notice_minutes, booking_window_days, active')
      .eq('space_id', spaceId)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error || !data) return DEFAULT_SCHEDULE
    return mapScheduleRow(data)
  } catch {
    return DEFAULT_SCHEDULE
  }
}

/** A schedule's date overrides as generator input (service-role; FAIL-SAFE to []). */
async function readOverrides(scheduleId: string | null): Promise<SlotOverride[]> {
  if (!scheduleId) return []
  try {
    const { data, error } = await overridesTable()
      .select('id, schedule_id, on_date, is_blackout, start_minute, end_minute')
      .eq('schedule_id', scheduleId)
    if (error || !data) return []
    return data.map((r) => ({
      // on_date is a DATE, serialized 'YYYY-MM-DD' (Postgres) — take the leading 10 chars defensively.
      date: typeof r.on_date === 'string' ? r.on_date.slice(0, 10) : '',
      isBlackout: r.is_blackout === true,
      startMinute: r.start_minute ?? null,
      endMinute: r.end_minute ?? null,
    })).filter((o) => o.date)
  } catch {
    return []
  }
}

/** Resolve the full generator context for a Space in one place: the schedule rules + its overrides.
 *  FAIL-SAFE to defaults + []. */
async function readScheduleContext(
  spaceId: string,
): Promise<{ schedule: ScheduleSettings; overrides: SlotOverride[] }> {
  const schedule = await readSchedule(spaceId)
  const overrides = await readOverrides(schedule.id)
  return { schedule, overrides }
}

/** Build the pure SlotGenOptions for a Space from its schedule + service duration (P1) + booked ranges
 *  (P2 buffer conflict). Also returns the effective windows (their timezone overridden by the schedule
 *  tz when the schedule sets one, since P2 moves the tz onto the schedule) and the booking-window days. */
function buildSlotContext(
  windows: AvailabilityWindow[],
  schedule: ScheduleSettings,
  overrides: SlotOverride[],
  duration: number | null,
  bookedRanges: ReadonlyArray<{ startMs: number; endMs: number }>,
): { windows: AvailabilityWindow[]; horizonDays: number; opts: SlotGenOptions; timezone: string } {
  const tz = schedule.timezone ?? windows[0]?.timezone ?? 'UTC'
  // When the schedule sets a timezone, it is authoritative (P2 moves tz off the window), so slice every
  // window in it. Otherwise keep each window's own tz (booking v1).
  const effWindows = schedule.timezone ? windows.map((w) => ({ ...w, timezone: tz })) : windows
  const opts: SlotGenOptions = {
    ...(duration != null ? { durationMinutes: duration } : {}),
    minNoticeMinutes: schedule.minNoticeMinutes,
    bufferBeforeMinutes: schedule.bufferBeforeMinutes,
    bufferAfterMinutes: schedule.bufferAfterMinutes,
    bookedRanges,
    overrides,
    overrideTimezone: tz,
  }
  return { windows: effWindows, horizonDays: schedule.bookingWindowDays, opts, timezone: tz }
}

/** The confirmed bookings of a Space at/after `fromISO` (service-role; FAIL-SAFE to []). */
async function readConfirmedBookings(spaceId: string, fromISO: string): Promise<BookingRow[]> {
  try {
    const { data, error } = await bookingsTable()
      .select(BOOKING_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'confirmed')
      .gte('starts_at', fromISO)
      .order('starts_at', { ascending: true })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** The bookings that BLOCK a slot at/after `fromISO`: confirmed AND pending holds (Phase 4). The open-slot
 *  read must exclude both, matching the widened unique index `status in (confirmed, pending)` — otherwise a
 *  held-but-unpaid slot still renders as available and every booker bounces off it. Pending rows only exist
 *  once the bookable-services migration is applied, so pre-migration this reads exactly like confirmed.
 *  Service-role; FAIL-SAFE to []. */
async function readBlockingBookings(spaceId: string, fromISO: string): Promise<BookingRow[]> {
  try {
    const { data, error } = await bookingsTable()
      .select(BOOKING_COLS)
      .eq('space_id', spaceId)
      .in('status', ['confirmed', 'pending'])
      .gte('starts_at', fromISO)
      .order('starts_at', { ascending: true })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** Batch-read display names for a set of profile ids (service-role; FAIL-SAFE to an empty map). */
async function readMemberNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (
            col: string,
            vals: string[],
          ) => Promise<{ data: { id: string; display_name: string | null }[] | null }>
        }
      }
    }
    const { data } = await db.from('profiles').select('id, display_name').in('id', ids)
    for (const p of data ?? []) out.set(p.id, p.display_name?.trim() || 'A member')
  } catch {
    // fall through to the empty map (callers default to 'A member')
  }
  return out
}

// ── PUBLIC SERVER ACTIONS (inline 'use server'; all gated / validated server-side) ─────────────

/**
 * Replace a Space's weekly availability with `windows`. Gated on canEditProfile (owner / admin /
 * editor). Validates + normalizes every window (a malformed one is dropped); an EMPTY list clears
 * availability (a valid "I am not taking bookings" state). Replaces (delete then insert) through the
 * admin client. Returns ActionResult. Fail-closed on permission.
 */
export async function setSpaceAvailability(
  spaceId: string,
  windows: AvailabilityWindow[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your availability.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set availability for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth). The page already gates the
  // render on the same resolver; re-check it here so a per-Space role/disable override is enforced on the
  // WRITE too (the resolver folds the tool's on/off + lowest-role for this space).
  if (!spaceFunctionAccess(space, 'availability', caps.role))
    return fail('Availability is not turned on for this space, or your role cannot use it.')

  // Normalize + drop anything invalid. An empty result is a valid "no availability" state.
  const clean = (Array.isArray(windows) ? windows : []).slice(0, MAX_WINDOWS).flatMap((w) => {
    const n = normalizeWindow(w)
    return n ? [n] : []
  })

  try {
    // Clear the existing windows, then insert the new set. The booking surface re-derives slots from
    // these, so a clean replace keeps the rule set the single source of truth.
    const del = await availabilityTable().delete().eq('space_id', spaceId)
    if ((del as unknown as { error?: unknown }).error) {
      return fail('Could not save your availability. Try again.')
    }
    if (clean.length > 0) {
      const base = clean.map((w) => ({
        space_id: spaceId,
        weekday: w.weekday,
        start_minute: w.startMinute,
        end_minute: w.endMinute,
        slot_minutes: w.slotMinutes,
        timezone: w.timezone,
      }))
      // Only stamp the P1 service_type_id column when a window actually binds to a service, so the
      // insert works UNAPPLIED (the column is absent pre-migration). If a bound insert errors on the
      // missing column, retry without the binding (fail-soft: the window is kept, just service-agnostic).
      const anyBound = clean.some((w) => w.serviceTypeId)
      const rows = anyBound
        ? base.map((r, i) => ({ ...r, service_type_id: clean[i]!.serviceTypeId ?? null }))
        : base
      const { error } = await availabilityTable().insert(rows)
      if (error) {
        if (anyBound) {
          const retry = await availabilityTable().insert(base)
          if (retry.error) return fail('Could not save your availability. Try again.')
        } else {
          return fail('Could not save your availability. Try again.')
        }
      }
    }
  } catch {
    return fail('Could not save your availability. Try again.')
  }
  return ok()
}

/** A Space's published windows as the editor reads them back (service-role; FAIL-SAFE to []). Gated
 *  on canManage (owner/admin/editor) OR a platform janitor previewing as staff, so the owner and a
 *  staff preview both see the real rule set; WRITES stay on canEditProfile. */
export async function listSpaceAvailability(spaceId: string): Promise<AvailabilityWindow[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return readWindows(spaceId)
}

/**
 * The OPEN slots a member may book, over the next ~14 days (any authenticated caller). Reads the
 * Space's windows plus its confirmed bookings, then runs the pure generator. Returns ONLY open slot
 * instants (never who booked anything). FAIL-SAFE to [] on any error or for an anonymous caller.
 */
export async function listOpenSlots(
  spaceId: string,
  serviceTypeId?: string | null,
): Promise<OpenSlot[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  try {
    const now = new Date()
    // The windows + bookings reads are independent, so start them TOGETHER (Promise.all) instead of
    // waterfalling one after the other. Both readers are fail-safe to [], so Promise.all never rejects.
    // The early-return short-circuit is preserved: with no published windows there are no slots, so we
    // return [] without running the (already-overlapped, cheap) generator.
    const [windows, booked, duration, context] = await Promise.all([
      readWindows(spaceId),
      // Exclude confirmed AND pending holds, so a held-but-unpaid slot is not offered (matches the index).
      readBlockingBookings(spaceId, now.toISOString()),
      // P1: resolve the chosen service's duration (null = legacy flat booking on window slot_minutes).
      resolveServiceDuration(spaceId, serviceTypeId),
      // P2: schedule rules (buffers / notice / window / tz) + date overrides.
      readScheduleContext(spaceId),
    ])
    if (windows.length === 0) return []
    // A service was chosen but did not resolve (inactive / bad id): offer nothing rather than the
    // wrong grid. A null serviceTypeId (no service) keeps every window at its own slot length.
    if (serviceTypeId && duration == null) return []
    const scoped = windowsForService(windows, serviceTypeId ?? null)
    if (scoped.length === 0) return []
    const bookedMs = new Set(booked.map((b) => new Date(b.starts_at).getTime()))
    const bookedRanges = booked.map((b) => ({
      startMs: new Date(b.starts_at).getTime(),
      endMs: new Date(b.ends_at).getTime(),
    }))
    const ctx = buildSlotContext(scoped, context.schedule, context.overrides, duration, bookedRanges)
    return generateOpenSlots(ctx.windows, bookedMs, now, ctx.horizonDays, ctx.opts)
  } catch {
    return []
  }
}

/** The Space's configured booking timezone (the IANA tz its availability windows are stated in). v1
 *  is ONE timezone per Space, so the first window's tz is authoritative. Any authenticated caller;
 *  FAIL-SAFE to 'UTC' when there is no availability or on any error. Used by the member surface to
 *  label every slot in the Space's timezone. */
export async function getSpaceBookingTimezone(spaceId: string): Promise<string> {
  const profileId = await getMyProfileId()
  if (!profileId) return 'UTC'
  try {
    // P2: the schedule owns the timezone when configured; else fall back to the first window's tz.
    const [schedule, windows] = await Promise.all([readSchedule(spaceId), readWindows(spaceId)])
    return schedule.timezone ?? windows[0]?.timezone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

// ── P1: service types (the bookable "event types") ─────────────────────────────────────────────

/** A Space's ACTIVE bookable services, for the member picker (any authenticated caller). Sorted by
 *  sort_order. FAIL-SAFE to [] (so a Space with the P1 migration UNAPPLIED simply has no services and
 *  the member surface falls back to the legacy flat picker). */
export async function listBookableServices(spaceId: string): Promise<ServiceType[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  return readServiceTypes(spaceId, { activeOnly: true })
}

/** A Space's service types as the OWNER editor reads them back (active + inactive). Gated on
 *  canEditProfile (owner / admin / editor) OR a platform janitor preview. FAIL-SAFE to []. */
export async function listSpaceServiceTypes(spaceId: string): Promise<ServiceType[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return readServiceTypes(spaceId, { activeOnly: false })
}

/** One service type as the owner submits it. A blank id means "insert new"; a set id updates in place
 *  (preserving the id, so any window bound to it keeps its binding). */
export interface ServiceTypeInput {
  id?: string | null
  name: string
  description?: string | null
  durationMinutes: number
  priceCents?: number | null
  active?: boolean
  sortOrder?: number
}

/** Coerce a raw service-type input to a clean, safe row, or null if it cannot be made valid (a blank
 *  name is dropped). Clamps duration to [5, 480] and a bad price to null. Fail-closed. */
function cleanServiceInput(raw: ServiceTypeInput, index: number): {
  id: string | null
  name: string
  description: string | null
  duration_minutes: number
  price_cents: number | null
  active: boolean
  sort_order: number
} | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : ''
  if (!name) return null
  let duration = Number(raw.durationMinutes)
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) duration = 30
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, 1000)
      : null
  const price =
    typeof raw.priceCents === 'number' && Number.isFinite(raw.priceCents) && raw.priceCents >= 0
      ? Math.round(raw.priceCents)
      : null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  return {
    id,
    name,
    description,
    duration_minutes: duration,
    price_cents: price,
    active: raw.active !== false,
    sort_order: Number.isInteger(raw.sortOrder) ? (raw.sortOrder as number) : index,
  }
}

/**
 * Replace a Space's service types with `services` (owner / admin / editor, gated on canEditProfile).
 * Preserves ids of existing rows (updates them in place) so any availability window bound to a service
 * keeps its binding; inserts new rows; deletes rows the owner removed. An EMPTY list clears all
 * services (a valid "no services" state that falls back to the legacy flat picker). Returns
 * ActionResult; fail-closed on permission, fail-soft when the P1 table is absent.
 */
export async function setSpaceServiceTypes(
  spaceId: string,
  services: ServiceTypeInput[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your services.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set services for this space.')
  if (!spaceFunctionAccess(space, 'availability', caps.role))
    return fail('Availability is not turned on for this space, or your role cannot use it.')

  const MAX_SERVICES = 40
  const clean = (Array.isArray(services) ? services : [])
    .slice(0, MAX_SERVICES)
    .flatMap((s, i) => {
      const c = cleanServiceInput(s, i)
      return c ? [c] : []
    })

  try {
    // Existing rows for this Space (to know which to update vs delete). FAIL-SOFT to [] if the table
    // is absent pre-migration (the write below then no-ops with a friendly message rather than crash).
    const existing = await readServiceTypes(spaceId, { activeOnly: false })
    const existingIds = new Set(existing.map((s) => s.id))
    const keptIds = new Set<string>()

    for (const row of clean) {
      if (row.id && existingIds.has(row.id)) {
        keptIds.add(row.id)
        const { error } = (await serviceTypesTable()
          .update({
            name: row.name,
            description: row.description,
            duration_minutes: row.duration_minutes,
            price_cents: row.price_cents,
            active: row.active,
            sort_order: row.sort_order,
          })
          .eq('id', row.id)) as unknown as { error?: unknown }
        if (error) return fail('Could not save your services. Try again.')
      } else {
        const { error } = await serviceTypesTable().insert([
          {
            space_id: spaceId,
            name: row.name,
            description: row.description,
            duration_minutes: row.duration_minutes,
            price_cents: row.price_cents,
            active: row.active,
            sort_order: row.sort_order,
          },
        ])
        if (error) return fail('Could not save your services. Try again.')
      }
    }

    // Delete the rows the owner removed (present before, absent now).
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length > 0) {
      const { error } = (await serviceTypesTable()
        .delete()
        .in('id', toDelete)) as unknown as { error?: unknown }
      if (error) return fail('Could not save your services. Try again.')
    }
  } catch {
    return fail('Could not save your services. Try again.')
  }
  return ok()
}

// ── P2: schedule settings (buffers / notice / window / overrides) ───────────────────────────────

/** The owner-editable schedule settings + date overrides, read back for the editor. */
export interface ScheduleForEditor {
  settings: ScheduleSettings
  overrides: SlotOverride[]
}

/** A Space's schedule + overrides as the OWNER editor reads them (canEditProfile OR janitor preview).
 *  FAIL-SAFE to the neutral defaults + [] (so a pre-migration Space shows editable defaults). */
export async function getSpaceSchedule(spaceId: string): Promise<ScheduleForEditor> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return { settings: DEFAULT_SCHEDULE, overrides: [] }
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole))
    return { settings: DEFAULT_SCHEDULE, overrides: [] }
  const { schedule, overrides } = await readScheduleContext(spaceId)
  return { settings: schedule, overrides }
}

/** The schedule settings + overrides as the owner submits them. */
export interface ScheduleInput {
  timezone?: string | null
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
  minNoticeMinutes?: number
  bookingWindowDays?: number
  overrides?: SlotOverride[]
}

/** Coerce raw overrides to clean rows (drop malformed; a non-blackout needs start < end). Fail-closed. */
function cleanOverrides(raw: SlotOverride[] | undefined): {
  on_date: string
  is_blackout: boolean
  start_minute: number | null
  end_minute: number | null
}[] {
  const out: { on_date: string; is_blackout: boolean; start_minute: number | null; end_minute: number | null }[] = []
  const seen = new Set<string>()
  for (const o of raw ?? []) {
    if (typeof o?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue
    if (seen.has(o.date)) continue // one override per date (matches the unique index)
    const isBlackout = o.isBlackout === true
    if (isBlackout) {
      out.push({ on_date: o.date, is_blackout: true, start_minute: null, end_minute: null })
      seen.add(o.date)
      continue
    }
    const start = Number(o.startMinute)
    const end = Number(o.endMinute)
    if (!Number.isInteger(start) || start < 0 || start > 1439) continue
    if (!Number.isInteger(end) || end < 1 || end > 1440 || end <= start) continue
    out.push({ on_date: o.date, is_blackout: false, start_minute: start, end_minute: end })
    seen.add(o.date)
  }
  return out.slice(0, 200)
}

/**
 * Save a Space's schedule settings + date overrides (owner / admin / editor, gated on canEditProfile).
 * Upserts the Space's single active schedule row and REPLACES its overrides. Returns ActionResult;
 * fail-closed on permission, fail-soft when the P2 tables are absent (a friendly message, no crash).
 */
export async function setSpaceSchedule(spaceId: string, input: ScheduleInput): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your scheduling rules.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set scheduling rules for this space.')
  if (!spaceFunctionAccess(space, 'availability', caps.role))
    return fail('Availability is not turned on for this space, or your role cannot use it.')

  const timezone =
    typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : null
  const patch: Record<string, unknown> = {
    buffer_before_minutes: clampInt(input.bufferBeforeMinutes, 0, 480, 0),
    buffer_after_minutes: clampInt(input.bufferAfterMinutes, 0, 480, 0),
    min_notice_minutes: clampInt(input.minNoticeMinutes, 0, 43200, 0),
    booking_window_days: clampInt(input.bookingWindowDays, 1, 365, HORIZON_DAYS),
    active: true,
  }
  if (timezone) patch.timezone = timezone

  try {
    const existing = await readSchedule(spaceId)
    let scheduleId = existing.id
    if (scheduleId) {
      const { error } = (await schedulesTable().update(patch).eq('id', scheduleId)) as unknown as {
        error?: unknown
      }
      if (error) return fail('Could not save your scheduling rules. Try again.')
    } else {
      const ins = await schedulesTable().insert([{ space_id: spaceId, ...patch }])
      if ((ins as unknown as { error?: unknown }).error)
        return fail('Could not save your scheduling rules. Try again.')
      scheduleId = (await readSchedule(spaceId)).id
    }
    if (!scheduleId) return fail('Could not save your scheduling rules. Try again.')

    // Replace the overrides: clear then insert the clean set.
    const del = (await overridesTable().delete().eq('schedule_id', scheduleId)) as unknown as {
      error?: unknown
    }
    if (del.error) return fail('Could not save your scheduling rules. Try again.')
    const rows = cleanOverrides(input.overrides).map((o) => ({ schedule_id: scheduleId, ...o }))
    if (rows.length > 0) {
      const { error } = await overridesTable().insert(rows)
      if (error) return fail('Could not save your scheduling rules. Try again.')
    }
  } catch {
    return fail('Could not save your scheduling rules. Try again.')
  }
  return ok()
}

/**
 * Book an open slot. Any authenticated member (resolved via getMyProfileId). The server is the
 * authority: it re-validates that `startsAtISO` is a real, still-future slot WITHIN the Space's
 * published availability, then inserts a confirmed booking. The partial unique index is the final
 * guard against a double-book race: a second booker for the same instant fails the constraint and
 * gets a friendly "just taken" message. Returns ActionResult.
 */
export async function createBooking(
  spaceId: string,
  startsAtISO: string,
  note?: string,
  serviceTypeId?: string | null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to book a time.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const startsAt = new Date(startsAtISO)
  if (Number.isNaN(startsAt.getTime())) return fail('Pick a valid time.')

  const now = new Date()
  if (startsAt.getTime() <= now.getTime()) return fail('That time has already passed. Pick another.')

  // Re-derive the published slots and confirm the requested instant is a real, open one. P1: when a
  // service was chosen, validate against ITS duration and only the windows that offer it.
  const allWindows = await readWindows(spaceId)
  if (allWindows.length === 0) return fail('This space is not taking bookings right now.')

  const duration = await resolveServiceDuration(spaceId, serviceTypeId)
  if (serviceTypeId && duration == null) return fail('That service is no longer available. Pick another.')
  const scoped = windowsForService(allWindows, serviceTypeId ?? null)
  if (scoped.length === 0) return fail('That time is no longer available. Pick another.')

  // P2: re-validate against the SAME schedule context the member saw (notice, overrides, window, tz),
  // and read the blocking bookings up front so we can enforce buffer-aware conflict server-side too.
  const context = await readScheduleContext(spaceId)
  const booked = await readBlockingBookings(spaceId, now.toISOString())
  const bookedRanges = booked.map((b) => ({
    startMs: new Date(b.starts_at).getTime(),
    endMs: new Date(b.ends_at).getTime(),
  }))
  const ctx = buildSlotContext(scoped, context.schedule, context.overrides, duration, bookedRanges)

  const slotMinutes = slotLengthAt(ctx.windows, startsAt.getTime(), now, ctx.horizonDays, ctx.opts)
  if (slotMinutes == null) return fail('That time is no longer available. Pick another.')

  // Already taken (confirmed or held pending)? A fast pre-check for a friendly message; the unique index
  // is the real guard. P2: also block a slot that falls within the buffers of an existing booking.
  if (booked.some((b) => new Date(b.starts_at).getTime() === startsAt.getTime())) {
    return fail('That time was just taken. Pick another.')
  }
  if (bufferConflict(startsAt.getTime(), startsAt.getTime() + slotMinutes * 60000, ctx.opts)) {
    return fail('That time is too close to another booking. Pick another.')
  }

  const endsAt = new Date(startsAt.getTime() + slotMinutes * 60000)
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) : ''

  try {
    const { error } = await bookingsTable()
      .insert([
        {
          space_id: spaceId,
          member_profile_id: profileId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'confirmed',
          note: cleanNote ? cleanNote : null,
        },
      ])
      .select(BOOKING_COLS)
      .maybeSingle()
    if (error) {
      // The partial unique index rejects a second confirmed row for the same slot: translate the
      // race into the friendly message rather than a raw DB error.
      return fail('That time was just taken. Pick another.')
    }
  } catch {
    return fail('Could not book that time. Try again.')
  }
  return ok()
}

/**
 * Cancel a booking. Allowed for the BOOKER (the member who made it) OR a space admin. Reads the row
 * (admin client), checks ownership / admin, then flips status to 'cancelled' (which releases the
 * slot via the partial unique index, so it can be re-booked). Fail-closed on permission.
 */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to cancel a booking.')

  let row: BookingRow | null = null
  try {
    const { data } = await bookingsTable().select(BOOKING_COLS).eq('id', bookingId).maybeSingle()
    row = data
  } catch {
    row = null
  }
  if (!row) return fail('Booking not found.')

  // The booker may always cancel their own; otherwise the caller must be a space admin.
  let allowed = row.member_profile_id === profileId
  if (!allowed) {
    const space = await getSpaceById(row.space_id)
    if (space) {
      const caps = await getSpaceCapabilities(space, profileId)
      allowed = caps.isAdmin
    }
  }
  if (!allowed) return fail('You do not have permission to cancel this booking.')

  try {
    const { error } = await bookingsTable().update({ status: 'cancelled' }).eq('id', bookingId)
    if (error) return fail('Could not cancel the booking. Try again.')
  } catch {
    return fail('Could not cancel the booking. Try again.')
  }
  return ok()
}

// ── Bookable services (Phase 4, ADR-596): HOLD-FIRST booking tied to a commerce deposit ─────────
// These write the 'pending' status + order_id/product_id columns from migration 20261102000000, which
// is applied only when payments are enabled. They run ONLY in the paid service-booking path (gated
// behind commerce checkout, which is OFF until payouts are live), never in the free createBooking path
// above. All are FAIL-SOFT so a normal product-order settle/refund is never blocked pre-migration.

/**
 * Place a HOLD (a 'pending' booking) on an open slot for a paid service, before its deposit settles.
 * Re-validates the slot server-side (same rules as createBooking) and inserts status='pending' stamped
 * with the service product_id. The widened unique index (confirmed OR pending) blocks a second
 * hold/confirm on the same slot. Returns the new booking id + its end instant, or null on any miss.
 */
export async function holdSlotForBooking(
  spaceId: string,
  memberProfileId: string,
  startsAtISO: string,
  productId: string,
): Promise<{ bookingId: string; endsAt: string } | null> {
  const startsAt = new Date(startsAtISO)
  if (Number.isNaN(startsAt.getTime())) return null
  const now = new Date()
  if (startsAt.getTime() <= now.getTime()) return null
  const windows = await readWindows(spaceId)
  if (windows.length === 0) return null
  const slotMinutes = slotLengthAt(windows, startsAt.getTime(), now)
  if (slotMinutes == null) return null
  const endsAt = new Date(startsAt.getTime() + slotMinutes * 60000)
  try {
    const { data, error } = await bookingsTable()
      .insert([
        {
          space_id: spaceId,
          member_profile_id: memberProfileId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: 'pending',
          product_id: productId,
          note: null,
        },
      ])
      .select(BOOKING_COLS)
      .maybeSingle()
    if (error || !data) return null
    return { bookingId: data.id, endsAt: endsAt.toISOString() }
  } catch {
    return null
  }
}

/** Stamp the commerce order that will pay for a held booking onto it (after checkout creates the
 *  order). FAIL-SOFT. */
export async function linkBookingToOrder(bookingId: string, orderId: string): Promise<void> {
  try {
    await bookingsTable().update({ order_id: orderId }).eq('id', bookingId)
  } catch {
    /* fail-soft */
  }
}

/** Confirm the held booking behind a settled order (deposit paid). Idempotent (flips only a still
 *  'pending' hold). FAIL-SOFT + a no-op pre-migration, so a normal product-order settle is never
 *  blocked by a missing column. */
export async function confirmBookingByOrder(orderId: string): Promise<void> {
  if (!orderId) return
  try {
    await bookingsTable().update({ status: 'confirmed' }).eq('order_id', orderId).eq('status', 'pending')
  } catch {
    /* pre-migration / no linked booking: no-op */
  }
}

/** Release (cancel) the booking behind a refunded / cancelled order, freeing the slot. FAIL-SOFT. */
export async function cancelBookingByOrder(orderId: string): Promise<void> {
  if (!orderId) return
  try {
    await bookingsTable().update({ status: 'cancelled' }).eq('order_id', orderId)
  } catch {
    /* fail-soft */
  }
}

/**
 * The owner's UPCOMING confirmed bookings (member name + time). Gated on canEditProfile (owner /
 * admin / editor). Reads the confirmed rows from now forward, then resolves member display names in
 * one batched lookup. FAIL-SAFE to [] for an anonymous / unauthorized caller or any error.
 */
export async function listSpaceBookings(spaceId: string): Promise<SpaceBooking[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []

  try {
    const rows = await readConfirmedBookings(spaceId, new Date().toISOString())
    if (rows.length === 0) return []

    // Batch-resolve member display names (one query for all bookers).
    const ids = [...new Set(rows.map((r) => r.member_profile_id))]
    const names = await readMemberNames(ids)

    return rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      memberProfileId: r.member_profile_id,
      memberName: names.get(r.member_profile_id) ?? 'A member',
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      note: r.note,
    }))
  } catch {
    return []
  }
}
