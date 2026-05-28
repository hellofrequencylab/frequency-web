import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/app-shell'
import RightSidebar from '@/components/sidebar/right-sidebar'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'

// Authenticated app layout. Wraps Feed, Groups, Events, Admin.
// Pages outside this group (onboarding, settings, sign-in, /people) render
// without the nav shell and do their own auth checks.
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps, lifetime_gems')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // No profile row means the trigger hasn't run yet. Send to onboarding.
  if (!profile) redirect('/onboarding')

  // Unread notification count. Non-blocking, falls back to 0 on error
  const unreadCount = await getUnreadCount().catch(() => 0)

  // Right sidebar streams in independently. Doesn't block page render
  const sidebar = (
    <Suspense fallback={<RightSidebarSkeleton />}>
      <RightSidebar
        profileId={profile.id}
        role={profile.community_role as CommunityRole}
      />
    </Suspense>
  )

  return (
    <AppShell profile={profile} sidebar={sidebar} unreadCount={unreadCount}>
      {children}
      <AchievementToastContainer />
      <PresenceHeartbeat />
      <PushRegistration />
    </AppShell>
  )
}

function RightSidebarSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="h-48 rounded-xl border border-border bg-surface animate-pulse" />
      <div className="h-36 rounded-xl border border-border bg-surface animate-pulse" />
      <div className="h-28 rounded-xl border border-border bg-surface animate-pulse" />
    </div>
  )
}
