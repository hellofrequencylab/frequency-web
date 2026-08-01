// Space-creation limits (ADR-810) — the PURE rule for how many Spaces a member may create, kept
// framework-free (no Supabase/Next) so it is trivially unit-testable, like lib/pricing/plans.ts. The IO
// caller (lib/spaces/provision.ts createSpace) loads the caller's tier + owned-space facts and gates on
// billingLive() so the cap is INERT while billing is OFF (anyone can still create, today's behavior) and
// only bites at go-live.
//
// The rule (owner decision, ADR-810; FIRST SPACE OPENED to everyone, ADR-876):
//   • Any member             → exactly 1 space. A free Space is open to anyone, so the first one is
//                              never gated on a personal tier. This is what /pricing promises.
//   • Owns a paid space      → unlimited (a Business / Non Profit plan is the "run multiple" unlock).
// Owning even one paid Business/Non Profit space is what lifts the cap, so the second space (and beyond)
// is the Business upgrade, exactly as the funnel intends.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { asSpacePlan } from './plans'

/** The facts the pure rule needs: the caller's personal tier, how many active spaces they already own,
 *  and whether any of those is on a paid plan. */
export interface SpaceCreationContext {
  tier: EntitlementTier | null | undefined
  ownedSpaceCount: number
  ownsPaidSpace: boolean
}

/** Is a space plan a PAID plan? `free` is the ONLY unpaid plan (ADR-552), so this asks the question in
 *  the one shape that cannot go stale: everything above the floor is paid.
 *
 *  🔴 It used to enumerate — `p === 'business' || p === 'nonprofit'` — and the enumeration had gone
 *  wrong: `collective` and `independent` were added to SPACE_PLANS afterwards and never added here, so
 *  every paying Space read as unpaid. That was not hypothetical. All four paid Spaces in production are
 *  `collective`, meaning every paying customer silently failed the multi-Space unlock this module
 *  exists to grant. It was masked only because the caller wraps the block in featureGatesLive(), which
 *  is false during the beta grace window and un-masks by itself when the window closes.
 *
 *  An allow-list of paid plans has to be edited every time a plan is added, and forgetting is invisible
 *  until someone pays. Asking "is it the free floor" needs no edit and fails in the safe direction:
 *  `asSpacePlan` narrows an unknown label to 'free' (default-deny), so a typo reads as unpaid rather
 *  than granting the unlock. PURE. */
export function isPaidSpacePlan(plan: string | null | undefined): boolean {
  return asSpacePlan(plan) !== 'free'
}

/** May the caller create ANOTHER space, given the facts? PURE + total (see the rule above). */
export function canCreateSpace(ctx: SpaceCreationContext): boolean {
  // Owning a paid space lifts the cap entirely — the Business plan is the multi-space unlock.
  if (ctx.ownsPaidSpace) return true
  // The FIRST space is open to every member, whatever their personal tier (ADR-876): a free Space
  // costs nothing and /pricing says so, so the tier check that used to sit here is gone.
  return ctx.ownedSpaceCount < 1
}

/** The plain-voice reason a create is blocked (CONTENT-VOICE §10: no em dash, no guilt), or null when
 *  allowed. Distinguishes "go Crew for your first space" from "go Business to run more than one". PURE. */
export function spaceCreationBlockReason(ctx: SpaceCreationContext): string | null {
  if (canCreateSpace(ctx)) return null
  // The only remaining block is the SECOND space: the first is free to everyone (ADR-876).
  return 'Your plan includes one space. Upgrade a space to Business to run more than one.'
}
