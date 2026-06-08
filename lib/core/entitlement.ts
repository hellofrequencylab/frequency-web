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

import type { EntitlementTier } from './access-matrix'

export type { EntitlementTier }
// `isPaid(tier)` is THE single "is this person paid?" predicate (defined next to the
// matrix it feeds). Re-exported here so app code imports it from the entitlement seam.
export { isPaid } from './access-matrix'

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
 */
export function deriveTier(membershipTier: EntitlementTier | null | undefined): EntitlementTier {
  return membershipTier ?? 'free'
}
