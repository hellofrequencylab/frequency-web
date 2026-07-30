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
// CRITICAL — OFF preserves current behavior (the ABSOLUTE INVARIANT, ADR-370): while the FEATURE GATES
// are not live, featureAllowed short-circuits to TRUE, so this returns EXACTLY what the pure
// spaceFunctionAccess returns today (the spaceHasEntitlement read + the role check). Only once the gates
// go live does the plan-ladder gate add a second, consistent check.
//
// THE GATE SWITCH IS featureGatesLive(), NOT billingLive() (ADR-874). Selling and gating are separate
// decisions on separate dates: billing turns on so Spaces can BUY, and the ladder starts biting only when
// the beta grace window ends. Reading billingLive() here would revoke every free Space's paid features
// the instant checkout opened. FAIL-SAFE: any error degrades to the pure resolver, never to a lockout.

import type { SpaceRole } from './membership'
import {
  type SpaceLike,
  spaceAiDepth,
  spaceCanRunPlaybooks,
  spaceCanSeeResonance,
  spaceCanUseResonanceAi,
  AI_DEPTH_KEYS,
  type AiDepthTier,
} from './entitlements'
import { spaceFunctionAccess, spaceFunctionDef, type SpaceFunctionKey } from './functions'
import { featureAllowed } from '@/lib/pricing/gates'
import { asSpacePlan } from '@/lib/pricing/plans'
import { featureGatesLive } from '@/lib/pricing/settings'

/** The plan-gated Space function entitlement key → the pricing feature-gate key. Only functions that
 *  carry an entitlement (CRM, email, shop's 'storefront') map here; a universal function
 *  (entitlement === null) is never plan-gated and resolves entirely on the pure path. Kept in lock-step
 *  with FEATURE_GATES (lib/pricing/gates.ts) §5 space features. */
const FUNCTION_FEATURE_KEY: Record<string, string> = {
  // 🔴 `crm` and `email` are deliberately absent (ADR-917, Phase 3b). They are METERED, not gated:
  // a free Space really does get a CRM and really can email its own people, up to the allowance the
  // pricing page publishes. The counted limits live at the WRITE seams, where a quantity can actually
  // be measured (lib/crm/contact-allowance.ts, and the monthly send allowance in lib/spaces/email.ts).
  // Mapping them here would re-create the contradiction Phase 3b removed: a plan-ladder check that
  // takes the whole feature away instead of capping how much of it you use.
  storefront: 'space_storefront',
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
    const gatesLive = await featureGatesLive()
    // While the gates are not live this short-circuits to true; the spaceHasEntitlement read above
    // already governed the result, so not-live is byte-for-byte today's behavior.
    return await featureAllowed(featureKey, { plan: asSpacePlan(plan ?? space?.plan ?? null) }, { gatesLive })
  } catch {
    // FAIL-SAFE: degrade to the pure result (which already passed) rather than lock out.
    return true
  }
}

// ── Collaborator hosting (ADR-799 §B / ADR-810 / ADR-835) ────────────────────────────────────────
// The LIVE plan gate for HOSTING collaborator spaces + hosting events WITH Collaborator Spaces. The
// HOST side needs the plan (feature `space_collaborators`, Collective floor; Non Profit clears it):
// the venue in a space↔space collaboration, or the EVENT'S HOME SPACE for an event Collaborator.
// BEING a collaborator (the guest side, incl. an event Collaborator) is free for any active Business /
// Non Profit Space. This is the SERVER-SIDE authority the collaboration + event-share actions call
// before writing (invite, feature-request, and every accept), so the free→paid wall cannot be bypassed
// by driving the actions directly. While the gates are not live (billing off, or the beta grace window
// still open), featureAllowed short-circuits to TRUE, so hosting stays free + universal (today's
// behavior). FAIL-SAFE: an error degrades to GRANTED, matching every other reader (never a lockout).

/** May this space HOST collaborators (venue grain) / host events with Collaborators (event grain)
 *  under its current plan, LIVE? Collective/Non Profit pass; a free or Business space is gated once
 *  the gates are live (and sees the locked preview meanwhile). Pass the plan explicitly, or it reads
 *  space.plan. FAIL-SAFE to granted. */
export async function spaceCanHostCollaborators(
  space: ({ plan?: string | null } & SpaceLike) | null | undefined,
  plan?: string | null,
): Promise<boolean> {
  try {
    const gatesLive = await featureGatesLive()
    return await featureAllowed('space_collaborators', { plan: asSpacePlan(plan ?? space?.plan ?? null) }, { gatesLive })
  } catch {
    // FAIL-SAFE: degrade to granted (grace-preserving), never a lockout on a read error.
    return true
  }
}

// ── AI-depth access (Resonance Engine Phase 6 · ADR-387) ─────────────────────────────────────────
// The LIVE gate for the three AI-depth capabilities, the per-Space analog of spaceFunctionAccessLive
// for the Resonance Engine's paid depth. Each AI-depth key maps to a pricing feature-gate so the same
// featureAllowed plan-ladder governs it once the gates are live; while they are not, featureAllowed
// short-circuits to true and the result is EXACTLY the pure spaces.entitlements read (today's
// behavior + whatever a plan has flipped on). FAIL-CLOSED is the contract here, NOT fail-open: an
// AI-depth capability is a paid LEVER, so any error degrades to the free WEDGE (no depth), never an
// over-grant. The free wedge is never gated, so a degrade never locks a member out of the loop.

/** The AI-depth entitlement key → the pricing feature-gate key. Kept in lock-step with FEATURE_GATES
 *  (lib/pricing/gates.ts) §5 space features. */
const AI_DEPTH_FEATURE_KEY: Record<string, string> = {
  [AI_DEPTH_KEYS.playbooks]: 'space_crm_playbooks',
  [AI_DEPTH_KEYS.resonance]: 'space_crm_resonance',
  [AI_DEPTH_KEYS.resonanceAi]: 'space_crm_resonance_ai',
}

/** Resolve ONE AI-depth capability live: the pure entitlement read (DEFAULT-DENY) AND the
 *  featureAllowed plan-ladder check, BOTH required. FAIL-CLOSED: an error degrades to the pure read
 *  result (the entitlement the blob already grants), which is itself default-deny, so a misread never
 *  over-grants a paid lever. */
async function aiDepthCapabilityLive(
  space: ({ plan?: string | null } & SpaceLike) | null | undefined,
  pureHas: boolean,
  featureKey: string,
  plan?: string | null,
): Promise<boolean> {
  // The pure entitlement gate first (default-deny). If the blob does not grant it, it is OFF.
  if (!pureHas) return false
  try {
    const gatesLive = await featureGatesLive()
    return await featureAllowed(featureKey, { plan: asSpacePlan(plan ?? space?.plan ?? null) }, { gatesLive })
  } catch {
    // FAIL-CLOSED for a paid lever: degrade to the pure read (which already passed). The pure read is
    // itself default-deny, so this can only ever GRANT what the entitlements blob already grants.
    return pureHas
  }
}

/** May a Space run GOVERNED AUTO-EXECUTION of safe playbooks, LIVE (entitlement + plan ladder)? The
 *  depth half only; the autonomy slider (autoExecutionAllowed, Phase 3) still gates how much runs. */
export async function spaceCanRunPlaybooksLive(
  space: ({ plan?: string | null } & SpaceLike) | null | undefined,
  plan?: string | null,
): Promise<boolean> {
  return aiDepthCapabilityLive(space, spaceCanRunPlaybooks(space), AI_DEPTH_FEATURE_KEY[AI_DEPTH_KEYS.playbooks]!, plan)
}

/** May a Space see the read-only RESONANCE surface, LIVE (entitlement + plan ladder)? The top rung
 *  (resonance_ai) implies it, so a Space with only `crm.resonance_ai` still resolves true. */
export async function spaceCanSeeResonanceLive(
  space: ({ plan?: string | null } & SpaceLike) | null | undefined,
  plan?: string | null,
): Promise<boolean> {
  // The mid rung is implied by the top rung; the pure reader already folds that in.
  const featureKey = spaceCanUseResonanceAi(space)
    ? AI_DEPTH_FEATURE_KEY[AI_DEPTH_KEYS.resonanceAi]!
    : AI_DEPTH_FEATURE_KEY[AI_DEPTH_KEYS.resonance]!
  return aiDepthCapabilityLive(space, spaceCanSeeResonance(space), featureKey, plan)
}

/** May a Space use the FULL Resonance Graph + managed matching (the top rung), LIVE? */
export async function spaceCanUseResonanceAiLive(
  space: ({ plan?: string | null } & SpaceLike) | null | undefined,
  plan?: string | null,
): Promise<boolean> {
  return aiDepthCapabilityLive(space, spaceCanUseResonanceAi(space), AI_DEPTH_FEATURE_KEY[AI_DEPTH_KEYS.resonanceAi]!, plan)
}

/** The Space's resolved AI-depth tier (the pure reader, re-exported here so the cockpit can read the
 *  whole ladder in one call). FAIL-CLOSED to the free `wedge`. The LIVE per-capability gates above
 *  layer the plan ladder on top once the gates are live. */
export function aiDepthFor(space: SpaceLike | null | undefined): AiDepthTier {
  return spaceAiDepth(space)
}
