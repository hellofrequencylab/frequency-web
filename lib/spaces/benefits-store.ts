// MEMBER BENEFITS — THE IO LAYER (ADR-1372, backlog LIVE-092). The service-role reads and the gated
// operator write behind `space_member_benefits` / `space_tier_benefits` / `space_benefit_redemptions`.
//
// SHAPE (identical to the memberships split, lib/spaces/memberships.ts): the CONTRACT is pure and
// lives in lib/spaces/benefits.ts (types + normalizeBenefit + the resolver, unit-tested with no
// database). This module is the thin IO beneath it, plus the action implementations. It carries NO
// 'use server' directive, so it can also export the pure `periodKeyFor` / `planBenefitSetOps`
// helpers and the row mappers the test needs; the thin 'use server' wrappers a CLIENT component
// calls live in lib/spaces/benefits-actions.ts. SERVER components import the read functions here
// directly — they never cross a client boundary, so they need no wrapper.
//
// ACCESS MODEL (matches the migration header): the three tables have RLS on with NO client policies,
// so every read and write goes through this module on the service-role client. The server is the
// authority for "which space" and "what may this caller do here":
//   • reads fail-safe (empty), the one exception being countRedemptions — see its comment.
//   • writes fail-closed on a permission miss (canEditProfile, like setMembershipTiers).
//
// UNTYPED-TABLE SEAM (ADR-246): lib/database.types.ts does not know these three tables yet, so the
// admin client is narrowed per-query through a small loose query type rather than regenerating the
// whole Database type. Exactly the seam lib/spaces/booking.ts and lib/spaces/audiences.ts use.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  normalizeBenefit,
  type BenefitKind,
  type BenefitPeriod,
  type BenefitScope,
  type MemberBenefit,
} from '@/lib/spaces/benefits'

// A Space cannot define an unbounded number of benefits: the resolver walks every one of them on
// every priced line, and an operator with 500 rows is a mistake, not a use case.
const MAX_BENEFITS_PER_SPACE = 48

// ── PURE: the period key ────────────────────────────────────────────────────────────────────────

/**
 * The bucket a redemption counts against, matching `space_benefit_redemptions.period_key`:
 * 'YYYY-MM' for a monthly cap, 'YYYY' for a yearly one, 'lifetime' when the benefit's cap is a
 * total (period null). Computed in UTC so the same instant always lands in the same bucket
 * regardless of where the server happens to run.
 *
 * FAIL-CLOSED on an unreadable clock: an unparseable timestamp collapses to 'lifetime', the
 * NARROWEST window there is (a lifetime bucket never resets). A broken clock can therefore only
 * ever tighten a cap, never hand out a free redemption. `countRedemptions` and `recordRedemption`
 * both derive their key here, so the read and the write can never disagree about which bucket
 * they mean. Pure.
 */
export function periodKeyFor(period: BenefitPeriod, nowIso: string): string {
  if (period !== 'month' && period !== 'year') return 'lifetime'
  const ms = Date.parse(nowIso)
  if (!Number.isFinite(ms)) return 'lifetime'
  const d = new Date(ms)
  const year = String(d.getUTCFullYear()).padStart(4, '0')
  if (period === 'year') return year
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ── PURE: the write plan (id preservation) ──────────────────────────────────────────────────────

/**
 * The write plan for a benefit save, the exact upsert-by-id shape `planTierSetOps` uses for tiers
 * (ADR-824): which incoming benefits UPDATE an existing row, which INSERT, and which existing rows
 * DELETE.
 *
 * 🔴 WHY IDS ARE PRESERVED. A delete-and-reinsert renumbers every benefit on every save, and a
 * benefit id is referenced by `space_tier_benefits` AND by every past `space_benefit_redemptions`
 * row — the ledger that makes `maxUses` real. Churning ids would orphan the assignments and silently
 * reset every member's usage count to zero on the next edit. An incoming id that is not a current
 * row of THIS Space is treated as an insert (the id is dropped), so a stale or cross-space id can
 * never hijack another Space's row. Pure; tested.
 */
export function planBenefitSetOps(
  existingIds: string[],
  benefits: MemberBenefit[],
): {
  updates: (MemberBenefit & { id: string })[]
  inserts: MemberBenefit[]
  deleteIds: string[]
} {
  const existing = new Set(existingIds)
  const updates: (MemberBenefit & { id: string })[] = []
  const inserts: MemberBenefit[] = []
  const kept = new Set<string>()
  for (const b of benefits) {
    if (b.id && existing.has(b.id) && !kept.has(b.id)) {
      kept.add(b.id)
      updates.push({ ...b, id: b.id })
    } else {
      const { id: _dropped, ...rest } = b
      inserts.push(rest)
    }
  }
  return { updates, inserts, deleteIds: existingIds.filter((id) => !kept.has(id)) }
}

// ── IO: the untyped admin-client seams (tables not in the generated types yet, ADR-246) ─────────

type BenefitRow = {
  id: string
  space_id: string
  kind: string
  value: number
  scope: string
  label: string
  max_uses: number | null
  period: string | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
}
type TierBenefitRow = { tier_id: string; benefit_id: string }
type RedemptionRow = { id: string }

type BenefitQuery = {
  select: (cols: string) => BenefitQuery
  eq: (col: string, val: unknown) => BenefitQuery
  in: (col: string, vals: string[]) => BenefitQuery
  order: (col: string, opts: { ascending: boolean }) => BenefitQuery
  update: (patch: Record<string, unknown>) => BenefitQuery
  insert: (rows: Record<string, unknown>[]) => BenefitQuery
  delete: () => BenefitQuery
  then: (
    resolve: (r: { data: BenefitRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}
type TierBenefitQuery = {
  select: (cols: string) => TierBenefitQuery
  eq: (col: string, val: unknown) => TierBenefitQuery
  in: (col: string, vals: string[]) => TierBenefitQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  delete: () => TierBenefitQuery
  then: (
    resolve: (r: { data: TierBenefitRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}
type RedemptionQuery = {
  select: (cols: string) => RedemptionQuery
  eq: (col: string, val: unknown) => RedemptionQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
  then: (
    resolve: (r: { data: RedemptionRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}
type TierIdQuery = {
  select: (cols: string) => TierIdQuery
  eq: (col: string, val: unknown) => TierIdQuery
  then: (
    resolve: (r: { data: { id: string }[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

function benefitsTable(): BenefitQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => BenefitQuery }
  return db.from('space_member_benefits')
}
function tierBenefitsTable(): TierBenefitQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TierBenefitQuery }
  return db.from('space_tier_benefits')
}
function redemptionsTable(): RedemptionQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => RedemptionQuery }
  return db.from('space_benefit_redemptions')
}
function spaceTiersTable(): TierIdQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TierIdQuery }
  return db.from('space_membership_tiers')
}

const BENEFIT_COLS =
  'id, space_id, kind, value, scope, label, max_uses, period, starts_at, ends_at, is_active'

const KINDS: readonly BenefitKind[] = ['included', 'percent', 'amount_off', 'fixed_price']
const SCOPES: readonly BenefitScope[] = [
  'space_events',
  'guest_events',
  'stays',
  'products',
  'all',
]

/** Map a DB row to the app's MemberBenefit. Deliberately NOT routed through `normalizeBenefit`: the
 *  row was validated on write, and normalizeBenefit is fail-CLOSED on an empty tier assignment, so
 *  running it here would make an unassigned benefit invisible in the editor that has to fix it. An
 *  unassigned benefit is still harmless at checkout: `benefitApplies` can never match an empty
 *  `tierIds`. Kind and scope are re-checked because they decide how `value` is read. */
function mapBenefitRow(r: BenefitRow, tierIds: string[]): MemberBenefit {
  const kind: BenefitKind = KINDS.find((k) => k === r.kind) ?? 'percent'
  const scope: BenefitScope = SCOPES.find((s) => s === r.scope) ?? 'space_events'
  return {
    id: r.id,
    spaceId: r.space_id,
    kind,
    value: kind === 'included' ? 0 : typeof r.value === 'number' && r.value > 0 ? r.value : 0,
    scope,
    label: typeof r.label === 'string' ? r.label : '',
    maxUses: typeof r.max_uses === 'number' && r.max_uses > 0 ? r.max_uses : null,
    period: r.period === 'month' || r.period === 'year' ? r.period : null,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    isActive: r.is_active !== false,
    tierIds,
  }
}

/** The tier assignments for a set of benefit ids, as benefitId -> tierIds. FAIL-SAFE to an empty
 *  map, which resolves to "assigned to nobody" — the fail-closed direction. */
async function readAssignments(benefitIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (benefitIds.length === 0) return out
  try {
    const { data, error } = (await tierBenefitsTable()
      .select('tier_id, benefit_id')
      .in('benefit_id', benefitIds)) as unknown as {
      data: TierBenefitRow[] | null
      error: unknown
    }
    if (error || !data) return out
    for (const row of data) {
      if (!row?.benefit_id || !row?.tier_id) continue
      const list = out.get(row.benefit_id)
      if (list) list.push(row.tier_id)
      else out.set(row.benefit_id, [row.tier_id])
    }
  } catch {
    // fall through to the empty map (fail-safe)
  }
  return out
}

/** The tier ids that really belong to this Space. Used to reject a cross-space tier id on write.
 *  FAIL-SAFE to an empty list. */
async function readSpaceTierIds(spaceId: string): Promise<string[]> {
  try {
    const { data, error } = (await spaceTiersTable()
      .select('id')
      .eq('space_id', spaceId)) as unknown as { data: { id: string }[] | null; error: unknown }
    if (error || !data) return []
    return data.map((r) => r.id).filter((id): id is string => typeof id === 'string' && !!id)
  } catch {
    return []
  }
}

// ── PUBLIC READS ────────────────────────────────────────────────────────────────────────────────

/**
 * Every benefit a Space has defined, each with its `tierIds` populated, oldest first. Public-
 * readable the way `listMembershipTiers` is: the server component that prices a line reads it, and
 * a benefit is a published offer, not a secret. FAIL-SAFE to [].
 */
export async function listSpaceBenefits(spaceId: string): Promise<MemberBenefit[]> {
  if (!spaceId) return []
  try {
    const { data, error } = (await benefitsTable()
      .select(BENEFIT_COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: true })) as unknown as {
      data: BenefitRow[] | null
      error: unknown
    }
    if (error || !data) return []
    const assignments = await readAssignments(data.map((r) => r.id))
    return data.map((r) => mapBenefitRow(r, assignments.get(r.id) ?? []))
  } catch {
    return []
  }
}

/**
 * The same list as the EDITOR reads it back, gated: canEditProfile (owner / admin / editor) or a
 * platform janitor previewing as staff. Mirrors `listAllMembershipTiers` — a gated read exists so
 * the owner surface has one call it can trust, while writes stay on canEditProfile. FAIL-SAFE to [].
 */
export async function listSpaceBenefitsForOwner(spaceId: string): Promise<MemberBenefit[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  return listSpaceBenefits(spaceId)
}

/**
 * The ACTIVE benefits assigned to ONE membership tier — what the resolver is handed at a checkout.
 * The benefit rows are filtered by `space_id` as well as by assignment, so a tier id belonging to
 * another Space resolves to nothing rather than to that Space's benefits. FAIL-SAFE to [].
 */
export async function listBenefitsForTier(
  spaceId: string,
  tierId: string,
): Promise<MemberBenefit[]> {
  if (!spaceId || !tierId) return []
  try {
    const { data: links, error: linkErr } = (await tierBenefitsTable()
      .select('tier_id, benefit_id')
      .eq('tier_id', tierId)) as unknown as { data: TierBenefitRow[] | null; error: unknown }
    if (linkErr || !links || links.length === 0) return []

    const ids = [...new Set(links.map((l) => l.benefit_id).filter(Boolean))]
    if (ids.length === 0) return []

    const { data, error } = (await benefitsTable()
      .select(BENEFIT_COLS)
      .eq('space_id', spaceId)
      .in('id', ids)) as unknown as { data: BenefitRow[] | null; error: unknown }
    if (error || !data) return []

    // The full assignment set, because the resolver checks `tierIds.includes(ctx.tierId)` and a
    // benefit that only carried the tier we asked about would be right by accident.
    const assignments = await readAssignments(data.map((r) => r.id))
    return data
      .filter((r) => r.is_active !== false)
      .map((r) => mapBenefitRow(r, assignments.get(r.id) ?? [tierId]))
  } catch {
    return []
  }
}

/**
 * How many times a member has already redeemed one benefit in one period bucket.
 *
 * 🔴 THE ONE READ THAT FAILS CLOSED. Every other read here fails safe to empty, because an empty
 * list shows an operator less than they should see and costs nothing. This one gates money: erring
 * to 0 on an unreadable ledger would hand out an uncapped free redemption every time the database
 * hiccuped, and nothing downstream would ever notice. So a read failure returns
 * Number.MAX_SAFE_INTEGER — the cap reads as exhausted, the benefit does not apply, and the buyer
 * pays list price. The worst case is a member who has to ask why their guest pass did not apply,
 * which is a support message rather than a hole in the revenue.
 */
export async function countRedemptions(
  benefitId: string,
  memberProfileId: string,
  periodKey: string,
): Promise<number> {
  if (!benefitId || !memberProfileId) return Number.MAX_SAFE_INTEGER
  try {
    const { data, error } = (await redemptionsTable()
      .select('id')
      .eq('benefit_id', benefitId)
      .eq('member_profile_id', memberProfileId)
      .eq('period_key', periodKey || 'lifetime')) as unknown as {
      data: RedemptionRow[] | null
      error: unknown
    }
    if (error || !data) return Number.MAX_SAFE_INTEGER
    return data.length
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

/**
 * The `usesByBenefitId` map a BenefitContext wants, for one member against a set of benefits. Each
 * benefit is counted in ITS OWN period bucket (a monthly pass and a yearly pass are different
 * windows), which is why this cannot be one query. Fails closed per benefit via countRedemptions.
 */
export async function usesForMember(
  benefits: readonly MemberBenefit[],
  memberProfileId: string,
  nowIso: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const b of benefits) {
    // An uncapped benefit is never counted: the resolver ignores the entry, and reading the ledger
    // for it would be a query per line for nothing.
    if (!b.id || b.maxUses == null) continue
    out[b.id] = await countRedemptions(b.id, memberProfileId, periodKeyFor(b.period, nowIso))
  }
  return out
}

// ── PUBLIC WRITES (gated server-side) ───────────────────────────────────────────────────────────

/** The DB row shape for a benefit (no space_id: the caller adds it, so a row can never be written
 *  into a Space the action did not authorize). */
function toRow(b: MemberBenefit): Record<string, unknown> {
  return {
    kind: b.kind,
    value: b.value,
    scope: b.scope,
    label: b.label,
    max_uses: b.maxUses,
    period: b.period,
    starts_at: b.startsAt,
    ends_at: b.endsAt,
    is_active: b.isActive,
  }
}

/**
 * Save a Space's member benefits as an UPSERT-BY-ID, the same contract `setMembershipTiers` uses.
 * Gated on canEditProfile (owner / admin / editor) plus the per-space `memberships` function gate,
 * since a benefit is a property of the membership program. Every benefit is re-normalized through
 * the pure `normalizeBenefit` (fail-closed: an unknown kind or scope, a blank label, or no tier
 * assignment DROPS the row), and every `tierIds` entry is intersected with the tiers that really
 * belong to this Space, so a cross-space tier id can never be assigned. An EMPTY list clears every
 * benefit, which is a valid "no benefits" state.
 *
 * Benefit ids survive an edit (see planBenefitSetOps): `space_tier_benefits` and the redemption
 * ledger both point at them. Returns ActionResult. Fail-closed on permission.
 */
export async function setSpaceBenefits(
  spaceId: string,
  benefits: MemberBenefit[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to set your member benefits.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to set member benefits for this space.')
  // PER-SPACE FUNCTION GATE (defense in depth, per-space-roles Phase 2). A benefit is part of the
  // membership program, so it rides the same function key rather than inventing a second switch.
  if (!spaceFunctionAccess(space, 'memberships', caps.role))
    return fail('Memberships is not turned on for this space, or your role cannot use it.')

  // Normalize + drop anything invalid, then intersect the assignment with this Space's real tiers.
  // A benefit left with no tier is dropped: `normalizeBenefit` already treats an empty assignment as
  // invalid, and a benefit assigned to nobody is a half-built row, not a state worth persisting.
  const ownTierIds = new Set(await readSpaceTierIds(spaceId))
  const raw = Array.isArray(benefits) ? benefits.slice(0, MAX_BENEFITS_PER_SPACE) : []
  const clean: MemberBenefit[] = []
  for (const b of raw) {
    const n = normalizeBenefit(b, spaceId)
    if (!n) continue
    const tierIds = n.tierIds.filter((t) => ownTierIds.has(t))
    if (tierIds.length === 0) continue
    clean.push({ ...n, tierIds })
  }

  try {
    const { data: existing, error: readErr } = (await benefitsTable()
      .select('id')
      .eq('space_id', spaceId)) as unknown as { data: { id: string }[] | null; error: unknown }
    if (readErr) return fail('Could not save your benefits. Try again.')

    const plan = planBenefitSetOps(
      (existing ?? []).map((r) => r.id),
      clean,
    )

    // The benefit ids whose assignments this save owns, paired with the tiers they should end up on.
    const assignments: { benefitId: string; tierIds: string[] }[] = []

    for (const b of plan.updates) {
      const upd = (await benefitsTable()
        .update(toRow(b))
        .eq('id', b.id)
        .eq('space_id', spaceId)) as unknown as { error?: unknown }
      if (upd?.error) return fail('Could not save your benefits. Try again.')
      assignments.push({ benefitId: b.id, tierIds: b.tierIds })
    }

    // Inserted one at a time on purpose: the new id has to be paired with the RIGHT benefit's tier
    // list, and a bulk insert only promises a set of returned rows, not their order.
    for (const b of plan.inserts) {
      const { data, error } = (await benefitsTable()
        .insert([{ space_id: spaceId, ...toRow(b) }])
        .select('id')) as unknown as { data: { id: string }[] | null; error: unknown }
      const newId = data?.[0]?.id
      if (error || !newId) return fail('Could not save your benefits. Try again.')
      assignments.push({ benefitId: newId, tierIds: b.tierIds })
    }

    if (plan.deleteIds.length > 0) {
      // The assignment rows and the redemption ledger both cascade from the benefit row.
      const del = (await benefitsTable()
        .delete()
        .eq('space_id', spaceId)
        .in('id', plan.deleteIds)) as unknown as { error?: unknown }
      if (del?.error) return fail('Could not save your benefits. Try again.')
    }

    // Replace the assignments for exactly the benefits this save touched. Scoped to those ids so a
    // concurrent save of a different benefit is never clobbered.
    const touched = assignments.map((a) => a.benefitId)
    if (touched.length > 0) {
      const wipe = (await tierBenefitsTable()
        .delete()
        .in('benefit_id', touched)) as unknown as { error?: unknown }
      if (wipe?.error) return fail('Could not save your benefits. Try again.')

      const rows = assignments.flatMap((a) =>
        [...new Set(a.tierIds)].map((tierId) => ({ tier_id: tierId, benefit_id: a.benefitId })),
      )
      if (rows.length > 0) {
        const ins = await tierBenefitsTable().insert(rows)
        if (ins?.error) return fail('Could not save your benefits. Try again.')
      }
    }
  } catch {
    return fail('Could not save your benefits. Try again.')
  }
  return ok()
}

/**
 * Write one redemption to the ledger. Called from the CHECKOUT path after the money is taken, never
 * from a client: the caller has already resolved which benefit applied, so this takes no capability
 * gate of its own beyond being service-role. `periodKey` comes from `periodKeyFor` so the write and
 * the `countRedemptions` read always name the same bucket.
 *
 * `amountCents` is the DISCOUNTED amount the buyer actually paid, which is also what the platform
 * take-rate was computed on (ADR-1372 §2). Recording the list price here would make the ledger
 * disagree with the charge.
 */
export async function recordRedemption(
  benefitId: string,
  memberProfileId: string,
  periodKey: string,
  amountCents: number,
): Promise<ActionResult> {
  if (!benefitId || !memberProfileId) return fail('Could not record that benefit.')
  const amount = Math.max(0, Math.round(Number(amountCents)) || 0)
  try {
    const { error } = await redemptionsTable().insert([
      {
        benefit_id: benefitId,
        member_profile_id: memberProfileId,
        period_key: periodKey || 'lifetime',
        amount_cents: amount,
      },
    ])
    if (error) return fail('Could not record that benefit.')
  } catch {
    return fail('Could not record that benefit.')
  }
  return ok()
}
