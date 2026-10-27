import { viewerHidesDemo } from '@/lib/demo-preference'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getCachedUser, getCachedViewerProfile } from '@/lib/auth'
import { resolveSpaceForHost, activeVerticalsForSpace } from '@/lib/spaces'
import { hasOperatedSpaces } from '@/lib/spaces/operated'
import { VERTICALS } from '@/lib/verticals'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { announcementBannerState, countdownLabel } from '@/components/layout/announcement-banner'
import { AnnouncementBar } from '@/components/layout/announcement-bar'
import { OfferBar } from '@/components/offers/offer-bar'
import { offerBarState } from '@/lib/offers/operator-offer-server'
import { matchPublicTwin } from '@/lib/nav/public-twin'
import { getPublicCircles, getTopicalChannels } from '@/lib/discover'
import { isSafeRoute, adminScopeFor } from '@/lib/layout/page-chrome'
import { scopeKeyFor, type AppOverrides } from '@/lib/apps/overrides'
import { loadCachedChromeOverrides, loadCachedAppOverrides } from '@/lib/layout/chrome-sources'
import { loadPageSettings } from '@/lib/page-settings/store'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyMembersShell } from '@/components/frequency/members/shell/members-shell'
import {
  FrequencyAnonRightMicro,
  FrequencyAnonRightRail,
  FrequencyRightMicro,
  FrequencyRightRail,
} from '@/components/frequency/members/shell/right-rail'
import { AnonJoinGate } from '@/components/frequency/members/feed/anon-join-gate'
import { isAnonShellFeed } from '@/lib/nav/anon-feed'
import { ANON_FEED_PROFILE } from '@/lib/feed/anon-feed'
import { DEFAULT_SKIN } from '@/lib/theme/skins'
import type { DockData } from '@/components/sidebar/game-stats-dock'
// The Frequency members kit and the shell's own rules. Both are scoped to
// [data-design="frequency"] [data-kit="members"], so under DAWN they match nothing.
import '@/app/themes/active/kit-members'
import '@/app/themes/active/members-shell'
import { loadGameStats } from '@/components/sidebar/right-sidebar'
import type { CommunityRole } from '@/components/sidebar/right-sidebar'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { getMessagesUnreadCount } from '@/app/(main)/messages/popover-actions'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import type { Capability } from '@/lib/core/capabilities'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { resolveOperatorContext } from '@/lib/context/resolve-context'
import { getStaffMember } from '@/lib/staff'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo, isPaid, type AccessLevel, type Hats, type Surface } from '@/lib/core/access-matrix'
import { NAV_AREAS } from '@/lib/nav-areas'
import { AchievementToastContainer } from '@/components/achievement-toast'
import { ToastLane } from '@/components/toast-lane'
import { ZapToastContainer } from '@/components/zap-toast'
import { RewardLive } from '@/components/reward-live'
import { PresenceHeartbeat } from '@/components/presence/heartbeat'
import { PushRegistration } from '@/components/push/registration'
import { VeraLauncher } from '@/components/vera/vera-launcher'
import { resolvePersonalTeaseGate } from '@/lib/pricing/tease-gate'
import { PageViewTracker } from '@/components/analytics/track-provider'
import { ObserveProvider } from '@/components/analytics/observe-provider'
import { GaConsentGate } from '@/components/analytics/ga-consent-gate'
import { GaStaffOptOut } from '@/components/analytics/ga-staff-optout'
import { hasConsent } from '@/lib/consent/consent'
import { getSearchIndex } from '@/lib/help/content'
import { CaptureLauncher } from '@/components/feed/capture-launcher'
import { TimezoneSync } from '@/components/layout/timezone-sync'
import { SupportLauncher } from '@/components/support/support-launcher'
import { UpgradeLauncher } from '@/components/crew/upgrade-launcher'
import { InviteLauncher } from '@/components/invite/invite-launcher'
import { DailyCheckIn } from '@/components/daily-check-in'
import { atLeastRole, asWebRole, isStaff } from '@/lib/core/roles'
import { staffCan } from '@/lib/core/staff-roles'
import {
  marketplaceVisibility,
  MARKET_AREAS,
  AREA_NAV_KEY,
  AREA_PREFIX,
} from '@/lib/marketplace/visibility'
import { isAnonPublicDetail } from '@/lib/nav/public-detail-routes'
import { getMyFrequency } from '@/lib/nav/my-frequency'
import { ViewerProvider } from '@/components/layout/viewer-chrome'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

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
// Space profile, these render in the public SiteHeader chrome (no member rails), the same header
// /discover uses (SCAN-641). The CREATE flow (/events/new) and host MANAGE sub-routes stay
// members-only (proxy + this gate both exclude them).
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

// Per-route SEO overrides (ADR-268) used to live in generateMetadata here and
// read x-pathname via headers(). That call voided ISR for every child (SCAN-643).
// Pages that declare their own generateMetadata still win. Operator page_settings
// SEO is applied on those pages, not from this layout.

/**
 * The PUBLIC twin of a member detail path, for a signed-out visitor who followed a share link
 * or a QR (lib/nav/public-twin.ts explains why this is a redirect and not an opened page).
 *
 * The two lookups resolve through the SAME public reads the twin pages use, so this can never
 * find a row the twin would refuse to render: `public_circles` omits unlisted Circles and
 * `topical_channels` is filtered to active ones, so a miss returns null and the caller falls
 * through to today's `/` redirect. FAIL-SAFE: any read error is swallowed to null for the same
 * reason — a visitor landing on the home page is the behaviour we already ship, and a layout
 * that throws on the signed-out path would take down every public route with it.
 */
/** Admin and Space console routes, which carry their own Frequency chrome (components/frequency/admin). */
async function resolvePublicTwin(pathname: string | null): Promise<string | null> {
  const match = matchPublicTwin(pathname)
  if (!match) return null
  if (match.path) return match.path
  try {
    if (match.lookup === 'circle') {
      // Both routes are keyed by the SLUG now (LIVE-182), so this no longer TRANSLATES anything —
      // but the read stays, because it is the existence check. Only LISTED circles are in it,
      // which is exactly the set /discover/circles/<slug> will resolve, so a member on a circle
      // with no public twin gets null here instead of a link into a 404.
      const circles = await getPublicCircles(200)
      const hit = circles.find((c) => c.slug === match.segment)
      return hit ? `/discover/circles/${hit.slug ?? hit.id}` : null
    }
    if (match.lookup === 'channel') {
      // Member route is keyed by id, the twin by slug.
      const channels = await getTopicalChannels()
      const hit = channels.find((c) => c.id === match.segment)
      return hit ? `/discover/topics/${hit.slug}` : null
    }
  } catch {
    return null
  }
  return null
}

// Authenticated app layout. Wraps Feed, Groups, Events, Admin.
// Pages outside this group (onboarding, settings, sign-in, /people) render
// without the nav shell and do their own auth checks.
export default async function MainLayout({
  children,
  wizard,
}: {
  children: React.ReactNode
  /**
   * The `@wizard` parallel-route slot (ADR-1017). Renders a Spark OVER the page a member was on
   * when they reached it by an in-app link, and NOTHING on a cold hit — a refresh, a shared link,
   * or a crawl renders `@wizard/default.tsx` (null) here and the wizard's own full page in
   * `children`, which is the ADR-986 half of the deal. See app/(main)/@wizard/.
   *
   * It costs the shell nothing: the slot's own tree is a null default plus a null catch-all, and
   * an intercepting page only exists for the six wizard routes.
   */
  wizard: React.ReactNode
}) {
  // SCAN-643: publicChrome is defined here, but it is returned only AFTER headers() and
  // getCachedUser below, so leftover public views (Space profile tabs, the /events index)
  // still pay the auth cookie read. Accepted by ADR-1707 (SCAN-788) at the current size.
  // Sitemap share URLs for events + listings moved to app/(public)/ (no cookies/headers).
  const publicChrome = async () => {
    // A signed-out visitor on a leftover public view (a Space profile tab, the /events index) gets the public
    // Frequency chrome, exactly as app/(public)/layout.tsx does. The bodies here are members-kit bodies
    // (FqSpaceChrome, FqEventsBody) that the signed-in shell scopes with MembersKitRoot; without that scope
    // they render unstyled, so this wrapper carries the same `data-kit="members"` root on Commons.
    return (
      <ViewerProvider>
        <SiteShell surface="commons">
          {/* `.fqm-public-view` (members-shell.css) is the page: the container, the clearance under the
              fixed site header, the site canvas, and the site kit's class meanings put back (SCAN-912). */}
          <div data-kit="members" data-theme="commons" data-energy="flow" className="fqm-public-view">
            {children}
          </div>
        </SiteShell>
      </ViewerProvider>
    )
  }

  // Leftover public views still in this group (Space profile tabs, /events index).
  // headers() + getCachedUser still run here. Share event, listing, and Space
  // home / Show URLs left this group (SCAN-643, SCAN-644).
  const currentPath = (await headers()).get('x-pathname')
  const isPublicView =
    isAnonSpaceProfile(currentPath) || isAnonPublicEvent(currentPath) || isAnonPublicDetail(currentPath)

  const user = await getCachedUser()

  if (!user) {
    // THE FEED AS ANONYMOUS (SCAN-889; owner, 2026-10-14: "When a visitor goes to the feed, I want them to
    // see the actual feed with their account as Anonymous"). Under Frequency a signed-out request for the
    // bare /feed (proxy.ts lets exactly that one through, lib/nav/anon-feed.ts) renders the REAL member
    // shell around the real Feed page, with a stand-in "Anonymous" viewer: no photo, no standing, no
    // counts, no Circles, no admin. Nothing here reads for a viewer: the nav is the visitor column of the
    // access matrix (pure), the rail is the public rail, and the Feed page reads public data only
    // (lib/feed/anon-feed.ts). This layout is already a per-request render (headers() and the session read
    // above), so nothing of this visitor is cached for anyone else. The join overlay rides over it all.
    if (isAnonShellFeed(currentPath, SITE_DESIGN)) {
      const visitorNav: Record<string, AccessLevel> = Object.fromEntries(
        NAV_AREAS.map((a) => [a.key, a.surface ? accessTo(a.surface as Surface, { loggedIn: false }) : 'full']),
      )
      return (
        <div data-skin={DEFAULT_SKIN} className="contents">
          <FrequencyMembersShell
            anonymous
            profile={ANON_FEED_PROFILE}
            previewVisitor
            crew={false}
            stats={Promise.resolve(null)}
            sidebar={<FrequencyAnonRightRail />}
            sidebarMicro={<FrequencyAnonRightMicro />}
            banner={null}
            unreadCount={0}
            messagesUnread={0}
            navAccess={visitorNav}
            myFrequency={null}
            operatesSpaces={false}
            staffRole={null}
            webRole="none"
            caps={[]}
            availableContexts={[]}
            skin={DEFAULT_SKIN}
          >
            {children}
            <AnonJoinGate />
          </FrequencyMembersShell>
        </div>
      )
    }
    if (isPublicView) return publicChrome()
    // The in-app Business Spaces directory (/spaces/directory) has a PUBLIC twin at /discover/spaces.
    // Send a logged-out visitor who lands on the member URL (e.g. a shared link) to the public browse
    // instead of the generic home, so the directory is reachable without an account.
    if (currentPath === '/spaces/directory') redirect('/discover/spaces')
    // The same deal, generalised to the five entity DETAIL families that have a /discover twin
    // (Circle, Practice, Journey, Partner, Channel). A share link or QR resolves to the MEMBER
    // url, so without this the recipient of a shared Circle lands on the home page having been
    // told they were being sent to a Circle. Resolved outside the try/catch-free path on purpose:
    // resolvePublicTwin returns null rather than throwing, and null keeps today's behaviour.
    const twin = await resolvePublicTwin(currentPath)
    if (twin) redirect(twin)
    redirect('/')
  }

  // The ONE viewer profiles read of the render (ADR-1244): the same React-cached row the
  // caller resolver reads, so the roles and tier below are derived from the row this shell
  // renders. Raw DB values: `community_role` here is the TRUE role (view-as is applied below).
  const profile = await getCachedViewerProfile()

  // No profile row means the trigger hasn't run yet. Send to onboarding — unless this is a public
  // page, which stays viewable.
  if (!profile) {
    if (isPublicView) return publicChrome()
    redirect('/onboarding')
  }

  // AN ACCOUNT HOLDER IS ADMITTED (ADR-1371, ruling on OWN-072). This gate used to redirect any
  // member without `onboarding_completed` into /join — a SIGNUP funnel — on EVERY request. /join
  // is the front door for someone who does not have an account yet; marching someone who already
  // has a working one back through it answers a question they already answered, forever.
  //
  // Measured in production on 2026-09-15, the day of the ruling: SEVEN real members were being
  // re-marched on every request, admitted between 26 June and 3 September, every one of them with
  // an empty `meta` and a generated handle. The nine hand-admitted accounts of ADR-1324 had
  // already been carried through by then, so these were seven DIFFERENT people, and the set grows
  // by one every time somebody signs up and does not finish. #2553 made the funnel resumable,
  // which shortened the march; it never asked why an account holder was on it.
  //
  // So the induction is no longer a wall in the member shell. It remains the signup path — /join
  // is still where an account is created, and /onboarding still forwards there while
  // FUNNEL_INDUCTION_ACTIVE is on — but it is reached by SIGNING UP, not by being bounced out of
  // the app you already belong to. What the induction used to collect is now collected inline, the
  // way the edit rail does it (the `identity` step of the first-run checklist).
  //
  // The `!profile` branch above is a DIFFERENT case and still redirects: no profile row at all
  // means the creation trigger has not run, so there is no account to admit yet.

  // Effective role honours a steward's (host+) "view as" override so the whole shell
  // (nav + capabilities) previews a role under them; realRole is the true role, used
  // to show the view-as control + the roles below it. See lib/view-as.ts.
  const realRole = (profile.community_role ?? 'member') as CommunityRole

  // Frequency's rails and header carry the viewer's standing (streak, Zaps, Gems, rank, current
  // Journey). Started here, never awaited by the layout: the shell resolves it behind Suspense, and
  // `loadGameStats` is the same request-cached read the right rail already makes, so it costs no
  // second query.
  const fqStats = loadGameStats(profile.id).catch((): DockData | null => null)

  // Request headers (host + current route) — read once and reused below.
  const reqHeaders = await headers()
  const reqPath = reqHeaders.get('x-pathname')

  // The admin scope for this page (adminScopeFor, pure) — used to load the per-scope App overrides
  // (docs/ADMIN-RAIL.md Phase 6) threaded into PageAdminProvider, mirroring the chrome overrides. A
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
    messagesUnread,
    globalCaps,
    realHats,
    analyticsConsent,
    chromeOverrides,
    appOverrides,
    space,
    staffMember,
    operatesSpacesRaw,
    operatorContextRaw,
    marketplaceVis,
    myFrequencyRaw,
  ] = await Promise.all([
    applyViewAs(realRole),
    viewingAsVisitor(realRole),
    getUnreadCount().catch(() => 0),
    // Live Messages unread total for the header badge (surfaced on mobile too). One grouped RPC,
    // fail-safe to 0 (no badge) on any error or pre-migration.
    getMessagesUnreadCount().catch(() => 0),
    // Global-scope capabilities for the standardized admin bar (docs/ADMIN-RAIL.md Phase 1), threaded
    // through PageAdminProvider. Per-entity caps ride the open event from each entity page; this is the
    // route-independent set. Request-cached + fail-closed (empty set) in the resolver.
    getGlobalCapabilities().catch((): Set<Capability> => new Set()),
    getViewerHats(),
    hasConsent(profile.id, 'analytics'),
    // The two operator chrome tables, through the shell's CROSS-REQUEST cached readers (ADR-1243,
    // lib/layout/chrome-sources.ts): identical for every viewer, invalidated by the page-layout
    // manager's write path, FAIL-SAFE {} on any error so the code chrome map + catalog defaults win.
    loadCachedChromeOverrides(),
    // Per-scope App overrides for the standardized admin rail (docs/ADMIN-RAIL.md Phase 6). Loaded
    // once per request like chromeOverrides; FAIL-SAFE ({} on any error / pre-migration) so the rail
    // always falls back to the catalog defaults. A null page scope (takeover) loads nothing.
    pageScope ? loadCachedAppOverrides(scopeKeyFor(pageScope)) : Promise.resolve({} as AppOverrides),
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
    // Two more speculative reads folded in for the same reason as getStaffMember and the operator
    // trio above: both were the last things still awaited SERIALLY between this wave and the theme
    // chain, so each one pushed the theme (and therefore first paint) back by a full round trip.
    //
    // getMyFrequency is React-cached and internally fail-safe (any error resolves to a profile-only
    // menu). It is discarded on the previewing-down path, where the rail must not keep a steward's
    // own Spaces.
    getMyFrequency(profile.id, profile.handle),
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

  // The timed Beta offer (try-first funnel): a live countdown strip, or a one-time nudge to the offer
  // page once a new Space owner has something built. Null for everyone else, at no query.
  const offerState = previewingDown ? null : await offerBarState(profile.id, profile.meta, operatesSpaces)
  const offerBanner = offerState ? <OfferBar href="/offer" endsAtMs={offerState.endsAtMs} pending={offerState.pending} /> : null

  // MY FREQUENCY — the rail's disclosure (you, and what you run). One React-cached read, itself
  // fail-safe (any error resolves to a profile-only menu), so the rail can never block or throw on
  // it. Suppressed under a view-as downgrade / visitor preview for the same reason operatesSpaces
  // and staffRole are: a steward previewing as a member must not keep their own Spaces in the menu.
  const myFrequency = previewingDown ? null : myFrequencyRaw

  // Staff web_role axis (ADR-208) — gates the staff-only on-page "Page" settings group
  // (admin+, the EMBEDDED-ADMIN inline layer). Suppressed under a downgrade preview so a
  // steward's "view as" faithfully hides operator chrome, matching staffRole above.
  const pageWebRole = previewingDown ? 'none' : asWebRole(profile.web_role)
  // Keep an operator's own browsing out of Google Analytics. Gated on the TRUE web role (not the
  // view-as-downgraded pageWebRole), so previewing as a member does not re-enable tracking. GaStaffOptOut
  // persists the opt-out in the browser so even future first-paints are excluded before the page_view.
  const gaStaffExcluded = isStaff(asWebRole(profile.web_role))

  // The operator-identity context (FRAMING ONLY — lib/context/operator-context.ts). Re-derived from
  // REAL authority (owned/admin Spaces + the staff axis) and re-validates the cookie, so the chip +
  // switcher only ever offer contexts the caller genuinely has. It is purely presentational: the
  // value never feeds a gate (the manage / admin surfaces re-check real authority independently).
  // Suppressed to personal-only while previewing DOWN, so a steward's "view as" faithfully drops the
  // operator/admin framing too, exactly like staffRole + pageWebRole above. realWebRole is the TRUE
  // staff axis so the Admin context is offered to actual staff regardless of the view-as preview.
  const availableContexts = previewingDown ? [] : operatorContextRaw.available

  // Page status & visibility (ADR-269) moved into the parallel theme wave below —
  // the read overlaps resolveTheme/cookies instead of serializing ahead of them,
  // and the redirect decision still lands before anything renders.

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

  // The Vera launcher inputs (help index + upsell tease gate) are OVERLAY chrome — they feed
  // neither a redirect nor the theme — so their reads are pushed into VeraLauncherSlot below and
  // stream in without blocking the shell's first byte (PAGE-FRAMEWORK §5).
  //
  // ONE ONBOARDING ENGINE (LIVE-240). The shell used to mount two more: the chores / Founder's
  // First Week coach (CoachOverlaySlot, gated `next_steps_enabled`) and the deterministic
  // coachmark tour (TourProvider, gated `auto_popups_enabled`). Both were dark, and both named
  // the operator-authored Walkthroughs suite as their successor in their own comments. They are
  // deleted rather than left flagged off: a dark engine is indistinguishable from a deleted one
  // except that it still has to be read, maintained and reasoned about. Walkthroughs is the
  // surviving engine — it renders where it was designed to, as a gentle card in the feed
  // (components/walkthroughs/feed-walkthrough.tsx), never as an overlay the shell throws at a
  // member. What is left here is the daily check-in, which is a rewards heartbeat, not onboarding.

  // Apply the active Space for this host (resolved in the parallel wave above): use its skin
  // AND hide vertical nav the Space hasn't switched on (ADR-249/250 step 6). Resilient: a null
  // space (lookup failure / pre-migration) falls back to the default skin + no vertical filtering
  // (the current look). The root space enables every vertical, so this filtering is a no-op there
  // — it only narrows nav for a non-root sub-brand Space. (chromeOverrides also came from the wave.)
  let activeSkin = 'default'
  let activeGeneration: string | null = null
  try {
    if (space) {
      activeSkin = space.skin
      // `spaces.generation` is the operator's GENERATION (feel) default (20260707000000_spaces_generation.sql).
      // Read via an untyped cast until lib/spaces maps the column onto Space (the codebase pattern for a
      // freshly-added column); null = no Space default, so resolveTheme falls back to DEFAULT_GENERATION.
      activeGeneration = (space as { generation?: string | null }).generation ?? null
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

  // The former serial tail (page-settings gate → theme → occasion pin → auto-occasion),
  // now ONE parallel wave — none of the four reads depends on another. resolveTheme keeps
  // the documented precedence (docs/THEME.md §6): the member's `fxtheme` cookie over the
  // Space default over the system default; the pin re-read only distinguishes "pinned
  // none" from "no pin". The auto-occasion read runs unconditionally here (instead of
  // conditionally after the theme resolves) so it overlaps too; its value is used only
  // when there is no pin and no explicit occasion. All fail-safe. The per-request
  // cookie + DB-theme reads live HERE, not in the root layout, so public marketing/
  // discover pages stay static (app/layout.tsx).
  const [theme, pageGate, announcement] = await Promise.all([
    resolveTheme({ spaceSkin: activeSkin, spaceGeneration: activeGeneration }),
    // Page status & visibility (ADR-269): DRAFT / min-role gating from page_settings.
    // LOCKOUT-PROOF + FAIL-SAFE exactly as before: staff always pass, errors mean no
    // gate, and /feed itself is never gated so a mis-set home can't loop.
    reqPath && reqPath !== '/feed' && isSafeRoute(reqPath) && !isStaff(pageWebRole)
      ? loadPageSettings(reqPath).catch(() => null)
      : Promise.resolve(null),
    // The beta countdown's date, read HERE rather than inside the banner (ADR-1030). It rides this
    // wave, so it costs no wall-clock — five reads were already in flight. What it buys is that the
    // shell knows whether a banner is coming BEFORE it renders: the banner ships in the first flush
    // and reserves its own height, instead of arriving late behind a `fallback={null}` and shoving
    // the page down. Null when unset, unreadable, or already past; fail-safe throughout.
    announcementBannerState(),
  ])
  if (pageGate) {
    const draftHidden = pageGate.status === 'draft'
    const roleHidden =
      !!pageGate.visibility_role &&
      !atLeastRole(effectiveRole, pageGate.visibility_role as CommunityRole)
    if (draftHidden || roleHidden) redirect('/feed')
  }
  // The app-wide overlays and launchers every member page carries, under the member shell.
  const shellChildren = (
    <>
      <GaConsentGate disabled={!analyticsConsent || gaStaffExcluded} />
      {gaStaffExcluded && <GaStaffOptOut />}
      <ImpersonationBanner />
      {children}
      {/* The Spark modal slot (ADR-1017). Sits beside the page rather than inside it, next to the
          app's other overlay launchers below, because a wizard opened over a page is chrome, not
          that page's content. It portals to the body, so its position here costs nothing. */}
      {wizard}
      {/* ONE bottom-right toast lane. Both stacks used to declare their own identical `fixed`
          box at z-50, so they claimed the same rect and both sat under the Vera panel — a reward
          toast fired with Vera open was never seen. components/toast-lane.tsx owns the geometry. */}
      <ToastLane>
        <AchievementToastContainer />
        <ZapToastContainer />
      </ToastLane>
      <PresenceHeartbeat />
      {/* LIVE-671: a reward earned on another device shows here without a reload. Not while a
          staff member previews as a visitor or another role: the feed is the REAL viewer's. */}
      {!previewingDown && <RewardLive profileId={profile.id} />}
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
      {/* Upgrade — the app-wide Crew upsell prompt; raised by every feature gate, the rail's Upgrade
          tab, or anywhere else that finds a member reaching past their scope, via `openUpgrade()`. */}
      <UpgradeLauncher />
      {/* Invite — the app-wide "invite friends, earn zaps" modal; opened from the
          account menu / anywhere via the 'open-invite' event. */}
      <InviteLauncher />
      <PageViewTracker />
      <ObserveProvider />
      {/* Daily check-in — the once-a-day server action that pays the visit gems and ticks the
          streak, plus its celebration toast. Rewards feedback, not an onboarding engine. */}
      <DailyCheckIn />
    </>
  )

  return (
    <>
      {/* ── THE DENSITY AXIS COULD NOT REACH THE ELEMENT THAT READS IT ────────────────────────
          `[data-generation]` is set on the SHELL ROOT (components/layout/app-shell.tsx), and each of the
          eight preset blocks in app/globals.css declares `--density-root` (spacious 112.5%, bold
          103%, kids 115%, and so on). But the only rule that consumes it is

              html { font-size: var(--density-root, 106.25%); }

          and custom properties inherit DOWNWARD only. A variable declared on a div inside <body>
          is invisible to <html>, so every preset's density number resolved to the 106.25% fallback
          and the whole axis was inert — on all eight presets, since the day it shipped. Nothing
          threw, nothing looked broken, and the Theme Studio happily offered a Density control
          (components/admin/theme-studio/tokens.ts) that moved a number nothing read. The other
          feel tokens were fine: `--type-scale`, `--radius-*`, `--motion-*`, `--ornament` and
          `--tap-min` are all read by descendants of the shell root, which is why only this one axis
          was dead and why it stayed dead so quietly.

          `rem` resolves against the ROOT element and nothing else, so the fix has to put the
          attribute on <html>. It CANNOT move to app/layout.tsx: line ~627 of this file records the
          deliberate reason the per-request cookie and DB-theme reads live here and not there —
          resolving the theme in the root layout would make every public marketing and /discover
          page dynamic. So the resolved value is stamped from here, synchronously, by a script that
          the browser executes as it parses this chunk (the same mechanism app/layout.tsx already
          uses to restore `data-skin` from localStorage before first paint). No flash: the value is
          server-resolved and the write happens before the shell below it is parsed.

          The shell root keeps its own `data-generation`. Both matching is harmless — same attribute,
          same value, and the inner declaration simply wins inside the shell — and it means the
          tokens now also reach UI PORTALED to document.body (toasts, dialogs, the view-as popover),
          which sat outside the shell root and had been getting baseline feel tokens all along.

          `balanced` is an explicit no-op preset, so a default install renders byte-identically;
          only a member or Space that actually chose a preset sees anything change. */}
      <script
        // The injected value is a server-resolved id from a closed registry (lib/theme/generations,
        // passed through `resolveGeneration`'s guard) and JSON-encoded on the way in, so no member
        // string reaches this sink. The `themeCss` <style> directly above takes the same shape.
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-generation',${JSON.stringify(theme.generation)})`,
        }}
      />
      {/* The member shell is the Frequency design's own chrome (components/frequency/members/shell, the design
          handoff's shell.js + Feed rails). ALWAYS the member shell, console routes included: a layout does
          not re-render on a client navigation, so a bare console render would strand the next member page
          without its chrome (and a member render would wrap the console in a second header). The shell
          reads the live path and steps aside on console routes itself (lib/nav/console-route.ts: kit root
          `data-console`, rail layout edge mode), so the console's own chrome stands alone on every move.
          The member's theme (Settings, Appearance: Frequency or Midnight) is [data-skin] on a box-less
          wrapper, so the kit's tokens re-resolve for everything inside the shell (app/themes/frequency.css). */}
      <div data-skin={theme.skin} className="contents">
      <FrequencyMembersShell
        profile={{ ...profile, community_role: effectiveRole }}
        previewVisitor={previewVisitor}
        crew={!previewingDown && isPaid(realHats.tier)}
        stats={fqStats}
        sidebar={
          <FrequencyRightRail
            profileId={profile.id}
            role={effectiveRole}
            pathname={reqPath ?? ''}
            stats={fqStats}
          />
        }
        sidebarMicro={<FrequencyRightMicro profileId={profile.id} stats={fqStats} />}
        banner={
  offerBanner ?? (announcement ? (
            <AnnouncementBar message={announcement.message} countLabel={countdownLabel(announcement.ends)} />
          ) : null)
        }
        unreadCount={unreadCount}
        messagesUnread={messagesUnread}
        navAccess={navAccess}
        myFrequency={myFrequency}
        operatesSpaces={operatesSpaces}
        staffRole={staffRole}
        webRole={pageWebRole}
        caps={previewingDown ? [] : Array.from(globalCaps)}
        appOverrides={appOverrides}
        chromeOverrides={chromeOverrides}
        accountTools={{ realRole, currentRole: effectiveRole, previewVisitor, context: previewingDown ? { kind: 'personal' } : operatorContextRaw.context, available: availableContexts, demoHidden: await viewerHidesDemo() }}
        availableContexts={availableContexts}
        skin={theme.skin}
      >
        {shellChildren}
      </FrequencyMembersShell>
      </div>
    </>
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

