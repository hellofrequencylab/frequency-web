// SPACE MEMBER DIRECTORY (LIVE-420 / ADR-1471).
//
// space.people is the STAFF roster (settings/members). Paying members live in
// space_memberships and had no member-facing list. This is that list: who belongs
// here, visible to people who belong here (or who manage the Space).
//
// GATES, in order:
//   • ROOT never lists. Same class of leak the Circles tab closed.
//   • A waitlist row is not a membership (same rule as the Journey tier gate).
//   • Ghost mode stays invisible. directory_visible is the /network switch and
//     does not hide you from people you joined a Space with.
//   • A handle-less row cannot be opened, so it is omitted rather than linked
//     to a dead /people/ URL.
//
// Reads use the admin client. RLS on space_memberships is owner-shaped; the
// app-layer gate is the door. Fail-closed: a missing Space, a broken read, or
// a viewer who is neither an active member nor a manager gets [].

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceById } from '@/lib/spaces/store'
import { getMyMembership } from '@/lib/spaces/memberships'
import type { Space } from '@/lib/spaces/types'

export const DIRECTORY_CAP = 200

export type DirectoryPerson = {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  tierName: string
}

export function canSeeSpaceMemberDirectory(args: {
  spaceType: string
  isActiveMember: boolean
  canManage: boolean
}): boolean {
  if (args.spaceType === 'root') return false
  return args.isActiveMember || args.canManage
}

/** Waitlist is not a membership. Cancelled / past_due rows are not open. */
export function isDirectoryMembership(status: string): boolean {
  return status === 'active'
}

export function isDirectoryProfile(row: {
  handle?: string | null
  ghost_mode?: boolean | null
}): boolean {
  if (!row.handle?.trim()) return false
  if (row.ghost_mode === true) return false
  return true
}

export async function viewerCanSeeSpaceMemberDirectory(space: Space): Promise<boolean> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const manage = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null)
  const mine = viewerProfileId ? await getMyMembership(space.id) : null
  return canSeeSpaceMemberDirectory({
    spaceType: space.type,
    isActiveMember: mine?.status === 'active',
    canManage: manage.canManage || manage.staffViewing,
  })
}

/**
 * The people who belong here. Empty for a viewer who cannot see the list, for
 * ROOT, or when the read misses. Sorted by display name. Capped.
 */
export async function listSpaceMemberDirectory(spaceId: string): Promise<DirectoryPerson[]> {
  const space = await getSpaceById(spaceId)
  if (!space) return []
  if (!(await viewerCanSeeSpaceMemberDirectory(space))) return []

  try {
    const { data: rows, error } = await createAdminClient()
      .from('space_memberships')
      .select('member_profile_id, tier_id, status')
      .eq('space_id', spaceId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(DIRECTORY_CAP)
    if (error || !rows) return []

    const memberIds = [...new Set(rows.map((r) => r.member_profile_id).filter(Boolean))]
    const tierIds = [...new Set(rows.map((r) => r.tier_id).filter(Boolean))]
    if (memberIds.length === 0) return []

    const [profiles, tiers] = await Promise.all([
      createAdminClient()
        .from('profiles')
        .select('id, display_name, handle, avatar_url, ghost_mode')
        .in('id', memberIds),
      tierIds.length
        ? createAdminClient().from('space_membership_tiers').select('id, name').in('id', tierIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])

    const profileById = new Map(
      (profiles.data ?? []).map((p) => [
        p.id,
        {
          displayName: p.display_name?.trim() || 'A member',
          handle: typeof p.handle === 'string' ? p.handle.trim() : '',
          avatarUrl: p.avatar_url ?? null,
          ghost_mode: p.ghost_mode === true,
        },
      ]),
    )
    const tierName = new Map((tiers.data ?? []).map((t) => [t.id, t.name?.trim() || 'Member']))

    const people: DirectoryPerson[] = []
    for (const row of rows) {
      if (!isDirectoryMembership(row.status)) continue
      const profile = profileById.get(row.member_profile_id)
      if (!profile || !isDirectoryProfile(profile)) continue
      people.push({
        profileId: row.member_profile_id,
        displayName: profile.displayName,
        handle: profile.handle,
        avatarUrl: profile.avatarUrl,
        tierName: tierName.get(row.tier_id) ?? 'Member',
      })
    }

    people.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
    return people
  } catch {
    return []
  }
}
