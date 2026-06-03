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
        {ROLE_HIERARCHY.map((r) => (
          <div key={r} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{ROLE_META[r].emoji}</span>
                <span className="rank-badge text-xs font-bold leading-tight" style={roleBadgeStyle(r)}>
                  {ROLE_LABEL[r]}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted">{counts[r]}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{ROLE_META[r].blurb}</p>
          </div>
        ))}
      </div>

      <RoleManager members={members} />

      <PermissionGrid initial={permissions} defaults={NAV_AREA_DEFAULTS} />
    </AdminPage>
  )
}
