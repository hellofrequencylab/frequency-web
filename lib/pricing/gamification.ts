// GAMIFICATION ACCESS — the THIRD independent flag (ADR-362). Derived from billing_tier by
// default (member = earn-only, crew+ = full), but an INDEPENDENT, overridable switch: the
// nullable `profiles.gamification_access_override` PINS it regardless of billing.
//
// PURE + framework-independent (no Supabase/Next) so it's unit-testable on its own. The DB
// READ (loading the profile) lives at the call site; this module just decides the access given
// the two inputs. Mirrors lib/core/entitlement.ts canCashIn (the "is this gamification full?"
// predicate), but separates the *axis* (access) from billing so an operator can grant/deny it
// independently — e.g. comp a free member full access, or revoke a paying member's.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

/** The two gamification access levels. earn_only = accrue Zaps/Gems/rank but cannot cash in /
 *  compete; full = the complete loop (claim, spend, compete). Matches the canCashIn split. */
export type GamificationAccess = 'earn_only' | 'full'

/** The DEFAULT access derived from the billing tier: paid (crew/supporter) = full, free = earn-only.
 *  This is the same line canCashIn draws (lib/core/entitlement.ts) — kept here as the pure derive so
 *  the override can layer over it. */
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
