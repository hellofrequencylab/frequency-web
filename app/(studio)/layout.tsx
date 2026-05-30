import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/staff'
import { StudioShell } from '@/components/layout/studio-shell'
import type { CommunityRole } from '@/lib/community-roles'

// The Studio: admin-gated business cockpit. Renders inside the STANDARD app shell
// (top header + left sidebar) with the Studio nav added as its own section, so it
// feels like part of the app. Gated once here (ADR-027).
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // Staff gate (redirects to '/' if not staff).
  await requireStaff()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps, lifetime_gems')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')

  return (
    <StudioShell
      profile={{ ...profile, community_role: (profile.community_role ?? 'member') as CommunityRole }}
    >
      {children}
    </StudioShell>
  )
}
