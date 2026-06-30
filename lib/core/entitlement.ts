// Entitlement tier (the billing/membership axis) — Member (free) → Crew (paid) →
// Supporter. Orthogonal to every role (docs/ROLES.md › "Entitlement"). Framework-
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

export const ENTITLEMENT_TIERS: readonly EntitlementTier[] = ['free', 'crew', 'supporter'] as const

export const ENTITLEMENT_LABEL: Record<EntitlementTier, string> = {
  free: 'Member', // the free participant — "come in as a member on the free tier"
  crew: 'Crew', // the paid membership
  supporter: 'Supporter',
}

/**
 * Resolve a profile's entitlement tier from the billing flag. The column is live and
 * backfilled, so this is just the source of truth + a safe default; kept as the single
 * seam so any future billing logic (grace periods, comps) lives in one place.
 *
 * TRANSITION (Pricing ladder Phase A · ADR-458). The member tiers collapse to free / crew;
 * Supporter is retired as a tier (it becomes a pay-what-you-want badge, `profiles.is_supporter`).
 * This reader stays TOLERANT of the old `supporter` label during the transition window — it maps
 * `supporter -> crew` at READ time, which is access-preserving (Supporter sat ABOVE Crew; both are
 * paid, both cash in, both get full gamification, so collapsing to crew never reduces access). The
 * collapse migration (pricing_member_tier) remaps the column the same way.
 * TODO(ADR-458): drop the supporter mapping once the migration has applied and no profile carries it.
 */
export function deriveTier(membershipTier: EntitlementTier | null | undefined): EntitlementTier {
  if (membershipTier === 'supporter') return 'crew'
  return membershipTier ?? 'free'
}

/**
 * Can this tier CASH IN the Vault — spend Gems / claim store rewards (ROLES.md
 * §Entitlement: "Gamification cash-in on the Crew tier")? Accrual (Zaps/Gems/rank) runs
 * for everyone on the free tier; the *cash-in* (claim/spend/compete) is the paid unlock.
 * The pure predicate behind both the Vault matrix gate and the server-side `redeemItem`
 * enforcement, so the UI nudge and the action guard never drift. Paid = the TIER only
 * (`isPaid`), fully decoupled from the community role (ADR-207/225).
 */
export function canCashIn(tier: EntitlementTier | null | undefined): boolean {
  return isPaid(tier)
}
