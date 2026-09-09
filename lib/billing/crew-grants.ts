// CREW GRANTED BY A PAID COMMUNITY MEMBERSHIP (LIVE-223).
//
// THE MODEL. People join free · businesses host free · you pay when you start charging. Nobody buys
// Crew as a subscription any more: you get it by paying dues to a community. Owner ruling — ANY
// active PAID membership, at ANY price, grants Crew.
//
// THE PROBLEM THIS SOLVES. `profiles.membership_tier` is a bare scalar with no provenance. Writing
// 'crew' into it on a paid join is a one-way door: when the membership lapses there is no way to
// tell the grant apart from a tier someone pays Stripe for directly, so the revoke would downgrade
// paying customers. So the grant lives in its OWN row, stamped with the tier that made it, exactly
// like `memberships.granted_by_tier_id` does for circle access (ADR-859). The column is never
// written by this engine. The effective tier is the union (lib/core/entitlement.ts):
//
//     effective = stripe_active OR EXISTS(active grant)
//
// THE TAKE-RATE GUARD IS NOT HERE, AND THAT IS THE POINT. Crew takes the member network take rate
// from 10% to 8%. A granted Crew must NOT inherit that rung, or a $1 membership tier becomes a
// machine for buying the rate down. Money reads `billedTier()` — the Stripe rung — and never the
// resolved tier. See lib/billing/granted-crew-take-rate.test.ts (LIVE-224).
//
// TWO GUARDS ON THE GRANT ITSELF:
//   1. PAID ONLY. `space_membership_tiers.price_cents > 0`. A free tier grants nothing, and a paid
//      tier the operator later drops to free revokes on the next lifecycle event.
//   2. NO SELF-GRANT. A Space's own owner and admins are NOT grantable by their own tier. Only paid
//      Spaces may create membership tiers, so opening a $1 tier already costs a Business
//      subscription — but without this an operator could still mint themselves Crew from a tier
//      they control, which is a grant with no counterparty. Enforced twice, here and by the
//      `entitlement_grants_no_self_grant` trigger, because an app-only rule is one direct write
//      away from being no rule at all.
//
// FAIL-SOFT ON WRITE, FAIL-CLOSED ON READ. Nothing here throws: a paid membership must never fail
// (nor a webhook enter a retry loop) because the grant write hiccuped, and the miss self-heals on
// the next lifecycle event. The READ is the opposite — an unreadable grant reads as NO grant,
// because "we could not tell" must never hand out paid access.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEffectiveTier, type EffectiveTier } from '@/lib/core/entitlement'

/** The table the grants live in (public.entitlement_grants). */
export const GRANTS_TABLE = 'entitlement_grants'

/** The only tier this engine grants today. The column is wider so a future rung needs no migration. */
export const GRANTED_TIER = 'crew' as const

/** Provenance: WHY the row exists. One source today; the column keeps the door open. */
export const GRANT_SOURCE = 'space_membership' as const

// ── Untyped admin-client seam (entitlement_grants is not in the generated types yet, ADR-246;
//    the same one-loose-thenable-chain idiom lib/spaces/tier-circle.ts uses) ────────────────────

type DbError = { code?: string; message?: string } | null

type Chain = {
  select: (cols: string) => Chain
  insert: (rows: Record<string, unknown>[]) => Chain
  delete: () => Chain
  eq: (col: string, val: string) => Chain
  limit: (n: number) => Chain
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: DbError }>
  then: <T>(
    resolve: (r: { data: Record<string, unknown>[] | null; error: DbError }) => T,
  ) => Promise<T>
}

function table(name: string): Chain {
  const db = createAdminClient() as unknown as { from: (t: string) => Chain }
  return db.from(name)
}

// ── The read side ───────────────────────────────────────────────────────────────────────────────

/**
 * Does this profile hold an ACTIVE Crew grant? A row IS the grant (revoke deletes it), so there is
 * exactly one truth to read and no revoked row can ever be mistaken for a live one.
 *
 * Request-cached per profile id (React cache, the getViewerHats / currentViewer idiom): the tier is
 * resolved several times per render and this must not become several round trips.
 *
 * FAIL-CLOSED: a read error reads as NO grant. The alternative hands out paid access on a hiccup.
 */
export const hasActiveCrewGrant = cache(async (profileId: string | null | undefined): Promise<boolean> => {
  if (!profileId) return false
  try {
    const { data, error } = await table(GRANTS_TABLE)
      .select('id')
      .eq('profile_id', profileId)
      .eq('tier', GRANTED_TIER)
      .limit(1)
    if (error) {
      console.error('[crew-grants] grant read failed', error.message)
      return false
    }
    return (data ?? []).length > 0
  } catch (err) {
    console.error('[crew-grants] hasActiveCrewGrant failed', err)
    return false
  }
})

/**
 * The profile's effective tier: the Stripe column UNION the grant. The one server seam every access
 * path narrows through (getViewerHats, load-capabilities' currentViewer).
 *
 * The record keeps `stripeTier` beside `tier` on purpose — pricing reads the former, access the
 * latter, and neither can silently become the other.
 */
export async function effectiveTierFor(
  profileId: string | null | undefined,
  membershipTier: string | null | undefined,
): Promise<EffectiveTier> {
  // Skip the round trip when the column already says crew: the union cannot come out any higher.
  if (membershipTier === GRANTED_TIER) return resolveEffectiveTier(membershipTier, false)
  return resolveEffectiveTier(membershipTier, await hasActiveCrewGrant(profileId))
}

/** Every tier currently granting this profile Crew, for the "why am I Crew?" provenance read. */
export async function crewGrantProvenance(
  profileId: string,
): Promise<{ spaceId: string; tierId: string }[]> {
  try {
    const { data, error } = await table(GRANTS_TABLE)
      .select('space_id, granted_by_tier_id')
      .eq('profile_id', profileId)
      .eq('tier', GRANTED_TIER)
    if (error) return []
    return (data ?? []).map((r) => ({
      spaceId: String(r.space_id),
      tierId: String(r.granted_by_tier_id),
    }))
  } catch {
    return []
  }
}

// ── The self-grant guard ────────────────────────────────────────────────────────────────────────

/**
 * Is this profile the Space's OWNER or one of its admins? Such a person is not grantable by their
 * own Space's tier: a membership you sell to yourself has no counterparty, and the grant would be
 * free Crew for anyone willing to open a tier.
 *
 * Read directly rather than through `getSpaceCapabilities` on purpose — that resolver folds
 * platform STAFF in as `isAdmin: true` on every Space, and a janitor who genuinely pays a
 * community's dues should keep the Crew that membership buys them.
 *
 * FAIL-CLOSED: an unreadable answer counts as "yes, they are staff here", so a read hiccup refuses
 * a grant rather than minting one that the trigger would then have to catch.
 */
export async function isSpaceOperator(spaceId: string, profileId: string): Promise<boolean> {
  try {
    const { data: space, error: spaceErr } = await table('spaces')
      .select('id, owner_profile_id')
      .eq('id', spaceId)
      .maybeSingle()
    if (spaceErr) return true
    if (space && String(space.owner_profile_id ?? '') === profileId) return true

    const { data: members, error: memberErr } = await table('space_members')
      .select('role, status')
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
    if (memberErr) return true
    // The per-Space ladder is viewer < editor < moderator < admin, with no 'owner' rung: the
    // owner is the spaces.owner_profile_id FK checked above.
    return (members ?? []).some((m) => m.status === 'active' && m.role === 'admin')
  } catch (err) {
    console.error('[crew-grants] isSpaceOperator failed', err)
    return true
  }
}

// ── The write side ──────────────────────────────────────────────────────────────────────────────

export interface CrewGrantSyncInput {
  spaceId: string
  profileId: string
  /** The tier being granted, or (for a revoke) the tier whose grant is being undone. */
  tierId: string
  /** On a tier SWITCH: the tier the member left — its grant is revoked before the new grant. */
  previousTierId?: string
  action: 'grant' | 'revoke'
}

export type CrewGrantReason =
  | 'granted'
  | 'already_granted'
  | 'revoked'
  | 'free_tier'
  | 'self_grant'
  | 'tier_missing'
  | 'error'

export interface CrewGrantSyncResult {
  granted: boolean
  reason: CrewGrantReason
}

/** Delete this profile's grant from ONE tier. Provenance is the whole filter, so a grant from a
 *  DIFFERENT community — or a Crew the member pays Stripe for — can never be touched. */
async function revokeGrantRow(profileId: string, tierId: string): Promise<void> {
  const { error } = await table(GRANTS_TABLE)
    .delete()
    .eq('profile_id', profileId)
    .eq('granted_by_tier_id', tierId)
  if (error) console.error('[crew-grants] revoke delete failed', error.message)
}

/**
 * Sync ONE member's Crew grant to their membership lifecycle. Called from
 * `syncTierCircleAccess` (lib/spaces/tier-circle.ts), which every membership lifecycle site
 * already calls — so wiring here reaches all six: created, renewed, cancelled, expired, refunded.
 * The sixth, TIER DELETED, is wired in the schema instead: `granted_by_tier_id` is
 * `on delete cascade`, so removing a tier removes exactly the grants it made and nothing else.
 *
 * NEVER THROWS. Idempotent: re-running a grant is a swallowed unique violation, re-running a
 * revoke deletes nothing.
 */
export async function syncCrewEntitlement(
  input: CrewGrantSyncInput,
): Promise<CrewGrantSyncResult> {
  try {
    if (input.action === 'revoke') {
      await revokeGrantRow(input.profileId, input.tierId)
      return { granted: false, reason: 'revoked' }
    }

    // Tier switch: the old tier's grant goes first, so a switch can never leave two rows standing.
    if (input.previousTierId && input.previousTierId !== input.tierId) {
      await revokeGrantRow(input.profileId, input.previousTierId)
    }

    const { data: tier } = await table('space_membership_tiers')
      .select('id, space_id, price_cents')
      .eq('id', input.tierId)
      .maybeSingle()
    // Cross-space sanity, same shape as the circle engine's: a tier that is not THIS Space's tier
    // grants nothing.
    if (!tier || String(tier.space_id) !== input.spaceId) {
      return { granted: false, reason: 'tier_missing' }
    }

    // GUARD 1 — PAID ONLY. Any price qualifies (owner ruling); zero does not. A tier the operator
    // drops from paid to free revokes here on the next lifecycle event rather than lingering.
    const priceCents = Number(tier.price_cents ?? 0)
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      await revokeGrantRow(input.profileId, input.tierId)
      return { granted: false, reason: 'free_tier' }
    }

    // GUARD 2 — NO SELF-GRANT. A Space's own owner/admins are not grantable by their own tier.
    if (await isSpaceOperator(input.spaceId, input.profileId)) {
      await revokeGrantRow(input.profileId, input.tierId)
      return { granted: false, reason: 'self_grant' }
    }

    const { error } = await table(GRANTS_TABLE).insert([
      {
        profile_id: input.profileId,
        tier: GRANTED_TIER,
        source: GRANT_SOURCE,
        space_id: input.spaceId,
        granted_by_tier_id: input.tierId,
      },
    ])
    if (error) {
      // The (profile_id, granted_by_tier_id) unique index: the grant already stands. Success.
      if (error.code === '23505') return { granted: false, reason: 'already_granted' }
      console.error('[crew-grants] grant insert failed', error.message)
      return { granted: false, reason: 'error' }
    }
    return { granted: true, reason: 'granted' }
  } catch (err) {
    console.error('[crew-grants] syncCrewEntitlement failed', input.action, err)
    return { granted: false, reason: 'error' }
  }
}
