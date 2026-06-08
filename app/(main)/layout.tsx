import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/app-shell'
import RightSidebar, { MobileGameStats } from '@/components/sidebar/right-sidebar'
import { DispatchTickerSlot } from '@/components/layout/dispatch-ticker-slot'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { getAreaPermissions } from '@/lib/permissions'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { getStaffMember } from '@/lib/staff'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ZapToastContainer } from '@/components/zap-toast'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'
import { VeraLauncher } from '@/components/vera/vera-launcher'
import { PageViewTracker } from '@/components/analytics/track-provider'
import { ObserveProvider } from '@/components/analytics/observe-provider'
import { GaConsentGate } from '@/components/analytics/ga-consent-gate'
import { hasConsent } from '@/lib/consent/consent'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { getSearchIndex } from '@/lib/help/content'
import { TourProvider } from '@/components/onboarding/tour-provider'
import type { TourState } from '@/lib/onboarding/select'
import { getOnboardingStatus } from '@/lib/onboarding/status'
import { BETA_INDUCTION_ACTIVE } from '@/lib/onboarding/beta-script'
import { ChoresOverlay } from '@/components/onboarding/chores-overlay'
import { CaptureLauncher } from '@/components/feed/capture-launcher'
import { SupportLauncher } from '@/components/support/support-launcher'
import { InviteLauncher } from '@/components/invite/invite-launcher'
import { DailyCheckIn } from '@/components/daily-check-in'
import { getProfileChores } from '@/lib/onboarding/profile-chores'
import { getFounderTasks } from '@/lib/onboarding/founder-tasks'
import { getActiveTraining } from '@/lib/onboarding/training'
import { atLeastRole } from '@/lib/core/roles'

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

  // Effective role honours a steward's (host+) "view as" override so the whole shell
  // (nav + capabilities) previews a role under them; realRole is the true role, used
  // to show the view-as control + the roles below it. See lib/view-as.ts.
  const realRole = (profile.community_role ?? 'member') as CommunityRole
  const effectiveRole = await applyViewAs(realRole)
  // Janitor previewing the logged-out experience: server caps drop to member
  // (effectiveRole), and the NAV gates as a visitor (driven by this flag).
  const previewVisitor = await viewingAsVisitor(realRole)

  // Unread notification count. Non-blocking, falls back to 0 on error
  const unreadCount = await getUnreadCount().catch(() => 0)

  // Per-area access overrides (janitor-set from /admin/roles). Drives which menu
  // items are usable vs. muted. Falls back to {} (code defaults) on error.
  const permissions = await getAreaPermissions()

  // Staff axis (team_members) — unlocks the Studio nav group independent of trust
  // role (ADR-027). Suppressed while previewing a lower role/visitor so the janitor
  // "view as" accurately reflects what that role sees.
  const previewingDown = previewVisitor || effectiveRole !== realRole
  const staff = previewingDown ? null : await getStaffMember()
  const staffRole = staff?.role ?? null

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

  // Cues whose activation task is already done are suppressed (don't tell someone
  // to add a photo they have). Only pay for the status lookup when a task-cue is
  // still unseen — otherwise there's nothing to suppress.
  const TASK_CUES = ['profile_face', 'circles_find', 'practice_adopt']
  const tourSatisfied: string[] = TASK_CUES.some((id) => !tourState.seen.includes(id))
    ? (await getOnboardingStatus(profile.id)).steps.filter((s) => s.done).map((s) => s.key)
    : []

  // Right sidebar streams in independently. Doesn't block page render
  const sidebar = (
    <Suspense fallback={<RightSidebarSkeleton />}>
      <RightSidebar
        profileId={profile.id}
        role={effectiveRole}
      />
    </Suspense>
  )

  // Mobile stats menu body (zaps · streak · rank · journey · vault) — the same
  // progress cockpit as the desktop dock, streamed independently so it never
  // blocks the shell. The shell hosts it behind a right-edge, click-to-open menu.
  const statsPanel = (
    <Suspense fallback={null}>
      <MobileGameStats profileId={profile.id} />
    </Suspense>
  )

  // Analytics consent (ADR-069). A member who opted out has GA suppressed client-side
  // (GaConsentGate sets gtag's native opt-out flag); the server mirror is gated too.
  const analyticsConsent = await hasConsent(profile.id, 'analytics')

  // Beta-content toggle: only offered when seeded demo content actually exists
  // (global demo_mode on); reflects the member's own hide/show cookie.
  const [demoMode, demoHidden] = await Promise.all([demoModeEnabled(), viewerHidesDemo()])

  // Vera's "chores" — the matriarch full-stop (BETA-ACTIVATION §2). Beta-only (the
  // oath justifies the friction); retires once everything's done + rewarded. Off at
  // launch with the induction flag (back to the non-blocking model).
  const chores = BETA_INDUCTION_ACTIVE ? await getProfileChores(profile.id) : null
  // Once chores are done, Vera keeps coaching (build item 1.3, folded into the same
  // surface — no competing card): surface the single next activation step.
  let coachNext = chores?.complete ? (await getOnboardingStatus(profile.id)).current : null
  // Activation done? Hand off to Founder's First Week (build item 1.4) while it's
  // unfinished. The founder query only runs for this small, fully-activated cohort.
  if (chores?.complete && !coachNext && !(await getFounderTasks(profile.id)).complete) {
    coachNext = {
      key: 'log', // synthetic step — the overlay renders by copy/href, not key
      label: 'Founder’s First Week',
      headline: 'Your Founder’s First Week',
      blurb: 'You’re activated — now the fun part. Six moves to become a Founder, and a badge when you finish.',
      href: '/founder',
      cta: 'See your tasks',
      done: false,
    }
  }
  // Role-advancement training (ADR-157 §7): if a promotion assigned training, Vera
  // points at it (takes precedence — it's the freshest thing they unlocked). Query
  // gated to host+ (the management roles that receive training) so the member
  // majority never pays for it.
  if (chores?.complete && atLeastRole(realRole, 'host')) {
    const training = await getActiveTraining(profile.id)
    if (training) {
      coachNext = {
        key: 'log',
        label: training.title,
        headline: training.title,
        blurb: training.blurb,
        href: '/training',
        cta: 'Start training',
        done: false,
      }
    }
  }

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
      previewVisitor={previewVisitor}
      sidebar={sidebar}
      statsPanel={statsPanel}
      ticker={ticker}
      unreadCount={unreadCount}
      permissions={permissions}
      staffRole={staffRole}
      demoMode={demoMode}
      demoHidden={demoHidden}
    >
      <GaConsentGate disabled={!analyticsConsent} />
      {children}
      <AchievementToastContainer />
      <ZapToastContainer />
      <PresenceHeartbeat />
      <PushRegistration />
      <VeraLauncher index={helpIndex} />
      {/* Capture — the app-wide primary action (§6 Phase 2). Posts default to the
          member's wall; reachable from any page in the shell. */}
      <CaptureLauncher scopeId={profile.id} />
      {/* Support — the app-wide bug/report dialog; opened from the account menu, the
          Vera chat box, or any "Report" button via the 'open-support' event. */}
      <SupportLauncher />
      {/* Invite — the app-wide "invite friends, earn zaps" modal; opened from the
          account menu / anywhere via the 'open-invite' event. */}
      <InviteLauncher />
      {chores && (!chores.complete || !chores.rewarded || coachNext) && (
        <ChoresOverlay chores={chores} nextAction={coachNext} />
      )}
      <PageViewTracker />
      <ObserveProvider />
      <DailyCheckIn />
      <TourProvider initialState={tourState} satisfied={tourSatisfied} />
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
