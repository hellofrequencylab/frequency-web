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

/** The candidate slot start-instants (as UTC Dates) a window produces across the next `horizonDays`
 *  days from `now`. Pure helper, used by generateOpenSlots. For each day in range whose local
 *  weekday matches the window, slice [startMinute, endMinute) by slotMinutes; a slot is emitted only
 *  if it fully fits before endMinute (a trailing partial slot is dropped). */
function windowSlotInstants(
  window: AvailabilityWindow,
  now: Date,
  horizonDays: number,
  opts?: SlotGenOptions,
): Date[] {
  const out: Date[] = []
  // P1: slice by the service duration when supplied, else the window's own slot length. A duration
  // wider than the window simply yields no slots for that window (nothing fully fits).
  const step = effectiveSlotMinutes(window, opts)
  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
    // The calendar date `dayOffset` days from now, read in the window's timezone (so "today" is
    // today THERE, not in UTC).
    const anchor = new Date(now.getTime() + dayOffset * 86400000)
    const parts = wallPartsInZone(anchor, window.timezone)
    if (!parts) continue
    // The weekday of that local date (Y/M/D at UTC midnight gives the calendar weekday).
    const localWeekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
    if (localWeekday !== window.weekday) continue
    for (
      let minute = window.startMinute;
      minute + step <= window.endMinute;
      minute += step
    ) {
      out.push(zonedTimeToUtc(parts.year, parts.month, parts.day, minute, window.timezone))
      if (out.length > MAX_SLOTS) return out
    }
  }
  return out
}

/**
 * THE slot generator (pure, the most-tested function). Given the availability windows, the set of
 * already-booked start instants, the current time, and a horizon, produce the OPEN slot start
 * instants (UTC), sorted ascending and de-duplicated. A slot is OPEN when it is:
 *   in the FUTURE (strictly after `now`, so past and in-progress slots are dropped), and
 *   NOT already booked (its start instant is not in `bookedStartsAtMs`).
 * Overlapping windows that produce the same start instant collapse to one slot. Returns at most
 * MAX_SLOTS. No IO: the caller supplies booked times plus now, so this is deterministic + testable.
 */
export function generateOpenSlots(
  windows: AvailabilityWindow[],
  bookedStartsAtMs: ReadonlySet<number>,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
  opts?: SlotGenOptions,
): OpenSlot[] {
  const nowMs = now.getTime()
  // Map start-instant ms to slotMinutes, so duplicate instants from overlapping windows collapse
  // (last write wins on the length, which is fine: the start uniquely identifies a slot).
  const byInstant = new Map<number, number>()
  for (const window of windows.slice(0, MAX_WINDOWS)) {
    const step = effectiveSlotMinutes(window, opts)
    for (const instant of windowSlotInstants(window, now, horizonDays, opts)) {
      const ms = instant.getTime()
      if (ms <= nowMs) continue // strictly future only: drop past + in-progress slots
      if (bookedStartsAtMs.has(ms)) continue // already taken
      byInstant.set(ms, step)
      if (byInstant.size > MAX_SLOTS) break
    }
  }
  return [...byInstant.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ms, slotMinutes]) => ({ startsAt: new Date(ms).toISOString(), slotMinutes }))
}

/** Whether `startsAtMs` is the start of a real, fully-fitting slot in `windows` (used server-side by
 *  createBooking to confirm a posted instant actually lands on a published slot boundary, not just
 *  any timestamp). Returns the slot length when valid, or null. Pure. */
export function slotLengthAt(
  windows: AvailabilityWindow[],
  startsAtMs: number,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
  opts?: SlotGenOptions,
): number | null {
  for (const window of windows.slice(0, MAX_WINDOWS)) {
    const step = effectiveSlotMinutes(window, opts)
    for (const instant of windowSlotInstants(window, now, horizonDays, opts)) {
      if (instant.getTime() === startsAtMs) return step
    }
  }
  return null
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
    const [windows, booked, duration] = await Promise.all([
      readWindows(spaceId),
      // Exclude confirmed AND pending holds, so a held-but-unpaid slot is not offered (matches the index).
      readBlockingBookings(spaceId, now.toISOString()),
      // P1: resolve the chosen service's duration (null = legacy flat booking on window slot_minutes).
      resolveServiceDuration(spaceId, serviceTypeId),
    ])
    if (windows.length === 0) return []
    // A service was chosen but did not resolve (inactive / bad id): offer nothing rather than the
    // wrong grid. A null serviceTypeId (no service) keeps every window at its own slot length.
    if (serviceTypeId && duration == null) return []
    const scoped = windowsForService(windows, serviceTypeId ?? null)
    if (scoped.length === 0) return []
    const bookedMs = new Set(booked.map((b) => new Date(b.starts_at).getTime()))
    return generateOpenSlots(
      scoped,
      bookedMs,
      now,
      undefined,
      duration != null ? { durationMinutes: duration } : undefined,
    )
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
    const windows = await readWindows(spaceId)
    return windows[0]?.timezone ?? 'UTC'
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
  const windows = windowsForService(allWindows, serviceTypeId ?? null)
  if (windows.length === 0) return fail('That time is no longer available. Pick another.')

  const slotMinutes = slotLengthAt(
    windows,
    startsAt.getTime(),
    now,
    undefined,
    duration != null ? { durationMinutes: duration } : undefined,
  )
  if (slotMinutes == null) return fail('That time is no longer available. Pick another.')

  // Already taken (confirmed or held pending)? A fast pre-check for a friendly message; the unique index
  // is the real guard.
  const booked = await readBlockingBookings(spaceId, now.toISOString())
  if (booked.some((b) => new Date(b.starts_at).getTime() === startsAt.getTime())) {
    return fail('That time was just taken. Pick another.')
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
