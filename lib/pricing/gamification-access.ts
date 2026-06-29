// GAMIFICATION ACCESS — the LIVE (server-side, IO) consumers of the third flag (ADR-362,
// ADR-370). The PURE resolver lives in lib/pricing/gamification.ts (override ?? derive(tier));
// this module is the seam that READS a profile + the operator flags and answers two questions
// every gamification surface can ask:
//
//   1. resolveViewerGamificationAccess() — the effective access ('earn_only' | 'full') for the
//      signed-in viewer, folding: the per-profile override (pinned), then the operator per-role
//      gamification_full_* flags, then the derive-from-tier default. This is the live consumer
//      the deferred build (REMAINING-WORK #2) was missing.
//   2. gamificationFullAllowed(tier) — the STANDALONE gate for the full gamification entitlement
//      (REMAINING-WORK #5), routed through featureAllowed('gamification_full', …) so it is INERT
//      while billing is OFF (short-circuits to grant) and only bites once an operator turns
//      billing on. It mirrors how vault_cash_in routes through featureAllowed (P3).
//
// CRITICAL — OFF preserves current behavior (the ABSOLUTE INVARIANT, ADR-370):
//   * While billing_live is OFF, gamificationFullAllowed short-circuits to TRUE (featureAllowed
//     grants everything), so nothing a surface gates on this changes.
//   * resolveViewerGamificationAccess folds in the per-role flags whose DEFAULTS already mirror
//     today's derive-from-tier line (crew/supporter = full, member = earn_only), so with the
//     seeded flags it returns EXACTLY what deriveGamificationAccess(tier) returns today.
// Every read is FAIL-SAFE: any DB/flag error degrades to the pure derive (today's behavior),
// never to a lockout.

import { createAdminClient } from '@/lib/supabase/admin'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { getCachedUser } from '@/lib/auth'
import { featureAllowed } from './gates'
import {
  type GamificationAccess,
  asGamificationAccess,
  deriveGamificationAccess,
  resolveGamificationAccess,
} from './gamification'
import { billingLive, loadPricingFlags } from './settings'

/** The per-role gamification_full_* flag key for a tier (the operator's per-tier override). */
const GAMIFICATION_FLAG: Record<EntitlementTier, 'gamification_full_member' | 'gamification_full_crew' | 'gamification_full_supporter'> = {
  free: 'gamification_full_member',
  crew: 'gamification_full_crew',
  supporter: 'gamification_full_supporter',
}

/** Resolve the effective gamification access for a profile shape, folding the operator per-role
 *  flags OVER the pure resolver. PURE-ish helper (flags passed in): the per-profile override wins
 *  first (pinned), then a per-role flag that grants FULL elevates the derived default, else the
 *  derive-from-tier line. The defaults (crew/supporter on, member off) reproduce today exactly. */
export function resolveGamificationAccessWithFlags(
  profile: { membership_tier?: EntitlementTier | string | null; gamification_access_override?: unknown } | null | undefined,
  flags: { gamification_full_member: boolean; gamification_full_crew: boolean; gamification_full_supporter: boolean },
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
    // membership_tier is typed; gamification_access_override is not in the generated types yet
    // (ADR-246) — selected via the untyped cast and read loosely by the pure resolver.
    const { data } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
        }
      }
    })
      .from('profiles')
      .select('membership_tier, gamification_access_override')
      .eq('auth_user_id', user.id)
      .maybeSingle()
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

/** The STANDALONE gate for the full gamification entitlement (REMAINING-WORK #5). Routed through
 *  featureAllowed('gamification_full', …) so it is INERT while billing is OFF (grants everything)
 *  and only applies the crew minimum once billing goes live. The single point a surface asks "may
 *  this viewer use the full gamification loop (compete / claim / spend)?" by tier. FAIL-SAFE: any
 *  error degrades to TRUE (today's behavior — never lock anyone out). */
export async function gamificationFullAllowed(tier: EntitlementTier | null | undefined): Promise<boolean> {
  try {
    const live = await billingLive()
    // While OFF this short-circuits to true inside featureAllowed; we pass it explicitly so the
    // resolver stays free of its own flag IO (the same contract vault_cash_in uses).
    return await featureAllowed('gamification_full', { tier: tier ?? 'free' }, { billingLive: live })
  } catch {
    return true
  }
}

/** Convenience: the viewer's full-gamification gate AND their resolved access, in one pass. A
 *  surface that needs both (e.g. the leaderboard compete affordance) calls this once. FAIL-SAFE. */
export async function resolveViewerGamification(
  tier: EntitlementTier | null | undefined,
): Promise<{ access: GamificationAccess; full: boolean }> {
  const [access, full] = await Promise.all([
    resolveViewerGamificationAccess(),
    gamificationFullAllowed(tier),
  ])
  return { access, full }
}

// Re-export the pure resolver so a caller that already has a profile in hand can resolve without IO.
export { resolveGamificationAccess }
