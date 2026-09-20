// THE MEMBER'S OWN SPACE MEMBERSHIPS (LIVE-423 / ADR-1472).
//
// FOCUS-MODEL §6 named this hole: a member who starts paying a community has
// nowhere to see or manage it. Settings Plan and billing is the Frequency Crew
// plan. listSpaceMemberships is the owner's roster. This is the member's list.
//
// GATES:
//   • Signed-out returns [].
//   • Cancelled is not open. Waitlist is open (the member can leave it).
//   • ROOT never lists. Same class of leak the People tab closed.
//   • Only the caller's member_profile_id rows.
//
// Reads use the admin client. RLS on space_memberships is owner-shaped; the
// app-layer profile id is the door. Fail-safe: a broken read or a missing
// Space returns []. No migration. No payment_status enforcement (that is the
// dunning row, not this surface).

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

export const MY_MEMBERSHIPS_CAP = 100

export type MySpaceMembership = {
  id: string
  spaceId: string
  spaceName: string
  spaceSlug: string
  tierId: string
  tierName: string
  status: 'active' | 'waitlist'
  billingInterval: string
  startedAt: string
}

type MembershipRow = {
  id: string
  space_id: string
  member_profile_id: string
  tier_id: string
  status: string
  billing_interval: string | null
  started_at: string
}

type SpaceRow = {
  id: string
  name: string | null
  slug: string | null
  type: string | null
}

type TierRow = {
  id: string
  name: string | null
}

export function isOpenSpaceMembership(status: string): boolean {
  return status === 'active' || status === 'waitlist'
}

export function isMemberFacingSpace(type: string | null | undefined): boolean {
  return type !== 'root'
}

export function membershipCadenceLabel(interval: string, status: 'active' | 'waitlist'): string {
  if (status === 'waitlist') return 'On the waitlist'
  if (interval === 'year') return 'Yearly'
  if (interval === 'once') return 'One time'
  return 'Monthly'
}

export function foldMySpaceMemberships(
  viewerProfileId: string,
  rows: MembershipRow[],
  spaces: SpaceRow[],
  tiers: TierRow[],
): MySpaceMembership[] {
  const spaceById = new Map(spaces.map((s) => [s.id, s]))
  const tierById = new Map(tiers.map((t) => [t.id, t]))
  const out: MySpaceMembership[] = []

  for (const row of rows) {
    if (row.member_profile_id !== viewerProfileId) continue
    if (!isOpenSpaceMembership(row.status)) continue
    const space = spaceById.get(row.space_id)
    if (!space?.slug?.trim()) continue
    if (!isMemberFacingSpace(space.type)) continue
    const status = row.status === 'waitlist' ? 'waitlist' : 'active'
    out.push({
      id: row.id,
      spaceId: row.space_id,
      spaceName: space.name?.trim() || 'A Space',
      spaceSlug: space.slug.trim(),
      tierId: row.tier_id,
      tierName: tierById.get(row.tier_id)?.name?.trim() || 'Member',
      status,
      billingInterval: row.billing_interval ?? 'month',
      startedAt: row.started_at,
    })
    if (out.length >= MY_MEMBERSHIPS_CAP) break
  }

  return out
}

/**
 * Spaces this member belongs to. Empty when signed out, when they hold none,
 * or when the read misses.
 */
export async function listMySpaceMemberships(): Promise<MySpaceMembership[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('space_memberships')
      .select('id, space_id, member_profile_id, tier_id, status, billing_interval, started_at')
      .eq('member_profile_id', profileId)
      .in('status', ['active', 'waitlist'])
      .order('started_at', { ascending: false })
      .limit(MY_MEMBERSHIPS_CAP)
    if (error || !data) return []

    const rows = data as MembershipRow[]
    const spaceIds = [...new Set(rows.map((r) => r.space_id))]
    const tierIds = [...new Set(rows.map((r) => r.tier_id))]
    if (spaceIds.length === 0) return []

    const [spacesRes, tiersRes] = await Promise.all([
      admin.from('spaces').select('id, name, slug, type').in('id', spaceIds),
      tierIds.length
        ? admin.from('space_membership_tiers').select('id, name').in('id', tierIds)
        : Promise.resolve({ data: [] as TierRow[] }),
    ])

    return foldMySpaceMemberships(
      profileId,
      rows,
      (spacesRes.data ?? []) as SpaceRow[],
      (tiersRes.data ?? []) as TierRow[],
    )
  } catch {
    return []
  }
}
