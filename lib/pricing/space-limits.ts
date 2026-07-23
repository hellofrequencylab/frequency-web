// Space-creation limits (ADR-810) — the PURE rule for how many Spaces a member may create, kept
// framework-free (no Supabase/Next) so it is trivially unit-testable, like lib/pricing/plans.ts. The IO
// caller (lib/spaces/provision.ts createSpace) loads the caller's tier + owned-space facts and gates on
// billingLive() so the cap is INERT while billing is OFF (anyone can still create, today's behavior) and
// only bites at go-live.
//
// The rule (owner decision, ADR-810):
//   • Free member            → 0 spaces (must go Crew to create the first one).
//   • Crew / Supporter       → exactly 1 space (the taste — run your own page).
//   • Owns a paid space      → unlimited (a Business / Non Profit plan is the "run multiple" unlock).
// Owning even one paid Business/Non Profit space is what lifts the cap, so the second space (and beyond)
// is the Business upgrade, exactly as the funnel intends.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'
import { asSpacePlan } from './plans'

/** The facts the pure rule needs: the caller's personal tier, how many active spaces they already own,
 *  and whether any of those is on a paid plan. */
export interface SpaceCreationContext {
  tier: EntitlementTier | null | undefined
  ownedSpaceCount: number
  ownsPaidSpace: boolean
}

/** Is a space plan a PAID plan (Business or Non Profit)? Free is the only unpaid plan (ADR-552). PURE. */
export function isPaidSpacePlan(plan: string | null | undefined): boolean {
  const p = asSpacePlan(plan)
  return p === 'business' || p === 'nonprofit'
}

/** May the caller create ANOTHER space, given the facts? PURE + total (see the rule above). */
export function canCreateSpace(ctx: SpaceCreationContext): boolean {
  // Owning a paid space lifts the cap entirely — the Business plan is the multi-space unlock.
  if (ctx.ownsPaidSpace) return true
  // Otherwise a paid PERSONAL tier (Crew+) unlocks exactly one space.
  if (!isPaid(ctx.tier ?? 'free')) return false
  return ctx.ownedSpaceCount < 1
}

/** The plain-voice reason a create is blocked (CONTENT-VOICE §10: no em dash, no guilt), or null when
 *  allowed. Distinguishes "go Crew for your first space" from "go Business to run more than one". PURE. */
export function spaceCreationBlockReason(ctx: SpaceCreationContext): string | null {
  if (canCreateSpace(ctx)) return null
  if (!isPaid(ctx.tier ?? 'free')) {
    return 'Creating a space is a Crew feature. Join Crew to stand up your first space.'
  }
  return 'Your plan includes one space. Upgrade a space to Business to run more than one.'
}
