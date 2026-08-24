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
