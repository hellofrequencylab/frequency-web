// Single source of truth for a page's SHELL CHROME — which right rail (if any)
// frames it. The app shell (components/layout/app-shell.tsx) reads this; pages
// never reach into the shell to toggle the rail. To reframe a route, edit the
// lists here — that is the entire API.
//
//   'global'  → the community right rail. The default for browse / stream /
//               dashboard pages.
//   'scoped'  → the global rail is suppressed because the entity DETAIL page
//               renders its OWN scope rail in-body (avoids the double-rail trap).
//   'none'    → FOCUS: a centered, full-width work surface with no rail —
//               compose / edit forms, settings, single-conversion + scan-confirm
//               utilities, and the operator / steward workspaces.
//
// Pairs with the page templates: a 'none' route renders <FocusTemplate>, a
// 'global'/'scoped' page renders <IndexTemplate>/<StreamTemplate>/<DetailTemplate>/
// <DashboardTemplate>. Keep the two in sync — the chrome here and the template
// there are two halves of the same decision (see docs/PAGE-FRAMEWORK.md §3).

import { cache } from 'react'

export type Rail = 'global' | 'scoped' | 'none'

// FOCUS — no right rail. Prefix match (covers the route and everything under it).
// Kept deliberately small: only genuine single-task surfaces (narrow forms, single
// conversion / claim cards) go full-width. Operator/steward DASHBOARDS (Marketing,
// CRM, Entry points, Outreach…) keep the uniform slim stats rail like the rest of
// the app — the rail is now a thin strip, so there's no double-rail/clutter cost,
// and members asked for a consistent right column site-wide.
const FOCUS_PREFIXES = [
  '/settings', // narrow account forms
  '/on-air', // the practice timer takeover (ADR-229) — breathe with zero chrome
  '/codes', // personal codes / QR hub (a single centered card)
  '/founder', // Founder's First Week checklist (build item 1.4)
  '/journal', // your Capture daily-log (build item §6 Phase 3)
  '/training', // role-advancement training (ADR-157 §7)
  '/upgrade', // single conversion card
  '/g/', // gift-a-zap confirm
  '/n/', // scan-landing claim
  '/scan', // the in-app QR scanner (ADR-235) — full camera takeover
]

// FOCUS by pattern — compose / edit surfaces that live one segment deep, plus the
// message threads. The section INDEX (e.g. /messages, /connections) keeps the
// rail; only the nested work surface goes full-width.
const FOCUS_PATTERNS: RegExp[] = [
  /^\/messages\/.+/, // a DM or room thread (the /messages inbox keeps the rail)
  /^\/events\/new$/, // create an event
  /^\/events\/scan$/, // capture an event poster (scan-confirm flow)
  /^\/events\/drafts(\/.+)?$/, // captured-event drafts + the draft editor
  // The event Invite page (/events/[slug]) owns its own two-column interior (wide
  // Post area + sticky Join aside); the global rail is suppressed to avoid the
  // double-rail trap (EVENTS-DESIGN §1). NOT a Focus form — a Detail page that
  // simply needs the full width. [^/]+ keeps it to the single slug segment, so
  // /events/[slug]/event.ics and /events/[slug]/manage are NOT matched here
  // and keep their own treatment; the negative lookahead re-excludes the sibling
  // Focus routes above it belt-and-suspenders.
  /^\/events\/(?!new$|scan$|drafts(\/|$))[^/]+$/,
  // The host Manage Dashboard (EVENTS-REWORK A2) is a metric-led operator surface
  // rendered with <DashboardTemplate> — Focus chrome (no rail), the operator
  // sibling of /admin. One segment deep under the slug.
  /^\/events\/[^/]+\/manage$/,
  /^\/practices\/[^/]+\/edit$/, // edit a practice
  /^\/connections\/.+/, // a contact editor / new contact (the index keeps the rail)
  // Entity-space Focus surfaces (ENTITY-SPACES-BUILD §B.5): the provisioning wizard and the owner
  // profile-settings surface are centered, no-rail FOCUS pages (FocusTemplate). The PROFILE itself
  // (/spaces/<slug> + tabs) now keeps the GLOBAL community rail (operator request — see SCOPED_PREFIXES
  // below, now empty); the directory (/spaces) keeps the global rail too.
  /^\/spaces\/new$/, // the provisioning wizard (Epic 1.6)
  /^\/spaces\/invite\/[^/]+$/, // the tokened invite-accept landing (space_invites) — a Focus card
  /^\/spaces\/[^/]+\/settings$/, // the owner profile-settings surface (Epic 1.7)
  /^\/spaces\/[^/]+\/settings\/availability$/, // the owner 1:1 availability editor (booking v1)
  /^\/spaces\/[^/]+\/settings\/memberships$/, // the owner membership tier editor (memberships v1)
  /^\/spaces\/[^/]+\/settings\/members$/, // the owner team / members surface (owner hub)
  /^\/spaces\/[^/]+\/settings\/qr$/, // the owner QR studio (codes + splash, Phase 2)
  /^\/spaces\/[^/]+\/settings\/crm$/, // the owner per-space CRM (pipeline + contacts + client notes, Phase 2)
  /^\/spaces\/[^/]+\/settings\/checkin$/, // the owner check-in roster (Event Space check-in, Phase 2)
  /^\/spaces\/[^/]+\/settings\/email$/, // the owner email / campaign composer (Phase 3)
]

// SCOPED — entity-detail sections that render their OWN in-body scope rail
// (the double-rail trap is avoided by suppressing the global rail). Nothing is
// scoped today: every section (including member PROFILES) keeps the GLOBAL community
// rail — the site's right rail is always present. A profile's own standing +
// Frequency Signature live in its interior content column, not a rail. Re-add a
// prefix here only if a section grows a genuine in-body rail.
const SCOPED_PREFIXES: string[] = [
  // The entity-space PROFILE (/spaces/<slug> + tabs) now keeps the GLOBAL community rail like the
  // rest of the app (operator request): a profile reads as a normal Detail page beside the site's
  // Quest rail, not a suppressed-rail island. Its context band lives in the interior content column
  // (a hero CARD, not a shell rail), so there is no double-rail trap to avoid. The profile therefore
  // falls through to 'global' below; the wizard (/spaces/new) and the owner settings sub-surfaces
  // (/spaces/<slug>/settings*) stay Focus ('none', matched in FOCUS_PATTERNS above), and the
  // directory (/spaces) was always global. Re-add '/spaces/' here only if the profile ever grows a
  // genuine in-body scope rail of its own.
  // (Empty otherwise.) Journeys used to be SCOPED: the old course-player detail page rendered its
  // own left syllabus as a scope rail, so the global rail was suppressed. After the v2
  // rebuild (ADR-252) that player is retired — /journeys/<slug> redirects to the learner
  // player (/learn) or the editor (/edit), and the player's syllabus is an in-content
  // pane, not a shell rail. So journey routes now keep the standard GLOBAL community rail
  // like the rest of the app. Re-add a prefix here only if a section grows a real in-body rail.
]

// The global MEMBER left rail (the one site menu) frames EVERY in-app page now,
// including the admin workspace (owner directive): admin uses the same left menu as
// the rest of the site, with the Admin section gated by role. No route swaps the left
// rail today; a future full-takeover surface could add its prefix here to mount its
// own left nav — never path-sniff in the shell. (Admin still drops the member RIGHT
// rail via `railFor`, so the admin info rail owns the right column.)
const LEFT_WORKSPACE_PREFIXES: readonly string[] = []

export type LeftRail = 'global' | 'none'

/** Whether the global MEMBER left rail (the one site menu) frames a page. 'global'
 *  everywhere today; 'none' only if a route mounts its OWN left nav (none currently). */
export function leftRailFor(pathname: string): LeftRail {
  const inWorkspace = LEFT_WORKSPACE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return inWorkspace ? 'none' : 'global'
}

/** Whether `pathname` is a syntactically safe app path to use as an override key —
 *  an absolute path of slug-ish segments (`/`, letters, digits, `-`, `_`). Guards the
 *  override store so a route can never be an external URL, a query string, or anything
 *  that isn't a normal in-app route. */
export function isSafeRoute(pathname: string): boolean {
  return typeof pathname === 'string' && /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(pathname)
}

export function railFor(pathname: string): Rail {
  // The Leader surface (/lead/*) is a member-side CONSOLIDATED dashboard (not the
  // /admin operator workspace), so it rides the standard GLOBAL community right rail
  // — it is intentionally absent from FOCUS/SCOPED below and falls through to
  // 'global' at the end. Registered here so the decision is explicit (PAGE-FRAMEWORK
  // §3): a leader keeps the member chrome, unlike /admin which drops both rails.

  // The admin workspace keeps the global LEFT menu (the one site nav) but drops the
  // member community RIGHT rail: the admin layout (app/(main)/admin/layout.tsx) mounts
  // its own operator info rail on the right, so the member right rail is suppressed.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'none'

  // The profile editor keeps the standard community rail even though it lives under
  // /settings (otherwise Focus): editing your profile is a "me" surface, so the
  // identity/standings rail belongs beside it (ADR-117). Overrides the prefix below.
  if (pathname === '/settings/profile') return 'global'

  const isFocus =
    FOCUS_PREFIXES.some((p) => pathname.startsWith(p)) ||
    FOCUS_PATTERNS.some((re) => re.test(pathname))
  if (isFocus) return 'none'

  const isScopedDetail = SCOPED_PREFIXES.some(
    (s) => pathname.startsWith(s) && pathname.length > s.length,
  )
  if (isScopedDetail) return 'scoped'

  return 'global'
}

// MINI rail — routes that keep the GLOBAL community rail but START it COLLAPSED to a thin
// strip, with an expand toggle at the rail's foot. The rail is NEVER removed (owner directive:
// "the right rail stays") — these are immersive build surfaces (the Journey course builder)
// that want the full center width by default while keeping the rail one tap away. railFor still
// returns 'global' for these, so every "rail stays" guarantee and the whole chrome-override
// model are untouched; this is a separate, additive hint the shell reads to pick the rail's
// DEFAULT width. Pattern match (one segment deep, the edit surface only).
const MINI_RAIL_PATTERNS: RegExp[] = [
  /^\/journeys\/[^/]+\/edit$/, // the Journey course builder (full-page editor)
]

/** Whether a page's GLOBAL rail should START collapsed to a mini strip (an expand toggle at the
 *  rail's foot restores it). Only meaningful where `railFor === 'global'`. Never suppresses the
 *  rail: collapse is reversible and the rail is always mounted. Pure + client-safe like railFor. */
export function railStartsCollapsed(pathname: string): boolean {
  return MINI_RAIL_PATTERNS.some((re) => re.test(pathname))
}

// ── Operator overrides (back-end chrome management) ────────────────────────────────────
//
// The block above is the CODE source of truth and stays UNCHANGED. What follows is an
// ADDITIVE, fail-safe layer that lets an operator override a route's right rail from the
// back end (/admin/page-layout → public.page_chrome_overrides), merged OVER the code default.
//
// LIVE: the shell reads these overrides. `(main)/layout.tsx` loads them server-side via
// `loadChromeOverrides()` and passes the map to `app-shell.tsx`, which resolves the right
// rail with `mergeChrome(railFor(pathname), chromeOverrides, pathname)`. `resolvePageChrome`
// is the equivalent async server-side resolver, available for server callers. Fail-safe
// throughout (no override / missing table → the code default). See docs/PAGE-FRAMEWORK.md §3/§8.

/** The routes an operator can frame from /admin/page-layout. The code map keys off
 *  PREFIXES + PATTERNS, so there is no finite list of every concrete path; this is the
 *  curated catalog of the meaningful surfaces (and Focus exemplars) an operator manages,
 *  each shown with its current effective rail. Adding a route here adds a manageable row;
 *  an override can also be set on any other safe route via the resolver. */
export interface ManagedRoute {
  /** The override key + match path (an exact route or an area root). */
  route: string
  /** A short operator-facing label. */
  label: string
  /** Which area of the app this belongs to (groups the editor). */
  area: 'Member' | 'Focus surfaces' | 'Operator'
}

export const MANAGED_ROUTES: readonly ManagedRoute[] = [
  // ── Member surfaces (default GLOBAL community rail) ──
  { route: '/feed', label: 'Home feed', area: 'Member' },
  { route: '/circles', label: 'Circles', area: 'Member' },
  { route: '/channels', label: 'Channels', area: 'Member' },
  { route: '/events', label: 'Events', area: 'Member' },
  { route: '/people', label: 'People', area: 'Member' },
  { route: '/spaces', label: 'Spaces (directory)', area: 'Member' },
  { route: '/practices', label: 'Practices', area: 'Member' },
  { route: '/journeys', label: 'Journeys', area: 'Member' },
  { route: '/programs', label: 'Programs', area: 'Member' },
  { route: '/messages', label: 'Messages (inbox)', area: 'Member' },
  { route: '/connections', label: 'Connections (index)', area: 'Member' },
  { route: '/friends', label: 'Friends', area: 'Member' },
  { route: '/search', label: 'Search', area: 'Member' },
  { route: '/broadcast', label: 'Broadcast', area: 'Member' },
  { route: '/crew', label: 'Crew', area: 'Member' },
  { route: '/outreach', label: 'Outreach', area: 'Member' },
  { route: '/lead', label: 'Leadership', area: 'Member' },
  { route: '/lead/training-library', label: 'Leader Training', area: 'Member' },
  // ── Focus surfaces (default NONE — full-width, no rail) ──
  { route: '/settings', label: 'Settings', area: 'Focus surfaces' },
  { route: '/settings/profile', label: 'Profile editor', area: 'Focus surfaces' },
  { route: '/on-air', label: 'On Air (practice timer)', area: 'Focus surfaces' },
  { route: '/scan', label: 'QR scanner', area: 'Focus surfaces' },
  { route: '/codes', label: 'Personal codes / QR hub', area: 'Focus surfaces' },
  { route: '/journal', label: 'Journal (Capture)', area: 'Focus surfaces' },
  { route: '/training', label: 'Role training', area: 'Focus surfaces' },
  { route: '/upgrade', label: 'Upgrade', area: 'Focus surfaces' },
  // ── Operator workspace (default NONE — full-width admin) ──
  { route: '/admin', label: 'Admin workspace', area: 'Operator' },
] as const

export type ChromeOverrides = Record<string, Rail>

/** All operator chrome overrides as a plain map (route → rail). Service-role read so it
 *  works regardless of the caller's RLS context; REQUEST-CACHED via React.cache so it
 *  runs at most once per request. FAIL-SAFE: returns `{}` on ANY error (incl. a missing
 *  table pre-migration), so the resolver always falls back to the code defaults and the
 *  app never breaks. The dynamic import keeps this server-only dependency out of the
 *  module's top level (railFor/leftRailFor stay pure, client-safe). */
export const loadChromeOverrides = cache(async (): Promise<ChromeOverrides> => {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // The result payload is re-validated below (isSafeRoute/isRail) before use.
    const db = createAdminClient()
    const { data, error } = await db.from('page_chrome_overrides').select('route, rail')
    if (error) return {}
    const out: ChromeOverrides = {}
    for (const row of data ?? []) {
      if (isSafeRoute(row.route) && isRail(row.rail)) out[row.route] = row.rail
    }
    return out
  } catch {
    return {}
  }
})

/** True if `value` is a valid Rail. */
export function isRail(value: unknown): value is Rail {
  return value === 'global' || value === 'scoped' || value === 'none'
}

/** Merge an operator override (exact-route match) over the code default. Pure — no
 *  Supabase/React — so it is trivially testable: a DB override for the exact `route`
 *  wins; otherwise the code answer (`codeRail`, i.e. railFor(route)) stands. */
export function mergeChrome(codeRail: Rail, overrides: ChromeOverrides, route: string): Rail {
  const override = overrides[route]
  return override && isRail(override) ? override : codeRail
}

/** The EFFECTIVE rail for a route: the operator override if one exists, else the code
 *  default (railFor). The async, override-aware twin of `railFor`, for SERVER callers
 *  that want the resolved rail in a single call. NOTE: the shell does NOT route through
 *  this wrapper — it already applies overrides inline as `mergeChrome(railFor(pathname),
 *  chromeOverrides, pathname)` in `app-shell.tsx` (the map is loaded once per request in
 *  `(main)/layout.tsx`), so operator overrides ARE live in rendering. This is the
 *  convenience entry point for any other server caller that needs the same answer. */
export async function resolvePageChrome(route: string): Promise<Rail> {
  const overrides = await loadChromeOverrides()
  return mergeChrome(railFor(route), overrides, route)
}
