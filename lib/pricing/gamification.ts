// GAMIFICATION ACCESS — the THIRD independent flag (ADR-362). Derived from billing_tier by
// default (member = earn-only, crew+ = full), but an INDEPENDENT, overridable switch: the
// nullable `profiles.gamification_access_override` PINS it regardless of billing.
//
// PURE + framework-independent (no Supabase/Next) so it's unit-testable on its own. The DB
// READ (loading the profile) lives at the call site; this module just decides the access given
// the two inputs. It separates the *axis* (access) from billing so an operator can grant or deny it
// independently — e.g. comp a free member full access, or revoke a paying member's.
//
// 🔴 THIS IS NOT A GATE, and after ADR-1295 (owner ruling 2026-09-09, OWN-071) nothing beside it is
// either. It used to mirror `canCashIn` in lib/core/entitlement.ts and sit next to the
// `gamification_full` FEATURE_GATES row; the predicate and the gate are both deleted, because the
// Quest is a side thing we all do together and earning, spending and competing are open to every
// signed-in member. What survives here is the operator PIN, and the `earn_only` rung it can still
// express is an operator's choice about one account, never a tier's default answer.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

/** The two gamification access levels an operator can pin. earn_only = accrue Zaps/Gems/rank without
 *  the claim/spend/compete half; full = the complete loop. */
export type GamificationAccess = 'earn_only' | 'full'

/** The DEFAULT access derived from the billing tier: paid (crew) = full, free = earn-only. The pure
 *  derive the operator override layers over. It gates NOTHING on its own (ADR-1295). */
export function deriveGamificationAccess(tier: EntitlementTier | null | undefined): GamificationAccess {
  return isPaid(tier) ? 'full' : 'earn_only'
}

/** Narrow an arbitrary value (the raw override column) to a GamificationAccess, or null. */
export function asGamificationAccess(raw: unknown): GamificationAccess | null {
  return raw === 'earn_only' || raw === 'full' ? raw : null
}

/** The minimum profile shape this resolver needs. Accepts the override loosely (the column may
 *  not be in the generated types yet — ADR-246) and reads either casing of the tier field. */
export interface PricingProfileLike {
  membership_tier?: EntitlementTier | string | null
  membershipTier?: EntitlementTier | string | null
  gamification_access_override?: unknown
  gamificationAccessOverride?: unknown
}

/** RESOLVE the effective gamification access for a profile: the override if set, else derive from
 *  the billing tier. `override ?? derive(membership_tier)` — the one entry point the gamification
 *  gates should consult. PURE + fail-safe (an unknown override is ignored; an unknown tier reads
 *  as free → earn_only). */
export function resolveGamificationAccess(profile: PricingProfileLike | null | undefined): GamificationAccess {
  const override = asGamificationAccess(
    profile?.gamification_access_override ?? profile?.gamificationAccessOverride,
  )
  if (override) return override
  const rawTier = profile?.membership_tier ?? profile?.membershipTier
  return deriveGamificationAccess((rawTier ?? 'free') as EntitlementTier)
}
