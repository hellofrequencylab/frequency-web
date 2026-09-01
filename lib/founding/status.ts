// FOUNDING STATUS — the durable Founder record (founding_members) + the grant/read/lapse
// helpers for the Founders Round (members) and the Founding Businesses cohort. Server-only
// (service-role admin client behind app-layer authz).
//
// THE NO-CHARGE INVARIANT (charge-at-graduation):
//   • grantFoundingStatus() flips reserved -> active and applies the LOCKED rate. It NEVER
//     charges: it does not set charged_at and does not call Stripe. The money flip lives
//     behind billingLive() / payoutsLive() and is owned by the billing path, not this module.
//     Its LIVE callers are beta onboarding (app/join/(induction)/actions.ts) and the Stripe
//     webhook reconciler (lib/billing/beta-founding.ts).
//
// NO RESERVE ARM LIVES HERE ANY MORE (SCAN-501). The Founding Business cohort was retired by
// owner directive on 2026-07-31 — lib/founding/business-checkout.ts went with it (see the
// CHARGING_SEAMS note in lib/pricing/gates-live.test.ts), and no /founders route is left in the
// tree, so the public offer that was reserveFounding()'s only intended caller is gone too.
// `reserveFounding` and `foundingBusinessTakenInCity` were the residue: verified 2026-08-25 to
// have no caller anywhere outside this file's own tests. Rows already carrying status='reserved' are
// still read and still graduate — grantFoundingStatus's sweep arm is untouched, and it upserts
// an ACTIVE row directly for a subject that never reserved, which is every subject now. The
// pure per-city cap math (foundingBusinessSpotsRemaining, lib/pricing/founding.ts) is likewise
// test-only and is tracked separately; deleting it is not this row's call.
//
// The founding_members table is not in the generated lib/database.types.ts yet (regen after
// apply, ADR-246), so it is reached through ONE loose service-role handle, the repo idiom
// (see lib/outbound/db.ts, lib/importer/materialize.ts).

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

// ── BADGE READS (making the grant VISIBLE) ──────────────────────────────────────────────────
//
// A founding grant that no surface renders is invisible, so these are the reads every Space
// surface paints the Founding Business mark from. They are the ONLY founding reads a public
// surface calls, and they are deliberately narrow.

/** What a Space surface needs to resolve the Founding Business mark.
 *
 *  `lockedRateCents` is the OPERATOR's own commercial term. It is carried here so a Space's own
 *  settings surface can read its rate back, and it must NEVER be handed to a public component:
 *  the badge is a STATUS, not a price tag. The public chip (FoundingBusinessBadge) takes a
 *  boolean and nothing else, and a source-shape test locks that. */
export interface FoundingSpaceBadge {
  isFounding: boolean
  /** Always 'business' — a Space founder is a Founding Business; the 'member' kind never keys a Space. */
  kind: 'business'
  /** PRIVATE. Operator-facing readouts only. Never render this on a public surface. */
  lockedRateCents: number | null
}

/** ONLY status='active' earns a badge.
 *  • 'reserved' has NOT graduated: the spot is held and nothing has been charged, so the Space is
 *    not a Founding Business yet and must not wear the mark.
 *  • 'lapsed' fell out of the cohort, so the mark is no longer true.
 *  A row must also be kind='business' — a Space is badged as a business founder, never as a member. */
function isActiveFoundingBusiness(r: Row): boolean {
  return r.status === 'active' && r.kind === 'business'
}

/** BATCHED: the Founding Business mark for many Spaces in ONE query, keyed by space id. A directory
 *  grid resolves every card's badge in a single pass, so a card list NEVER goes N+1 (mirrors the
 *  grouped-count readers in lib/spaces/discovery.ts). A space id absent from the Map is not a founder.
 *  Empty input costs no query. FAIL-SAFE to an empty Map: a read error never fabricates founder status. */
export async function foundingBadgesForSpaces(
  spaceIds: readonly string[],
): Promise<Map<string, FoundingSpaceBadge>> {
  const out = new Map<string, FoundingSpaceBadge>()
  const ids = Array.from(new Set(spaceIds)).filter(Boolean)
  if (ids.length === 0) return out
  try {
    const { data } = await foundingDb()
      .from('founding_members')
      .select('space_id, kind, status, locked_rate_cents')
      .in('space_id', ids)
    for (const r of (data ?? []) as Row[]) {
      // The status/kind gate runs HERE rather than as a second .eq() on the query, on purpose: the
      // callers' own tenancy filters (the directory binds .eq('status','active') on `spaces`) are
      // asserted by the leak-contract tests, and an identical filter emitted by this read would
      // satisfy those assertions on the directory's behalf. Matches foundingActiveFor.
      if (!isActiveFoundingBusiness(r)) continue
      const spaceId = typeof r.space_id === 'string' ? r.space_id : null
      if (!spaceId) continue
      out.set(spaceId, {
        isFounding: true,
        kind: 'business',
        lockedRateCents: typeof r.locked_rate_cents === 'number' ? r.locked_rate_cents : null,
      })
    }
  } catch {
    return out
  }
  return out
}

/** The Founding Business mark for ONE Space, or null when it is not an active founder. Delegates to
 *  the batched reader so there is exactly one rule about what counts. FAIL-SAFE to null. */
export async function foundingBadgeForSpace(
  spaceId: string | null | undefined,
): Promise<FoundingSpaceBadge | null> {
  const id = (spaceId ?? '').trim()
  if (!id) return null
  return (await foundingBadgesForSpaces([id])).get(id) ?? null
}

// ── GRANT (the founding hook) ───────────────────────────────────────────────────────────────

/**
 * Grant founding status: flip reserved founders to ACTIVE and apply the LOCKED rate. Called by beta
 * onboarding and the Stripe webhook reconciler. Callable + IDEMPOTENT + no-charge:
 *
 *   • Targeted (a profileId and/or spaceId given): activate that ONE founder's row (upserting a row
 *     if none exists yet, e.g. a member who bought the one-time Founders Round), applying the locked
 *     rate from config. For a member row, also set profiles.is_founding_member=true (the existing
 *     grandfather flag, lib/billing/founders.ts (retired)).
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
  /** The rate to LOCK on a NEWLY created row, in cents (ADR-875): the amount actually charged at the
   *  purchase that earned the grant, so the grandfather promise has a home on the row instead of
   *  living only in the price catalog. Falls back to the founding config when absent. An EXISTING
   *  row's locked rate is never overwritten: a founder's agreed rate is settled the day it is set. */
  lockedRateCents?: number | null
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
      const paidRate =
        typeof input.lockedRateCents === 'number' && input.lockedRateCents > 0
          ? input.lockedRateCents
          : null
      const lockedRateCents =
        existing?.lockedRateCents ??
        paidRate ??
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

// ── LAPSE (the other half of the lifecycle) ─────────────────────────────────────────────────
//
// ADR-875 promises the founding rate "for as long as the subscription is maintained". Until ADR-880
// NOTHING in the repo ever wrote status='lapsed' (zero write sites), so the sentence was true in the
// copy and false in the code: a founder who stopped paying stayed a founder, badge and locked rate,
// forever. This is the missing write.

/** Clear profiles.is_founding_member, EXCEPT for a Founders Round buyer.
 *
 *  The flag has two sources: the recurring beta-founder grant (which the subscription maintains) and
 *  the one-time Founders Round purchase (lib/billing/founders.ts (retired), `meta.founder.founder_round`), which
 *  was BOUGHT OUTRIGHT and is not conditional on any subscription. A lapsing subscription must never
 *  strip a Founders Round member of the thing they paid $250 for once. Best-effort; never throws. */
async function clearFoundingMemberFlag(profileId: string): Promise<void> {
  try {
    const db = foundingDb()
    const { data } = await db.from('profiles').select('meta').eq('id', profileId).maybeSingle()
    const meta = (data?.meta ?? {}) as Record<string, unknown>
    const founder = (meta.founder ?? {}) as Record<string, unknown>
    if (founder.founder_round === true) return // bought outright: not a subscription's to take away
    await db.from('profiles').update({ is_founding_member: false }).eq('id', profileId)
  } catch (err) {
    console.error('[founding] failed to clear is_founding_member:', err)
  }
}

/**
 * LAPSE a founder: flip an ACTIVE founding row to 'lapsed' and, for a member founder, drop the
 * `profiles.is_founding_member` grandfather flag (which resolveMemberPriceId reads as a permanent
 * founder price). Call it when a subscription reconciles to canceled / unpaid.
 *
 * NARROW BY DESIGN:
 *   • ONLY an `active` row lapses. A 'reserved' spot is a held place, not a granted status, and a
 *     row already 'lapsed' is left alone (idempotent).
 *   • A Founders Round member keeps the flag they bought outright (clearFoundingMemberFlag).
 *   • The CALLER owns the "was there really a subscription behind this?" question. A hand-recorded
 *     cash founder has no Stripe subscription, so no reconcile may ever reach them: the Space path
 *     lapses only when the canceled subscription IS the one the Space is on.
 *
 * FAIL-QUIET, like the grant: it returns a result and never throws, so a badge write can never bounce
 * a settled payment back to Stripe.
 */
export async function lapseFoundingStatus(subject: {
  profileId?: string | null
  spaceId?: string | null
}): Promise<ActionResult<{ lapsed: boolean }>> {
  const profileId = subject.profileId ?? null
  const spaceId = subject.spaceId ?? null
  if (!profileId && !spaceId) return fail('We could not tell whose founding status to lapse.')
  try {
    const existing = await getFoundingStatus({ profileId, spaceId })
    if (!existing || existing.status !== 'active') return ok({ lapsed: false })
    await foundingDb()
      .from('founding_members')
      .update({ status: 'lapsed', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (existing.kind === 'member' && (existing.profileId ?? profileId)) {
      await clearFoundingMemberFlag((existing.profileId ?? profileId)!)
    }
    return ok({ lapsed: true })
  } catch (err) {
    console.error('[founding] lapse failed:', err)
    return fail('Could not lapse founding status.')
  }
}
