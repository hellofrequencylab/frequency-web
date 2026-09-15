'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for member benefits (ADR-1372, backlog LIVE-092).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure contract
// (lib/spaces/benefits.ts: types + normalizeBenefit + the resolver) or the pure helpers in the IO
// layer (lib/spaces/benefits-store.ts: periodKeyFor, planBenefitSetOps). This thin file is the seam
// the CLIENT surfaces import, so their mutations cross the network boundary as proper Server
// Actions. It is the exact relationship lib/spaces/memberships-actions.ts has to
// lib/spaces/memberships.ts.
//
// SERVER components (the checkout pricing path, the owner's benefits surface, the pages) import
// `listSpaceBenefits` / `listBenefitsForTier` / `usesForMember` straight from
// lib/spaces/benefits-store.ts: they never cross a client boundary, so they need no wrapper.
//
// The authorization and validation all live in the implementations — canEditProfile plus the
// per-space `memberships` function gate, re-checked server-side on every write. These wrappers add
// nothing but the boundary, deliberately: a gate that lives in the wrapper is a gate a direct
// server-side caller walks straight past.

import {
  setSpaceBenefits as setSpaceBenefitsImpl,
  listSpaceBenefitsForOwner as listSpaceBenefitsForOwnerImpl,
  listBenefitsForTier as listBenefitsForTierImpl,
} from '@/lib/spaces/benefits-store'
import type { MemberBenefit } from '@/lib/spaces/benefits'
import type { ActionResult } from '@/lib/action-result'

/** Replace a Space's member benefits. Gated on canEditProfile + the memberships function gate; every
 *  benefit is re-normalized and every tier assignment re-checked against this Space's own tiers (see
 *  the implementation). Benefit ids survive the edit, so assignments and the redemption ledger keep
 *  pointing at the same rows. */
export async function setSpaceBenefits(
  spaceId: string,
  benefits: MemberBenefit[],
): Promise<ActionResult> {
  return setSpaceBenefitsImpl(spaceId, benefits)
}

/** A Space's benefits as the OWNER's editor reads them back after a save. Gated on canEditProfile
 *  (or a platform janitor previewing as staff); fail-safe to []. */
export async function listSpaceBenefitsForOwner(spaceId: string): Promise<MemberBenefit[]> {
  return listSpaceBenefitsForOwnerImpl(spaceId)
}

/** The ACTIVE benefits assigned to one membership tier, for a client surface that previews what a
 *  tier is worth. Public-readable the way the active tier list is; fail-safe to []. */
export async function listBenefitsForTier(
  spaceId: string,
  tierId: string,
): Promise<MemberBenefit[]> {
  return listBenefitsForTierImpl(spaceId, tierId)
}
