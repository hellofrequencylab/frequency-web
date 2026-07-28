import 'server-only'

// IN-CONTEXT UPSELL TEASE — the SERVER-SIDE gate resolver (Pricing ladder Phase E · ADR-466). Each
// wiring site calls one of these to get the `{ live, locked }` the <UpsellTease> island needs, so the
// surface never re-derives entitlement logic. It composes the EXISTING readers only (it owns no new
// gate): featureGatesLive() (lib/pricing/settings.ts) for `live`, and the matching capability gate for
// `locked`. Personal teases rank on the membership tier (featureAllowed on the tier axis, or a tier
// floor); Space teases rank on the Space's entitlement key (spaceHasEntitlement).
//
// WHY featureGatesLive() AND NOT billingLive() (ADR-874): a tease says "this is locked, here is the
// upgrade that unlocks it". During the beta grace window nothing IS locked — billing is live and
// selling, but every account still has the paid features — so a tease would be telling the member
// something untrue (CONTENT-VOICE §10, the skeptic test). Teases wake up on the same date the gates
// do. The honest selling surfaces (the pricing page, the upgrade CTAs, the plan ladder) ride
// billingLive() and are open for business throughout the window.
//
// THE INVARIANT: while the gates are not live, `live` is false, so the component renders nothing — and
// to keep it a true no-op, these resolvers SHORT-CIRCUIT before touching any capability read. A
// FAIL-SAFE catch makes any error resolve to not-shown (no tease), never to a stray prompt.

import { featureGatesLive } from './settings'
import { featureAllowed, type FeatureKey } from './gates'
import { getCallerProfile } from '@/lib/auth'
import { deriveTier, ENTITLEMENT_TIERS, type EntitlementTier } from '@/lib/core/entitlement'
import { spaceHasEntitlement, type SpaceLike } from '@/lib/spaces/entitlements'
import type { TeaseGate } from './upsell-tease'

export type { TeaseGate }

/** Not shown — the gates are not live, or an error. The fail-safe default everywhere. */
const HIDDEN: TeaseGate = { live: false, locked: false }

/** The caller's resolved entitlement tier (the TRUE DB tier, never beta-overridden), free if absent. */
async function callerTier(): Promise<EntitlementTier> {
  const profile = await getCallerProfile()
  return deriveTier(profile?.realMembershipTier ?? profile?.membershipTier ?? null)
}

/** Tier rank on the ladder (free < crew < supporter). Unknown ranks lowest. */
function tierRank(tier: EntitlementTier): number {
  const i = ENTITLEMENT_TIERS.indexOf(tier)
  return i < 0 ? 0 : i
}

/**
 * Resolve a PERSONAL-tier tease gate (Crew capabilities with a named feature-gate row: Vault cash-in,
 * Vera depth). `locked` = the feature is NOT allowed for the caller's membership tier with the gates
 * live. Reuses featureAllowed (which itself grants everything while the gates are not live), so this
 * only ever locks once the beta grace window ends. FAIL-SAFE to HIDDEN.
 */
export async function resolvePersonalTeaseGate(feature: FeatureKey): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    if (!live) return HIDDEN // not live = no-op; never read capabilities
    const tier = await callerTier()
    const allowed = await featureAllowed(feature, { tier }, { gatesLive: live })
    return { live, locked: !allowed }
  } catch {
    return HIDDEN
  }
}

/**
 * Resolve a tease gate on a TIER FLOOR directly (the Crew authoring capabilities — Programs / Journey
 * authoring, the personal CRM, QR Studio — that gate on the membership tier without a named feature-gate
 * row). `locked` = the caller is below `minTier` with the gates live. FAIL-SAFE to HIDDEN.
 */
export async function resolveTierTeaseGate(minTier: EntitlementTier): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    if (!live) return HIDDEN // not live = no-op; never read the tier
    const tier = await callerTier()
    return { live, locked: tierRank(tier) < tierRank(minTier) }
  } catch {
    return HIDDEN
  }
}

/**
 * Resolve a SPACE-entitlement tease gate (a Space CRM, a Space's QR codes, and other Space capabilities).
 * A Space tease is locked when the Space LACKS the entitlement key (spaceHasEntitlement is the
 * DEFAULT-DENY union of the plan's billing namespace + manual grants). Pass the entitlement key the
 * upgrade unlocks (e.g. 'crm'). FAIL-SAFE to HIDDEN.
 */
export async function resolveSpaceTeaseGate(
  space: SpaceLike | null | undefined,
  entitlementKey: string,
): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    if (!live) return HIDDEN // not live = no-op; never read capabilities
    return { live, locked: !spaceHasEntitlement(space, entitlementKey) }
  } catch {
    return HIDDEN
  }
}
