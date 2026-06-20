// EVENT SPACE TICKETING for the event_space role (MASTER-PLAN ADMIN-03, "Event Space ticketing owner
// control"). The library plus server actions behind the ticket surfaces, the Event Space analog of
// lib/spaces/memberships.ts:
//   space_ticket_tiers: the ticket tiers an owner publishes (name, kind free/rsvp, capacity, description).
//   space_ticket_rsvps: a member's RSVP to one of those tiers.
// Backed by the service-role admin client plus untyped casts (the tables are not in the generated DB
// types yet, ADR-246, mirroring lib/spaces/memberships.ts). The server is the authority for "which
// space" and "what may this caller do here" (P5, ADR-331/334/338): every write re-checks
// authorization; reads fail-safe (empty/null) and writes fail-closed on a permission miss.
//
// v1 HAS NO MONEY. There is NO price, by design: a tier is either FREE (open entry) or RSVP (a member
// reserves a spot, capacity-limited). Reserving a spot RECORDS an RSVP, it does NOT take a payment.
// The surfaces frame this honestly (CONTENT-VOICE skeptic test) so no copy implies a charge. Stripe
// Connect, real paid ticketing, tax receipts, and a box office are the Held Phase 4 and deliberately
// NOT built here (additive later: a price column + a payments table + a 'paid' kind, never a refactor,
// P4).
//
// SHAPE: the PURE helpers (tier normalization + validation) have no Supabase/Next imports, so they are
// fully unit-testable (lib/spaces/tickets.test.ts). The IO (the admin-client reads/writes) is a thin
// layer below them, and the ACTION IMPLEMENTATIONS are plain async functions here. This module has NO
// 'use server' directive (so it can ALSO export the pure helpers the test needs and the types the
// surfaces import). The thin 'use server' wrappers the CLIENT components call live in
// lib/spaces/tickets-actions.ts (a server-action module must export only async functions, so the pure
// helpers cannot live there). SERVER components import the read actions straight from here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** A ticket tier kind. NO 'paid' in v1 (no money; real paid ticketing is the Held Phase 4):
 *  - 'free' = open entry, no reservation needed.
 *  - 'rsvp' = a member reserves a spot (capacity-limited). */
export type TicketKind = 'free' | 'rsvp'

/** One ticket tier as the app consumes it (camelCased). There is NO price in v1 (no money). capacity
 *  caps the spots (null = unlimited); for a 'free' tier it is informational only (a free tier needs no
 *  reservation, so it is never blocked on capacity). */
export interface TicketTier {
  /** The tier id (absent for a not-yet-saved draft from the editor). */
  id?: string
  name: string
  kind: TicketKind
  /** Spots the tier holds; null = unlimited. */
  capacity: number | null
  description: string | null
  sort: number
  isActive: boolean
}

/** One of the owner's RSVPs (the owner-only list). Carries the member id + display name plus the tier
 *  they reserved and when, so the owner sees who is coming. */
export interface SpaceRsvp {
  id: string
  spaceId: string
  memberProfileId: string
  memberName: string
  tierId: string
  tierName: string
  reservedAt: string
}

/** The viewer's OWN going RSVP on a tier (or null), for the member surface to show their reservation. */
export interface MyRsvp {
  id: string
  tierId: string
  tierName: string
  reservedAt: string
}

// Hard caps so a malformed/hostile tier set can never write an unbounded number of rows.
const MAX_TIERS = 24
const MAX_NAME_LEN = 80
const MAX_DESCRIPTION_LEN = 500
// A generous upper bound on a capacity so a typo cannot store an absurd value.
const MAX_CAPACITY = 1_000_000

const KINDS: readonly TicketKind[] = ['free', 'rsvp']

// ── PURE: tier normalization + validation (no IO, fully testable) ───────────────────────────────

/** Clamp a raw capacity to a non-negative integer in [0, MAX_CAPACITY], or null (unlimited). An
 *  empty / non-finite / negative value reads as null (unlimited), so a blank capacity never blocks an
 *  RSVP and a malformed value never throws. Pure. */
export function normalizeCapacity(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, MAX_CAPACITY)
}

/** Coerce a raw tier-ish value to a clean TicketTier, or null if it cannot be made valid. A tier MUST
 *  have a non-empty name; everything else defaults sensibly (kind 'free', capacity null/unlimited,
 *  active true). Fail-closed: a nameless / malformed tier is DROPPED, never trusted. The `id` is
 *  preserved only when it is a non-empty string (a draft has none). Pure. */
export function normalizeTicketTier(raw: {
  id?: unknown
  name?: unknown
  kind?: unknown
  capacity?: unknown
  description?: unknown
  sort?: unknown
  isActive?: unknown
}): TicketTier | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return null

  const kind: TicketKind = KINDS.includes(raw.kind as TicketKind)
    ? (raw.kind as TicketKind)
    : 'free'

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, MAX_DESCRIPTION_LEN)
      : null

  const sortNum = Number(raw.sort)
  const sort = Number.isFinite(sortNum) ? Math.max(0, Math.min(32767, Math.round(sortNum))) : 0

  const tier: TicketTier = {
    name,
    kind,
    capacity: normalizeCapacity(raw.capacity),
    description,
    sort,
    // Default-active: only an explicit `false` turns a tier off.
    isActive: raw.isActive !== false,
  }
  if (typeof raw.id === 'string' && raw.id.trim()) tier.id = raw.id.trim()
  return tier
}

/** Normalize + drop invalid tiers from a raw list, capping the count and re-numbering `sort` to the
 *  list order so the saved order is stable. Pure: the replace-set action and the test share it. */
export function normalizeTicketTierSet(raw: unknown): TicketTier[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_TIERS) : []
  // Number `sort` by OUTPUT position (after dropping invalid tiers), so the saved order is dense and
  // stable even when an invalid tier was skipped.
  return list
    .flatMap((t) => {
      const n = normalizeTicketTier((t ?? {}) as Record<string, unknown>)
      return n ? [n] : []
    })
    .map((t, i) => ({ ...t, sort: i }))
}

// ── IO: the untyped admin-client seams (tables not in generated types yet, ADR-246) ────────────

// Loosely-typed rows + builders for the two not-yet-typed tables, mirroring lib/spaces/memberships.ts.
type TierRow = {
  id: string
  space_id: string
  name: string
  kind: string
  capacity: number | null
  description: string | null
  sort: number
  is_active: boolean
}
type RsvpRow = {
  id: string
  space_id: string
  tier_id: string
  member_profile_id: string
  status: string
  reserved_at: string
}

type TierQuery = {
  select: (cols: string) => TierQuery
  eq: (col: string, val: string) => TierQuery
  order: (col: string, opts: { ascending: boolean }) => TierQuery
  delete: () => TierQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  then: (resolve: (r: { data: TierRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
type RsvpQuery = {
  select: (cols: string) => RsvpQuery
  eq: (col: string, val: string) => RsvpQuery
  order: (col: string, opts: { ascending: boolean }) => RsvpQuery
  update: (patch: Record<string, unknown>) => RsvpQuery
  insert: (rows: Record<string, unknown>[]) => RsvpQuery
  maybeSingle: () => Promise<{ data: RsvpRow | null; error: unknown }>
  then: (
    resolve: (r: { data: RsvpRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function tiersTable(): TierQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TierQuery }
  return db.from('space_ticket_tiers')
}
function rsvpsTable(): RsvpQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => RsvpQuery }
  return db.from('space_ticket_rsvps')
}

const TIER_COLS = 'id, space_id, name, kind, capacity, description, sort, is_active'
const RSVP_COLS = 'id, space_id, tier_id, member_profile_id, status, reserved_at'

/** Map a DB tier row to the app's TicketTier (kind/capacity re-normalized defensively). */
function mapTierRow(r: TierRow): TicketTier {
  const kind: TicketKind = KINDS.includes(r.kind as TicketKind) ? (r.kind as TicketKind) : 'free'
  return {
    id: r.id,
    name: r.name,
    kind,
    capacity: normalizeCapacity(r.capacity),
    description: r.description ?? null,
    sort: typeof r.sort === 'number' ? r.sort : 0,
    isActive: r.is_active !== false,
  }
}

/** Read a Space's tiers (service-role; FAIL-SAFE to []), sorted by sort. `activeOnly` filters to live
 *  tiers (the member surface); the editor reads all. */
async function readTiers(spaceId: string, activeOnly: boolean): Promise<TicketTier[]> {
  try {
    const { data, error } = await tiersTable()
      .select(TIER_COLS)
      .eq('space_id', spaceId)
      .order('sort', { ascending: true })
    if (error || !data) return []
    const rows = activeOnly ? data.filter((r) => r.is_active !== false) : data
    return rows.map(mapTierRow)
  } catch {
    return []
  }
}

/** Read a Space's going RSVPs (service-role; FAIL-SAFE to []). */
async function readGoingRsvps(spaceId: string): Promise<RsvpRow[]> {
  try {
    const { data, error } = await rsvpsTable()
      .select(RSVP_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'going')
      .order('reserved_at', { ascending: false })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** The viewer's going RSVP row on a tier, or null (service-role; FAIL-SAFE to null). */
async function readMyGoingRsvp(tierId: string, profileId: string): Promise<RsvpRow | null> {
  try {
    const { data } = await rsvpsTable()
      .select(RSVP_COLS)
      .eq('tier_id', tierId)
      .eq('member_profile_id', profileId)
      .eq('status', 'going')
      .maybeSingle()
    return data
  } catch {
    return null
  }
}

/** Count the GOING RSVPs on a tier (a head/count query: no rows, no name join). FAIL-SAFE to 0. The
 *  capacity gate reads this before recording a new RSVP. The tier id is already space-scoped by the
 *  caller, so this never reaches past the tenant. */
async function countGoingRsvps(tierId: string): Promise<number> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{ count: number | null }>
          }
        }
      }
    }
    const { count } = await db
      .from('space_ticket_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('tier_id', tierId)
      .eq('status', 'going')
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
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
 * Replace a Space's ticket tiers with `tiers` (replace-set, like setMembershipTiers). Gated on
 * canEditProfile (owner / admin / editor). Validates + normalizes every tier (a nameless / malformed
 * one is dropped, sort re-numbered to list order); an EMPTY list clears all tiers (a valid "no
 * tickets" state). Replaces (delete then insert) through the admin client. Existing RSVPs reference a
 * deleted tier row by id, so a future-safe note mirroring memberships v1: v1 deletes-and-reinserts,
 * which orphans an RSVP's tier_id if a tier is removed; listSpaceRsvps fails safe to a generic tier
 * name for an orphaned RSVP (the integrator should switch to upsert-by-id before paid ticketing
 * ships). Returns ActionResult. Fail-closed on permission. NO money is involved.
 */
export async function setTicketTiers(spaceId: string, tiers: TicketTier[]): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your ticket tiers.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set ticket tiers for this space.')

  // Normalize + drop anything invalid. An empty result is a valid "no tiers" state.
  const clean = normalizeTicketTierSet(tiers)

  try {
    // Clear the existing tiers, then insert the new set. The member surface re-reads these, so a clean
    // replace keeps the tier list the single source of truth.
    const del = await tiersTable().delete().eq('space_id', spaceId)
    if ((del as unknown as { error?: unknown }).error) {
      return fail('Could not save your tiers. Try again.')
    }
    if (clean.length > 0) {
      const rows = clean.map((t) => ({
        space_id: spaceId,
        name: t.name,
        kind: t.kind,
        capacity: t.capacity,
        description: t.description,
        sort: t.sort,
        is_active: t.isActive,
      }))
      const { error } = await tiersTable().insert(rows)
      if (error) return fail('Could not save your tiers. Try again.')
    }
  } catch {
    return fail('Could not save your tiers. Try again.')
  }
  return ok()
}

/** A Space's ACTIVE tiers, for the member ticket surface (any caller; the server component reads this
 *  so tiers are public-readable). Sorted by sort. FAIL-SAFE to []. */
export async function listTicketTiers(spaceId: string): Promise<TicketTier[]> {
  try {
    return await readTiers(spaceId, true)
  } catch {
    return []
  }
}

/** A Space's ALL tiers as the editor reads them back (service-role; FAIL-SAFE to []). Gated on
 *  canEditProfile (owner/admin/editor) OR a platform janitor previewing as staff; WRITES stay on
 *  canEditProfile. */
export async function listAllTicketTiers(spaceId: string): Promise<TicketTier[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return readTiers(spaceId, false)
}

/** The viewer's own going RSVP for a Space's tier, or null (any authenticated caller; FAIL-SAFE to
 *  null). The member surface reads this to show "you have a spot on <tier>" + a Cancel. */
export async function getMyRsvp(spaceId: string): Promise<MyRsvp | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  try {
    const rows = await readGoingRsvps(spaceId)
    const mine = rows.find((r) => r.member_profile_id === profileId)
    if (!mine) return null
    const tiers = await readTiers(spaceId, false)
    const tier = tiers.find((t) => t.id === mine.tier_id)
    return {
      id: mine.id,
      tierId: mine.tier_id,
      tierName: tier?.name ?? 'Ticket',
      reservedAt: mine.reserved_at,
    }
  } catch {
    return null
  }
}

/**
 * RSVP to a tier. Any authenticated member (resolved via getMyProfileId). v1 RECORDS the RSVP; it does
 * NOT take a payment (real paid ticketing is the Held Phase 4). The server re-validates that the tier
 * is real + active + an 'rsvp' tier of THIS Space (a 'free' tier needs no reservation), checks
 * capacity, then inserts a going RSVP. A friendly fail if the member already holds a going RSVP on this
 * tier (the partial unique index is the final guard against a race). Returns ActionResult. NO money.
 */
export async function rsvpToTier(spaceId: string, tierId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to reserve a spot.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // The tier must be a real, ACTIVE 'rsvp' tier of THIS Space (no cross-space / retired-tier RSVPs; a
  // free tier needs no reservation, so it is not RSVP-able).
  const tiers = await readTiers(spaceId, true)
  const tier = tiers.find((t) => t.id === tierId)
  if (!tier) return fail('That ticket is no longer available. Pick another.')
  if (tier.kind !== 'rsvp') return fail('This ticket is free entry, so there is nothing to reserve.')

  // Already reserved? (A fast pre-check for a friendly message; the unique index is the real guard.)
  const existing = await readMyGoingRsvp(tierId, profileId)
  if (existing) return fail('You already have a spot here.')

  // Capacity gate: a limited tier cannot exceed its spots. NULL capacity = unlimited.
  if (tier.capacity != null) {
    const going = await countGoingRsvps(tierId)
    if (going >= tier.capacity) return fail('This ticket is full. Try another tier.')
  }

  try {
    const { error } = await rsvpsTable()
      .insert([
        {
          space_id: spaceId,
          tier_id: tierId,
          member_profile_id: profileId,
          status: 'going',
        },
      ])
      .select(RSVP_COLS)
      .maybeSingle()
    if (error) {
      // The partial unique index rejects a second going row for the same member on this tier:
      // translate the race into the friendly message rather than a raw DB error.
      return fail('You already have a spot here.')
    }
  } catch {
    return fail('Could not reserve right now. Try again.')
  }
  return ok()
}

/**
 * Cancel an RSVP. Allowed for the MEMBER who reserved OR a space admin. Reads the row (admin client),
 * checks ownership / admin, then flips status to 'cancelled' (which releases the one-going guard so the
 * member could re-RSVP). Fail-closed on permission.
 */
export async function cancelRsvp(rsvpId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to cancel an RSVP.')

  let row: RsvpRow | null = null
  try {
    const { data } = await rsvpsTable().select(RSVP_COLS).eq('id', rsvpId).maybeSingle()
    row = data
  } catch {
    row = null
  }
  if (!row) return fail('RSVP not found.')

  // The member may always cancel their own; otherwise the caller must be a space admin.
  let allowed = row.member_profile_id === profileId
  if (!allowed) {
    const space = await getSpaceById(row.space_id)
    if (space) {
      const caps = await getSpaceCapabilities(space, profileId)
      allowed = caps.isAdmin
    }
  }
  if (!allowed) return fail('You do not have permission to cancel this RSVP.')

  try {
    const { error } = await rsvpsTable().update({ status: 'cancelled' }).eq('id', rsvpId)
    if (error) return fail('Could not cancel the RSVP. Try again.')
  } catch {
    return fail('Could not cancel the RSVP. Try again.')
  }
  return ok()
}

/**
 * The owner's RSVPs (member name + tier + reserved date). Gated on canEditProfile (owner / admin /
 * editor) OR a platform janitor previewing as staff. Reads the going RSVP rows, then resolves member
 * display names + tier names in batched lookups. FAIL-SAFE to [] for an anonymous / unauthorized caller
 * or any error.
 */
export async function listSpaceRsvps(spaceId: string): Promise<SpaceRsvp[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []

  try {
    const rows = await readGoingRsvps(spaceId)
    if (rows.length === 0) return []

    // Batch-resolve member display names + tier names (one query each).
    const memberIds = [...new Set(rows.map((r) => r.member_profile_id))]
    const [names, tiers] = await Promise.all([readMemberNames(memberIds), readTiers(spaceId, false)])
    const tierName = new Map(tiers.map((t) => [t.id, t.name]))

    return rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      memberProfileId: r.member_profile_id,
      memberName: names.get(r.member_profile_id) ?? 'A member',
      tierId: r.tier_id,
      // An orphaned tier_id (its tier was removed in a replace-set) falls back to a generic label.
      tierName: tierName.get(r.tier_id) ?? 'Ticket',
      reservedAt: r.reserved_at,
    }))
  } catch {
    return []
  }
}
