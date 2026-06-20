'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for memberships (ENTITY-SPACES-SYSTEM §2.5, memberships v1).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure tier
// helpers or the shared types. Those live in lib/spaces/memberships.ts (no directive: pure helpers +
// IO + the action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// surfaces import, so the mutations cross the network boundary as proper Server Actions:
//   membership-tier-form.tsx  -> setMembershipTiers
//   membership-join.tsx       -> joinTier
//   membership-cancel-button.tsx -> cancelMembership
//
// SERVER components (membership-join surface, the owner member list, the pages) import the READ
// actions (listMembershipTiers / listAllMembershipTiers / getMyMembership / listSpaceMemberships)
// directly from lib/spaces/memberships.ts: they never cross a client boundary, so they need no
// wrapper. The authorization + validation all live in the implementations; these wrappers just
// re-expose them.

import {
  setMembershipTiers as setMembershipTiersImpl,
  joinTier as joinTierImpl,
  cancelMembership as cancelMembershipImpl,
  type MembershipTier,
} from '@/lib/spaces/memberships'
import { type ActionResult } from '@/lib/action-result'

/** Replace a Space's membership tiers. Gated on canEditProfile (see the implementation). */
export async function setMembershipTiers(
  spaceId: string,
  tiers: MembershipTier[],
): Promise<ActionResult> {
  return setMembershipTiersImpl(spaceId, tiers)
}

/** Join a tier. Any authenticated member; v1 records the membership and takes no charge. */
export async function joinTier(spaceId: string, tierId: string): Promise<ActionResult> {
  return joinTierImpl(spaceId, tierId)
}

/** Cancel a membership. The member who joined or a space admin only (gated in the implementation). */
export async function cancelMembership(membershipId: string): Promise<ActionResult> {
  return cancelMembershipImpl(membershipId)
}
