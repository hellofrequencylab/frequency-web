import { Shield } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL, roleBadgeStyle } from '@/lib/community-roles'
import { ROLE_META } from '@/lib/roles-meta'
import { getAreaPermissions } from '@/lib/permissions'
import { NAV_AREA_DEFAULTS } from '@/lib/nav-areas'
import { RoleManager, type RoleMember } from './role-manager'
import { PermissionGrid } from './permission-grid'
import { StaffRoleManager, type StaffMemberRow } from './staff-role-manager'
import { isStaffRole } from '@/lib/core/staff-roles'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export default async function AdminRolesPage() {
  // Role management is janitor-only (full keys).
  await requireAdmin('janitor')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps')
    .eq('is_system', false)
    .order('current_season_zaps', { ascending: false, nullsFirst: false })
    .limit(300)

  const permissions = await getAreaPermissions()

  // Current team / operations members (ADR-127). team_members is untyped in the
  // generated types, so query through an untyped handle.
  const db = admin as unknown as SupabaseClient
  const { data: teamRows } = await db
    .from('team_members')
    .select('role, profile:profiles!profile_id ( id, display_name, handle, avatar_url )')
    .order('created_at', { ascending: true })

  const teamMembers: StaffMemberRow[] = ((teamRows ?? []) as unknown as Array<{
    role: string
    profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null
  }>)
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
    role: ((m.community_role as CommunityRole) ?? 'member'),
    zaps: (m.current_season_zaps as number) ?? 0,
  }))

  const counts = ROLE_HIERARCHY.reduce<Record<CommunityRole, number>>((acc, r) => {
    acc[r] = members.filter((m) => m.role === r).length
    return acc
  }, {} as Record<CommunityRole, number>)

  return (
    <AdminPage
      title="Roles & permissions"
      eyebrow="Platform"
      icon={Shield}
      description="Assign roles, spot members ready to advance, and see what each role unlocks."
      width="default"
    >
      {/* Role roster */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_HIERARCHY.map((r) => {
          const RoleIcon = ROLE_META[r].Icon
          return (
          <div key={r} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-elevated text-muted">
                  <RoleIcon className="h-4 w-4" />
                </span>
                <span className="rank-badge text-xs font-bold leading-tight" style={roleBadgeStyle(r)}>
                  {ROLE_LABEL[r]}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted">{counts[r]}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{ROLE_META[r].blurb}</p>
          </div>
          )
        })}
      </div>

      <RoleManager members={members} />

      <StaffRoleManager members={teamMembers} />

      <PermissionGrid initial={permissions} defaults={NAV_AREA_DEFAULTS} />
    </AdminPage>
  )
}
