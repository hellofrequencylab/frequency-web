// GAMIFICATION ACCESS — the LIVE (server-side, IO) consumer of the third flag (ADR-362, ADR-370).
// The PURE resolver lives in lib/pricing/gamification.ts (override ?? derive(tier)); this module is
// the seam that READS a profile + the operator flags and answers one question:
//
//   resolveViewerGamificationAccess() — the effective access ('earn_only' | 'full') for the
//   signed-in viewer, folding: the per-profile override (pinned), then the operator per-role
//   gamification_full_* flags, then the derive-from-tier default.
//
// 🔴 THIS IS AN OPERATOR OVERRIDE, NOT A BILLING DOOR, and after ADR-1295 that is the whole of it.
// The `gamification_full` GATE it used to sit beside was deleted by the owner ruling of 2026-09-09
// (OWN-071): the Quest is a side thing we all do together, so earning, spending and competing are
// open to every signed-in member and no surface asks a tier for permission to play. What is left
// here is the per-profile / per-tier pin an operator can set from /admin/pricing.
//
// Every read is FAIL-SAFE: any DB/flag error degrades to the pure derive, never to a lockout.

import { createAdminClient } from '@/lib/supabase/admin'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { getCachedUser } from '@/lib/auth'
import {
  type GamificationAccess,
  asGamificationAccess,
  deriveGamificationAccess,
  resolveGamificationAccess,
} from './gamification'
import { loadPricingFlags } from './settings'

/** The per-role gamification_full_* flag key for a tier (the operator's per-tier override).
 *  Two rungs, two flags: the Supporter rung was retired from EntitlementTier (2026-08-24), and its
 *  `gamification_full_supporter` flag went with it — no tier could ever select it again. */
const GAMIFICATION_FLAG: Record<EntitlementTier, 'gamification_full_member' | 'gamification_full_crew'> = {
  free: 'gamification_full_member',
  crew: 'gamification_full_crew',
}

/** Resolve the effective gamification access for a profile shape, folding the operator per-role
 *  flags OVER the pure resolver. PURE-ish helper (flags passed in): the per-profile override wins
 *  first (pinned), then a per-role flag that grants FULL elevates the derived default, else the
 *  derive-from-tier line. The defaults (crew on, member off) reproduce today exactly. */
export function resolveGamificationAccessWithFlags(
  profile: { membership_tier?: EntitlementTier | string | null; gamification_access_override?: unknown } | null | undefined,
  flags: { gamification_full_member: boolean; gamification_full_crew: boolean },
): GamificationAccess {
  // 1. A per-profile override PINS the access regardless of tier or flags (the third flag's switch).
  const override = asGamificationAccess(profile?.gamification_access_override)
  if (override) return override

  // 2. The per-role operator flag: when ON for the viewer's tier, that tier gets FULL access (even
  //    where the derive-from-tier default would give earn_only, e.g. comping free members).
  const tier = ((profile?.membership_tier as EntitlementTier | null | undefined) ?? 'free') as EntitlementTier
  const flagKey = GAMIFICATION_FLAG[tier] ?? GAMIFICATION_FLAG.free
  if (flags[flagKey] === true) return 'full'

  // 3. Otherwise the pure derive (paid = full, free = earn_only).
  return deriveGamificationAccess(tier)
}

/** The effective gamification access for the SIGNED-IN viewer. FAIL-SAFE: any error (or no viewer)
 *  degrades to 'earn_only' for an anonymous caller, or to the pure derive for a known profile, never
 *  to a lockout. The live consumer REMAINING-WORK #2 was missing — pure resolver shipped + tested,
 *  unused in app code by design until now. */
export async function resolveViewerGamificationAccess(): Promise<GamificationAccess> {
  try {
    const user = await getCachedUser()
    if (!user) return 'earn_only'
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('membership_tier, gamification_access_override')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    // DIRECTION — FAIL OPEN (SCAN-539), which is what this module's header has always promised ("any
    // error degrades to today's behavior, never to a lockout"). A PostgREST error arrives in `error`,
    // not as a throw, so the try/catch below never
    // engaged and the unchecked null fell into the `!data` arm: a signed-in, paid, full-access member was
    // silently DOWNGRADED to 'earn_only' — the entitlement they bought disappearing with no error shown.
    // On an unreadable profile we cannot derive a tier, so the two candidate answers are "assume free"
    // (revokes a paid entitlement for the duration of the outage) and "assume full" (lets a free member
    // see the full loop for one request). The second is the smaller wrong answer, and it is the one the
    // module documents. `data === null` with no error is a genuinely absent profile and still reads
    // 'earn_only'; only the UNKNOWN case grants.
    if (error) {
      console.error('[gamification-access] profile unreadable, granting full (fail-open):', error.message)
      return 'full'
    }
    if (!data) return 'earn_only'
    const flags = await loadPricingFlags()
    return resolveGamificationAccessWithFlags(
      {
        membership_tier: data.membership_tier as EntitlementTier | null,
        gamification_access_override: data.gamification_access_override,
      },
      flags,
    )
  } catch {
    return 'earn_only'
  }
}

// 🔴 `gamificationFullAllowed` USED TO SIT HERE and is deliberately gone (ADR-1295, owner ruling
// 2026-09-09, OWN-071). It wrapped featureAllowed('gamification_full', …) and was the one place a
// surface asked "may this viewer compete / claim / spend?". The Quest is a side thing we all do
// together, so the answer is yes for every signed-in member and the question no longer exists. Its
// three consumers went with it: the leaderboard's compete gate, the Quest page's season-reset
// upgrade nudge, and the `gamificationFull` field on CrewContext. Do not re-add it.
//
// (2026-09-05, scan2 L9-13: the resolveViewerGamification convenience — access + full in one call —
// was removed first, which is what left the two readers separate.)

// Re-export the pure resolver so a caller that already has a profile in hand can resolve without IO.
export { resolveGamificationAccess }
