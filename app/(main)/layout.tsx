import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/app-shell'
import RightSidebar from '@/components/sidebar/right-sidebar'
import { DispatchTickerSlot } from '@/components/layout/dispatch-ticker-slot'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { getAreaPermissions } from '@/lib/permissions'
import { applyViewAs } from '@/lib/view-as'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ZapToastContainer } from '@/components/zap-toast'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'
import { SupportLauncher } from '@/components/support/support-launcher'
import { PageViewTracker } from '@/components/analytics/track-provider'
import { getSearchIndex } from '@/lib/help/content'
import { TourProvider } from '@/components/onboarding/tour-provider'
import type { TourState } from '@/lib/onboarding/select'
import { BETA_INDUCTION_ACTIVE } from '@/lib/onboarding/beta-script'

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

  // Logged-out visitors hitting an in-app URL go back to the splash (not the
  // sign-in form) — the splash is the front door for anyone who hasn't signed up.
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, current_season_zaps, lifetime_gems, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // No profile row means the trigger hasn't run yet. Send to onboarding.
  if (!profile) redirect('/onboarding')

  // During beta, the induction is the mandatory opening sequence: anyone who
  // hasn't completed it is routed in. `/onboarding` (outside this layout, so no
  // loop) forwards to /onboarding/beta. Flipping BETA_INDUCTION_ACTIVE off at
  // launch reverts to the non-blocking model (ADR-047).
  const meta = profile.meta as { onboarding_completed?: boolean } | null
  if (BETA_INDUCTION_ACTIVE && !meta?.onboarding_completed) redirect('/onboarding')

  // Effective role honours a janitor's "view as" override so the whole shell
  // (nav + capabilities) previews the chosen role; realRole is the true role,
  // used only to show the janitor control itself. See lib/view-as.ts.
  const realRole = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRole = await applyViewAs(realRole)

  // Unread notification count. Non-blocking, falls back to 0 on error
  const unreadCount = await getUnreadCount().catch(() => 0)

  // Per-area access overrides (janitor-set from /admin/roles). Drives which menu
  // items are usable vs. muted. Falls back to {} (code defaults) on error.
  const permissions = await getAreaPermissions()

  // Help index for the app-wide support launcher (docs/SUPPORT-SYSTEM.md §1).
  // Small + read from local Markdown; cheap to load with the shell.
  const helpIndex = await getSearchIndex()

  // Deterministic onboarding tour state from profiles.meta.tour (ADR-047 P1).
  const tourMeta = (profile.meta as { tour?: Partial<TourState> } | null)?.tour
  const tourState: TourState = {
    seen: tourMeta?.seen ?? [],
    dismissed: tourMeta?.dismissed ?? [],
    lastShownAt: tourMeta?.lastShownAt ?? null,
  }

  // Right sidebar streams in independently. Doesn't block page render
  const sidebar = (
    <Suspense fallback={<RightSidebarSkeleton />}>
      <RightSidebar
        profileId={profile.id}
        role={effectiveRole}
      />
    </Suspense>
  )

  // Community news ticker — streams in independently, never blocks the shell.
  const ticker = (
    <Suspense fallback={null}>
      <DispatchTickerSlot profileId={profile.id} />
    </Suspense>
  )

  return (
    <AppShell
      profile={{ ...profile, community_role: effectiveRole }}
      realRole={realRole}
      sidebar={sidebar}
      ticker={ticker}
      unreadCount={unreadCount}
      permissions={permissions}
    >
      {children}
      <AchievementToastContainer />
      <ZapToastContainer />
      <PresenceHeartbeat />
      <PushRegistration />
      <SupportLauncher index={helpIndex} />
      <PageViewTracker />
      <TourProvider initialState={tourState} />
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
