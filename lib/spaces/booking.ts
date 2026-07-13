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
import { canTakePayments } from '@/lib/commerce/selling'
import { payoutsLive } from '@/lib/billing/connect'
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

/** One booking question (P3): asked when a member books this service; the answer lands in the booking's
 *  `answers` map keyed by `id`. `type` is a plain input kind. */
export interface BookingQuestion {
  id: string
  label: string
  type: 'short' | 'long'
  required: boolean
}

/** A stored booking answer, LABELED so the owner reads it without re-resolving the service (P3). */
export interface BookingAnswer {
  id: string
  label: string
  value: string
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
  /** P3 booking questions asked at booking (ordered). Empty when none. */
  questions: BookingQuestion[]
  /** P4 (dark): linked commerce service product. When set AND deposits are live, booking this service
   *  opens deposit checkout; otherwise the free P0 confirm-only path is used. Null = free. */
  productId: string | null
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
  /** P3: the member's answers to the service's booking questions (labeled), for the owner calendar. */
  answers: BookingAnswer[]
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
  product_id?: string | null
  questions?: unknown
}
type BookingRow = {
  id: string
  space_id: string
  member_profile_id: string
  starts_at: string
  ends_at: string
  status: string
  note: string | null
  answers?: unknown
  service_type_id?: string | null
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
const BOOKING_COLS_P3 = `${BOOKING_COLS}, answers, service_type_id`
const SERVICE_TYPE_COLS = 'id, space_id, name, description, duration_minutes, price_cents, active, sort_order, product_id'
const SERVICE_TYPE_COLS_P3 = `${SERVICE_TYPE_COLS}, questions`

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

/** Parse a service's questions jsonb (fail-closed: drop malformed entries; cap the count). */
export function parseQuestions(raw: unknown): BookingQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: BookingQuestion[] = []
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue
    const o = q as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 200) : ''
    if (!id || !label) continue
    const type = o.type === 'long' ? 'long' : 'short'
    out.push({ id, label, type, required: o.required === true })
    if (out.length >= 20) break
  }
  return out
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
    questions: parseQuestions(r.questions),
    productId: typeof r.product_id === 'string' && r.product_id ? r.product_id : null,
  }
}

/** Read a Space's service types (service-role; FAIL-SAFE to [], so a missing table pre-migration is
 *  silent). Tries the P3 read (with questions); falls back to base columns when that column is absent.
 *  `activeOnly` filters to bookable ones for the member picker. Sorted by sort_order. */
async function readServiceTypes(
  spaceId: string,
  opts: { activeOnly: boolean },
): Promise<ServiceType[]> {
  const finish = (data: ServiceTypeRow[]) => {
    const mapped = data.map(mapServiceTypeRow)
    return opts.activeOnly ? mapped.filter((s) => s.active) : mapped
  }
  try {
    const ext = await serviceTypesTable()
      .select(SERVICE_TYPE_COLS_P3)
      .eq('space_id', spaceId)
      .order('sort_order', { ascending: true })
    if (!ext.error && ext.data) return finish(ext.data)
  } catch {
    /* pre-P3 column missing: fall through */
  }
  try {
    const { data, error } = await serviceTypesTable()
      .select(SERVICE_TYPE_COLS)
      .eq('space_id', spaceId)
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    return finish(data)
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
  const svc = await resolveService(spaceId, serviceTypeId)
  return svc ? svc.durationMinutes : null
}

/** Resolve the full active service (name + duration + questions) for a chosen id, or null. FAIL-SAFE. */
async function resolveService(
  spaceId: string,
  serviceTypeId: string | null | undefined,
): Promise<ServiceType | null> {
  if (!serviceTypeId) return null
  const services = await readServiceTypes(spaceId, { activeOnly: true })
  return services.find((s) => s.id === serviceTypeId) ?? null
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

/** The confirmed bookings of a Space at/after `fromISO` (service-role; FAIL-SAFE to []). Tries the P3
 *  read (with answers, for the owner calendar); falls back to base columns when that column is absent. */
async function readConfirmedBookings(spaceId: string, fromISO: string): Promise<BookingRow[]> {
  try {
    const ext = await bookingsTable()
      .select(BOOKING_COLS_P3)
      .eq('space_id', spaceId)
      .eq('status', 'confirmed')
      .gte('starts_at', fromISO)
      .order('starts_at', { ascending: true })
    if (!ext.error && ext.data) return ext.data
  } catch {
    /* pre-P3 answers column missing: fall through */
  }
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
  /** P3 booking questions asked at booking (ordered). */
  questions?: BookingQuestion[]
}

/** Coerce raw booking questions to a clean, stable list (each gets an id; blank labels dropped). */
function cleanQuestions(raw: BookingQuestion[] | undefined): BookingQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: BookingQuestion[] = []
  for (const q of raw) {
    const label = typeof q?.label === 'string' ? q.label.trim().slice(0, 200) : ''
    if (!label) continue
    const id = typeof q?.id === 'string' && q.id.trim() ? q.id.trim() : `q${out.length + 1}`
    out.push({ id, label, type: q?.type === 'long' ? 'long' : 'short', required: q?.required === true })
    if (out.length >= 20) break
  }
  return out
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
  questions: BookingQuestion[]
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
    questions: cleanQuestions(raw.questions),
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
      const base = {
        name: row.name,
        description: row.description,
        duration_minutes: row.duration_minutes,
        price_cents: row.price_cents,
        active: row.active,
        sort_order: row.sort_order,
      }
      // Include the P3 questions column when possible; if it is absent pre-migration the write errors,
      // so retry without questions (fail-soft: the service saves, just without its questions).
      const withQuestions = { ...base, questions: row.questions }
      if (row.id && existingIds.has(row.id)) {
        keptIds.add(row.id)
        const first = (await serviceTypesTable().update(withQuestions).eq('id', row.id)) as unknown as {
          error?: unknown
        }
        if (first.error) {
          const retry = (await serviceTypesTable().update(base).eq('id', row.id)) as unknown as {
            error?: unknown
          }
          if (retry.error) return fail('Could not save your services. Try again.')
        }
      } else {
        const first = await serviceTypesTable().insert([{ space_id: spaceId, ...withQuestions }])
        if (first.error) {
          const retry = await serviceTypesTable().insert([{ space_id: spaceId, ...base }])
          if (retry.error) return fail('Could not save your services. Try again.')
        }
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
  answers?: Record<string, string> | null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to book a time.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const placed = await validateAndPlaceBooking({
    space,
    profileId,
    startsAtISO,
    note: note ?? null,
    serviceTypeId: serviceTypeId ?? null,
    answers: answers ?? null,
    rescheduledFrom: null,
  })
  if (!placed.ok) return fail(placed.error)

  // Best-effort side effects: never block or roll back the booking on a mail hiccup.
  await afterBookingPlaced(space, placed)
  return ok()
}

/** The result of a successful placement (used by the confirmation + reminder side effects). */
interface PlacedBooking {
  ok: true
  bookingId: string
  profileId: string
  startsAt: string
  endsAt: string
  serviceName: string | null
}

/**
 * The shared validate-then-insert core for createBooking AND rescheduleBooking. Re-derives the Space's
 * published slots under the full P1/P2 context (service duration, buffers, notice, overrides, window),
 * enforces the exact-instant + buffer conflict, then inserts a CONFIRMED booking. The partial unique
 * index is the final race guard. Captures the service's booking questions into `answers` (required ones
 * must be filled). Fail-soft on the P3 columns (answers / rescheduled_from) when unapplied.
 */
async function validateAndPlaceBooking(params: {
  space: { id: string; slug: string }
  profileId: string
  startsAtISO: string
  note: string | null
  serviceTypeId: string | null
  answers: Record<string, string> | null
  rescheduledFrom: string | null
}): Promise<PlacedBooking | { ok: false; error: string }> {
  const { space, profileId, startsAtISO, serviceTypeId, rescheduledFrom } = params
  const spaceId = space.id

  const startsAt = new Date(startsAtISO)
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'Pick a valid time.' }
  const now = new Date()
  if (startsAt.getTime() <= now.getTime())
    return { ok: false, error: 'That time has already passed. Pick another.' }

  const allWindows = await readWindows(spaceId)
  if (allWindows.length === 0)
    return { ok: false, error: 'This space is not taking bookings right now.' }

  const service = await resolveService(spaceId, serviceTypeId)
  if (serviceTypeId && !service)
    return { ok: false, error: 'That service is no longer available. Pick another.' }
  const duration = service ? service.durationMinutes : null
  const scoped = windowsForService(allWindows, serviceTypeId)
  if (scoped.length === 0) return { ok: false, error: 'That time is no longer available. Pick another.' }

  const context = await readScheduleContext(spaceId)
  const booked = await readBlockingBookings(spaceId, now.toISOString())
  const bookedRanges = booked.map((b) => ({
    startMs: new Date(b.starts_at).getTime(),
    endMs: new Date(b.ends_at).getTime(),
  }))
  const ctx = buildSlotContext(scoped, context.schedule, context.overrides, duration, bookedRanges)

  const slotMinutes = slotLengthAt(ctx.windows, startsAt.getTime(), now, ctx.horizonDays, ctx.opts)
  if (slotMinutes == null) return { ok: false, error: 'That time is no longer available. Pick another.' }

  if (booked.some((b) => new Date(b.starts_at).getTime() === startsAt.getTime()))
    return { ok: false, error: 'That time was just taken. Pick another.' }
  if (bufferConflict(startsAt.getTime(), startsAt.getTime() + slotMinutes * 60000, ctx.opts))
    return { ok: false, error: 'That time is too close to another booking. Pick another.' }

  // P3: validate answers against the service's questions (required ones must be filled).
  const cleanAnswers = cleanAnswers_(service?.questions ?? [], params.answers)
  if (cleanAnswers === null) return { ok: false, error: 'Answer the required questions to book.' }

  const endsAt = new Date(startsAt.getTime() + slotMinutes * 60000)
  const cleanNote = typeof params.note === 'string' ? params.note.trim().slice(0, 500) : ''

  const baseRow: Record<string, unknown> = {
    space_id: spaceId,
    member_profile_id: profileId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: 'confirmed',
    note: cleanNote ? cleanNote : null,
  }
  // Include the P3 columns only when they carry a value, so a pre-migration insert (no such column)
  // is not attempted for the common case; if a bound insert errors on the missing column, retry base.
  const optional: Record<string, unknown> = {}
  if (cleanAnswers && cleanAnswers.length > 0) optional.answers = cleanAnswers
  if (rescheduledFrom) optional.rescheduled_from = rescheduledFrom
  if (serviceTypeId) optional.service_type_id = serviceTypeId
  const hasOptional = Object.keys(optional).length > 0

  try {
    let res = await bookingsTable()
      .insert([{ ...baseRow, ...optional }])
      .select(BOOKING_COLS)
      .maybeSingle()
    if (res.error && hasOptional) {
      // Likely a missing P3 column (or a duplicate; a duplicate retry fails again -> friendly message).
      res = await bookingsTable().insert([baseRow]).select(BOOKING_COLS).maybeSingle()
    }
    if (res.error || !res.data) {
      return { ok: false, error: 'That time was just taken. Pick another.' }
    }
    return {
      ok: true,
      bookingId: res.data.id,
      profileId,
      startsAt: res.data.starts_at,
      endsAt: res.data.ends_at,
      serviceName: service?.name ?? null,
    }
  } catch {
    return { ok: false, error: 'Could not book that time. Try again.' }
  }
}

/** Validate + shape the member's answers against a service's questions. Returns an ordered, LABELED
 *  array (so the owner can read it without re-resolving the service), or null when a required question
 *  is unanswered. Empty questions -> empty array. */
function cleanAnswers_(
  questions: BookingQuestion[],
  raw: Record<string, string> | null | undefined,
): BookingAnswer[] | null {
  const out: BookingAnswer[] = []
  for (const q of questions) {
    const val = raw && typeof raw[q.id] === 'string' ? raw[q.id]!.trim().slice(0, 2000) : ''
    if (q.required && !val) return null
    if (val) out.push({ id: q.id, label: q.label, value: val })
  }
  return out
}

/** Parse a booking's stored answers jsonb into the labeled array (fail-closed). */
export function parseAnswers(raw: unknown): BookingAnswer[] {
  if (!Array.isArray(raw)) return []
  const out: BookingAnswer[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label : ''
    const value = typeof o.value === 'string' ? o.value : ''
    if (!label || !value) continue
    out.push({ id: typeof o.id === 'string' ? o.id : label, label, value })
    if (out.length >= 20) break
  }
  return out
}

/** Fire the confirmation email (member + owner, with .ics) and schedule the reminder. Best-effort. */
async function afterBookingPlaced(
  space: { id: string; slug: string; name: string; brandName: string | null; ownerProfileId: string | null },
  placed: PlacedBooking,
): Promise<void> {
  const { notifyBookingConfirmed, scheduleBookingReminder } = await import('@/lib/spaces/booking-notify')
  await notifyBookingConfirmed({
    bookingId: placed.bookingId,
    spaceId: space.id,
    spaceSlug: space.slug,
    spaceName: space.brandName?.trim() || space.name,
    ownerProfileId: space.ownerProfileId,
    memberProfileId: placed.profileId,
    memberName: null,
    startsAt: placed.startsAt,
    endsAt: placed.endsAt,
    serviceName: placed.serviceName,
  })
  await scheduleBookingReminder(placed.bookingId, placed.startsAt)
}

/**
 * Reschedule a member's own booking to a new time (ADR-605 P3). ATOMIC in effect: it acquires the NEW
 * slot FIRST (through the same validateAndPlaceBooking re-validation + unique-index guard), and only
 * then cancels the old one, so a race can never free-then-lose the slot. Gated to the booker (or an
 * admin) and the cancellation policy window. Carries the service forward. Fires confirmation + reminder
 * for the new booking and a cancellation notice for the old is skipped (it is a move, not a loss).
 */
export async function rescheduleBooking(
  bookingId: string,
  newStartsAtISO: string,
  serviceTypeId?: string | null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to reschedule.')

  const old = await readBookingById(bookingId)
  if (!old) return fail('Booking not found.')
  if (old.status !== 'confirmed') return fail('That booking cannot be rescheduled.')

  const space = await getSpaceById(old.space_id)
  if (!space) return fail('Space not found.')

  // The booker may reschedule their own; otherwise an admin.
  const caps = await getSpaceCapabilities(space, profileId)
  const isBooker = old.member_profile_id === profileId
  if (!isBooker && !caps.isAdmin)
    return fail('You do not have permission to reschedule this booking.')

  // Policy window: a booker may not move a booking inside the minimum notice; an admin always may.
  if (isBooker && !caps.isAdmin) {
    const schedule = await readSchedule(old.space_id)
    if (!withinModifyWindow(old.starts_at, schedule.minNoticeMinutes)) {
      return fail('This booking is too close to its start time to reschedule.')
    }
  }

  // Acquire the NEW slot first (as the original booker), re-validated + guarded by the unique index.
  // Carry the original service forward unless the caller overrides it.
  const carryService = serviceTypeId ?? old.service_type_id ?? null
  const placed = await validateAndPlaceBooking({
    space,
    profileId: old.member_profile_id,
    startsAtISO: newStartsAtISO,
    note: old.note,
    serviceTypeId: carryService,
    answers: null,
    rescheduledFrom: old.id,
  })
  if (!placed.ok) return fail(placed.error)

  // New slot held: release the old one (fail-soft; the new booking already stands).
  try {
    await bookingsTable()
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', old.id)
  } catch {
    try {
      await bookingsTable().update({ status: 'cancelled' }).eq('id', old.id)
    } catch {
      /* fail-soft: the old row stays confirmed only if both updates fail; rare, self-heals on retry */
    }
  }

  await afterBookingPlaced(space, placed)
  return ok()
}

/** Whether a booking at `startsAt` is far enough out to still be modified under `minNoticeMinutes`
 *  (the cancellation / reschedule policy window; 0 = always allowed). Pure. */
export function withinModifyWindow(startsAt: string | Date, minNoticeMinutes: number): boolean {
  const startMs = typeof startsAt === 'string' ? new Date(startsAt).getTime() : startsAt.getTime()
  if (!Number.isFinite(startMs)) return false
  const notice = Math.max(0, minNoticeMinutes) * 60000
  return startMs - Date.now() >= notice
}

/** Read one booking row by id (service-role; FAIL-SAFE to null). Tries the P3 columns (service_type_id
 *  / answers) and falls back to base when absent. */
async function readBookingById(bookingId: string): Promise<BookingRow | null> {
  try {
    const ext = await bookingsTable().select(BOOKING_COLS_P3).eq('id', bookingId).maybeSingle()
    if (!ext.error && ext.data) return ext.data
  } catch {
    /* pre-P3 columns missing: fall through */
  }
  try {
    const { data } = await bookingsTable().select(BOOKING_COLS).eq('id', bookingId).maybeSingle()
    return data
  } catch {
    return null
  }
}

/**
 * Cancel a booking. Allowed for the BOOKER (the member who made it) OR a space admin. Reads the row
 * (admin client), checks ownership / admin, then flips status to 'cancelled' (which releases the
 * slot via the partial unique index, so it can be re-booked). Fail-closed on permission.
 */
export async function cancelBooking(bookingId: string, reason?: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to cancel a booking.')

  const row = await readBookingById(bookingId)
  if (!row) return fail('Booking not found.')
  if (row.status !== 'confirmed') return ok() // already cancelled: idempotent no-op

  // The booker may cancel their own (within the policy window); an admin always may.
  const space = await getSpaceById(row.space_id)
  const isBooker = row.member_profile_id === profileId
  let isAdmin = false
  if (space) {
    const caps = await getSpaceCapabilities(space, profileId)
    isAdmin = caps.isAdmin
  }
  if (!isBooker && !isAdmin) return fail('You do not have permission to cancel this booking.')
  if (isBooker && !isAdmin) {
    const schedule = await readSchedule(row.space_id)
    if (!withinModifyWindow(row.starts_at, schedule.minNoticeMinutes)) {
      return fail('This booking is too close to its start time to cancel.')
    }
  }

  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null

  try {
    // Stamp cancelled_at + cancel_reason (P3); fall back to a plain status flip when those columns are
    // absent pre-migration (fail-soft).
    let res = (await bookingsTable()
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: cleanReason })
      .eq('id', bookingId)) as unknown as { error?: unknown }
    if (res.error) {
      res = (await bookingsTable().update({ status: 'cancelled' }).eq('id', bookingId)) as unknown as {
        error?: unknown
      }
      if (res.error) return fail('Could not cancel the booking. Try again.')
    }
  } catch {
    return fail('Could not cancel the booking. Try again.')
  }

  // Best-effort cancellation notice (never blocks the cancel).
  if (space) {
    try {
      const { notifyBookingCancelled } = await import('@/lib/spaces/booking-notify')
      await notifyBookingCancelled(
        {
          spaceId: space.id,
          spaceSlug: space.slug,
          spaceName: space.brandName?.trim() || space.name,
          ownerProfileId: space.ownerProfileId,
          memberProfileId: row.member_profile_id,
          memberName: null,
          startsAt: row.starts_at,
          serviceName: null,
        },
        cleanReason,
      )
    } catch {
      /* fail-soft */
    }
  }
  return ok()
}

/** One of the member's OWN upcoming bookings, for the self-serve list (P3). */
export interface MyBooking {
  id: string
  startsAt: string
  endsAt: string
  note: string | null
  /** The service this was booked for, carried into a reschedule (null = legacy flat booking). */
  serviceTypeId: string | null
  serviceName: string | null
  /** Whether it is still far enough out to cancel / reschedule under the policy window. */
  canModify: boolean
}

/** The current member's upcoming confirmed bookings with a Space (P3 self-serve). Any authenticated
 *  caller sees only THEIR OWN. FAIL-SAFE to []. */
export async function listMyBookings(spaceId: string): Promise<MyBooking[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  try {
    const rows = await readConfirmedBookings(spaceId, new Date().toISOString())
    const mine = rows.filter((r) => r.member_profile_id === profileId)
    if (mine.length === 0) return []
    const [schedule, services] = await Promise.all([
      readSchedule(spaceId),
      readServiceTypes(spaceId, { activeOnly: false }),
    ])
    const nameById = new Map(services.map((s) => [s.id, s.name]))
    return mine.map((r) => {
      const serviceTypeId = r.service_type_id ?? null
      return {
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        note: r.note,
        serviceTypeId,
        serviceName: serviceTypeId ? (nameById.get(serviceTypeId) ?? null) : null,
        canModify: withinModifyWindow(r.starts_at, schedule.minNoticeMinutes),
      }
    })
  } catch {
    return []
  }
}

// ── P4 (ADR-605, DARK): deposit-at-booking for a Space service type, on the commerce spine ──────
// A Space service type carries an optional link to a commerce service product (space_service_types.
// product_id, P1). When that link is set AND deposits are live, booking the service opens deposit
// checkout (HOLD-FIRST, below); a free service (no product_id) keeps the untouched P0 confirm-only
// path. The whole path is DOUBLE-GATED OFF: a Business account may take payments (canTakePayments)
// AND payouts must be live (payoutsLive(), ADR-178) — both must hold, so it NO-OPS until an owner
// turns payments on. Everything is additive + fail-soft; nothing new is written until then.

/** Whether the deposit-at-booking path is live for a Space (DOUBLE-GATED, dark by default). A Space is
 *  a 'space' owner-kind for commerce, so this reduces to "payouts are live". Server-only. */
export async function bookingDepositsLive(): Promise<boolean> {
  return canTakePayments('space') && (await payoutsLive())
}

/**
 * Open deposit checkout for a PAID Space service type (P4, dark). HOLD-FIRST: place a 'pending' hold on
 * the slot, then the deposit rides the SAME commerce checkout; the settle webhook (confirmBookingByOrder)
 * flips the hold to confirmed and a refund (cancelBookingByOrder) releases it. NO-OPS unless deposits are
 * live and the service links a product, so the free confirm-only path is never affected. Returns the
 * checkout URL to redirect to, or an error. Fail-soft.
 */
export async function startServiceDeposit(
  spaceId: string,
  serviceTypeId: string,
  startsAtISO: string,
): Promise<{ url?: string; error?: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Sign in to book.' }

  // DOUBLE GATE (dark): both must hold or this no-ops back to the free path.
  if (!(await bookingDepositsLive())) return { error: 'Payments are not turned on yet.' }

  const service = await resolveService(spaceId, serviceTypeId)
  if (!service || !service.productId) return { error: 'This service is not set up for paid booking.' }

  // HOLD-FIRST: reserve the slot (a 'pending' booking), then take the deposit via commerce checkout.
  const hold = await holdSlotForBooking(spaceId, profileId, startsAtISO, service.productId)
  if (!hold) return { error: 'That time is no longer available. Pick another.' }

  try {
    // Dynamic import to avoid a static import cycle (checkout imports confirm/cancelBookingByOrder here).
    const { createCommerceCheckout } = await import('@/lib/commerce/checkout')
    const checkout = await createCommerceCheckout({
      buyerProfileId: profileId,
      items: [{ productId: service.productId, qty: 1 }],
    })
    if (checkout.error || !checkout.url || !checkout.orderId) {
      // Without an order the settle webhook can never confirm the hold; release it and stop.
      await cancelBooking(hold.bookingId)
      return { error: checkout.error ?? 'Could not start checkout.' }
    }
    await linkBookingToOrder(hold.bookingId, checkout.orderId)
    return { url: checkout.url }
  } catch {
    await cancelBooking(hold.bookingId)
    return { error: 'Could not start checkout.' }
  }
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
      answers: parseAnswers(r.answers),
    }))
  } catch {
    return []
  }
}
