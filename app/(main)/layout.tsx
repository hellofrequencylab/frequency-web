import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveSpaceForHost, activeVerticalsForSpace } from '@/lib/spaces'
import { VERTICALS } from '@/lib/verticals'
import AppShell from '@/components/layout/app-shell'
import type { Metadata } from 'next'
import { loadChromeOverrides, isSafeRoute } from '@/lib/layout/page-chrome'
import { loadPageSettings } from '@/lib/page-settings/store'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { loadActiveThemeCss, resolveActiveOccasionSlug } from '@/lib/theme/server/themes'
import RightSidebar, { MobileGameStats } from '@/components/sidebar/right-sidebar'
import { DispatchTickerSlot } from '@/components/layout/dispatch-ticker-slot'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { getAreaPermissions } from '@/lib/permissions'
import { getMenuConfig, orderedVisibleAreas } from '@/lib/menu-config'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { getStaffMember } from '@/lib/staff'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo, type AccessLevel, type Hats, type Surface } from '@/lib/core/access-matrix'
import { NAV_AREAS } from '@/lib/nav-areas'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ZapToastContainer } from '@/components/zap-toast'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'
import { VeraLauncher } from '@/components/vera/vera-launcher'
import { PageViewTracker } from '@/components/analytics/track-provider'
import { ObserveProvider } from '@/components/analytics/observe-provider'
import { GaConsentGate } from '@/components/analytics/ga-consent-gate'
import { hasConsent } from '@/lib/consent/consent'
import { demoModeEnabled, demoContentExists } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { getSearchIndex } from '@/lib/help/content'
import { TourProvider } from '@/components/onboarding/tour-provider'
import type { TourState } from '@/lib/onboarding/select'
import { getOnboardingStatus, nextStepsEnabled } from '@/lib/onboarding/status'
import { autoPopupsEnabled } from '@/lib/onboarding/flags'
import { BETA_INDUCTION_ACTIVE } from '@/lib/onboarding/beta-script'
import { ChoresOverlay } from '@/components/onboarding/chores-overlay'
import { CaptureLauncher } from '@/components/feed/capture-launcher'
import { TimezoneSync } from '@/components/layout/timezone-sync'
import { SupportLauncher } from '@/components/support/support-launcher'
import { InviteLauncher } from '@/components/invite/invite-launcher'
import { DailyCheckIn } from '@/components/daily-check-in'
import { getProfileChores } from '@/lib/onboarding/profile-chores'
import { getFounderTasks } from '@/lib/onboarding/founder-tasks'
import { FOUNDER_COACH } from '@/lib/onboarding/founder-config'
import { getActiveTraining } from '@/lib/onboarding/training'
import { atLeastRole, asWebRole, isStaff } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import {
  marketplaceVisibility,
  MARKET_AREAS,
  AREA_NAV_KEY,
  AREA_PREFIX,
} from '@/lib/marketplace/visibility'
import { getMenu, getMenuSettings } from '@/lib/menus/read'
import { viewerRoleFor } from '@/components/layout/menu-role'
import { MarketingHeader } from '@/components/layout/marketing-header'
import { MarketingFooter } from '@/components/layout/marketing-footer'

// A logged-out visitor is normally sent back to the splash, but a NETWORKED Space profile
// (/spaces/<slug> + its public tabs) is public + crawlable (SEO/AIO) — those render in the
// public chrome instead. The in-app /spaces index routes (directory, new) and the owner
// sub-surfaces (settings, edit) stay members-only. The space layout itself self-resolves
// visibility (network only; private/missing → notFound) and emits its own canonical/OG/JSON-LD.
const SPACES_NON_PROFILE = new Set(['directory', 'new'])
function isAnonSpaceProfile(p: string | null): boolean {
  if (!p) return false
  const m = /^\/spaces\/([^/]+)(?:\/([^/]+))?$/.exec(p)
  if (!m) return false
  const [, slug, tab] = m
  if (SPACES_NON_PROFILE.has(slug)) return false
  if (tab === 'settings' || tab === 'edit') return false
  return true
}

// Per-route SEO overrides (ADR-268): an operator sets a route's title / description /
// share-image in the on-page Page panel; this applies them as the (main) layout's metadata
// (a page's own generateMetadata still wins). The current route comes from the `x-pathname`
// header proxy.ts already sets (ADR-161). FAIL-SAFE: any miss → the code default (no override),
// so it is harmless before the page_settings migration is applied.
export async function generateMetadata(): Promise<Metadata> {
  try {
    const pathname = (await headers()).get('x-pathname')
    if (!pathname || !isSafeRoute(pathname)) return {}
    const s = await loadPageSettings(pathname)
    if (!s) return {}
    const md: Metadata = {}
    if (s.seo_title) md.title = s.seo_title
    if (s.seo_description) md.description = s.seo_description
    // Link previews use the compact social-share image, falling back to the wide header.
    const ogImage = s.og_image_url ?? s.header_image_url
    if (ogImage) {
      md.openGraph = {
        images: [{ url: ogImage }],
        ...(s.seo_title ? { title: s.seo_title } : {}),
      }
    }
    return md
  } catch {
    return {}
  }
}

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
  // EXCEPTION: a public networked Space profile is crawlable + shareable, so render it
  // in the public marketing chrome (logo header + footer) rather than the member shell
  // (there is no profile to build the shell from). The space layout walls private/missing.
  if (!user) {
    const anonPath = (await headers()).get('x-pathname')
    if (isAnonSpaceProfile(anonPath)) {
      const [headerMenu, footerMenu, menuTimings] = await Promise.all([
        getMenu('header'),
        getMenu('footer'),
        getMenuSettings(),
      ])
      return (
        <>
          <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} isAuth={false} />
          <main className="min-h-screen bg-surface pt-16">{children}</main>
          <MarketingFooter menu={footerMenu} />
        </>
      )
    }
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, web_role, current_season_zaps, lifetime_gems, meta')
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

  // Request headers (host + current route) — read once and reused below.
  const reqHeaders = await headers()
  const reqPath = reqHeaders.get('x-pathname')

  // ONE parallel wave of the shell's independent reads. Every entry depends only on
  // `profile` / `realRole` (or nothing), so they run concurrently instead of as ~16 serial
  // round-trips — that serial chain is what made every authed navigation feel laggy (site
  // audit 2026-06-18). Values that depend on the result of this wave (previewingDown, staffRole,
  // navHats) and the theme chain are derived AFTER it; the redirect guards above still run first.
  // getStaffMember is fetched speculatively here and discarded when previewing down — one cheap
  // read beats a serial hop. Per-promise fail-safes match the originals (each helper has its own
  // default; the externally-fallible reads are `.catch`'d).
  const [
    effectiveRole,
    previewVisitor,
    unreadCount,
    permissions,
    menuConfig,
    realHats,
    helpIndex,
    analyticsConsent,
    [demoMode, demoHidden, hasDemoContent],
    nextSteps,
    autoPopups,
    chromeOverrides,
    space,
    chores,
    staffMember,
    headerMenu,
    leftMenu,
    profileMenu,
    adminHeaderMenu,
    menuTimings,
  ] = await Promise.all([
    applyViewAs(realRole),
    viewingAsVisitor(realRole),
    getUnreadCount().catch(() => 0),
    getAreaPermissions(),
    getMenuConfig(),
    getViewerHats(),
    getSearchIndex(),
    hasConsent(profile.id, 'analytics'),
    Promise.all([demoModeEnabled(), viewerHidesDemo(), demoContentExists()]),
    nextStepsEnabled(),
    autoPopupsEnabled(),
    loadChromeOverrides(),
    resolveSpaceForHost(reqHeaders.get('host')).catch(() => null),
    BETA_INDUCTION_ACTIVE ? getProfileChores(profile.id) : Promise.resolve(null),
    getStaffMember().catch(() => null),
    // The standardized menu containers (lib/menus, ADR-390). getMenu falls back to the code
    // defaults on any miss/error, so these reads are safe pre-migration and no menu ever breaks.
    // The in-app shell uses: header (the mega-menu), left (the rail — admin section entry points
    // live here, role-gated), profile (the account dropdown), and admin_header (the contextual
    // admin mega sub-nav). Footer is fetched by its own layouts.
    getMenu('header'),
    getMenu('left'),
    getMenu('profile'),
    getMenu('admin_header'),
    getMenuSettings(),
  ])
  const menuAreaKeys = orderedVisibleAreas(menuConfig).map((a) => a.key)

  // Janitor previewing the logged-out experience: server caps drop to member
  // (effectiveRole), and the NAV gates as a visitor (driven by this flag).
  // Staff axis (team_members) — unlocks the Studio nav group independent of trust role
  // (ADR-027). Suppressed while previewing a lower role/visitor so the janitor "view as"
  // accurately reflects what that role sees (the speculative staff read is dropped here).
  const previewingDown = previewVisitor || effectiveRole !== realRole
  const staffRole = previewingDown ? null : (staffMember?.role ?? null)

  // Staff web_role axis (ADR-208) — gates the staff-only on-page "Page" settings group
  // (admin+, the EMBEDDED-ADMIN inline layer). Suppressed under a downgrade preview so a
  // steward's "view as" faithfully hides operator chrome, matching staffRole above.
  const pageWebRole = previewingDown ? 'none' : asWebRole(profile.web_role)

  // The viewer collapsed to a single MenuAccess token for the DB-backed header / admin
  // megas (components/layout/menu-role). View-as aware: a visitor preview reads as
  // 'visitor', and a downgraded preview rides the effective community role (staff is
  // already stripped to 'none' above), so "view as" faithfully previews what that role
  // sees in the menus. Otherwise staff (admin/janitor) is authoritative over the trust role.
  const menuViewerRole = viewerRoleFor({
    loggedIn: !previewVisitor,
    communityRole: effectiveRole,
    webRole: pageWebRole,
    previewVisitor,
  })

  // Page status & visibility (ADR-269): an operator can mark a route DRAFT or set the
  // lowest community role that may reach it (the on-page Page panel → page_settings).
  // Enforce it here — the one place with the route (the x-pathname header proxy.ts sets)
  // AND the viewer's resolved role. LOCKOUT-PROOF + FAIL-SAFE: staff (view-as-aware) always
  // pass so an operator can preview drafts and is never locked out; any error is ignored
  // (no gate); and we never redirect /feed itself, so a mis-set home can't loop.
  if (reqPath && reqPath !== '/feed' && isSafeRoute(reqPath) && !isStaff(pageWebRole)) {
    const ps = await loadPageSettings(reqPath)
    if (ps) {
      const draftHidden = ps.status === 'draft'
      const roleHidden =
        !!ps.visibility_role && !atLeastRole(effectiveRole, ps.visibility_role as CommunityRole)
      if (draftHidden || roleHidden) redirect('/feed')
    }
  }

  // Matrix-driven nav visibility (owner directive): resolve each nav item's access for
  // this viewer — respecting "view as" (effectiveRole) and suppressing personas/staff
  // when previewing down — so the menu shows every item they can reach, wherever it sits.
  // (realHats / staffRole / effectiveRole were resolved in the parallel wave above.)
  const navHats: Hats = previewVisitor
    ? { loggedIn: false }
    : {
        loggedIn: true,
        role: effectiveRole,
        tier: realHats.tier,
        personas: previewingDown ? [] : realHats.personas,
        staff: staffRole,
      }
  const navAccess: Record<string, AccessLevel> = Object.fromEntries(
    NAV_AREAS.map((a) => [a.key, a.surface ? accessTo(a.surface as Surface, navHats) : 'full']),
  )

  // Help index for the app-wide support launcher (docs/SUPPORT-SYSTEM.md §1) was loaded
  // in the parallel wave above (helpIndex). Small + read from local Markdown.

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

  // Analytics consent (ADR-069), the beta-content toggle (demoMode/demoHidden/hasDemoContent),
  // Vera's "chores" (BETA-ACTIVATION §2; beta-only via the induction flag), and the operator
  // switches (nextSteps/autoPopups, both default off) were all resolved in the parallel wave above.

  // Once chores are done, Vera keeps coaching (build item 1.3, folded into the same
  // surface — no competing card): surface the single next activation step.
  let coachNext = chores?.complete ? (await getOnboardingStatus(profile.id)).current : null
  // Activation done? Hand off to Founder's First Week (build item 1.4) while it's
  // unfinished. The founder query only runs for this small, fully-activated cohort.
  if (chores?.complete && !coachNext && !(await getFounderTasks(profile.id)).complete) {
    coachNext = {
      key: 'log', // synthetic step — the overlay renders by copy/href, not key
      label: FOUNDER_COACH.headline,
      headline: FOUNDER_COACH.headline,
      blurb: FOUNDER_COACH.blurb,
      href: FOUNDER_COACH.href,
      cta: FOUNDER_COACH.cta,
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

  // Apply the active Space for this host (resolved in the parallel wave above): use its skin
  // AND hide vertical nav the Space hasn't switched on (ADR-249/250 step 6). Resilient: a null
  // space (lookup failure / pre-migration) falls back to the default skin + no vertical filtering
  // (the current look). The root space enables every vertical, so this filtering is a no-op there
  // — it only narrows nav for a non-root sub-brand Space. (chromeOverrides also came from the wave.)
  let activeSkin = 'default'
  let activeGeneration: string | null = null
  let activeBrandName: string | null = null
  let activeBrandLogoUrl: string | null = null
  try {
    if (space) {
      activeSkin = space.skin
      // `spaces.generation` is the operator's GENERATION (feel) default (20260707000000_spaces_generation.sql).
      // Read via an untyped cast until lib/spaces maps the column onto Space (the codebase pattern for a
      // freshly-added column); null = no Space default, so resolveTheme falls back to DEFAULT_GENERATION.
      activeGeneration = (space as { generation?: string | null }).generation ?? null
      activeBrandName = space.brandName
      activeBrandLogoUrl = space.brandLogoUrl
      const enabled = new Set(activeVerticalsForSpace(space).map((v) => v.id))
      for (const v of VERTICALS) {
        if (enabled.has(v.id)) continue
        for (const p of v.nav ?? []) navAccess[p.area.key] = 'none' // hide its nav for this Space
      }
    }
  } catch {
    /* vertical-filtering failure → default skin, no filtering */
  }

  // Marketplace visibility (operator-controlled, per area). An area switched OFF is hidden
  // from regular members — its nav/footer entry is dropped AND the page itself is gated —
  // while operators still see it to build it. Mirrors the Space nav-hide above + the
  // safe-route redirect earlier. FAIL-OPEN: any read error leaves the marketplace visible.
  // The redirect is decided inside the try but THROWN outside it, so a caught error can
  // never swallow Next's redirect signal.
  const isMarketOperator =
    !previewVisitor && !previewingDown && (isStaff(pageWebRole) || staffCan(staffRole, 'platform', 'read'))
  let marketAreaHidden = false
  try {
    if (!isMarketOperator) {
      const vis = await marketplaceVisibility()
      for (const area of MARKET_AREAS) {
        if (vis[area]) continue
        navAccess[AREA_NAV_KEY[area]] = 'none'
        const prefix = AREA_PREFIX[area]
        if (reqPath && (reqPath === prefix || reqPath.startsWith(prefix + '/'))) marketAreaHidden = true
      }
    }
  } catch {
    /* visibility read failed → leave the marketplace fully visible (fail-open) */
  }
  if (marketAreaHidden) redirect('/feed')

  // Resolve the member's theme for the in-app shell: the personal `fxtheme` cookie (skin /
  // generation / occasion) over the Space default over the system default. The per-request
  // cookie + DB-theme reads live HERE, not in the root layout, so the public marketing/discover
  // pages stay static/prerendered (app/layout.tsx). Fail-safe throughout.
  const theme = await resolveTheme({ spaceSkin: activeSkin, spaceGeneration: activeGeneration })
  const occasion =
    theme.occasion !== 'none' ? theme.occasion : await resolveActiveOccasionSlug(new Date())
  // The active DB skin/occasion theme as a scoped <style> (fail-safe '' until theme rows exist).
  const themeCss = await loadActiveThemeCss({ skin: theme.skin, occasion })

  return (
    <>
      {themeCss ? <style id="fx-theme" dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
    <AppShell
      skin={theme.skin}
      generation={theme.generation}
      occasion={occasion}
      brandName={activeBrandName}
      brandLogoUrl={activeBrandLogoUrl}
      chromeOverrides={chromeOverrides}
      webRole={pageWebRole}
      profile={{ ...profile, community_role: effectiveRole }}
      realRole={realRole}
      previewVisitor={previewVisitor}
      sidebar={sidebar}
      statsPanel={statsPanel}
      ticker={ticker}
      unreadCount={unreadCount}
      permissions={permissions}
      menuAreaKeys={menuAreaKeys}
      leftMenu={leftMenu}
      navAccess={navAccess}
      staffRole={staffRole}
      demoMode={demoMode}
      demoHidden={demoHidden}
      hasDemoContent={hasDemoContent}
      headerMenu={headerMenu}
      profileMenu={profileMenu}
      adminHeaderMenu={adminHeaderMenu}
      menuViewerRole={menuViewerRole}
      menuTimings={menuTimings}
    >
      <GaConsentGate disabled={!analyticsConsent} />
      {children}
      <AchievementToastContainer />
      <ZapToastContainer />
      <PresenceHeartbeat />
      <PushRegistration />
      {/* One-time browser→home_timezone sync so the practice "day" resolves in the
          member's own tz server-side (their Log Practice buttons reset at THEIR midnight). */}
      <TimezoneSync />
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
      {nextSteps && chores && (!chores.complete || !chores.rewarded || coachNext) && (
        <ChoresOverlay chores={chores} nextAction={coachNext} />
      )}
      <PageViewTracker />
      <ObserveProvider />
      {autoPopups && <DailyCheckIn />}
      {autoPopups && <TourProvider initialState={tourState} satisfied={tourSatisfied} />}
    </AppShell>
    </>
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
