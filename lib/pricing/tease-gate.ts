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
// THE INVARIANT: while the gates are not live, `live` is false, so <UpsellTease> renders no tease —
// and a FAIL-SAFE catch makes any error resolve to not-shown, never to a stray prompt.
//
// ── THE OTHER HALF (ADR-875): the same detection, a different sentence ────────────────────────────
// Sleeping the tease left real knowledge on the floor. At the moment a member reaches for a capability
// that belongs to a tier above their plan, we know two true things: which tier that is, and that the
// beta grace window is why they have it. So during grace these resolvers return `notice` instead of
// `locked`: a warm, non-blocking line that names the tier, says when memberships start, and invites
// them to subscribe early for the beta rate and a Founding badge. Nothing is prevented, and no copy
// here claims otherwise. Once the grace window closes, `notice` is null and the tease speaks again.
//
// The two are MUTUALLY EXCLUSIVE by construction: `live` and `notice` can never both be set, because
// `live` means the gates bite and `notice` means the grace window is still open.

import { featureGatesLive } from './settings'
import { featureAllowed, loadFeatureGateOverrides, meetsGate, mergeGate, type FeatureKey } from './gates'
import { getCallerProfile } from '@/lib/auth'
import { deriveTier, ENTITLEMENT_TIERS, type EntitlementTier } from '@/lib/core/entitlement'
import { spaceHasEntitlement, type SpaceLike } from '@/lib/spaces/entitlements'
import { readBetaState } from './beta-state'
import {
  betaNoticeCopy,
  shouldShowBetaNotice,
  targetForEntitlementKey,
  targetForGate,
  targetForTier,
  type BetaNotice,
  type BetaNoticeTarget,
} from './beta-notice'
import type { TeaseGate } from './upsell-tease'

export type { TeaseGate }

/** Not shown — nothing to tease and nothing to say. The fail-safe default everywhere. */
const HIDDEN: TeaseGate = { live: false, locked: false, notice: null }

/** The caller's resolved identity + entitlement tier (the TRUE DB tier, never beta-overridden). */
async function caller(): Promise<{ id: string | null; tier: EntitlementTier }> {
  const profile = await getCallerProfile()
  return {
    id: profile?.id ?? null,
    tier: deriveTier(profile?.realMembershipTier ?? profile?.membershipTier ?? null),
  }
}

/** Tier rank on the ladder (free < crew). Unknown ranks lowest. */
function tierRank(tier: EntitlementTier): number {
  const i = ENTITLEMENT_TIERS.indexOf(tier)
  return i < 0 ? 0 : i
}

/**
 * Build the grace notice for a capability, or null. Shared by all three resolvers so the rule lives
 * in ONE place: read the beta state for this subject, apply the pure visibility predicate, and format
 * the copy from the operator's own grace date. Reached only when the gates are NOT live.
 *
 * `alreadyEntitled` is the caller's own answer to "is this account already on that tier or above",
 * computed with the SAME check the lock tease uses, so the notice and the tease can never disagree
 * about who is below the line. FAIL-SAFE to null.
 */
async function graceNotice(
  target: BetaNoticeTarget | null,
  ctx: { alreadyEntitled: boolean; profileId?: string | null; spaceId?: string | null },
): Promise<BetaNotice | null> {
  try {
    if (!target) return null
    const state = await readBetaState({ profileId: ctx.profileId, spaceId: ctx.spaceId })
    const show = shouldShowBetaNotice({
      graceActive: state.graceActive,
      selling: state.selling,
      alreadyEntitled: ctx.alreadyEntitled,
      isFounding: state.isFounding,
      hasBillingAgreement: state.hasBillingAgreement,
    })
    if (!show) return null
    return betaNoticeCopy(target, state.graceEndsAtMs)
  } catch {
    return null
  }
}

/**
 * Resolve a PERSONAL-tier tease gate (Crew capabilities with a named feature-gate row: Vault cash-in,
 * Vera depth). `locked` = the feature is NOT allowed for the caller's membership tier with the gates
 * live. While the gates are not live, the beta grace notice takes its place (ADR-875), named from the
 * feature's REAL merged gate rather than any hand-written feature -> tier map. FAIL-SAFE to HIDDEN.
 */
export async function resolvePersonalTeaseGate(feature: FeatureKey): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    const { id, tier } = await caller()
    if (live) {
      const allowed = await featureAllowed(feature, { tier }, { gatesLive: live })
      return { live, locked: !allowed, notice: null }
    }
    // The gates are soft: name the tier this feature really sits on and invite, never block.
    const gate = mergeGate(String(feature), await loadFeatureGateOverrides())
    const notice = await graceNotice(targetForGate(gate), {
      alreadyEntitled: gate ? meetsGate(gate, { tier }) : true,
      profileId: id,
    })
    return { live: false, locked: false, notice }
  } catch {
    return HIDDEN
  }
}

/**
 * Resolve a tease gate on a TIER FLOOR directly (the Crew authoring capabilities — Programs / Journey
 * authoring, the personal CRM, QR Studio — that gate on the membership tier without a named feature-gate
 * row). `locked` = the caller is below `minTier` with the gates live; during the beta grace window the
 * notice takes its place instead. FAIL-SAFE to HIDDEN.
 */
export async function resolveTierTeaseGate(minTier: EntitlementTier): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    const { id, tier } = await caller()
    const below = tierRank(tier) < tierRank(minTier)
    if (live) return { live, locked: below, notice: null }
    const notice = await graceNotice(targetForTier(minTier), {
      alreadyEntitled: !below,
      profileId: id,
    })
    return { live: false, locked: false, notice }
  } catch {
    return HIDDEN
  }
}

/**
 * Resolve a SPACE-entitlement tease gate (a Space CRM, a Space's QR codes, and other Space capabilities).
 * A Space tease is locked when the Space LACKS the entitlement key (spaceHasEntitlement is the
 * DEFAULT-DENY union of the plan's billing namespace + manual grants). Pass the entitlement key the
 * upgrade unlocks (e.g. 'crm'). During the beta grace window the notice takes its place, naming the
 * LOWEST plan whose depth set grants that key. A Space that already carries founding status, or pays
 * us through an active off-Stripe agreement (ADR-872), is never invited. FAIL-SAFE to HIDDEN.
 */
export async function resolveSpaceTeaseGate(
  space: SpaceLike | null | undefined,
  entitlementKey: string,
): Promise<TeaseGate> {
  try {
    const live = await featureGatesLive()
    const has = spaceHasEntitlement(space, entitlementKey)
    if (live) return { live, locked: !has, notice: null }
    const notice = await graceNotice(targetForEntitlementKey(entitlementKey), {
      alreadyEntitled: has,
      spaceId: space?.id ?? null,
    })
    return { live: false, locked: false, notice }
  } catch {
    return HIDDEN
  }
}
