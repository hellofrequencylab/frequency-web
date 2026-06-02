import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStaffMember } from '@/lib/staff'
import { atLeastRole } from '@/lib/core/roles'
import { StudioShell } from '@/components/layout/studio-shell'
import type { CommunityRole } from '@/lib/community-roles'

// The Studio: the marketing-only cockpit. Renders inside the STANDARD app shell
// (top header + left sidebar) with the Studio nav added as its own section — a
// self-contained marketing workspace (CRM / email / pipeline) whose logo always
// links back to the main site.
//
// Access (ADR-027 + admin role): community admin/janitor, OR a Studio staff
// member (the marketing team on the separate team_members axis).
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps, lifetime_gems')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')

  const role = (profile.community_role ?? 'member') as CommunityRole
  // Admins and janitors are in by role; otherwise fall back to the staff axis.
  if (!atLeastRole(role, 'admin')) {
    const staff = await getStaffMember().catch(() => null)
    if (!staff) redirect('/')
  }

  return (
    <StudioShell profile={{ ...profile, community_role: role }}>
      {children}
    </StudioShell>
  )
}
