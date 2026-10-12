// SHARED MEMBERSHIP ACROSS A COLLECTIVE'S MEMBER SPACES (LIVE-767, ADR-1709 phase 8).
//
// A paid membership in the Collective parent counts as an active membership in each of its member
// Spaces. The rule for WHICH Spaces are member Spaces is not re-derived here: it is memberSpacePlan's
// relationship rule (lib/collective/member-spaces.ts), asked with the child's own plan pinned to
// 'free' so the answer is the relationship alone and not the child's plan. The same six conditions
// gate it: parent active on a Collective plan, same owner on both sides, child active, neither side
// root, parent not itself a member Space.
//
// READ-TIME ONLY, like the inherited plan. Nothing is written to space_memberships for the child:
// detaching the member Space, suspending it, or the parent's downgrade ends the shared membership on
// the next read. A viewer with their OWN open row in the member Space keeps that row; the parent's
// is the fallback, never a second membership.
//
// The pure half (`sharedMembershipScope`) is what the probe and the tests exercise. The reader
// (`resolveSharedMembership`) is the store half: two Space reads and one membership read on the
// service-role client, fail-safe to null on every miss, because a membership this file cannot prove
// is a membership nobody holds.

import { createAdminClient } from '@/lib/supabase/admin'
import { memberSpacePlan } from './member-spaces'

interface SharedMembershipRelationship {
  childOwnerId?: string | null
  parentOwnerId?: string | null
  childStatus?: string | null
  childType?: string | null
  parentType?: string | null
  parentParentId?: string | null
}

/**
 * Does a paid membership in `parent` count in `child`? PURE.
 *
 * The child's own plan is deliberately NOT an input: a member Space that pays for Business on its
 * own is still a member Space, and its parent's members still belong there. memberSpacePlan is asked
 * with 'free' for exactly that reason, so this is the relationship rule and nothing else.
 */
export function sharedMembershipScope(
  child: { parentId?: string | null },
  parent: { id: string; plan?: string | null; status?: string | null } | null,
  relationship?: SharedMembershipRelationship,
): boolean {
  if (!parent || !child.parentId || child.parentId !== parent.id) return false
  return memberSpacePlan('free', parent, relationship) === 'business'
}

/** A membership the viewer holds in the Collective parent, as the member Space reads it. */
interface SharedMembership {
  id: string
  tierId: string
  tierName: string
  startedAt: string
  paymentStatus: string | null
  /** The Collective the membership was bought in, so a surface can say where it comes from. */
  via: { spaceId: string; spaceSlug: string; spaceName: string }
}

type SpaceRow = {
  id: string; slug: string; name: string | null; brand_name: string | null
  parent_id: string | null; owner_profile_id: string | null; status: string | null; type: string | null; plan: string | null
}
const SPACE_COLS = 'id, slug, name, brand_name, parent_id, owner_profile_id, status, type, plan'

/**
 * The viewer's ACTIVE paid membership in the Collective parent of `spaceId`, or null. Called only
 * once the Space's own read found no open row for the viewer (the caller's job; this never asks).
 * Waitlist rows do not travel: a spot in the parent's queue is not a membership anywhere.
 */
export async function resolveSharedMembership(spaceId: string, profileId: string): Promise<SharedMembership | null> {
  if (!spaceId || !profileId) return null
  try {
    const db = createAdminClient()
    const child = await db.from('spaces').select(SPACE_COLS).eq('id', spaceId).maybeSingle()
    const childRow = child.data as SpaceRow | null
    if (child.error || !childRow?.parent_id) return null
    const parent = await db.from('spaces').select(SPACE_COLS).eq('id', childRow.parent_id).maybeSingle()
    const parentRow = parent.data as SpaceRow | null
    if (parent.error || !parentRow) return null
    const shared = sharedMembershipScope({ parentId: childRow.parent_id }, parentRow, {
      childOwnerId: childRow.owner_profile_id,
      parentOwnerId: parentRow.owner_profile_id,
      childStatus: childRow.status,
      childType: childRow.type,
      parentType: parentRow.type,
      parentParentId: parentRow.parent_id,
    })
    if (!shared) return null
    const { data, error } = await db
      .from('space_memberships')
      .select('id, tier_id, started_at, payment_status')
      .eq('space_id', parentRow.id)
      .eq('member_profile_id', profileId)
      .eq('status', 'active')
      .maybeSingle()
    const row = data as { id: string; tier_id: string; started_at: string; payment_status?: string | null } | null
    if (error || !row) return null
    const tier = await db.from('space_membership_tiers').select('name').eq('id', row.tier_id).maybeSingle()
    return {
      id: row.id,
      tierId: row.tier_id,
      tierName: (tier.data as { name?: string } | null)?.name ?? 'Member',
      startedAt: row.started_at,
      paymentStatus: row.payment_status ?? null,
      via: { spaceId: parentRow.id, spaceSlug: parentRow.slug, spaceName: parentRow.brand_name ?? parentRow.name ?? 'the Collective' },
    }
  } catch {
    return null
  }
}

/** The yes/no form of the reader, for a members-only door (a members ticket tier, a paid-members
 *  Circle) that asks only whether the viewer belongs. Same read, same fail-safe. */
export async function holdsSharedMembership(spaceId: string, profileId: string | null): Promise<{ tier_id: string } | null> {
  if (!profileId) return null
  const shared = await resolveSharedMembership(spaceId, profileId)
  return shared ? { tier_id: shared.tierId } : null
}
