// TIER → CIRCLE MEMBERSHIP ACCESS (ADR-859). A Space links a membership tier to ONE of its
// circles (space_membership_tiers.circle_id); the membership lifecycle grants and revokes the
// member's circle membership. Durable rows, not a live gate: the circle IS the hub — its roster,
// circles.member_count, the comms audience, and the get_my_circle_ids() RLS helper all read
// `memberships` rows directly, so a tier member must exist there as a real row (see the ADR-859
// migration header for the contrast with ADR-823's live-gated event tickets).
//
// PROVENANCE RULE: every row this engine creates is stamped memberships.granted_by_tier_id.
// Revoke deletes ONLY rows carrying the revoking tier's id — a row the member self-joined
// (granted_by_tier_id IS NULL) is NEVER touched, and a self-joined row that already exists at
// grant time WINS (left untagged), so a later billing event can never evict a membership the
// member chose on their own.
//
// FAIL-SOFT POSTURE: syncTierCircleAccess never throws. A paid membership must never fail (nor a
// webhook enter a retry loop) because the circle write hiccuped or the circle is full — the miss
// is visible in the returned reason + the log, and self-heals on the next lifecycle event or on a
// re-link sweep (setTierCircle). setTierCircle is the operator action core and DOES report
// failures as ActionResult, since the operator can act on them.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── Untyped admin-client seam (granted_by_tier_id / circle_id not in generated types yet,
//    ADR-246; one loose thenable chain covers every query this module makes) ────────────────────

type DbError = { code?: string; message?: string } | null

type Chain = {
  select: (cols: string) => Chain
  insert: (rows: Record<string, unknown>[]) => Chain
  update: (patch: Record<string, unknown>) => Chain
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

// ── The canonical active-membership reader ──────────────────────────────────────────────────────

/**
 * Does this profile hold an ACTIVE membership in this Space (optionally: in this specific tier)?
 * THE canonical reader for "is a member right now" — new code should call this instead of
 * re-writing the query (today the same shape is copy-pasted in lib/billing/tickets.ts and the
 * events page; those callers are deliberately left as-is, other work is in flight there).
 *
 * status='active' ONLY. Note that a past_due membership currently KEEPS status 'active' (the finer
 * Stripe state lives in payment_status; only a cancellation flips status) — so past_due members
 * still count as members here. That matches every existing consumer and is kept deliberately.
 * FAIL-SAFE to false.
 */
export async function hasActiveSpaceMembership(
  spaceId: string,
  profileId: string,
  tierId?: string,
): Promise<boolean> {
  if (!spaceId || !profileId) return false
  try {
    let q = table('space_memberships')
      .select('id')
      .eq('space_id', spaceId)
      .eq('member_profile_id', profileId)
      .eq('status', 'active')
    if (tierId) q = q.eq('tier_id', tierId)
    const { data } = await q.limit(1)
    return (data ?? []).length > 0
  } catch {
    return false
  }
}

// ── Internal grant / revoke primitives (both non-throwing) ──────────────────────────────────────

/** The cap trigger (enforce_circle_member_cap) raises 'circle_full' with errcode P0001. */
function isCircleFull(error: NonNullable<DbError>): boolean {
  return error.code === 'P0001' && (error.message ?? '').includes('circle_full')
}

type GrantOutcome = {
  granted: boolean
  reason?: 'already_member' | 'circle_full' | 'error'
}

/**
 * Materialize ONE circle membership for a tier grant. Idempotent:
 *   - an existing ACTIVE row wins untouched (a self-joined row stays untagged, so revoke can
 *     never claim it; a row an earlier grant tagged is already correct);
 *   - a dormant row (status pending/inactive) blocks a fresh INSERT via the UNIQUE
 *     (profile_id, circle_id) constraint, so it is reactivated in place and takes provenance —
 *     the tier is what made it live again, so revoke may undo it. (This UPDATE path bypasses the
 *     BEFORE INSERT cap trigger; accepted — the row already held a seat in member_count.)
 *   - otherwise INSERT with granted_by_tier_id. 'circle_full' from the cap trigger and the
 *     unique-race 23505 are translated to reasons, never thrown.
 */
async function grantCircleRow(
  circleId: string,
  profileId: string,
  tierId: string,
): Promise<GrantOutcome> {
  try {
    const { data: existing } = await table('memberships')
      .select('id, status')
      .eq('circle_id', circleId)
      .eq('profile_id', profileId)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'active') return { granted: false, reason: 'already_member' }
      // Reactivation is an UPDATE, and the cap guard (enforce_circle_member_cap) is BEFORE
      // INSERT only, counting active rows — so flipping a dormant row to active would slip
      // past it (ADR-863). Re-check the cap here: a dormant row held a slot in member_count,
      // but NOT in the active-member cap, so reactivating a full circle must report full, not
      // silently overfill it. Best-effort read; a miss falls through to the insert-guarded path.
      const { data: circle } = await table('circles')
        .select('member_cap')
        .eq('id', circleId)
        .maybeSingle()
      const cap = (circle as { member_cap: number | null } | null)?.member_cap ?? null
      if (cap != null) {
        // Count active members via an untyped handle (the shared Chain type doesn't model the
        // head/count select option; repo idiom for reaching past the generated types, ADR-246).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createAdminClient() as unknown as { from: (t: string) => any }
        const { count } = await db
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('circle_id', circleId)
          .eq('status', 'active')
        if (typeof count === 'number' && count >= cap) {
          return { granted: false, reason: 'circle_full' }
        }
      }
      const { error } = await table('memberships')
        .update({ status: 'active', granted_by_tier_id: tierId })
        .eq('id', String(existing.id))
      if (error) {
        console.error('[tier-circle] reactivate failed', error.message)
        return { granted: false, reason: 'error' }
      }
      return { granted: true }
    }

    const { error } = await table('memberships').insert([
      { circle_id: circleId, profile_id: profileId, status: 'active', granted_by_tier_id: tierId },
    ])
    if (error) {
      if (isCircleFull(error)) return { granted: false, reason: 'circle_full' }
      // Lost a join race with the member's own join: their row wins, exactly like pre-existing.
      if (error.code === '23505') return { granted: false, reason: 'already_member' }
      console.error('[tier-circle] grant insert failed', error.message)
      return { granted: false, reason: 'error' }
    }
    return { granted: true }
  } catch (err) {
    console.error('[tier-circle] grantCircleRow failed', err)
    return { granted: false, reason: 'error' }
  }
}

/**
 * Delete this member's circle rows granted by THIS tier — provenance is the whole filter
 * (granted_by_tier_id = tierId), so a self-joined row (NULL provenance) or another tier's grant
 * can never match. No circle filter on purpose: it would be redundant when the link is current
 * and would strand a drifted row if the tier was re-linked between grant and revoke.
 */
async function revokeCircleRows(profileId: string, tierId: string): Promise<void> {
  const { error } = await table('memberships')
    .delete()
    .eq('profile_id', profileId)
    .eq('granted_by_tier_id', tierId)
  if (error) console.error('[tier-circle] revoke delete failed', error.message)
}

// ── The idempotent lifecycle engine ─────────────────────────────────────────────────────────────

export interface TierCircleSyncInput {
  spaceId: string
  profileId: string
  /** The tier being granted, or (for a revoke) the tier whose grant is being undone. */
  tierId: string
  /** On a tier SWITCH: the tier the member left — its grant is revoked before the new grant. */
  previousTierId?: string
  action: 'grant' | 'revoke'
}

export interface TierCircleSyncResult {
  granted: boolean
  reason?: 'revoked' | 'no_circle' | 'already_member' | 'circle_full' | 'error'
}

/**
 * Sync ONE member's circle access to their membership lifecycle. Called (fire-and-forget) at
 * every lifecycle site: joinTier's active branch, promoteMembership, cancelMembership, and both
 * branches of the Stripe webhook reconcile. Idempotent + NEVER THROWS (fail-soft, console.error):
 *   grant  → look up the tier's circle; no link = no-op. Insert the provenance-stamped row unless
 *            an active row already exists (self-join wins). A full circle returns
 *            { granted: false, reason: 'circle_full' } — a paid membership must never fail on it;
 *            the operator sees the miss in the action result / log.
 *   revoke → delete ONLY the rows this tier granted (provenance rule).
 *   switch → pass action 'grant' with previousTierId: the old tier's grant is revoked first.
 */
export async function syncTierCircleAccess(
  input: TierCircleSyncInput,
): Promise<TierCircleSyncResult> {
  try {
    if (input.action === 'revoke') {
      await revokeCircleRows(input.profileId, input.tierId)
      return { granted: false, reason: 'revoked' }
    }

    // Tier switch: undo the previous tier's grant before granting the new tier's circle.
    if (input.previousTierId && input.previousTierId !== input.tierId) {
      await revokeCircleRows(input.profileId, input.previousTierId)
    }

    const { data: tier } = await table('space_membership_tiers')
      .select('space_id, circle_id')
      .eq('id', input.tierId)
      .maybeSingle()
    // Cross-space sanity: the tier must be THIS Space's tier (a mismatched call grants nothing),
    // and an unlinked tier is the normal no-op.
    const circleId = (tier?.circle_id as string | null) ?? null
    if (!tier || tier.space_id !== input.spaceId || !circleId) {
      return { granted: false, reason: 'no_circle' }
    }
    return await grantCircleRow(circleId, input.profileId, input.tierId)
  } catch (err) {
    console.error('[tier-circle] syncTierCircleAccess failed', input.action, err)
    return { granted: false, reason: 'error' }
  }
}

// ── The operator action core ────────────────────────────────────────────────────────────────────

/**
 * Link a tier to one of the Space's circles (or null to unlink). The action core behind the
 * membership settings surface, shaped like setSpaceEventAccess: gated on canEditProfile (the
 * caller passes the resolved actor; the gate is re-checked here as defense in depth), and BOTH
 * sides are validated to belong to this Space — a tier or circle from another Space fails.
 *
 *   LINK    → initial sweep: grant every CURRENT active member of the tier (this replaces any
 *             backfill migration; a new link self-heals). Returns how many were granted and how
 *             many missed on a full circle so the surface can tell the operator.
 *   UNLINK  → revoke every row this tier granted (provenance rule; self-joins survive).
 *   RE-LINK → revoke from the OLD circle first, then sweep the new one.
 */
export async function setTierCircle(
  spaceId: string,
  tierId: string,
  circleId: string | null,
  actorProfileId: string,
): Promise<ActionResult<{ granted: number; full: number }>> {
  if (!actorProfileId) return fail('Sign in.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, actorProfileId)
  if (!caps.canEditProfile) {
    return fail('You do not have permission to manage memberships for this space.')
  }

  try {
    // The tier must be THIS Space's tier (same-space validation, the ADR-824 precedent).
    const { data: tier } = await table('space_membership_tiers')
      .select('id, circle_id')
      .eq('id', tierId)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (!tier) return fail('That membership tier does not belong to this space.')

    // ...and so must the circle (no cross-space grants, ever).
    if (circleId) {
      const { data: circle } = await table('circles')
        .select('id, space_id')
        .eq('id', circleId)
        .maybeSingle()
      if (!circle || circle.space_id !== spaceId) {
        return fail('That circle does not belong to this space.')
      }
    }

    const previousCircleId = (tier.circle_id as string | null) ?? null
    if (previousCircleId === circleId) return ok({ granted: 0, full: 0 }) // no change

    // UNLINK / RE-LINK: rows granted by this tier leave the old circle FIRST, so a re-link can
    // never leave a member holding both circles from one tier.
    if (previousCircleId) {
      const { error } = await table('memberships').delete().eq('granted_by_tier_id', tierId)
      if (error) return fail('Could not update the circle link. Try again.')
    }

    const { error: linkErr } = await table('space_membership_tiers')
      .update({ circle_id: circleId })
      .eq('id', tierId)
      .eq('space_id', spaceId)
    if (linkErr) return fail('Could not update the circle link. Try again.')
    if (!circleId) return ok({ granted: 0, full: 0 })

    // INITIAL SWEEP: every current ACTIVE member of the tier gets the circle now. Row by row so
    // one full-circle miss (or one bad row) never blocks the rest; misses are counted for the
    // operator, not thrown.
    const { data: members } = await table('space_memberships')
      .select('member_profile_id')
      .eq('space_id', spaceId)
      .eq('tier_id', tierId)
      .eq('status', 'active')
    let granted = 0
    let full = 0
    for (const m of members ?? []) {
      const res = await grantCircleRow(circleId, String(m.member_profile_id), tierId)
      if (res.granted) granted += 1
      else if (res.reason === 'circle_full') full += 1
    }
    return ok({ granted, full })
  } catch (err) {
    console.error('[tier-circle] setTierCircle failed', err)
    return fail('Could not update the circle link. Try again.')
  }
}
