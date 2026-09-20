// MAY THIS MEMBER ENROL IN A TIER-GATED JOURNEY? (LIVE-411, ADR-1472)
//
// Events already gate tickets on space_membership_tiers (ADR-823,
// spaceMembershipGateError). Journeys only had private | unlisted | public.
// This is the fourth audience: members of one named tier.
//
// PURE comparison lives here so both doors (free enrol and paid checkout)
// cannot disagree. IO is a thin admin-client read (same posture as
// free-enrol-gate: the gate must still read the plan and the membership
// when the viewer is a guest or the wrong tier). Fail-closed on a missing
// plan or a broken membership read: a gated Journey must never open because
// a lookup failed.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { listMembershipTiers } from '@/lib/spaces/memberships'

/** Copy when the viewer holds no membership in the owning Space. */
export function journeyNeedsMembershipMessage(spaceName: string, tierName: string): string {
  return `This Journey is for ${spaceName} members. Join ${tierName} first.`
}

/** Copy when the viewer holds a different tier. */
export function journeyWrongTierMessage(spaceName: string, tierName: string): string {
  return `This Journey is for the ${tierName} membership at ${spaceName}.`
}

export const JOURNEY_TIER_UNAVAILABLE_MESSAGE = 'This Journey is not available.'

export type JourneyTierCheck = { ok: true } | { ok: false; error: string; href: string | null }

/**
 * Does this membership clear a Journey's optional tier gate? PURE.
 * `spaceTierId` null means no gate. A waitlist row is not a membership.
 */
export function journeyTierGateError(
  spaceTierId: string | null,
  membership: { tierId: string; status: string } | null,
  labels: { spaceName: string; tierName: string },
): string | null {
  if (!spaceTierId) return null
  if (!membership || membership.status !== 'active') {
    return journeyNeedsMembershipMessage(labels.spaceName, labels.tierName)
  }
  if (membership.tierId !== spaceTierId) {
    return journeyWrongTierMessage(labels.spaceName, labels.tierName)
  }
  return null
}

/**
 * May `profileId` enrol in `planId` under the optional tier gate?
 *
 * `isOwner` is the author-or-manager escape, matching checkFreeEnrol: they
 * walk their own program without buying the membership. Everyone else meets
 * the tier. Already-enrolled members are not this function's job.
 */
export async function checkJourneyTier(
  planId: string,
  profileId: string | null,
  opts: { isOwner?: boolean } = {},
): Promise<JourneyTierCheck> {
  if (opts.isOwner) return { ok: true }

  const admin = createAdminClient()
  let plan: { space_id: string | null; space_tier_id: string | null } | null = null
  try {
    const { data } = await admin
      .from('journey_plans')
      .select('space_id, space_tier_id')
      .eq('id', planId)
      .maybeSingle()
    plan = (data as { space_id: string | null; space_tier_id: string | null } | null) ?? null
  } catch {
    return { ok: false, error: JOURNEY_TIER_UNAVAILABLE_MESSAGE, href: null }
  }
  if (!plan) return { ok: false, error: JOURNEY_TIER_UNAVAILABLE_MESSAGE, href: null }

  const spaceTierId = plan.space_tier_id ?? null
  if (!spaceTierId) return { ok: true }

  const spaceId = plan.space_id
  if (!spaceId) return { ok: false, error: JOURNEY_TIER_UNAVAILABLE_MESSAGE, href: null }

  const space = await getSpaceById(spaceId)
  const spaceName = space?.name?.trim() || 'this Space'
  const href = space?.slug ? `/spaces/${space.slug}` : null

  const tiers = await listMembershipTiers(spaceId)
  const tierName = tiers.find((t) => t.id === spaceTierId)?.name?.trim() || 'that membership'

  if (!profileId) {
    return {
      ok: false,
      error: journeyNeedsMembershipMessage(spaceName, tierName),
      href,
    }
  }

  let membership: { tierId: string; status: string } | null = null
  try {
    const { data } = await admin
      .from('space_memberships')
      .select('tier_id, status')
      .eq('space_id', spaceId)
      .eq('member_profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle()
    const row = data as { tier_id: string; status: string } | null
    membership = row ? { tierId: row.tier_id, status: row.status } : null
  } catch {
    return { ok: false, error: JOURNEY_TIER_UNAVAILABLE_MESSAGE, href }
  }

  const error = journeyTierGateError(spaceTierId, membership, { spaceName, tierName })
  return error ? { ok: false, error, href } : { ok: true }
}
