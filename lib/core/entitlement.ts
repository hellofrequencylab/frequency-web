// Entitlement tier (the billing/membership axis) — Member (free) → Crew (paid). Two
// rungs. Orthogonal to every role (docs/ROLES.md › "Entitlement"). Framework-
// independent, like the rest of lib/core. The single place that decides "what does this
// person pay for", so the ✋→✅ gates in the access matrix have one source of truth.
//
// "Everyone is part of the Crew on the paid tier — that's the membership point." The
// real source is profiles.membership_tier (migration 20260608040000, applied + backfilled),
// threaded through getCallerProfile → getViewerHats. Paid access is the TIER only; it is
// fully decoupled from the community role (a free-tier Host is a steward, not "paid" —
// they get their tools from the role, via the access matrix, not from membership).

import { isPaid, type EntitlementTier } from './access-matrix'

export type { EntitlementTier }
// `isPaid(tier)` is THE single "is this person paid?" predicate (defined next to the
// matrix it feeds). Re-exported here so app code imports it from the entitlement seam.
export { isPaid }

export const ENTITLEMENT_TIERS: readonly EntitlementTier[] = ['free', 'crew'] as const

export const ENTITLEMENT_LABEL: Record<EntitlementTier, string> = {
  free: 'Member', // the free participant — "come in as a member on the free tier"
  crew: 'Crew', // the paid membership
}

/**
 * Resolve a profile's entitlement tier from the billing flag. The column is live and
 * backfilled, so this is just the source of truth + a safe default; kept as the single
 * seam so any future billing logic (grace periods, comps) lives in one place.
 *
 * RETIRED, 2026-08-24 (owner directive closing the ADR-458 drop condition). This reader used to
 * fold the old Supporter label into Crew so a historical row could not lose access. That fold is
 * gone, and it is gone because its drop condition was MET rather than assumed: migration
 * 20260915000100 narrowed the column CHECK to exactly ('free','crew') and remapped every row, and
 * the live column carries zero of the retired label. It cannot enter the column, so the tolerance
 * had nothing left to tolerate, and a fail-safe nothing can trip is one that only reads as cover.
 * The Supporter BADGE (the pay-what-you-want contribution mark on a profile) is a different axis
 * and is untouched: retiring a rung is not retiring a way to give.
 */
export function deriveTier(membershipTier: EntitlementTier | null | undefined): EntitlementTier {
  return membershipTier ?? 'free'
}

// 🔴 `canCashIn` USED TO SIT HERE and is deliberately gone (ADR-1295, owner ruling 2026-09-09,
// OWN-071). It answered "may this tier spend Gems / claim Vault rewards", and the answer is now yes
// for every signed-in member: the Quest is a side thing we all do together, and a member who earns
// but can never spend is not playing the same game as one who can. Its ONE call site was the
// `redeemItem` guard in app/(main)/crew/store/actions.ts, which went in the same change along with
// the `vault_cash_in` and `gamification_full` gates. Do not re-add it: what bounds a redemption is
// the Gem balance, the season, the rank requirement and the remaining stock, none of which is a tier.

// ── GRANTED CREW (LIVE-223) ─────────────────────────────────────────────────────────────────────
//
// Crew is a TIER, not a role, and `profiles.membership_tier` is a bare scalar with NO provenance:
// nothing in that column records WHY a profile is crew. So a grant written straight into it could
// never be revoked when the granting membership lapsed without also downgrading someone who pays
// Stripe directly. The fix is the pattern already proven on circle memberships
// (memberships.granted_by_tier_id, ADR-859): keep the grant in its OWN row, stamped with the tier
// that made it, and resolve the tier as a UNION of two independently-revocable facts.
//
//   effective tier = stripe_active  OR  EXISTS(an active grant)
//
// `stripeTier` is what the person BOUGHT (the column). `granted` is what an active PAID community
// membership confers (public.entitlement_grants). `tier` is what ACCESS should read. They are kept
// as three separate fields on purpose: the moment they collapse into one string, the take-rate
// question ("which rung did this seller PAY for?") and the access question ("what may they do?")
// become indistinguishable, and a $1 membership tier turns into a machine for buying the network
// take rate down from 10% to 8%. See lib/billing/granted-crew-take-rate.test.ts.

/** The two-fact tier: what was bought, what was granted, and what access should read. */
export interface EffectiveTier {
  /** The BILLED rung — `profiles.membership_tier` alone. The ONLY rung money may read. */
  readonly stripeTier: EntitlementTier
  /** True when an active paid community membership grants Crew (public.entitlement_grants). */
  readonly granted: boolean
  /** What ACCESS reads: `stripeTier` OR the grant. Never a pricing input. */
  readonly tier: EntitlementTier
}

/** Is this an {@link EffectiveTier} record rather than a bare tier string? PURE. */
export function isEffectiveTier(value: unknown): value is EffectiveTier {
  return !!value && typeof value === 'object' && 'stripeTier' in (value as object)
}

/**
 * Resolve the effective tier from the two independent facts. PURE — the DB read lives in
 * lib/billing/crew-grants.ts, so this stays trivially testable and framework-independent.
 *
 * A grant can only ever RAISE the tier: someone who pays Stripe directly is never downgraded by
 * grant logic, because the union is taken over `isPaid`, not over a precedence order.
 */
export function resolveEffectiveTier(
  membershipTier: EntitlementTier | string | null | undefined,
  hasActiveGrant: boolean,
): EffectiveTier {
  const stripeTier = deriveTier((membershipTier ?? null) as EntitlementTier | null)
  const granted = hasActiveGrant === true
  return {
    stripeTier,
    granted,
    tier: isPaid(stripeTier) || granted ? 'crew' : stripeTier,
  }
}

/**
 * 🔴 THE BILLED RUNG, and the reason this accessor exists at all.
 *
 * Money reads THIS, never `EffectiveTier.tier`. Crew takes the member network take rate from 10%
 * to 8%; if a granted Crew inherited that rung, opening a $1 membership tier would pay for itself
 * and then some — the grant would BUY DOWN the take rate. So every pricing path narrows through
 * here, and it is written to be right even when handed the whole two-fact record by mistake: an
 * `EffectiveTier` collapses to its `stripeTier`, never to `tier`.
 *
 * Unknown / legacy labels pass through untouched so the caller's own allow-list (`isPaid`) decides
 * — a `!== 'free'` test upstream would read a typo as paid, which is the inversion
 * lib/billing/pricing-keys.ts documents. PURE.
 */
export function billedTier(
  seller: EffectiveTier | EntitlementTier | string | null | undefined,
): EntitlementTier {
  if (isEffectiveTier(seller)) return deriveTier(seller.stripeTier)
  return deriveTier((seller ?? null) as EntitlementTier | null)
}
