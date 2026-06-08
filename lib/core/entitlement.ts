// Entitlement tier (the billing axis) — Free → Member (paid) → Supporter. Orthogonal
// to every role (docs/ROLES.md › "Entitlement"). Framework-independent, like the rest
// of lib/core. This is the single place that decides "what does this person pay for",
// so the ✋→✅ gates in the access matrix have one source of truth.
//
// TRANSITIONAL (P2.1): the real source is profiles.membership_tier (migration
// 20260608040000) — additive + backfilled, but until it's applied and billing (P2.2)
// lands, `paid` is proxied by a crew-or-above community role (today's
// `isCrew = role !== 'member'`). `deriveTier` already prefers the explicit flag when
// present, so once the column is live the read path passes it through unchanged.

import { atLeastRole, type CommunityRole } from './roles'
import type { EntitlementTier } from './access-matrix'

export type { EntitlementTier }

export const ENTITLEMENT_TIERS: readonly EntitlementTier[] = ['free', 'member', 'supporter'] as const

export const ENTITLEMENT_LABEL: Record<EntitlementTier, string> = {
  free: 'Free',
  member: 'Member',
  supporter: 'Supporter',
}

/**
 * Resolve a profile's entitlement tier. Prefers the explicit billing flag
 * (`membershipTier`) once the column is live; until then falls back to the crew-or-
 * above community-role proxy — so this is behavior-preserving today and a one-field
 * change when billing lands.
 */
export function deriveTier(input: {
  role?: CommunityRole | null
  membershipTier?: EntitlementTier | null
}): EntitlementTier {
  if (input.membershipTier) return input.membershipTier
  return atLeastRole(input.role ?? null, 'crew') ? 'member' : 'free'
}
