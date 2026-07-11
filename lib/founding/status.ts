// FOUNDING STATUS — the durable Founder record (founding_members) + the reserve/grant/read
// helpers for the Founders Round (members) and the Founding Businesses cohort. Server-only
// (service-role admin client behind app-layer authz).
//
// THE NO-CHARGE INVARIANT (reserve-now, charge-at-graduation):
//   • RESERVE writes a founding_members row with status='reserved' and charged_at=NULL.
//     NOTHING is charged (card_on_file stays false; a card is optional). This is the only
//     write the public Founding Business offer performs for a signed-in owner.
//   • grantFoundingStatus() flips reserved -> active and applies the LOCKED rate. It NEVER
//     charges: it does not set charged_at and does not call Stripe. The money flip lives
//     behind billingLive() / payoutsLive() and is owned by the billing path, not this module.
//     The beta graduation (graduateBeta) calls grantFoundingStatus() as its founding hook.
//
// The founding_members table is not in the generated lib/database.types.ts yet (regen after
// apply, ADR-246), so it is reached through ONE loose service-role handle, the repo idiom
// (see lib/beta/db.ts, lib/importer/materialize.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundingConfig } from '@/lib/pricing/settings'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** 'member' = an individual Founding Member; 'business' = a Founding Business (per-city cohort). */
export type FoundingKind = 'member' | 'business'
/** reserved -> active (at graduation) -> lapsed (if a founder ever falls out). */
export type FoundingState = 'reserved' | 'active' | 'lapsed'

/** A durable founding row (the fields the app reads). Mirrors the migration columns. */
export interface FoundingRecord {
  id: string
  profileId: string | null
  spaceId: string | null
  kind: FoundingKind
  lockedRateCents: number | null
  lockedTakeBps: number | null
  cohortCity: string | null
  status: FoundingState
  reservedAt: string
  chargedAt: string | null
  cardOnFile: boolean
}

// ── The loose service-role handle for founding_members (untyped-admin idiom) ──────────────
type Row = Record<string, unknown>
type Res<T> = { data: T; error: unknown }
interface SelectChain extends PromiseLike<Res<Row[] | null>> {
  eq(col: string, val: unknown): SelectChain
  neq(col: string, val: unknown): SelectChain
  in(col: string, vals: readonly unknown[]): SelectChain
  maybeSingle(): Promise<Res<Row | null>>
}
interface WriteChain extends PromiseLike<Res<Row[] | null>> {
  eq(col: string, val: unknown): WriteChain
}
interface FoundingTable {
  select(cols?: string): SelectChain
  insert(rows: Row | Row[]): PromiseLike<Res<Row[] | null>>
  update(vals: Row): WriteChain
}
function foundingDb(): { from(table: string): FoundingTable } {
  return createAdminClient() as unknown as { from(table: string): FoundingTable }
}

function toRecord(r: Row): FoundingRecord {
  return {
    id: String(r.id),
    profileId: (r.profile_id as string | null) ?? null,
    spaceId: (r.space_id as string | null) ?? null,
    kind: r.kind === 'business' ? 'business' : 'member',
    lockedRateCents: typeof r.locked_rate_cents === 'number' ? r.locked_rate_cents : null,
    lockedTakeBps: typeof r.locked_take_bps === 'number' ? r.locked_take_bps : null,
    cohortCity: (r.cohort_city as string | null) ?? null,
    status: r.status === 'active' ? 'active' : r.status === 'lapsed' ? 'lapsed' : 'reserved',
    reservedAt: String(r.reserved_at ?? ''),
    chargedAt: (r.charged_at as string | null) ?? null,
    cardOnFile: r.card_on_file === true,
  }
}

// ── READS ─────────────────────────────────────────────────────────────────────────────────

/** The founding record for a member or a Space, or null. FAIL-SAFE to null (a read error never
 *  fabricates founder status). Reached through the admin client behind app-layer authz. */
export async function getFoundingStatus(subject: {
  profileId?: string | null
  spaceId?: string | null
}): Promise<FoundingRecord | null> {
  const col = subject.spaceId ? 'space_id' : subject.profileId ? 'profile_id' : null
  const val = subject.spaceId ?? subject.profileId ?? null
  if (!col || !val) return null
  try {
    const { data } = await foundingDb()
      .from('founding_members')
      .select('*')
      .eq(col, val)
      .maybeSingle()
    return data ? toRecord(data) : null
  } catch {
    return null
  }
}

/** Batch: which of these members/Spaces are ACTIVE founders (status='active'). Returns two Sets so a
 *  card grid can badge in one pass, mirroring lib/commerce/seller-verification.ts. FAIL-SAFE to empty. */
export async function foundingActiveFor(subjects: {
  profileIds?: readonly string[]
  spaceIds?: readonly string[]
}): Promise<{ profiles: Set<string>; spaces: Set<string> }> {
  const profiles = new Set<string>()
  const spaces = new Set<string>()
  const profileIds = Array.from(new Set(subjects.profileIds ?? [])).filter(Boolean)
  const spaceIds = Array.from(new Set(subjects.spaceIds ?? [])).filter(Boolean)
  if (profileIds.length === 0 && spaceIds.length === 0) return { profiles, spaces }
  try {
    const db = foundingDb()
    if (profileIds.length > 0) {
      const { data } = await db
        .from('founding_members')
        .select('profile_id, status')
        .in('profile_id', profileIds)
      for (const r of (data ?? []) as Row[]) {
        if (r.status === 'active' && typeof r.profile_id === 'string') profiles.add(r.profile_id)
      }
    }
    if (spaceIds.length > 0) {
      const { data } = await db
        .from('founding_members')
        .select('space_id, status')
        .in('space_id', spaceIds)
      for (const r of (data ?? []) as Row[]) {
        if (r.status === 'active' && typeof r.space_id === 'string') spaces.add(r.space_id)
      }
    }
  } catch {
    return { profiles, spaces }
  }
  return { profiles, spaces }
}

/** How many Founding BUSINESS spots are TAKEN (reserved or active, not lapsed) in a city. Powers the
 *  per-city spots-remaining display (pair with foundingBusinessSpotsRemaining in lib/pricing/founding).
 *  FAIL-SAFE to 0 so the cap always renders as "open" rather than blocking on a read error. */
export async function foundingBusinessTakenInCity(city: string): Promise<number> {
  const c = (city || '').trim()
  if (!c) return 0
  try {
    const { data } = await foundingDb()
      .from('founding_members')
      .select('id, kind, cohort_city, status')
      .eq('kind', 'business')
      .eq('cohort_city', c)
    return (data ?? []).filter((r) => (r as Row).status !== 'lapsed').length
  } catch {
    return 0
  }
}

/** A seller reference (a marketplace listing's owner), the subset the charter-badge resolver needs.
 *  Mirrors the SellerRef shape in lib/commerce/seller-verification.ts so a card grid can resolve both
 *  the verified and the Founding mark in parallel. */
export interface FoundingSellerRef {
  id: string
  ownerProfileId?: string | null
  ownerSpaceId?: string | null
}

/** Batch: which of these listings are sold by an ACTIVE Founder (member or Space). Returns a Map keyed
 *  by listing id (absent = not a founder), mirroring sellerVerifiedFor so the market page can badge in
 *  one pass. Read-only, FAIL-SAFE to an empty Map. */
export async function foundingSellersFor(sellers: readonly FoundingSellerRef[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  if (sellers.length === 0) return out
  const { profiles, spaces } = await foundingActiveFor({
    profileIds: sellers.map((s) => s.ownerProfileId ?? '').filter(Boolean),
    spaceIds: sellers.map((s) => s.ownerSpaceId ?? '').filter(Boolean),
  })
  for (const s of sellers) {
    const founding =
      (!!s.ownerSpaceId && spaces.has(s.ownerSpaceId)) || (!!s.ownerProfileId && profiles.has(s.ownerProfileId))
    if (founding) out.set(s.id, true)
  }
  return out
}

// ── RESERVE (durable, no charge) ────────────────────────────────────────────────────────────

/** Reserve a durable founding spot for a SIGNED-IN subject (a member or a Space owner with a Space),
 *  idempotently. Writes/updates one founding_members row with status='reserved', charged_at=NULL, and
 *  the LOCKED rate from config. NEVER charges: card_on_file stays false and no Stripe is touched.
 *
 *  The public /founders/business offer uses this only when it already knows the owner's Space; an
 *  anonymous visitor reserves via the contacts-lead waitlist (app/(marketing)/founders/business/
 *  actions.ts), exactly like the member /founders flow. Re-reserving is a harmless no-op (the row is
 *  kept in whatever state it is already in; an already-active founder is not demoted). */
export async function reserveFounding(input: {
  kind: FoundingKind
  profileId?: string | null
  spaceId?: string | null
  cohortCity?: string | null
}): Promise<ActionResult<{ reserved: boolean }>> {
  const { kind } = input
  const profileId = input.profileId ?? null
  const spaceId = input.spaceId ?? null
  if (!profileId && !spaceId) return fail('We could not tell who is reserving.')

  const config = await getFoundingConfig()
  const lockedRateCents = kind === 'business' ? config.business_monthly_cents : config.member_one_time_cents
  const lockedTakeBps = kind === 'business' ? config.business_take_bps : null

  try {
    const existing = await getFoundingStatus({ profileId, spaceId })
    if (existing) {
      // Idempotent: a spot is already held. Never demote an active founder back to reserved.
      return ok({ reserved: existing.status === 'reserved' })
    }
    await foundingDb()
      .from('founding_members')
      .insert({
        profile_id: profileId,
        space_id: spaceId,
        kind,
        locked_rate_cents: lockedRateCents,
        locked_take_bps: lockedTakeBps,
        cohort_city: (input.cohortCity ?? '').trim() || null,
        status: 'reserved',
        card_on_file: false,
      })
    return ok({ reserved: true })
  } catch (err) {
    console.error('[founding] reserve failed:', err)
    return fail('Something went wrong holding your founding spot. Please try again.')
  }
}

// ── GRANT (the graduation hook) ─────────────────────────────────────────────────────────────

/**
 * Grant founding status: flip reserved founders to ACTIVE and apply the LOCKED rate. This is the
 * beta graduation's founding hook (graduateBeta() calls it). Callable + IDEMPOTENT + no-charge:
 *
 *   • Targeted (a profileId and/or spaceId given): activate that ONE founder's row (upserting a row
 *     if none exists yet, e.g. a member who bought the one-time Founders Round), applying the locked
 *     rate from config. For a member row, also set profiles.is_founding_member=true (the existing
 *     grandfather flag, lib/billing/founders.ts).
 *   • Sweep (no subject given): activate EVERY status='reserved' row.
 *
 * It NEVER charges: charged_at is left untouched (the gated billing path sets it when money actually
 * moves after the Sept 1 billing_live flip). Re-running is safe: an already-active row is left as-is.
 * FAIL-SAFE: returns the count granted; a DB error returns a fail() without partial-charging anything.
 */
export async function grantFoundingStatus(input?: {
  profileId?: string | null
  spaceId?: string | null
  kind?: FoundingKind
  cohortCity?: string | null
}): Promise<ActionResult<{ granted: number }>> {
  const config = await getFoundingConfig()
  const db = foundingDb()

  try {
    // ── Targeted grant: activate (or create-then-activate) one subject's founding row. ──
    if (input && (input.profileId || input.spaceId)) {
      const profileId = input.profileId ?? null
      const spaceId = input.spaceId ?? null
      const existing = await getFoundingStatus({ profileId, spaceId })
      const kind: FoundingKind = existing?.kind ?? input.kind ?? (spaceId ? 'business' : 'member')
      const lockedRateCents =
        existing?.lockedRateCents ??
        (kind === 'business' ? config.business_monthly_cents : config.member_one_time_cents)
      const lockedTakeBps = existing?.lockedTakeBps ?? (kind === 'business' ? config.business_take_bps : null)

      if (existing) {
        if (existing.status === 'active') {
          // Already granted: make sure the member flag is set, then no-op.
          if (kind === 'member' && profileId) await setFoundingMemberFlag(profileId)
          return ok({ granted: 0 })
        }
        await db
          .from('founding_members')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await db.from('founding_members').insert({
          profile_id: profileId,
          space_id: spaceId,
          kind,
          locked_rate_cents: lockedRateCents,
          locked_take_bps: lockedTakeBps,
          cohort_city: (input.cohortCity ?? '').trim() || null,
          status: 'active',
          card_on_file: false,
        })
      }
      if (kind === 'member' && profileId) await setFoundingMemberFlag(profileId)
      return ok({ granted: 1 })
    }

    // ── Sweep: activate every reserved founder. ──
    const { data } = await db.from('founding_members').select('*').eq('status', 'reserved')
    const rows = (data ?? []).map(toRecord)
    if (rows.length === 0) return ok({ granted: 0 })

    await db
      .from('founding_members')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('status', 'reserved')

    // Set the grandfather flag on every member founder we just activated.
    for (const r of rows) {
      if (r.kind === 'member' && r.profileId) await setFoundingMemberFlag(r.profileId)
    }
    return ok({ granted: rows.length })
  } catch (err) {
    console.error('[founding] grant failed:', err)
    return fail('Could not grant founding status.')
  }
}

/** Set profiles.is_founding_member=true (the existing grandfather flag). Idempotent, best-effort. */
async function setFoundingMemberFlag(profileId: string): Promise<void> {
  try {
    await foundingDb().from('profiles').update({ is_founding_member: true }).eq('id', profileId)
  } catch (err) {
    console.error('[founding] failed to set is_founding_member:', err)
  }
}
