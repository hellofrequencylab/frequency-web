// MEMBERSHIPS for the Business role (ENTITY-SPACES-SYSTEM §2.5 "Memberships"). The library plus
// server actions behind the membership surfaces, the Business analog of lib/spaces/booking.ts:
//   space_membership_tiers: the tiers an owner publishes (name, price shown, interval, benefits).
//   space_memberships:      a member's membership in one of those tiers.
// Backed by the service-role admin client (the tables are in the generated DB types, so access is
// typed; mirrors lib/spaces/booking.ts). The server is the authority for "which
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
import { ensureSpaceMemberContact } from '@/lib/crm/lead-capture'
import { recordSpaceMemberActivity } from '@/lib/crm/interactions'
import { syncTierCircleAccess } from '@/lib/spaces/tier-circle'
import { stripe } from '@/lib/billing/stripe'

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
  /** Max ACTIVE members (ADR-824); null = unlimited. */
  capacity: number | null
  /** When true, a FULL tier takes waitlist joins instead of closing (ADR-824). */
  waitlist: boolean
  sort: number
  isActive: boolean
}

/** One of the owner's members (the owner-only list). Carries the member id + display name plus the
 *  tier they joined and when, so the owner sees who is a member. Includes WAITLIST rows (ADR-824)
 *  so the owner can promote as spots open — `status` says which is which. */
export interface SpaceMembership {
  id: string
  spaceId: string
  memberProfileId: string
  memberName: string
  tierId: string
  tierName: string
  status: 'active' | 'waitlist'
  startedAt: string
}

/** The viewer's OWN open membership (or null), for the join surface to show their current tier.
 *  `status` distinguishes a live membership from a waitlist spot (ADR-824). */
export interface MyMembership {
  id: string
  tierId: string
  tierName: string
  status: 'active' | 'waitlist'
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
  capacity?: unknown
  waitlist?: unknown
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

  // Capacity (ADR-824): a non-negative integer, or null for unlimited. Malformed/negative → null
  // (fail-open to unlimited, matching the DB default — never to an accidental 0-member lockout).
  const capNum = Math.round(Number(raw.capacity))
  const capacity =
    raw.capacity != null && Number.isFinite(capNum) && capNum >= 0
      ? Math.min(capNum, 1_000_000)
      : null

  const tier: MembershipTier = {
    name,
    priceCents: normalizePriceCents(raw.priceCents),
    interval,
    description,
    benefits: normalizeBenefits(raw.benefits),
    capacity,
    waitlist: raw.waitlist === true,
    sort,
    // Default-active: only an explicit `false` turns a tier off.
    isActive: raw.isActive !== false,
  }
  if (typeof raw.id === 'string' && raw.id.trim()) tier.id = raw.id.trim()
  return tier
}

/** The write plan for a tier save (ADR-824 upsert-by-id): which incoming tiers UPDATE an existing
 *  row (id preserved — event-access gates and memberships keep pointing at it), which INSERT, and
 *  which existing rows DELETE. An incoming id that isn't a current row of this Space is treated as
 *  an insert (id dropped), so a stale/cross-space id can never hijack a row. Pure; tested. */
export function planTierSetOps(
  existingIds: string[],
  tiers: MembershipTier[],
): {
  updates: (MembershipTier & { id: string })[]
  inserts: MembershipTier[]
  deleteIds: string[]
} {
  const existing = new Set(existingIds)
  const updates: (MembershipTier & { id: string })[] = []
  const inserts: MembershipTier[] = []
  const kept = new Set<string>()
  for (const t of tiers) {
    if (t.id && existing.has(t.id) && !kept.has(t.id)) {
      kept.add(t.id)
      updates.push({ ...t, id: t.id })
    } else {
      const { id: _dropped, ...rest } = t
      inserts.push(rest)
    }
  }
  return { updates, inserts, deleteIds: existingIds.filter((id) => !kept.has(id)) }
}

/** Normalize + drop invalid tiers from a raw list, capping the count and re-numbering `sort` to the
 *  list order so the saved order is stable. Pure: the upsert action and the test share it. */
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

// ── IO: the typed admin-client seams ────────────────────────────────────────────────────────────

type TierRow = {
  id: string
  space_id: string
  name: string
  price_cents: number
  interval: string
  description: string | null
  benefits: unknown
  capacity: number | null
  waitlist: boolean
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

function tiersTable() {
  return createAdminClient().from('space_membership_tiers')
}
function membershipsTable() {
  return createAdminClient().from('space_memberships')
}

const TIER_COLS =
  'id, space_id, name, price_cents, interval, description, benefits, capacity, waitlist, sort, is_active'
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
    capacity: typeof r.capacity === 'number' && r.capacity >= 0 ? r.capacity : null,
    waitlist: r.waitlist === true,
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

/** Read a Space's OPEN memberships — active + waitlist (service-role; FAIL-SAFE to []). */
async function readOpenMemberships(spaceId: string): Promise<MembershipRow[]> {
  try {
    const { data, error } = await membershipsTable()
      .select(MEMBERSHIP_COLS)
      .eq('space_id', spaceId)
      .in('status', ['active', 'waitlist'])
      .order('started_at', { ascending: false })
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** The viewer's OPEN membership row (active or waitlist) for a Space, or null (service-role;
 *  FAIL-SAFE to null). The one-open unique index guarantees at most one row. */
async function readMyOpenMembership(
  spaceId: string,
  profileId: string,
): Promise<MembershipRow | null> {
  try {
    const { data } = await membershipsTable()
      .select(MEMBERSHIP_COLS)
      .eq('space_id', spaceId)
      .eq('member_profile_id', profileId)
      .in('status', ['active', 'waitlist'])
      .maybeSingle()
    return data
  } catch {
    return null
  }
}

/** Count ACTIVE members per tier for a Space (service-role; FAIL-SAFE to an empty map). Drives the
 *  capacity check in joinTier and the spots-left display on the join surface (ADR-824). */
export async function countActiveMembersByTier(spaceId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await readOpenMemberships(spaceId)
  for (const r of rows) {
    if (r.status !== 'active') continue
    out.set(r.tier_id, (out.get(r.tier_id) ?? 0) + 1)
  }
  return out
}

/** Batch-read display names for a set of profile ids (service-role; FAIL-SAFE to an empty map). */
async function readMemberNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const { data } = await createAdminClient().from('profiles').select('id, display_name').in('id', ids)
    for (const p of data ?? []) out.set(p.id, p.display_name?.trim() || 'A member')
  } catch {
    // fall through to the empty map (callers default to 'A member')
  }
  return out
}

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ──────────────────────────────────

/**
 * Save a Space's membership tiers as an UPSERT-BY-ID (ADR-824; replaces the v1 delete-and-reinsert).
 * Gated on canEditProfile (owner / admin / editor). Validates + normalizes every tier (a nameless /
 * malformed one is dropped, sort re-numbered to list order); an EMPTY list clears all tiers (a valid
 * "no memberships" state). A tier that carries its existing id is UPDATED IN PLACE, so everything
 * that references it — memberships' tier_id, members-only event tickets (event_ticket_types
 * .space_tier_id, ADR-823) — keeps pointing at the same row across edits. Only genuinely removed
 * tiers are deleted (their event gates degrade to any-member via ON DELETE SET NULL, and
 * listSpaceMemberships falls back to a generic tier name for their memberships).
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

  // 🔴 THE PLAN WALL (ADR-914, docs/VALUE-LADDER.md §3). Selling a membership is the most defensible
  // wall in the product, and it is enforced HERE, at the write, rather than on the settings surface:
  // this action is directly callable, and a wall that only exists where it renders is decorative.
  //
  // Why a wall and not a meter. A membership is a recurring PROMISE to another person — they pay every
  // month expecting the thing to still be there. Helping someone make that promise from an account
  // they may abandon next month is not a feature. And "one free membership" would teach nothing while
  // creating exactly one stranded subscriber, which is the worst possible outcome for both sides.
  //
  // Above the wall there is deliberately NO ceiling: the meter that capped a free Space at 10 active
  // members is deleted, because telling a Space its eleventh supporter cannot join punishes the
  // customer for succeeding at the one thing we asked them to do, and the take rate already scales
  // with volume. The wall is at the start or nowhere.
  //
  // SETTING NO TIERS IS ALWAYS ALLOWED. A Space that downgrades must be able to clear its tiers, and
  // refusing that would trap someone below the wall with a live membership program they cannot turn
  // off. Checked before the gate for exactly that reason.
  if (tiers.length > 0) {
    const [{ featureAllowed }, { featureGatesLive }, { asSpacePlan }] = await Promise.all([
      import('@/lib/pricing/gates'),
      import('@/lib/pricing/settings'),
      import('@/lib/pricing/plans'),
    ])
    const allowed = await featureAllowed(
      'space_memberships',
      { plan: asSpacePlan(space.plan) },
      { gatesLive: await featureGatesLive() },
    )
    if (!allowed) {
      return fail('Selling memberships comes with Business. Tickets, donations, and your shop stay open on every plan.')
    }
  }

  // Normalize + drop anything invalid. An empty result is a valid "no tiers" state.
  const clean = normalizeTierSet(tiers)

  const toRow = (t: MembershipTier) => ({
    name: t.name,
    price_cents: t.priceCents,
    interval: t.interval,
    description: t.description,
    benefits: t.benefits,
    capacity: t.capacity,
    waitlist: t.waitlist,
    sort: t.sort,
    is_active: t.isActive,
  })

  try {
    const { data: existing, error: readErr } = (await tiersTable()
      .select('id')
      .eq('space_id', spaceId)) as unknown as { data: { id: string }[] | null; error: unknown }
    if (readErr) return fail('Could not save your tiers. Try again.')

    const plan = planTierSetOps((existing ?? []).map((r) => r.id), clean)

    for (const t of plan.updates) {
      const upd = await (tiersTable().update(toRow(t)).eq('id', t.id).eq('space_id', spaceId) as unknown as Promise<{ error: unknown }>)
      if (upd.error) return fail('Could not save your tiers. Try again.')
    }
    if (plan.inserts.length > 0) {
      const { error } = await tiersTable().insert(
        plan.inserts.map((t) => ({ space_id: spaceId, ...toRow(t) })),
      )
      if (error) return fail('Could not save your tiers. Try again.')
    }
    if (plan.deleteIds.length > 0) {
      const del = await (tiersTable().delete().eq('space_id', spaceId).in('id', plan.deleteIds) as unknown as Promise<{ error: unknown }>)
      if (del.error) return fail('Could not save your tiers. Try again.')
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
    const row = await readMyOpenMembership(spaceId, profileId)
    if (!row) return null
    const tiers = await readTiers(spaceId, false)
    const tier = tiers.find((t) => t.id === row.tier_id)
    return {
      id: row.id,
      tierId: row.tier_id,
      tierName: tier?.name ?? 'Member',
      status: row.status === 'waitlist' ? 'waitlist' : 'active',
      startedAt: row.started_at,
    }
  } catch {
    return null
  }
}

/**
 * Join a tier. Any authenticated member (resolved via getMyProfileId). v1 RECORDS the membership;
 * it does NOT take a payment (billing is Phase 4). The server re-validates that the tier is real +
 * active in this Space, then inserts an active membership — or, when the tier is FULL (ADR-824)
 * and takes a waitlist, a `waitlist` row instead. A friendly fail if the member already holds an
 * open row here (the one-open unique index is the final guard against a race). Returns
 * ActionResult<{ waitlisted }> so the join card can say which outcome happened.
 */
export async function joinTier(
  spaceId: string,
  tierId: string,
): Promise<ActionResult<{ waitlisted: boolean }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to become a member.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  // The tier must be a real, ACTIVE tier of THIS Space (no cross-space / retired-tier joins).
  const tiers = await readTiers(spaceId, true)
  const tier = tiers.find((t) => t.id === tierId)
  if (!tier) return fail('That tier is no longer available. Pick another.')

  // Already in? (A fast pre-check for a friendly message; the unique index is the real guard.)
  const existing = await readMyOpenMembership(spaceId, profileId)
  if (existing) {
    return fail(
      existing.status === 'waitlist'
        ? 'You are already on the waitlist here.'
        : 'You are already a member here.',
    )
  }

  // CAPACITY (ADR-824): a full tier takes a waitlist join when the owner turned that on, else it
  // closes with an honest message. The count is a pre-check; the insert below is the racy edge and
  // a rare over-join is corrected by the owner (promote/cancel), never a crash.
  let waitlisted = false
  if (tier.capacity != null) {
    const counts = await countActiveMembersByTier(spaceId)
    if ((counts.get(tierId) ?? 0) >= tier.capacity) {
      if (!tier.waitlist) return fail('This tier is full.')
      waitlisted = true
    }
  }

  let membershipRowId: string | null = null
  try {
    const { data, error } = await membershipsTable()
      .insert([
        {
          space_id: spaceId,
          member_profile_id: profileId,
          tier_id: tierId,
          status: waitlisted ? 'waitlist' : 'active',
        },
      ])
      .select(MEMBERSHIP_COLS)
      .maybeSingle()
    if (error) {
      // The one-open unique index rejects a second open row for the same member: translate the
      // race into the friendly message rather than a raw DB error.
      return fail('You are already a member here.')
    }
    membershipRowId = data?.id ?? null
    // AUTOMATION TRIGGER (ADR-561 + ADR-797): a member just joined a tier — ACTIVE joins only (a
    // waitlist spot is not a membership; the trigger fires on promotion instead). First materialize
    // a mailable Space contact for them (a join opts them into this Space's member emails, honoring
    // any prior unsubscribe), THEN fire 'member.joined' with the RESOLVED contactId. This is
    // required because a tenant Space's contacts carry profile_id NULL (the membrane law), so the
    // trigger cannot resolve the member's Space contact by profile_id alone — welcome / onboarding
    // would reach no one. Both steps are fail-safe and run in the background (not awaited).
    if (!waitlisted) {
      void (async () => {
        const contactId = await ensureSpaceMemberContact(spaceId, profileId)
        await fireSpaceTrigger(spaceId, 'member.joined', { contactId: contactId ?? undefined, profileId })
        // TIER→CIRCLE ACCESS (ADR-859): a live membership grants the tier's linked circle, if any.
        // Fail-soft by contract — the join stands regardless of the circle write.
        await syncTierCircleAccess({ spaceId, profileId, tierId, action: 'grant' })
      })().catch(() => {
        // All callees are contractually non-throwing; this is cheap insurance against a future
        // contract break, so an automation error can never surface as an unhandled rejection.
      })
    }
  } catch {
    return fail('Could not join right now. Try again.')
  }
  // Log onto the member's Space timeline (program adoption shows on Resonance, ADR-796). The
  // idempotency key is keyed to THIS membership row, not the member's lifetime: a member who cancels
  // and rejoins (a win-back, the most valuable Resonance signal) gets a fresh row id and so a fresh
  // timeline entry, instead of being silently swallowed by a stale lifetime-stable key.
  await recordSpaceMemberActivity({
    spaceId,
    spaceOwnerProfileId: space.ownerProfileId,
    memberProfileId: profileId,
    channel: 'event',
    summary: waitlisted ? `Joined waitlist: ${tier.name}` : `Joined membership: ${tier.name}`,
    idempotencyKey: `member_join:${membershipRowId ?? `${spaceId}:${profileId}`}`,
    metadata: {
      kind: waitlisted ? 'membership_waitlist' : 'membership_join',
      tierId,
      tierName: tier.name,
    },
    // Scope spine (ADR-827): first-class membership scope (the tier), dual-written next to the
    // legacy metadata.kind + tierId convention.
    scope: { kind: 'membership', id: tierId },
  })
  return ok({ waitlisted })
}

/**
 * Promote a WAITLIST membership to ACTIVE (ADR-824). Allowed for a space admin (the same bar as
 * cancelling someone else's membership). Re-checks capacity so a promotion can't overfill the tier;
 * stamps started_at to the promotion moment (that's when the membership actually starts) and fires
 * the member.joined automation exactly like a direct join. Fail-closed on permission.
 */
export async function promoteMembership(membershipId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in.')

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
  if (row.status !== 'waitlist') return fail('Only a waitlist spot can be promoted.')

  const space = await getSpaceById(row.space_id)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.isAdmin) return fail('You do not have permission to promote members here.')

  // Capacity re-check: promoting must not overfill (the spot may have refilled since).
  const tiers = await readTiers(row.space_id, false)
  const tier = tiers.find((t) => t.id === row.tier_id)
  if (tier?.capacity != null) {
    const counts = await countActiveMembersByTier(row.space_id)
    if ((counts.get(row.tier_id) ?? 0) >= tier.capacity) {
      return fail('This tier is full. Open a spot (or raise the capacity) first.')
    }
  }

  try {
    const upd = await (membershipsTable()
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', membershipId)
      .eq('status', 'waitlist') as unknown as Promise<{ error: unknown }>)
    if (upd.error) return fail('Could not promote. Try again.')
  } catch {
    return fail('Could not promote. Try again.')
  }

  const memberProfileId = row.member_profile_id
  void (async () => {
    const contactId = await ensureSpaceMemberContact(row.space_id, memberProfileId)
    await fireSpaceTrigger(row.space_id, 'member.joined', {
      contactId: contactId ?? undefined,
      profileId: memberProfileId,
    })
    // TIER→CIRCLE ACCESS (ADR-859): promotion IS the membership start — grant the tier's circle.
    await syncTierCircleAccess({
      spaceId: row.space_id,
      profileId: memberProfileId,
      tierId: row.tier_id,
      action: 'grant',
    })
  })().catch(() => {
    /* fail-safe: the promotion is recorded regardless of the automation */
  })
  await recordSpaceMemberActivity({
    spaceId: row.space_id,
    spaceOwnerProfileId: space.ownerProfileId,
    memberProfileId,
    channel: 'event',
    summary: `Joined membership: ${tier?.name ?? 'Member'} (from the waitlist)`,
    idempotencyKey: `member_promote:${membershipId}`,
    metadata: { kind: 'membership_promote', tierId: row.tier_id },
    // Scope spine (ADR-827): first-class membership scope (the tier), dual-written.
    scope: row.tier_id ? { kind: 'membership', id: row.tier_id } : null,
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

  // stripe_subscription_id rides along (when the billing migration added it) so a PAID membership's
  // subscription can be cancelled too — without it a member cancel keeps billing and the next
  // webhook re-asserts status 'active' (which would silently re-grant tier circle access, ADR-859).
  type CancelRow = MembershipRow & { stripe_subscription_id?: string | null }
  let row: CancelRow | null = null
  try {
    const { data } = await membershipsTable()
      .select(`${MEMBERSHIP_COLS}, stripe_subscription_id`)
      .eq('id', membershipId)
      .maybeSingle()
    row = data as CancelRow | null
  } catch {
    row = null
  }
  if (!row) return fail('Membership not found.')

  // The member may always cancel their own; otherwise the caller must be a space admin. Resolve the
  // Space once here so the same handle serves both the admin check and the timeline log below.
  const space = await getSpaceById(row.space_id)
  let allowed = row.member_profile_id === profileId
  if (!allowed && space) {
    const caps = await getSpaceCapabilities(space, profileId)
    allowed = caps.isAdmin
  }
  if (!allowed) return fail('You do not have permission to cancel this membership.')

  // BILLING GUARD (ADR-859): stop the Stripe subscription BEFORE the DB flip, immediately (no
  // period-end grace — the member asked to cancel). Best-effort: a Stripe error logs + continues,
  // the DB cancel below still stands. The remaining edge (Stripe cancel fails, a later webhook
  // re-asserts active) is documented in the ADR; without this call that edge was the NORM.
  if (row.stripe_subscription_id && stripe) {
    try {
      await stripe.subscriptions.cancel(row.stripe_subscription_id)
    } catch (err) {
      console.error('[cancelMembership] stripe subscription cancel failed', err)
    }
  }

  try {
    const { error } = await membershipsTable()
      .update({ status: 'cancelled' })
      .eq('id', membershipId)
    if (error) return fail('Could not cancel the membership. Try again.')
  } catch {
    return fail('Could not cancel the membership. Try again.')
  }
  // TIER→CIRCLE ACCESS (ADR-859): the membership ended — revoke the rows ITS tier granted (a
  // self-joined circle row is never touched). Fire-and-forget, matching the join-side automation.
  void syncTierCircleAccess({
    spaceId: row.space_id,
    profileId: row.member_profile_id,
    tierId: row.tier_id,
    action: 'revoke',
  }).catch(() => {
    /* contractually non-throwing; insurance so a revoke error never rejects unhandled */
  })
  // Log the departure onto the member's Space timeline (ADR-796): the comms center records arrivals AND
  // departures, so an operator's "where this person is" read stays true. Keyed to this membership row so
  // it logs exactly once per cancel.
  if (space) {
    await recordSpaceMemberActivity({
      spaceId: row.space_id,
      spaceOwnerProfileId: space.ownerProfileId,
      memberProfileId: row.member_profile_id,
      channel: 'event',
      summary: 'Cancelled their membership',
      idempotencyKey: `member_cancel:${membershipId}`,
      metadata: { kind: 'membership_cancel', tierId: row.tier_id },
      // Scope spine (ADR-827): first-class membership scope (the tier), dual-written.
      scope: row.tier_id ? { kind: 'membership', id: row.tier_id } : null,
    })
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
    const rows = await readOpenMemberships(spaceId)
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
      // An orphaned tier_id (its tier was truly removed) falls back to a generic label.
      tierName: tierName.get(r.tier_id) ?? 'Member',
      status: r.status === 'waitlist' ? 'waitlist' : 'active',
      startedAt: r.started_at,
    }))
  } catch {
    return []
  }
}
