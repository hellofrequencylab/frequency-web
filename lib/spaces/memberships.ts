// MEMBERSHIPS for the Business role (ENTITY-SPACES-SYSTEM §2.5 "Memberships"). The library plus
// server actions behind the membership surfaces, the Business analog of lib/spaces/booking.ts:
//   space_membership_tiers: the tiers an owner publishes (name, price shown, interval, benefits).
//   space_memberships:      a member's membership in one of those tiers.
// Backed by the service-role admin client plus untyped casts (the tables are not in the generated
// DB types yet, ADR-246, mirroring lib/spaces/booking.ts). The server is the authority for "which
// space" and "what may this caller do here" (P5): every write re-checks authorization; reads
// fail-safe (empty/null) and writes fail-closed on a permission miss.
//
// v1 IS NOT BILLING. price_cents + interval are DISPLAY ONLY: joining a tier RECORDS a membership,
// it does NOT take a payment. The join surface frames this honestly (CONTENT-VOICE skeptic test) so
// no copy implies a charge. Stripe billing / dunning / proration and member-only content gating are
// Phase 4 and deliberately NOT built here (additive later: a payments table + a subscription id
// column, never a refactor, P4).
//
// SHAPE: the PURE helpers (tier normalization + validation) have no Supabase/Next imports, so they
// are fully unit-testable (lib/spaces/memberships.test.ts). The IO (the admin-client reads/writes)
// is a thin layer below them, and the ACTION IMPLEMENTATIONS are plain async functions here. This
// module has NO 'use server' directive (so it can ALSO export the pure helpers the test needs and
// the types the surfaces import). The thin 'use server' wrappers the CLIENT components call live in
// lib/spaces/memberships-actions.ts (a server-action module must export only async functions, so the
// pure helpers cannot live there). SERVER components import the read actions straight from here.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { fireSpaceTrigger } from '@/lib/spaces/drip-enroll'
import { recordSpaceMemberActivity } from '@/lib/crm/interactions'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** A billing cadence shown to members. DISPLAY ONLY in v1 (no charge is taken). */
export type MembershipInterval = 'month' | 'year' | 'once'

/** One membership tier as the app consumes it (camelCased). priceCents + interval are DISPLAY ONLY
 *  in v1 (what membership will cost; joining takes no charge). benefits is a list of plain strings
 *  the join card renders. */
export interface MembershipTier {
  /** The tier id (absent for a not-yet-saved draft from the editor). */
  id?: string
  name: string
  priceCents: number
  interval: MembershipInterval
  description: string | null
  benefits: string[]
  sort: number
  isActive: boolean
}

/** One of the owner's members (the owner-only list). Carries the member id + display name plus the
 *  tier they joined and when, so the owner sees who is a member. */
export interface SpaceMembership {
  id: string
  spaceId: string
  memberProfileId: string
  memberName: string
  tierId: string
  tierName: string
  startedAt: string
}

/** The viewer's OWN active membership (or null), for the join surface to show their current tier. */
export interface MyMembership {
  id: string
  tierId: string
  tierName: string
  startedAt: string
}

// Hard caps so a malformed/hostile tier set can never write an unbounded number of rows.
const MAX_TIERS = 24
const MAX_BENEFITS = 20
const MAX_NAME_LEN = 80
const MAX_DESCRIPTION_LEN = 500
const MAX_BENEFIT_LEN = 120
// A generous upper bound on a displayed price (in cents) so a typo cannot store an absurd value.
const MAX_PRICE_CENTS = 100_000_000

const INTERVALS: readonly MembershipInterval[] = ['month', 'year', 'once']

// ── PURE: tier normalization + validation (no IO, fully testable) ───────────────────────────────

/** Coerce a raw value to a clean array of benefit strings: trims each, drops empties, caps the
 *  count + each length. Anything non-array (or non-string entries) is dropped. Pure + fail-closed. */
export function normalizeBenefits(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().slice(0, MAX_BENEFIT_LEN)
    if (trimmed) out.push(trimmed)
    if (out.length >= MAX_BENEFITS) break
  }
  return out
}

/** Clamp a raw price to a non-negative integer number of cents within [0, MAX_PRICE_CENTS]. A
 *  non-finite / negative / NaN value floors to 0. Pure. */
function normalizePriceCents(raw: unknown): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, MAX_PRICE_CENTS)
}

/** Coerce a raw tier-ish value to a clean MembershipTier, or null if it cannot be made valid. A
 *  tier MUST have a non-empty name; everything else defaults sensibly (price 0, interval 'month',
 *  active true). Fail-closed: a nameless / malformed tier is DROPPED, never trusted. The `id` is
 *  preserved only when it is a non-empty string (a draft has none). Pure. */
export function normalizeTier(raw: {
  id?: unknown
  name?: unknown
  priceCents?: unknown
  interval?: unknown
  description?: unknown
  benefits?: unknown
  sort?: unknown
  isActive?: unknown
}): MembershipTier | null {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return null

  const interval: MembershipInterval = INTERVALS.includes(raw.interval as MembershipInterval)
    ? (raw.interval as MembershipInterval)
    : 'month'

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, MAX_DESCRIPTION_LEN)
      : null

  const sortNum = Number(raw.sort)
  const sort = Number.isFinite(sortNum) ? Math.max(0, Math.min(32767, Math.round(sortNum))) : 0

  const tier: MembershipTier = {
    name,
    priceCents: normalizePriceCents(raw.priceCents),
    interval,
    description,
    benefits: normalizeBenefits(raw.benefits),
    sort,
    // Default-active: only an explicit `false` turns a tier off.
    isActive: raw.isActive !== false,
  }
  if (typeof raw.id === 'string' && raw.id.trim()) tier.id = raw.id.trim()
  return tier
}

/** Normalize + drop invalid tiers from a raw list, capping the count and re-numbering `sort` to the
 *  list order so the saved order is stable. Pure: the replace-set action and the test share it. */
export function normalizeTierSet(raw: unknown): MembershipTier[] {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_TIERS) : []
  // Number `sort` by OUTPUT position (after dropping invalid tiers), so the saved order is dense
  // and stable even when an invalid tier was skipped.
  return list
    .flatMap((t) => {
      const n = normalizeTier((t ?? {}) as Record<string, unknown>)
      return n ? [n] : []
    })
    .map((t, i) => ({ ...t, sort: i }))
}

// ── IO: the untyped admin-client seams (tables not in generated types yet, ADR-246) ────────────

// Loosely-typed rows + builders for the two not-yet-typed tables, mirroring lib/spaces/booking.ts.
type TierRow = {
  id: string
  space_id: string
  name: string
  price_cents: number
  interval: string
  description: string | null
  benefits: unknown
  sort: number
  is_active: boolean
}
type MembershipRow = {
  id: string
  space_id: string
  member_profile_id: string
  tier_id: string
  status: string
  started_at: string
}

type TierQuery = {
  select: (cols: string) => TierQuery
  eq: (col: string, val: string) => TierQuery
  order: (col: string, opts: { ascending: boolean }) => TierQuery
  delete: () => TierQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  then: (resolve: (r: { data: TierRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}
type MembershipQuery = {
  select: (cols: string) => MembershipQuery
  eq: (col: string, val: string) => MembershipQuery
  order: (col: string, opts: { ascending: boolean }) => MembershipQuery
  update: (patch: Record<string, unknown>) => MembershipQuery
  insert: (rows: Record<string, unknown>[]) => MembershipQuery
  maybeSingle: () => Promise<{ data: MembershipRow | null; error: unknown }>
  then: (
    resolve: (r: { data: MembershipRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function tiersTable(): TierQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TierQuery }
  return db.from('space_membership_tiers')
}
function membershipsTable(): MembershipQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => MembershipQuery }
  return db.from('space_memberships')
}

const TIER_COLS = 'id, space_id, name, price_cents, interval, description, benefits, sort, is_active'
const MEMBERSHIP_COLS = 'id, space_id, member_profile_id, tier_id, status, started_at'

/** Map a DB tier row to the app's MembershipTier (benefits re-normalized; a malformed row's name is
 *  trusted as-is since it was validated on write). */
function mapTierRow(r: TierRow): MembershipTier {
  const interval: MembershipInterval = INTERVALS.includes(r.interval as MembershipInterval)
    ? (r.interval as MembershipInterval)
    : 'month'
  return {
    id: r.id,
    name: r.name,
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : 0,
    interval,
    description: r.description ?? null,
    benefits: normalizeBenefits(r.benefits),
    sort: typeof r.sort === 'number' ? r.sort : 0,
    isActive: r.is_active !== false,
  }
}

/** Read a Space's tiers (service-role; FAIL-SAFE to []), sorted by sort then name. `activeOnly`
 *  filters to live tiers (the member surface); the editor reads all. */
async function readTiers(spaceId: string, activeOnly: boolean): Promise<MembershipTier[]> {
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

/** Read a Space's active memberships (service-role; FAIL-SAFE to []). */
async function readActiveMemberships(spaceId: string): Promise<MembershipRow[]> {
  try {
    const { data, error } = await membershipsTable()
      .select(MEMBERSHIP_COLS)
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** The viewer's active membership row for a Space, or null (service-role; FAIL-SAFE to null). */
async function readMyActiveMembership(
  spaceId: string,
  profileId: string,
): Promise<MembershipRow | null> {
  try {
    const { data } = await membershipsTable()
      .select(MEMBERSHIP_COLS)
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
 * Replace a Space's membership tiers with `tiers` (replace-set, like setSpaceAvailability). Gated on
 * canEditProfile (owner / admin / editor). Validates + normalizes every tier (a nameless / malformed
 * one is dropped, sort re-numbered to list order); an EMPTY list clears all tiers (a valid "no
 * memberships" state). Replaces (delete then insert) through the admin client. Existing memberships
 * reference deleted tier rows by id, so a future-safe note: v1 deletes-and-reinserts, which orphans
 * a membership's tier_id if a tier is removed; listSpaceMemberships fails safe to a generic tier name
 * for an orphaned membership (the integrator should switch to upsert-by-id before billing ships).
 * Returns ActionResult. Fail-closed on permission.
 */
export async function setMembershipTiers(
  spaceId: string,
  tiers: MembershipTier[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your membership tiers.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set membership tiers for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see lib/spaces/booking.ts.
  if (!spaceFunctionAccess(space, 'memberships', caps.role))
    return fail('Memberships is not turned on for this space, or your role cannot use it.')

  // Normalize + drop anything invalid. An empty result is a valid "no tiers" state.
  const clean = normalizeTierSet(tiers)

  try {
    // Clear the existing tiers, then insert the new set. The member surface re-reads these, so a
    // clean replace keeps the tier list the single source of truth.
    const del = await tiersTable().delete().eq('space_id', spaceId)
    if ((del as unknown as { error?: unknown }).error) {
      return fail('Could not save your tiers. Try again.')
    }
    if (clean.length > 0) {
      const rows = clean.map((t) => ({
        space_id: spaceId,
        name: t.name,
        price_cents: t.priceCents,
        interval: t.interval,
        description: t.description,
        benefits: t.benefits,
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

/** A Space's ACTIVE tiers, for the member join surface (any caller; the server component reads this
 *  so tiers are public-readable). Sorted by sort. FAIL-SAFE to []. */
export async function listMembershipTiers(spaceId: string): Promise<MembershipTier[]> {
  try {
    return await readTiers(spaceId, true)
  } catch {
    return []
  }
}

/** A Space's ALL tiers as the editor reads them back (service-role; FAIL-SAFE to []). Gated on
 *  canManage (owner/admin/editor) OR a platform janitor previewing as staff; WRITES stay on
 *  canEditProfile. */
export async function listAllMembershipTiers(spaceId: string): Promise<MembershipTier[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return readTiers(spaceId, false)
}

/** The viewer's own active membership for a Space, or null (any authenticated caller; FAIL-SAFE to
 *  null). The join surface reads this to show "you are a member of <tier>" + a Cancel. */
export async function getMyMembership(spaceId: string): Promise<MyMembership | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  try {
    const row = await readMyActiveMembership(spaceId, profileId)
    if (!row) return null
    const tiers = await readTiers(spaceId, false)
    const tier = tiers.find((t) => t.id === row.tier_id)
    return {
      id: row.id,
      tierId: row.tier_id,
      tierName: tier?.name ?? 'Member',
      startedAt: row.started_at,
    }
  } catch {
    return null
  }
}

/**
 * Join a tier. Any authenticated member (resolved via getMyProfileId). v1 RECORDS the membership;
 * it does NOT take a payment (billing is Phase 4). The server re-validates that the tier is real +
 * active in this Space, then inserts an active membership. A friendly fail if the member already has
 * an active membership here (the partial unique index is the final guard against a race). Returns
 * ActionResult.
 */
export async function joinTier(spaceId: string, tierId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to become a member.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // The tier must be a real, ACTIVE tier of THIS Space (no cross-space / retired-tier joins).
  const tiers = await readTiers(spaceId, true)
  const tier = tiers.find((t) => t.id === tierId)
  if (!tier) return fail('That tier is no longer available. Pick another.')

  // Already a member? (A fast pre-check for a friendly message; the unique index is the real guard.)
  const existing = await readMyActiveMembership(spaceId, profileId)
  if (existing) return fail('You are already a member here.')

  try {
    const { error } = await membershipsTable()
      .insert([
        {
          space_id: spaceId,
          member_profile_id: profileId,
          tier_id: tierId,
          status: 'active',
        },
      ])
      .select(MEMBERSHIP_COLS)
      .maybeSingle()
    if (error) {
      // The partial unique index rejects a second active row for the same member: translate the
      // race into the friendly message rather than a raw DB error.
      return fail('You are already a member here.')
    }
    // AUTOMATION TRIGGER (ADR-561): a member just joined a tier. Fire the 'member.joined' trigger so any
    // enabled rule enrolls this member (resolved to their Space contact by profile) into its drip
    // sequence. FIRE-SAFE + fire-and-forget: fireSpaceTrigger never throws and we do not await it, so a
    // rule error can never break the join.
    void fireSpaceTrigger(spaceId, 'member.joined', { profileId })
  } catch {
    return fail('Could not join right now. Try again.')
  }
  // Log the join onto the member's Space timeline (program adoption shows on Resonance, ADR-796).
  await recordSpaceMemberActivity({
    spaceId,
    spaceOwnerProfileId: space.ownerProfileId,
    memberProfileId: profileId,
    channel: 'event',
    summary: `Joined membership: ${tier.name}`,
    idempotencyKey: `member_join:${spaceId}:${profileId}`,
    metadata: { kind: 'membership_join', tierId, tierName: tier.name },
  })
  return ok()
}

/**
 * Cancel a membership. Allowed for the MEMBER who joined OR a space admin. Reads the row (admin
 * client), checks ownership / admin, then flips status to 'cancelled' (which releases the
 * one-active guard so the member could re-join). Fail-closed on permission.
 */
export async function cancelMembership(membershipId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to cancel a membership.')

  let row: MembershipRow | null = null
  try {
    const { data } = await membershipsTable()
      .select(MEMBERSHIP_COLS)
      .eq('id', membershipId)
      .maybeSingle()
    row = data
  } catch {
    row = null
  }
  if (!row) return fail('Membership not found.')

  // The member may always cancel their own; otherwise the caller must be a space admin.
  let allowed = row.member_profile_id === profileId
  if (!allowed) {
    const space = await getSpaceById(row.space_id)
    if (space) {
      const caps = await getSpaceCapabilities(space, profileId)
      allowed = caps.isAdmin
    }
  }
  if (!allowed) return fail('You do not have permission to cancel this membership.')

  try {
    const { error } = await membershipsTable()
      .update({ status: 'cancelled' })
      .eq('id', membershipId)
    if (error) return fail('Could not cancel the membership. Try again.')
  } catch {
    return fail('Could not cancel the membership. Try again.')
  }
  return ok()
}

/**
 * The owner's MEMBERS (member name + tier + joined date). Gated on canEditProfile (owner / admin /
 * editor). Reads the active membership rows, then resolves member display names + tier names in
 * batched lookups. FAIL-SAFE to [] for an anonymous / unauthorized caller or any error.
 */
export async function listSpaceMemberships(spaceId: string): Promise<SpaceMembership[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []

  try {
    const rows = await readActiveMemberships(spaceId)
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
      tierName: tierName.get(r.tier_id) ?? 'Member',
      startedAt: r.started_at,
    }))
  } catch {
    return []
  }
}
