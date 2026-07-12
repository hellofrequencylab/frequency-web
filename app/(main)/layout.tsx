import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveSpaceForHost, activeVerticalsForSpace } from '@/lib/spaces'
import { hasOperatedSpaces } from '@/lib/spaces/operated'
import { VERTICALS } from '@/lib/verticals'
import AppShell from '@/components/layout/app-shell'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { BetaCountdownBanner } from '@/components/layout/beta-countdown-banner'
import type { Metadata } from 'next'
import { loadChromeOverrides, isSafeRoute, adminScopeFor } from '@/lib/layout/page-chrome'
import { loadAppOverrides, scopeKeyFor, type AppOverrides } from '@/lib/apps/overrides'
import { loadPageSettings } from '@/lib/page-settings/store'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { structureFor } from '@/lib/theme/structure'
import { THEME_COOKIE, parseThemeCookie } from '@/lib/theme/cookie'
import { loadActiveThemeCss, resolveActiveOccasionSlug } from '@/lib/theme/server/themes'
import RightSidebar, { MobileGameStats } from '@/components/sidebar/right-sidebar'
import { DispatchTickerSlot } from '@/components/layout/dispatch-ticker-slot'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { getAreaPermissions } from '@/lib/permissions'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import type { Capability } from '@/lib/core/capabilities'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { PERSONAL_CONTEXT } from '@/lib/context/operator-context'
import { resolveOperatorContext } from '@/lib/context/resolve-context'
import { getStaffMember } from '@/lib/staff'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo, type AccessLevel, type Hats, type Surface } from '@/lib/core/access-matrix'
import { NAV_AREAS } from '@/lib/nav-areas'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ZapToastContainer } from '@/components/zap-toast'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'
import { VeraLauncher } from '@/components/vera/vera-launcher'
import { resolvePersonalTeaseGate } from '@/lib/pricing/tease-gate'
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

// The events index (/events) and an event's detail page (/events/<slug>) are PUBLIC + crawlable
// (SEO/AIO) — a signed-out visitor sees the event and is prompted to sign in for any action. Like a
// Space profile, these render in the public marketing chrome (no member rails). The CREATE flow
// (/events/new) and host MANAGE sub-routes stay members-only (proxy + this gate both exclude them).
function isAnonPublicEvent(p: string | null): boolean {
  if (!p) return false
  if (p === '/events') return true
  const m = /^\/events\/([^/]+)(?:\/(.+))?$/.exec(p)
  if (!m) return false
  const [, slug, rest] = m
  if (slug === 'new') return false
  if (rest) return false // any sub-route (e.g. /manage) is members-only
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
  // A PUBLIC view (a networked Space profile or a public events page) renders in the slim public
  // chrome for ANY viewer who can't get the member shell — signed-out, OR signed-in but pre-profile
  // / mid-beta-induction. That last case is why /events was bouncing to /onboarding/beta: a session
  // with onboarding incomplete hit the induction redirect even on a public page. The public surface
  // must never redirect to onboarding; it just shows the page with a Sign in / Join header.
  const currentPath = (await headers()).get('x-pathname')
  const isPublicView = isAnonSpaceProfile(currentPath) || isAnonPublicEvent(currentPath)
  const publicChrome = async () => {
    const [headerMenu, footerMenu, menuTimings] = await Promise.all([
      getMenu('header'),
      getMenu('footer'),
      getMenuSettings(),
    ])
    return (
      <>
        <MarketingHeader headerMenu={headerMenu} menuTimings={menuTimings} isAuth={false} />
        {/* Spacer clears the now-taller fixed header (4rem + safe-area-inset-top). min-h-dvh
            (not screen) tracks the iOS dynamic toolbar so landscape height doesn't glitch. */}
        <main className="min-h-dvh bg-canvas" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
          {/* A public page (a networked Space profile, a public event) reads in a single CENTERED column at
              the shared ~88rem width — the same width the public /discover/spaces directory uses, so moving
              between the directory and a Space reads as one product. A public viewer has no nav/community
              rail, so there are no gutters to mirror; the content is simply centered and never sprawls
              edge to edge. (The SIGNED-IN view still uses the member shell's three-column grid.) */}
          <div className="mx-auto w-full max-w-[88rem] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
        <MarketingFooter menu={footerMenu} />
      </>
    )
  }

  if (!user) {
    if (isPublicView) return publicChrome()
    // The in-app Business Spaces directory (/spaces/directory) has a PUBLIC twin at /discover/spaces.
    // Send a logged-out visitor who lands on the member URL (e.g. a shared link) to the public browse
    // instead of the generic home, so the directory is reachable without an account.
    if (currentPath === '/spaces/directory') redirect('/discover/spaces')
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, community_role, web_role, current_season_zaps, lifetime_gems, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // No profile row means the trigger hasn't run yet. Send to onboarding — unless this is a public
  // page, which stays viewable.
  if (!profile) {
    if (isPublicView) return publicChrome()
    redirect('/onboarding')
  }

  // During beta, the induction is the mandatory opening sequence: anyone who
  // hasn't completed it is routed in. `/onboarding` (outside this layout, so no
  // loop) forwards to /onboarding/beta. Flipping BETA_INDUCTION_ACTIVE off at
  // launch reverts to the non-blocking model (ADR-047). A public page is exempt so a
  // not-yet-onboarded session can still read it.
  const meta = profile.meta as { onboarding_completed?: boolean } | null
  if (BETA_INDUCTION_ACTIVE && !meta?.onboarding_completed) {
    if (isPublicView) return publicChrome()
    redirect('/onboarding')
  }

  // Effective role honours a steward's (host+) "view as" override so the whole shell
  // (nav + capabilities) previews a role under them; realRole is the true role, used
  // to show the view-as control + the roles below it. See lib/view-as.ts.
  const realRole = (profile.community_role ?? 'member') as CommunityRole

  // Request headers (host + current route) — read once and reused below.
  const reqHeaders = await headers()
  const reqPath = reqHeaders.get('x-pathname')

  // The admin scope for this page (adminScopeFor, pure) — used to load the per-scope App overrides
  // (docs/ADMIN-RAIL.md Phase 6) threaded into PageAdminProvider, mirroring loadChromeOverrides. A
  // null scope (full-viewport takeover) has nothing to manage, so no overrides load.
  const pageScope = reqPath && isSafeRoute(reqPath) ? adminScopeFor(reqPath) : null

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
    globalCaps,
    realHats,
    analyticsConsent,
    [demoMode, demoHidden, hasDemoContent],
    chromeOverrides,
    appOverrides,
    space,
    staffMember,
    operatesSpacesRaw,
    operatorContextRaw,
    marketplaceVis,
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
    // Global-scope capabilities for the standardized admin bar (docs/ADMIN-RAIL.md Phase 1), threaded
    // through PageAdminProvider. Per-entity caps ride the open event from each entity page; this is the
    // route-independent set. Request-cached + fail-closed (empty set) in the resolver.
    getGlobalCapabilities().catch((): Set<Capability> => new Set()),
    getViewerHats(),
    hasConsent(profile.id, 'analytics'),
    Promise.all([demoModeEnabled(), viewerHidesDemo(), demoContentExists()]),
    loadChromeOverrides(),
    // Per-scope App overrides for the standardized admin rail (docs/ADMIN-RAIL.md Phase 6). Loaded
    // once per request like chromeOverrides; FAIL-SAFE ({} on any error / pre-migration) so the rail
    // always falls back to the catalog defaults. A null page scope (takeover) loads nothing.
    pageScope ? loadAppOverrides(scopeKeyFor(pageScope)) : Promise.resolve({} as AppOverrides),
    resolveSpaceForHost(reqHeaders.get('host')).catch(() => null),
    getStaffMember().catch(() => null),
    // Speculative operator reads, folded in like getStaffMember above. Each is React-cached AND
    // internally fail-safe (hasOperatedSpaces → false; resolveOperatorContext → personal-only;
    // marketplaceVisibility → all-visible/fail-open), so calling them unconditionally here never
    // throws and is free on the previewing-down path where the value is discarded. Folding them
    // into this wave (rather than awaiting them serially further down) lets the theme chain start
    // earlier. The previewing-down / operator suppression is applied where each is consumed below.
    hasOperatedSpaces(profile.id),
    resolveOperatorContext({ id: profile.id, webRole: asWebRole(profile.web_role) }),
    marketplaceVisibility(),
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
  // Left-rail order/visibility (NAV-SYSTEM-REDESIGN §8, phase 3): the legacy menu_config
  // overlay is retired. lib/menus (getMenu('left')) is the surviving DB override — when a
  // left surface is seeded it owns order + hide; unseeded, the shell falls back to the
  // registry / NAV_AREAS code order (sectionsFromKeys(undefined) → the full code rail), so
  // the rail's behavior with no DB menu is unchanged.

  // Janitor previewing the logged-out experience: server caps drop to member
  // (effectiveRole), and the NAV gates as a visitor (driven by this flag).
  // Staff axis (team_members) — unlocks the Studio nav group independent of trust role
  // (ADR-027). Suppressed while previewing a lower role/visitor so the janitor "view as"
  // accurately reflects what that role sees (the speculative staff read is dropped here).
  const previewingDown = previewVisitor || effectiveRole !== realRole
  const staffRole = previewingDown ? null : (staffMember?.role ?? null)

  // Data gate for the operator "My Spaces" rail item (nav-areas requiresOperatedSpaces): does this
  // person OWN or actively ADMIN at least one Space? One cheap request-cached EXISTS probe, resolved
  // once here and threaded into the shell (never per-item). Suppressed under a downgrade / visitor
  // preview so a steward's "view as" faithfully drops the operator entry too, matching staffRole.
  const operatesSpaces = previewingDown ? false : operatesSpacesRaw

  // Staff web_role axis (ADR-208) — gates the staff-only on-page "Page" settings group
  // (admin+, the EMBEDDED-ADMIN inline layer). Suppressed under a downgrade preview so a
  // steward's "view as" faithfully hides operator chrome, matching staffRole above.
  const pageWebRole = previewingDown ? 'none' : asWebRole(profile.web_role)

  // The operator-identity context (FRAMING ONLY — lib/context/operator-context.ts). Re-derived from
  // REAL authority (owned/admin Spaces + the staff axis) and re-validates the cookie, so the chip +
  // switcher only ever offer contexts the caller genuinely has. It is purely presentational: the
  // value never feeds a gate (the manage / admin surfaces re-check real authority independently).
  // Suppressed to personal-only while previewing DOWN, so a steward's "view as" faithfully drops the
  // operator/admin framing too, exactly like staffRole + pageWebRole above. realWebRole is the TRUE
  // staff axis so the Admin context is offered to actual staff regardless of the view-as preview.
  const { context: operatorContext, available: availableContexts } = previewingDown
    ? { context: PERSONAL_CONTEXT, available: [] }
    : operatorContextRaw

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

  // The Vera launcher inputs (help index + upsell tease gate), the onboarding coach, and the
  // daily-check-in/tour are all OVERLAY chrome — none feed a redirect or the theme. Their reads
  // are pushed into their own Suspense slots below (VeraLauncherSlot / CoachOverlaySlot /
  // AutoPopupsSlot) so they stream in and never block the shell's first byte (PAGE-FRAMEWORK §5).

  // Deterministic onboarding tour state from profiles.meta.tour (ADR-047 P1). Cheap + sync (no
  // await), so it stays here and is handed to AutoPopupsSlot; the async tour reads (the flag +
  // getOnboardingStatus for `tourSatisfied`) live in that slot so they never block the shell.
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

  // Mobile stats menu body (zaps · streak · rank · journey · vault) — the same
  // progress cockpit as the desktop dock, streamed independently so it never
  // blocks the shell. The shell hosts it behind a right-edge, click-to-open menu.
  const statsPanel = (
    <Suspense fallback={null}>
      <MobileGameStats profileId={profile.id} />
    </Suspense>
  )

  // The onboarding coach (ChoresOverlay) and its next-step chain (chores + getOnboardingStatus /
  // getFounderTasks / getActiveTraining) moved into CoachOverlaySlot below — flag-guarded
  // (nextStepsEnabled ships OFF) and streamed behind its own Suspense, so it never blocks the shell.

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
      const vis = marketplaceVis
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
  // An EXPLICIT member occasion pin (set from Settings -> Appearance, incl. "Off" = 'none') WINS
  // over the DB auto-schedule, per the documented precedence (docs/THEME.md §6: a member/code pin
  // first, only then the calendar). Without this, pinning "Off" couldn't suppress an operator-
  // scheduled occasion. resolveTheme already folds the pin into theme.occasion; this only
  // distinguishes "pinned none" from "no pin" by re-reading the cookie. Fail-safe: any miss = no pin.
  let occasionPinned = false
  try {
    const jar = await cookies()
    occasionPinned = parseThemeCookie(jar.get(THEME_COOKIE)?.value).occ !== undefined
  } catch {
    /* no pin → fall through to the auto-schedule below */
  }
  const occasion =
    occasionPinned || theme.occasion !== 'none'
      ? theme.occasion
      : await resolveActiveOccasionSlug(new Date())
  // The STRUCTURE axis (docs/THEME.md): the coarse layout variant the resolved generation maps to
  // (simple / standard / dense). The shell sets it as [data-structure] alongside [data-generation],
  // so the calm/kids ends get a roomier composition and the bold preset a denser one. This is the
  // real (non-test) caller structureFor() was missing (BUILD-CATALOG §A.13 #1).
  const structure = structureFor(theme.generation)
  // The active DB skin/occasion theme as a scoped <style> (fail-safe '' until theme rows exist).
  const themeCss = await loadActiveThemeCss({ skin: theme.skin, occasion })

  return (
    <>
      {themeCss ? <style id="fx-theme" dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
    <AppShell
      skin={theme.skin}
      generation={theme.generation}
      structure={structure}
      occasion={occasion}
      brandName={activeBrandName}
      brandLogoUrl={activeBrandLogoUrl}
      chromeOverrides={chromeOverrides}
      appOverrides={appOverrides}
      webRole={pageWebRole}
      caps={previewingDown ? [] : Array.from(globalCaps)}
      profile={{ ...profile, community_role: effectiveRole }}
      realRole={realRole}
      previewVisitor={previewVisitor}
      operatorContext={operatorContext}
      availableContexts={availableContexts}
      sidebar={sidebar}
      statsPanel={statsPanel}
      ticker={ticker}
      unreadCount={unreadCount}
      permissions={permissions}
      leftMenu={leftMenu}
      navAccess={navAccess}
      staffRole={staffRole}
      operatesSpaces={operatesSpaces}
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
      <ImpersonationBanner />
      {/* Beta countdown (platform_settings.beta_ends_at) — renders nothing until an operator sets a
          date; its one cached read sits behind Suspense so it never blocks the shell. */}
      <Suspense fallback={null}>
        <BetaCountdownBanner />
      </Suspense>
      {children}
      <AchievementToastContainer />
      <ZapToastContainer />
      <PresenceHeartbeat />
      <PushRegistration />
      {/* One-time browser→home_timezone sync so the practice "day" resolves in the
          member's own tz server-side (their Log Practice buttons reset at THEIR midnight). */}
      <TimezoneSync />
      {/* Vera launcher — its help index (parsed Markdown, now React-cached) + the upsell tease
          gate resolve in their own Suspense slot, so they never block the shell's first byte. */}
      <Suspense fallback={null}>
        <VeraLauncherSlot />
      </Suspense>
      {/* Capture — the app-wide primary action (§6 Phase 2). Posts default to the
          member's wall; reachable from any page in the shell. */}
      <CaptureLauncher scopeId={profile.id} />
      {/* Support — the app-wide bug/report dialog; opened from the account menu, the
          Vera chat box, or any "Report" button via the 'open-support' event. */}
      <SupportLauncher />
      {/* Invite — the app-wide "invite friends, earn zaps" modal; opened from the
          account menu / anywhere via the 'open-invite' event. */}
      <InviteLauncher />
      {/* Onboarding coach (ChoresOverlay) — flag-guarded (ships OFF) + streamed: the chores +
          next-step reads resolve inside this slot's Suspense so they never block the shell. */}
      <Suspense fallback={null}>
        <CoachOverlaySlot profileId={profile.id} realRole={realRole} />
      </Suspense>
      <PageViewTracker />
      <ObserveProvider />
      {/* Daily check-in + onboarding tour — flag-guarded (ships OFF) + streamed: the auto-popups
          flag + getOnboardingStatus resolve inside this slot's Suspense, off the shell's path. */}
      <Suspense fallback={null}>
        <AutoPopupsSlot profileId={profile.id} tourState={tourState} />
      </Suspense>
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

// ── Overlay slots (streamed behind Suspense, off the shell's critical path) ────────────────────
// Each is overlay-only chrome — none feeds a redirect or the theme — so its reads are resolved
// here (under a <Suspense fallback={null}> in the shell) instead of blocking the shell's first
// byte. Behavior is identical to the prior inline derivations; only the timing changes.

// Vera's launcher inputs. getSearchIndex parses the help-center Markdown (now React-cached, so
// once per request) and resolvePersonalTeaseGate reads the (dormant-until-billing) upsell gate.
async function VeraLauncherSlot() {
  const [index, veraTease] = await Promise.all([
    getSearchIndex(),
    resolvePersonalTeaseGate('vera_unlimited'),
  ])
  return <VeraLauncher index={index} veraTease={veraTease} />
}

// The onboarding coach overlay. Gated on nextStepsEnabled() (ships OFF) → returns null after one
// flag read in the shipped state. When ON, the chores + next-step chain (getOnboardingStatus /
// getFounderTasks / getActiveTraining) streams in behind this slot. Mirrors the prior inline logic.
async function CoachOverlaySlot({ profileId, realRole }: { profileId: string; realRole: CommunityRole }) {
  const nextSteps = await nextStepsEnabled()
  if (!nextSteps) return null
  const chores = BETA_INDUCTION_ACTIVE ? await getProfileChores(profileId) : null
  if (!chores) return null

  // Once chores are done, Vera keeps coaching (build item 1.3): surface the single next step.
  let coachNext = chores.complete ? (await getOnboardingStatus(profileId)).current : null
  // Activation done? Hand off to Founder's First Week (build item 1.4) while it's unfinished.
  if (chores.complete && !coachNext && !(await getFounderTasks(profileId)).complete) {
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
  // Role-advancement training (ADR-157 §7) takes precedence, host+ only.
  if (chores.complete && atLeastRole(realRole, 'host')) {
    const training = await getActiveTraining(profileId)
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

  if (!(!chores.complete || !chores.rewarded || coachNext)) return null
  return <ChoresOverlay chores={chores} nextAction={coachNext} />
}

// Cues whose activation task is already done are suppressed (don't tell someone to add a photo
// they have). Only pay for the status lookup when a task-cue is still unseen.
const TASK_CUES = ['profile_face', 'circles_find', 'practice_adopt']

// Daily check-in + onboarding tour. Gated on autoPopupsEnabled() (ships OFF) → returns null after
// one flag read in the shipped state. When ON, tourSatisfied (getOnboardingStatus) streams in
// behind this slot. Mirrors the prior inline logic.
async function AutoPopupsSlot({ profileId, tourState }: { profileId: string; tourState: TourState }) {
  const autoPopups = await autoPopupsEnabled()
  if (!autoPopups) return null
  const tourSatisfied: string[] = TASK_CUES.some((id) => !tourState.seen.includes(id))
    ? (await getOnboardingStatus(profileId)).steps.filter((s) => s.done).map((s) => s.key)
    : []
  return (
    <>
      <DailyCheckIn />
      <TourProvider initialState={tourState} satisfied={tourSatisfied} />
    </>
  )
}
