// LIVE per-Space function access — the IO wrapper that routes the PLAN-GATED Space functions
// (CRM, email, …) through featureAllowed for a consistent resolution with the personal gates
// (ADR-370, REMAINING-WORK #4). The PURE resolver lib/spaces/functions.ts spaceFunctionAccess
// stays the source of truth for ROLE + the universal on/off; this wrapper adds the SAME
// featureAllowed plan-ladder check the rest of pricing uses, on top of the existing
// spaceHasEntitlement read.
//
// WHY a wrapper, not an edit to functions.ts: that module is PURE + framework-independent (no
// Supabase/Next), so it cannot do the async featureAllowed IO. This thin server-only seam composes
// the pure resolver with the (async) gate.
//
// CRITICAL — OFF preserves current behavior (the ABSOLUTE INVARIANT, ADR-370): while billing_live is
// OFF, featureAllowed short-circuits to TRUE, so this returns EXACTLY what the pure spaceFunctionAccess
// returns today (the spaceHasEntitlement read + the role check). Only once billing is live does the
// plan-ladder gate add a second, consistent check. The DB feature-gate overrides + ladder math only
// ever matter once an operator turns billing on. FAIL-SAFE: any error degrades to the pure resolver
// (today's behavior), never to a lockout.

import type { SpaceRole } from './membership'
import type { SpaceLike } from './entitlements'
import { spaceFunctionAccess, spaceFunctionDef, type SpaceFunctionKey } from './functions'
import { featureAllowed } from '@/lib/pricing/gates'
import { asSpacePlan } from '@/lib/pricing/plans'
import { billingLive } from '@/lib/pricing/settings'

/** The plan-gated Space function entitlement key → the pricing feature-gate key. Only functions that
 *  carry an entitlement (CRM, email) map here; a universal function (entitlement === null) is never
 *  plan-gated and resolves entirely on the pure path. Kept in lock-step with FEATURE_GATES
 *  (lib/pricing/gates.ts) §5 space features. */
const FUNCTION_FEATURE_KEY: Record<string, string> = {
  crm: 'space_crm',
  email: 'space_email',
  automation: 'space_automation',
  team: 'space_team',
  multi_pipeline: 'space_multi_pipeline',
  whitelabel: 'space_whitelabel',
}

/** The pricing feature-gate key for a Space function, or null when the function is universal (no
 *  plan gate) or unmapped (resolves on the pure path only). */
export function featureKeyForFunction(fn: SpaceFunctionKey | string): string | null {
  const def = spaceFunctionDef(fn)
  if (!def?.entitlement) return null
  return FUNCTION_FEATURE_KEY[def.entitlement] ?? null
}

/**
 * THE live per-Space function gate. Composes the PURE spaceFunctionAccess (role + universal on/off +
 * the existing spaceHasEntitlement read) with the featureAllowed plan-ladder check for plan-gated
 * functions. Both must pass.
 *
 * While billing is OFF, featureAllowed grants everything, so this returns exactly the pure result
 * (today's behavior). FAIL-SAFE: any error in the gate read degrades to the pure result.
 *
 * @param space     the Space (entitlements + feature_roles + plan)
 * @param fn        the function key
 * @param viewerSpaceRole the viewer's resolved space role (getSpaceCapabilities -> caps.role)
 * @param plan      the Space's billing plan label (spaces.plan); resolved via asSpacePlan
 */
export async function spaceFunctionAccessLive(
  space: ({ featureRoles?: unknown; plan?: string | null } & SpaceLike) | null | undefined,
  fn: SpaceFunctionKey | string,
  viewerSpaceRole: SpaceRole | null | undefined,
  plan?: string | null,
): Promise<boolean> {
  // 1. The unchanged pure gate (role + universal on/off + spaceHasEntitlement). Fail-closed already.
  if (!spaceFunctionAccess(space, fn, viewerSpaceRole)) return false

  // 2. The plan-ladder gate for plan-gated functions only. Universal functions skip this entirely.
  const featureKey = featureKeyForFunction(fn)
  if (!featureKey) return true

  try {
    const live = await billingLive()
    // While OFF this short-circuits to true; the spaceHasEntitlement read above already governed the
    // result, so OFF is byte-for-byte today's behavior.
    return await featureAllowed(featureKey, { plan: asSpacePlan(plan ?? space?.plan ?? null) }, { billingLive: live })
  } catch {
    // FAIL-SAFE: degrade to the pure result (which already passed) rather than lock out.
    return true
  }
}
