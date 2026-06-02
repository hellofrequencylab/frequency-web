import { notFound } from 'next/navigation'
import { Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL, roleBadgeStyle } from '@/lib/community-roles'
import { ROLE_META } from '@/lib/roles-meta'
import { RoleManager, type RoleMember } from './role-manager'

export const dynamic = 'force-dynamic'

export default async function AdminRolesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: caller } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  // Role management is janitor-only (full keys).
  if (!caller || caller.community_role !== 'janitor') notFound()

  const { data: rows } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps')
    .eq('is_system', false)
    .order('current_season_zaps', { ascending: false, nullsFirst: false })
    .limit(300)

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
    <div>
      <div className="mb-1 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary-strong" />
        <h1 className="text-2xl font-bold text-text">Roles &amp; permissions</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        Assign roles, spot members ready to advance, and see what each role unlocks.
      </p>

      {/* Role roster */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_HIERARCHY.map((r) => (
          <div key={r} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{ROLE_META[r].emoji}</span>
                <span className="rank-badge text-[11px] font-bold leading-tight" style={roleBadgeStyle(r)}>
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
    </div>
  )
}
