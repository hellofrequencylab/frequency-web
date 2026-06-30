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
}

/** One open slot offered to a member: the absolute UTC instant it starts, plus its length so the
 *  surface can label the duration. Never carries who booked anything (only OPEN slots are emitted). */
export interface OpenSlot {
  /** Absolute UTC instant (ISO 8601) the slot starts at. */
  startsAt: string
  /** Slot length in minutes (the window's slot_minutes). */
  slotMinutes: number
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
}): AvailabilityWindow | null {
  const weekday = Number(raw.weekday)
  const startMinute = Number(raw.startMinute)
  const endMinute = Number(raw.endMinute)
  let slotMinutes = Number(raw.slotMinutes)
  const timezone =
    typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone.trim() : 'UTC'

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) return null
  if (!Number.isInteger(endMinute) || endMinute < 1 || endMinute > 1440) return null
  if (endMinute <= startMinute) return null
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 480) slotMinutes = 30

  return { weekday, startMinute, endMinute, slotMinutes, timezone }
}

/** The candidate slot start-instants (as UTC Dates) a window produces across the next `horizonDays`
 *  days from `now`. Pure helper, used by generateOpenSlots. For each day in range whose local
 *  weekday matches the window, slice [startMinute, endMinute) by slotMinutes; a slot is emitted only
 *  if it fully fits before endMinute (a trailing partial slot is dropped). */
function windowSlotInstants(window: AvailabilityWindow, now: Date, horizonDays: number): Date[] {
  const out: Date[] = []
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
      minute + window.slotMinutes <= window.endMinute;
      minute += window.slotMinutes
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
): OpenSlot[] {
  const nowMs = now.getTime()
  // Map start-instant ms to slotMinutes, so duplicate instants from overlapping windows collapse
  // (last write wins on the length, which is fine: the start uniquely identifies a slot).
  const byInstant = new Map<number, number>()
  for (const window of windows.slice(0, MAX_WINDOWS)) {
    for (const instant of windowSlotInstants(window, now, horizonDays)) {
      const ms = instant.getTime()
      if (ms <= nowMs) continue // strictly future only: drop past + in-progress slots
      if (bookedStartsAtMs.has(ms)) continue // already taken
      byInstant.set(ms, window.slotMinutes)
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
): number | null {
  for (const window of windows.slice(0, MAX_WINDOWS)) {
    for (const instant of windowSlotInstants(window, now, horizonDays)) {
      if (instant.getTime() === startsAtMs) return window.slotMinutes
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
  gte: (col: string, val: string) => BookingQuery
  order: (col: string, opts: { ascending: boolean }) => BookingQuery
  update: (patch: Record<string, unknown>) => BookingQuery
  insert: (rows: Record<string, unknown>[]) => BookingQuery
  maybeSingle: () => Promise<{ data: BookingRow | null; error: unknown }>
  then: (
    resolve: (r: { data: BookingRow[] | null; error: unknown }) => unknown,
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

const AVAILABILITY_COLS = 'id, space_id, weekday, start_minute, end_minute, slot_minutes, timezone'
const BOOKING_COLS = 'id, space_id, member_profile_id, starts_at, ends_at, status, note'

/** Read a Space's availability windows (service-role; FAIL-SAFE to []). Malformed rows are dropped
 *  via normalizeWindow (fail-closed). */
async function readWindows(spaceId: string): Promise<AvailabilityWindow[]> {
  try {
    const { data, error } = await availabilityTable()
      .select(AVAILABILITY_COLS)
      .eq('space_id', spaceId)
    if (error || !data) return []
    return data.flatMap((r) => {
      const w = normalizeWindow({
        weekday: r.weekday,
        startMinute: r.start_minute,
        endMinute: r.end_minute,
        slotMinutes: r.slot_minutes,
        timezone: r.timezone,
      })
      return w ? [w] : []
    })
  } catch {
    return []
  }
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
      const rows = clean.map((w) => ({
        space_id: spaceId,
        weekday: w.weekday,
        start_minute: w.startMinute,
        end_minute: w.endMinute,
        slot_minutes: w.slotMinutes,
        timezone: w.timezone,
      }))
      const { error } = await availabilityTable().insert(rows)
      if (error) return fail('Could not save your availability. Try again.')
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
export async function listOpenSlots(spaceId: string): Promise<OpenSlot[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  try {
    const now = new Date()
    // The windows + bookings reads are independent, so start them TOGETHER (Promise.all) instead of
    // waterfalling one after the other. Both readers are fail-safe to [], so Promise.all never rejects.
    // The early-return short-circuit is preserved: with no published windows there are no slots, so we
    // return [] without running the (already-overlapped, cheap) generator.
    const [windows, booked] = await Promise.all([
      readWindows(spaceId),
      readConfirmedBookings(spaceId, now.toISOString()),
    ])
    if (windows.length === 0) return []
    const bookedMs = new Set(booked.map((b) => new Date(b.starts_at).getTime()))
    return generateOpenSlots(windows, bookedMs, now)
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
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to book a time.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const startsAt = new Date(startsAtISO)
  if (Number.isNaN(startsAt.getTime())) return fail('Pick a valid time.')

  const now = new Date()
  if (startsAt.getTime() <= now.getTime()) return fail('That time has already passed. Pick another.')

  // Re-derive the published slots and confirm the requested instant is a real, open one.
  const windows = await readWindows(spaceId)
  if (windows.length === 0) return fail('This space is not taking bookings right now.')

  const slotMinutes = slotLengthAt(windows, startsAt.getTime(), now)
  if (slotMinutes == null) return fail('That time is no longer available. Pick another.')

  // Already booked? (A fast pre-check for a friendly message; the unique index is the real guard.)
  const booked = await readConfirmedBookings(spaceId, now.toISOString())
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
