import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CommunityRole } from '@/lib/core/roles'
import { isStaffRole } from '@/lib/core/staff-roles'
import { getAreaPermissions } from '@/lib/permissions'
import type { RoleMember } from './role-manager'
import type { StaffMemberRow } from './staff-role-manager'

// Community roster + operations team + area-permission overrides for the in-place
// Roles module (ADR-138 — People). Mirrors the /admin/roles page load (which can
// adopt this to DRY).
export async function getRolesData(): Promise<{
  members: RoleMember[]
  teamMembers: StaffMemberRow[]
  permissions: Awaited<ReturnType<typeof getAreaPermissions>>
}> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps')
    .eq('is_system', false)
    .order('current_season_zaps', { ascending: false, nullsFirst: false })
    .limit(300)

  const permissions = await getAreaPermissions()

  const db = admin as unknown as SupabaseClient
  const { data: teamRows } = await db
    .from('team_members')
    .select('role, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .order('created_at', { ascending: true })

  const teamMembers: StaffMemberRow[] = (
    (teamRows ?? []) as unknown as Array<{
      role: string
      profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null
    }>
  )
    .filter((r) => r.profile && isStaffRole(r.role))
    .map((r) => ({
      profileId: r.profile!.id,
      displayName: r.profile!.display_name ?? 'Unnamed',
      handle: r.profile!.handle ?? '',
      avatarUrl: r.profile!.avatar_url ?? null,
      role: r.role as StaffMemberRow['role'],
    }))

  const members: RoleMember[] = (rows ?? []).map((m) => ({
    id: m.id as string,
    displayName: (m.display_name as string) ?? 'Unnamed',
    handle: (m.handle as string) ?? '',
    avatarUrl: (m.avatar_url as string) ?? null,
    role: (m.community_role as CommunityRole) ?? 'member',
    zaps: (m.current_season_zaps as number) ?? 0,
  }))

  return { members, teamMembers, permissions }
}
