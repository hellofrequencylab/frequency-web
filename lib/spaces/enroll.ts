// ENROLLMENT for the Coaching role (ENTITY-SPACES-SYSTEM §2.7 "Coaching academy", MASTER-PLAN item
// ADMIN-02). The library plus server actions behind the enroll surfaces, the Coaching analog of
// lib/spaces/memberships.ts:
//   space_programs:     the ONE program/cohort an owner publishes (name, description, schedule,
//                       dates, capacity). One row per Space in v1.
//   space_enrollments:  a member's enrollment in that program.
// Backed by the service-role admin client plus untyped casts (the tables are not in the generated
// DB types yet, ADR-246, mirroring lib/spaces/memberships.ts). The server is the authority for "which
// space" and "what may this caller do here" (P5): every write re-checks authorization; reads
// fail-safe (empty/null) and writes fail-closed on a permission miss.
//
// v1 IS NOT BILLING. A program has NO price and enrolling takes NO payment: enrolling RESERVES a seat,
// it does NOT take a charge. The enroll surface frames this honestly (CONTENT-VOICE skeptic test) so
// no copy implies a charge. Paid enrollment / Stripe billing / waitlists / a structured session
// calendar are Phase 4 and deliberately NOT built here (additive later: a payments table + columns,
// never a refactor, P4).
//
// SHAPE: the PURE helpers (program normalization + validation) have no Supabase/Next imports, so they
// are fully unit-testable. The IO (the admin-client reads/writes) is a thin layer below them, and the
// ACTION IMPLEMENTATIONS are plain async functions here. This module has NO 'use server' directive
// (so it can ALSO export the pure helpers + the types the surfaces import). The thin 'use server'
// wrappers the CLIENT components call live in lib/spaces/enroll-actions.ts (a server-action module
// must export only async functions, so the pure helpers cannot live there). SERVER components import
// the read actions straight from here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { recordSpaceMemberActivity } from '@/lib/crm/interactions'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One program/cohort as the app consumes it (camelCased). There is NO price in v1 (enrolling takes
 *  no charge). schedule is free text describing when it runs; startsOn / endsOn are optional ISO date
 *  strings; capacity is an optional seat cap (0 = no cap). */
export interface SpaceProgram {
  /** The program id (absent for a not-yet-saved draft from the editor). */
  id?: string
  name: string
  description: string | null
  schedule: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  startsOn: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  endsOn: string | null
  /** Seat cap; 0 = no cap. DISPLAY + enroll guard, never a price. */
  capacity: number
  isPublished: boolean
}

/** One of the owner's enrollees (the owner-only list). Carries the member id + display name plus when
 *  they enrolled, so the owner sees who is in the program. */
export interface SpaceEnrollment {
  id: string
  spaceId: string
  memberProfileId: string
  memberName: string
  enrolledAt: string
}

/** The viewer's OWN active enrollment (or null), for the enroll surface to show their status. */
export interface MyEnrollment {
  id: string
  enrolledAt: string
}

/** The program plus a live seat count, for the member enroll surface. seatsLeft is null when the
 *  program has no cap (capacity 0); otherwise capacity minus active enrollments, floored at 0. */
export interface ProgramWithSeats {
  program: SpaceProgram
  activeCount: number
  seatsLeft: number | null
}

// Hard caps so a malformed/hostile program can never write an unbounded value.
const MAX_NAME_LEN = 120
const MAX_DESCRIPTION_LEN = 2000
const MAX_SCHEDULE_LEN = 500
// A generous upper bound on a seat cap so a typo cannot store an absurd value.
const MAX_CAPACITY = 1_000_000

// ── PURE: program normalization + validation (no IO, fully testable) ─────────────────────────────

/** A YYYY-MM-DD string, or null. Anything not matching the date shape (or empty) is dropped. Pure. */
function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  // Reject an impossible calendar date (e.g. 2026-13-40) — Date parses + normalizes it, so compare.
  const d = new Date(`${trimmed}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === trimmed ? trimmed : null
}

/** Clamp a raw capacity to a non-negative integer within [0, MAX_CAPACITY]. A non-finite / negative /
 *  NaN value floors to 0 (no cap). Pure. */
function normalizeCapacity(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_CAPACITY)
}

/** Coerce a raw program-ish value to a clean SpaceProgram, or null if it cannot be made valid. A
 *  program MUST have a non-empty name; everything else defaults sensibly. Fail-closed: a nameless /
 *  malformed program is DROPPED, never trusted. The `id` is preserved only when it is a non-empty
 *  string (a draft has none). If both dates are present and ends_on precedes starts_on, ends_on is
 *  dropped (a single date is always coherent). Pure. */
export function normalizeProgram(raw: {
  id?: unknown
  name?: unknown
  description?: unknown
  schedule?: unknown
  startsOn?: unknown
  endsOn?: unknown
  capacity?: unknown
  isPublished?: unknown
}): SpaceProgram | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return null

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, MAX_DESCRIPTION_LEN)
      : null

  const schedule =
    typeof raw.schedule === 'string' && raw.schedule.trim()
      ? raw.schedule.trim().slice(0, MAX_SCHEDULE_LEN)
      : null

  const startsOn = normalizeDate(raw.startsOn)
  let endsOn = normalizeDate(raw.endsOn)
  // An end-before-start range is incoherent: keep the start, drop the end.
  if (startsOn && endsOn && endsOn < startsOn) endsOn = null

  const program: SpaceProgram = {
    name,
    description,
    schedule,
    startsOn,
    endsOn,
    capacity: normalizeCapacity(raw.capacity),
    // Default-published: only an explicit `false` keeps the program drafted.
    isPublished: raw.isPublished !== false,
  }
  if (typeof raw.id === 'string' && raw.id.trim()) program.id = raw.id.trim()
  return program
}

// ── IO: the untyped admin-client seams (tables not in generated types yet, ADR-246) ────────────

// Loosely-typed rows + builders for the two not-yet-typed tables, mirroring lib/spaces/memberships.ts.
type ProgramRow = {
  id: string
  space_id: string
  name: string
  description: string | null
  schedule: string | null
  starts_on: string | null
  ends_on: string | null
  capacity: number
  is_published: boolean
}
type EnrollmentRow = {
  id: string
  space_id: string
  program_id: string
  member_profile_id: string
  status: string
  enrolled_at: string
}

type ProgramQuery = {
  select: (cols: string) => ProgramQuery
  eq: (col: string, val: string) => ProgramQuery
  order: (col: string, opts: { ascending: boolean }) => ProgramQuery
  delete: () => ProgramQuery
  insert: (rows: Record<string, unknown>[]) => ProgramQuery
  maybeSingle: () => Promise<{ data: ProgramRow | null; error: unknown }>
  then: (resolve: (r: { data: ProgramRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
type EnrollmentQuery = {
  select: (cols: string) => EnrollmentQuery
  eq: (col: string, val: string) => EnrollmentQuery
  order: (col: string, opts: { ascending: boolean }) => EnrollmentQuery
  update: (patch: Record<string, unknown>) => EnrollmentQuery
  insert: (rows: Record<string, unknown>[]) => EnrollmentQuery
  maybeSingle: () => Promise<{ data: EnrollmentRow | null; error: unknown }>
  then: (
    resolve: (r: { data: EnrollmentRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function programsTable(): ProgramQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => ProgramQuery }
  return db.from('space_programs')
}
function enrollmentsTable(): EnrollmentQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => EnrollmentQuery }
  return db.from('space_enrollments')
}

const PROGRAM_COLS =
  'id, space_id, name, description, schedule, starts_on, ends_on, capacity, is_published'
const ENROLLMENT_COLS = 'id, space_id, program_id, member_profile_id, status, enrolled_at'

/** Map a DB program row to the app's SpaceProgram. */
function mapProgramRow(r: ProgramRow): SpaceProgram {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    schedule: r.schedule ?? null,
    startsOn: r.starts_on ?? null,
    endsOn: r.ends_on ?? null,
    capacity: typeof r.capacity === 'number' ? r.capacity : 0,
    isPublished: r.is_published !== false,
  }
}

/** Read a Space's program row (service-role; FAIL-SAFE to null). `publishedOnly` filters to a live
 *  program (the member surface); the editor reads it regardless of publish state. */
async function readProgram(spaceId: string, publishedOnly: boolean): Promise<SpaceProgram | null> {
  try {
    const { data, error } = await programsTable()
      .select(PROGRAM_COLS)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    if (publishedOnly && data.is_published === false) return null
    return mapProgramRow(data)
  } catch {
    return null
  }
}

/** Read a Space's active enrollments (service-role; FAIL-SAFE to []). */
async function readActiveEnrollments(spaceId: string): Promise<EnrollmentRow[]> {
  try {
    const { data, error } = await enrollmentsTable()
      .select(ENROLLMENT_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** Count a Space's active enrollments (service-role; FAIL-SAFE to 0). */
async function countActiveEnrollments(spaceId: string): Promise<number> {
  return (await readActiveEnrollments(spaceId)).length
}

/** The viewer's active enrollment row for a Space, or null (service-role; FAIL-SAFE to null). */
async function readMyActiveEnrollment(
  spaceId: string,
  profileId: string,
): Promise<EnrollmentRow | null> {
  try {
    const { data } = await enrollmentsTable()
      .select(ENROLLMENT_COLS)
      .eq('space_id', spaceId)
      .eq('member_profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle()
    return data
  } catch {
    return null
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

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ──────────────────────────────────

/**
 * Set (create or replace) a Space's program. Gated on canEditProfile (owner / admin / editor).
 * Validates + normalizes the program (a nameless / malformed one is rejected). v1 keeps ONE program
 * per Space: this deletes any existing program row for the Space then inserts the new one (the
 * one-program-per-space unique index is the DB-level guard). Deleting the program cascades its
 * enrollments away, so an owner who replaces a program starts the roster fresh — acceptable in v1
 * where a program is a single ongoing cohort; the integrator should switch to upsert-by-id before a
 * program can have paid enrollments. Returns ActionResult. Fail-closed on permission.
 */
export async function setSpaceProgram(
  spaceId: string,
  raw: {
    name: string
    description?: string | null
    schedule?: string | null
    startsOn?: string | null
    endsOn?: string | null
    capacity?: number
    isPublished?: boolean
  },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set up your program.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set up a program for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see lib/spaces/booking.ts.
  if (!spaceFunctionAccess(space, 'enroll', caps.role))
    return fail('Enrollment is not turned on for this space, or your role cannot use it.')

  const clean = normalizeProgram(raw)
  if (!clean) return fail('Give your program a name.')

  try {
    // Replace: clear the existing program for this Space (cascades its enrollments), then insert the
    // new one. v1 is one program per Space, so a clean replace keeps the program row the single
    // source of truth and respects the one-program-per-space unique index.
    const del = await programsTable().delete().eq('space_id', spaceId)
    if ((del as unknown as { error?: unknown }).error) {
      return fail('Could not save your program. Try again.')
    }
    const { error } = await programsTable()
      .insert([
        {
          space_id: spaceId,
          name: clean.name,
          description: clean.description,
          schedule: clean.schedule,
          starts_on: clean.startsOn,
          ends_on: clean.endsOn,
          capacity: clean.capacity,
          is_published: clean.isPublished,
        },
      ])
      .select(PROGRAM_COLS)
      .maybeSingle()
    if (error) return fail('Could not save your program. Try again.')
  } catch {
    return fail('Could not save your program. Try again.')
  }
  return ok()
}

/** A Space's PUBLISHED program for the member enroll surface (any caller; the server component reads
 *  this so the program is public-readable). FAIL-SAFE to null. */
export async function getSpaceProgram(spaceId: string): Promise<SpaceProgram | null> {
  try {
    return await readProgram(spaceId, true)
  } catch {
    return null
  }
}

/** A Space's program with a live seat count, for the member enroll surface (any caller). Returns null
 *  when there is no published program. FAIL-SAFE to null. */
export async function getProgramWithSeats(spaceId: string): Promise<ProgramWithSeats | null> {
  try {
    const program = await readProgram(spaceId, true)
    if (!program) return null
    const activeCount = await countActiveEnrollments(spaceId)
    const seatsLeft =
      program.capacity > 0 ? Math.max(0, program.capacity - activeCount) : null
    return { program, activeCount, seatsLeft }
  } catch {
    return null
  }
}

/** A Space's program as the editor reads it back (service-role; FAIL-SAFE to null). Gated on
 *  canEditProfile (owner/admin/editor) OR a platform janitor previewing as staff; WRITES stay on
 *  canEditProfile. Reads regardless of publish state so the owner can edit a draft. */
export async function getSpaceProgramForOwner(spaceId: string): Promise<SpaceProgram | null> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return null
  return readProgram(spaceId, false)
}

/** The viewer's own active enrollment for a Space, or null (any authenticated caller; FAIL-SAFE to
 *  null). The enroll surface reads this to show "you are enrolled" + a Cancel. */
export async function getMyEnrollment(spaceId: string): Promise<MyEnrollment | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  try {
    const row = await readMyActiveEnrollment(spaceId, profileId)
    if (!row) return null
    return { id: row.id, enrolledAt: row.enrolled_at }
  } catch {
    return null
  }
}

/**
 * Enroll in a Space's program. Any authenticated member (resolved via getMyProfileId). v1 RECORDS the
 * enrollment; it does NOT take a payment (paid enrollment is Phase 4). The server re-validates that
 * the program is real + published in this Space, refuses an over-capacity enrollment, then inserts an
 * active enrollment. A friendly fail if the member already has an active enrollment here (the partial
 * unique index is the final guard against a race). Returns ActionResult.
 */
export async function enrollInProgram(spaceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to enroll.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // The program must be a real, PUBLISHED program of THIS Space (no cross-space / draft enrolls).
  const program = await readProgram(spaceId, true)
  if (!program || !program.id) return fail('Enrollment is not open right now. Check back soon.')

  // Already enrolled? (A fast pre-check for a friendly message; the unique index is the real guard.)
  const existing = await readMyActiveEnrollment(spaceId, profileId)
  if (existing) return fail('You are already enrolled here.')

  // Capacity guard: refuse when a capped program is full.
  if (program.capacity > 0) {
    const activeCount = await countActiveEnrollments(spaceId)
    if (activeCount >= program.capacity) return fail('This program is full right now.')
  }

  try {
    const { error } = await enrollmentsTable()
      .insert([
        {
          space_id: spaceId,
          program_id: program.id,
          member_profile_id: profileId,
          status: 'active',
        },
      ])
      .select(ENROLLMENT_COLS)
      .maybeSingle()
    if (error) {
      // The partial unique index rejects a second active row for the same member: translate the race
      // into the friendly message rather than a raw DB error.
      return fail('You are already enrolled here.')
    }
  } catch {
    return fail('Could not enroll right now. Try again.')
  }
  // Log the enrollment onto the member's Space timeline (program adoption shows on Resonance, ADR-796).
  await recordSpaceMemberActivity({
    spaceId,
    spaceOwnerProfileId: space.ownerProfileId,
    memberProfileId: profileId,
    channel: 'event',
    summary: program.name ? `Enrolled: ${program.name}` : 'Enrolled in the program',
    idempotencyKey: `enroll:${spaceId}:${profileId}`,
    metadata: { kind: 'program_enrollment', programId: program.id, programName: program.name ?? null },
  })
  return ok()
}

/**
 * Cancel an enrollment. Allowed for the MEMBER who enrolled OR a space admin. Reads the row (admin
 * client), checks ownership / admin, then flips status to 'cancelled' (which releases the one-active
 * guard so the member could re-enroll). Fail-closed on permission.
 */
export async function cancelEnrollment(enrollmentId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to cancel an enrollment.')

  let row: EnrollmentRow | null = null
  try {
    const { data } = await enrollmentsTable()
      .select(ENROLLMENT_COLS)
      .eq('id', enrollmentId)
      .maybeSingle()
    row = data
  } catch {
    row = null
  }
  if (!row) return fail('Enrollment not found.')

  // The member may always cancel their own; otherwise the caller must be a space admin.
  let allowed = row.member_profile_id === profileId
  if (!allowed) {
    const space = await getSpaceById(row.space_id)
    if (space) {
      const caps = await getSpaceCapabilities(space, profileId)
      allowed = caps.isAdmin
    }
  }
  if (!allowed) return fail('You do not have permission to cancel this enrollment.')

  try {
    const { error } = await enrollmentsTable()
      .update({ status: 'cancelled' })
      .eq('id', enrollmentId)
    if (error) return fail('Could not cancel the enrollment. Try again.')
  } catch {
    return fail('Could not cancel the enrollment. Try again.')
  }
  return ok()
}

/**
 * The owner's ENROLLEES (member name + enrolled date). Gated on canEditProfile (owner / admin /
 * editor). Reads the active enrollment rows, then resolves member display names in a batched lookup.
 * FAIL-SAFE to [] for an anonymous / unauthorized caller or any error.
 */
export async function listSpaceEnrollments(spaceId: string): Promise<SpaceEnrollment[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []

  try {
    const rows = await readActiveEnrollments(spaceId)
    if (rows.length === 0) return []

    const memberIds = [...new Set(rows.map((r) => r.member_profile_id))]
    const names = await readMemberNames(memberIds)

    return rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      memberProfileId: r.member_profile_id,
      memberName: names.get(r.member_profile_id) ?? 'A member',
      enrolledAt: r.enrolled_at,
    }))
  } catch {
    return []
  }
}
