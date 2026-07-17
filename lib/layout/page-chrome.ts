// Single source of truth for a page's SHELL CHROME — which right rail (if any)
// frames it. The app shell (components/layout/app-shell.tsx) reads this; pages
// never reach into the shell to toggle the rail. To reframe a route, edit the
// lists here — that is the entire API.
//
//   'global'  → the community right rail. The DEFAULT for every member page now
//               (owner directive, 2026-06-20: the right rail shows site-wide) —
//               browse / stream / dashboard AND compose / edit / settings surfaces.
//   'scoped'  → the global rail is suppressed because the entity DETAIL page
//               renders its OWN scope rail in-body (avoids the double-rail trap).
//   'none'    → no right rail. Reserved for just two cases: the /admin/* operator
//               workspace (it mounts its OWN info rail — no double-railing) and the
//               full-viewport takeovers (the practice timer, scanner, auth gate,
//               print sheet) that read with zero app chrome.
//
// Pairs with the page templates: a Focus compose/edit page still renders
// <FocusTemplate> (a centered, no-side-content body) — it just keeps the global rail
// beside it now; a 'global'/'scoped' browse page renders <IndexTemplate>/
// <StreamTemplate>/<DetailTemplate>/<DashboardTemplate> (see docs/PAGE-FRAMEWORK.md §3).

import { cache } from 'react'
import type { ScopeKind } from '@/lib/admin/modules/registry'
import type { SpaceType } from '@/lib/spaces/types'

export type Rail = 'global' | 'scoped' | 'none'

// FULL-VIEWPORT TAKEOVERS — the ONLY member-side routes that drop the right rail
// (owner directive, 2026-06-20: "the right rail shows on every page"). These are
// genuine zero-chrome takeovers, not merely narrow forms: the practice timer, the
// camera scanner, the auth gate, and the print sheet. EVERYTHING else a member, host,
// or owner touches — settings, compose/edit forms, message threads, the Space
// directory + Space settings, codes/journal/upgrade and the rest — now keeps the
// GLOBAL community rail. (The /admin/* operator workspace is handled separately below:
// it mounts its OWN info rail, so the member rail is suppressed there to avoid double-
// railing.) Prefix match covers the route and everything beneath it.
const FULL_TAKEOVER_PREFIXES = [
  '/on-air', // the practice timer takeover (ADR-229) — breathe with zero chrome
  '/scan', // the in-app QR scanner (ADR-235) — full camera takeover
  '/sign-in', // the auth gate — a centered card, no app chrome
  '/print', // print sheets (e.g. /print/qr) — a paper surface, no rail
]

// FOCUS surfaces — centered, no-rail single-task flows that compose <FocusTemplate>
// (a form, a single decision). They keep the global LEFT menu but drop the member
// RIGHT rail so the form reads centered. Growth OS Engine 3 (ADR-456): the apply
// flows (/apply, /apply/<track>) and the seeker waitlist (/waitlist) are such flows.
const FOCUS_NONE_PREFIXES: readonly string[] = ['/apply', '/waitlist']

// SCOPED — entity-detail sections that render their OWN in-body scope rail
// (the double-rail trap is avoided by suppressing the global rail). Nothing is
// scoped today: every section (including member PROFILES) keeps the GLOBAL community
// rail — the site's right rail is always present. A profile's own standing +
// Frequency Signature live in its interior content column, not a rail. Re-add a
// prefix here only if a section grows a genuine in-body rail.
const SCOPED_PREFIXES: string[] = [
  // The entity-space PROFILE (/spaces/<slug> + tabs) keeps the GLOBAL community rail like the rest
  // of the app (operator request): a profile reads as a normal Detail page beside the site's Quest
  // rail, not a suppressed-rail island. Its context band lives in the interior content column (a
  // hero CARD, not a shell rail), so there is no double-rail trap to avoid. EVERY /spaces route now
  // falls through to 'global' below — the directory (/spaces/directory), the provisioning wizard (/spaces/new),
  // the invite landing, AND the owner settings sub-surfaces (/spaces/<slug>/settings*): the right
  // rail shows site-wide (owner directive, 2026-06-20). The settings sub-pages still compose
  // <FocusTemplate> for a centered body; they just keep the rail beside it. Re-add '/spaces/' here
  // only if the profile ever grows a genuine in-body scope rail of its own.
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

// FULL-WIDTH DASHBOARD surfaces — member-side operator workspaces that compose <DashboardTemplate>
// and genuinely need the full center width because their body SCROLLS HORIZONTALLY and would fight a
// right rail. These keep the global LEFT menu but drop the member RIGHT rail, like /admin's own
// dashboard. Today the ONLY one is a Space's own CRM board (/spaces/<slug>/crm), a paid per-Space
// pipeline workspace (CRM-STRATEGY P3) with a horizontal stage board, distinct from the Focus
// settings/crm notes surface. Pattern match (one slug deep).
//
// NOTE (ADR-471, owner directive: "the right rail shows on every page"): the entity OWNER CONSOLES
// (/{entity}/[id]/manage, ADR-441/469) are NO LONGER here. They are a vertical GRID of section cards,
// not a horizontal board, so they read correctly beside the community rail (the rail fills what was an
// empty right gutter). They fall through to 'global' below like every other member surface. Only a
// surface whose body truly scrolls sideways belongs in this list.
const DASHBOARD_NONE_PATTERNS: RegExp[] = [
  // NOTE: the Space CRM board (/spaces/<slug>/crm) USED to drop the right rail here (a horizontal stage
  // board reads edge to edge). Owner directive (2026-07): the CRM keeps the GLOBAL community rail like
  // every other member surface — its default People/Cockpit views are vertical and read fine beside the
  // rail, and the Pipeline view simply scrolls horizontally within its (narrower) column. So it now
  // falls through to 'global' in railFor; only the full-WIDTH editors below still drop the rail.
  // The Space LANDING editor (/spaces/<slug>/edit-page, ADR-476/472) is a FULL-WIDTH editor: it drops
  // BOTH rails so the Puck builder (left components · canvas · right fields) uses the whole width, but
  // it KEEPS the site header (owner directive, 2026-07: "full page with the main header still
  // showing") — so it is NOT a full-viewport takeover (which also hides the header). The header-keeping
  // + left-nav-dropping half lives in isFullWidthEditor + the shell; this entry drops the right rail.
  /^\/spaces\/[^/]+\/edit-page$/,
  // The Space MARKETING email editor (/spaces/<slug>/marketing, Email in the Business CRM P1): a two-pane
  // on-canvas email editor (block list + settings LEFT, live email canvas RIGHT). Like the CRM board it reads
  // best edge to edge, so it keeps the left menu but drops the member right rail. Pattern match (one slug deep).
  /^\/spaces\/[^/]+\/marketing$/,
  // The MARKETING page editor (/edit/<slug>, ADR-508 U4-A) is the same kind of FULL-WIDTH editor as the
  // Space landing editor: the in-house Puck-free builder (components/page-editor/editor.tsx) fills the
  // whole width, so both rails drop, but the site header STAYS (owner directive: "fullscreen experience
  // with the main header still visible"). The header-keeping + left-nav-dropping half lives in
  // isFullWidthEditor + the shell; this entry drops the right rail.
  /^\/edit\/[^/]+$/,
  // NOTE (ADR-522 follow-up): the "Build your Spotlight" Puck editor (/settings/profile/spotlight) USED to
  // be a full-viewport takeover here. It is retired — that route now just redirects owners to the in-rail
  // grid builder on their own profile (/people/<handle>), which keeps the standard global rail. So it no
  // longer drops any chrome and is intentionally absent from this list.
]

// FULL-VIEWPORT EDITOR TAKEOVERS — the Puck-based page builders that own the ENTIRE viewport with
// their own top bar (desktop) / control dock (mobile). The extra rule here (beyond dropping the right
// rail via DASHBOARD_NONE_PATTERNS) is for MOBILE, where the app-shell's fixed bottom tab bar would
// otherwise sit ON TOP of the editor's thumb-zone control dock, making it unreachable. A route in this
// list tells the shell to also suppress the mobile bottom nav + its side drawers (and the desktop
// header), so the editor is the only chrome on screen.
//
// NOTE: the Space landing editor (/spaces/<slug>/edit-page) is deliberately NOT here — it stays
// IN PAGE (the site header + left nav around the Puck editor), the operator's expected surface for
// editing their marketing page from inside the app. Only the member Spotlight builder takes the whole
// viewport (its mobile Discord dock needs the bottom-nav clearance). Pattern match (exact surface only).
// (ADR-522 follow-up: the member Spotlight Puck editor that used to live here is retired — its route now
// redirects to the in-rail grid builder. No member route is a full-viewport editor takeover today; the
// remaining Puck builders (Space landing / marketing) are FULL-WIDTH editors that keep the header.)
const FULL_VIEWPORT_EDITOR_PATTERNS: RegExp[] = []

/** Whether `pathname` is a full-viewport Puck EDITOR takeover — the shell hides the mobile bottom
 *  nav + drawers (and the desktop header) so the editor's own top bar / thumb-zone dock owns the
 *  whole viewport with nothing over it. Pure + client-safe like railFor. */
export function isFullViewportEditor(pathname: string): boolean {
  return FULL_VIEWPORT_EDITOR_PATTERNS.some((re) => re.test(pathname))
}

// FULL-WIDTH EDITORS — page builders that use the WHOLE content width (both rails + the page gutters
// dropped) but KEEP the site header, unlike a full-viewport takeover which also hides the header. The
// Space landing editor (/spaces/<slug>/edit-page) is one: the operator edits their profile with the
// Puck builder edge to edge, but the top header stays so they never feel out of the app (owner
// directive, 2026-07: "full page with the main header still showing"). Pattern match (exact surface).
// The marketing page editor (/edit/<slug>, ADR-508 U4-A) joins it: the same fullscreen builder with the
// main header kept, now that the route lives under (main) and mounts the shell.
const FULL_WIDTH_EDITOR_PATTERNS: RegExp[] = [/^\/spaces\/[^/]+\/edit-page$/, /^\/edit\/[^/]+$/]

/** Whether `pathname` is a FULL-WIDTH editor: the shell drops both rails + page gutters (like a
 *  takeover) so the builder fills the width, but KEEPS the site header (not a full-viewport takeover).
 *  Pure + client-safe like railFor. */
export function isFullWidthEditor(pathname: string): boolean {
  return FULL_WIDTH_EDITOR_PATTERNS.some((re) => re.test(pathname))
}

// ⚠️ THE GLOBAL COMMUNITY RIGHT RAIL ALWAYS EXISTS ON THE EVENTS DETAIL PAGE. ⚠️
// Do NOT suppress the rail for /events/<slug> (a past change set it to 'none' to dodge a
// "double right column" — that was wrong). The global rail is a fixed part of the member
// chrome; the fix for any doubled-column feeling is to make the PAGE'S OWN interior content
// templated/movable blocks, NEVER to remove the rail. The event detail page falls through to
// the default 'global' rail like every other member surface.

export function railFor(pathname: string): Rail {
  // The Leader surface (/lead/*) is a member-side CONSOLIDATED dashboard (not the
  // /admin operator workspace), so it rides the standard GLOBAL community right rail
  // — it is intentionally absent from the takeover/SCOPED lists below and falls through
  // to 'global' at the end. Registered here so the decision is explicit (PAGE-FRAMEWORK
  // §3): a leader keeps the member chrome, unlike /admin which drops both rails.

  // A Space's CRM board is a full-width Dashboard workspace: it keeps the left menu but drops the
  // member right rail (the board scrolls horizontally and reads best edge to edge).
  if (DASHBOARD_NONE_PATTERNS.some((re) => re.test(pathname))) return 'none'

  // The admin workspace keeps the global LEFT menu (the one site nav) but drops the
  // member community RIGHT rail: the admin layout (app/(main)/admin/layout.tsx) mounts
  // its own operator info rail on the right, so the member right rail is suppressed.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'none'

  // The Pages workspace (/pages and its sub-managers: /pages/home, /pages/splash, /pages/sequences)
  // is a member-accessible operator MANAGER (a list of pages to open + edit), not the /admin
  // workspace with its own info rail. So it keeps the GLOBAL community right rail like every other
  // member surface (owner directive, 2026-06-20: the right rail shows on every page) — it falls
  // through to 'global' below. The actual page editors open elsewhere (in place with edit mode, or
  // the marketing/splash editors), so nothing full-width is affected here.

  // Full-viewport takeovers (the practice timer, the scanner, the auth gate, print) are
  // the ONLY other routes without the right rail — they read with zero app chrome.
  const isTakeover = FULL_TAKEOVER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  if (isTakeover) return 'none'

  // Engine 3 apply / waitlist Focus flows: centered, no member right rail.
  const isFocusFlow = FOCUS_NONE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  if (isFocusFlow) return 'none'

  const isScopedDetail = SCOPED_PREFIXES.some(
    (s) => pathname.startsWith(s) && pathname.length > s.length,
  )
  if (isScopedDetail) return 'scoped'

  return 'global'
}

// ── The admin SCOPE resolver (LP4 / ADR-501, docs/LOOM-PLATFORM.md §5, step B0) ──────────
//
// The single answer to "what can be managed on this page?", the sibling of railFor. The
// standardized admin bar reads it (via lib/apps/for-scope.ts) instead of every surface
// path-sniffing its own scope table. It replaces the duplicate PATH_SCOPE_KINDS that lived in
// settings-panel.tsx. Pure + client-safe like railFor (the ScopeKind import is TYPE-ONLY, erased
// at build, so no runtime dependency on the registry reaches the client bundle).

/** A page's admin scope: `kind` is the capability scope, `id` the entity's URL slug (present on an
 *  entity-detail page, absent on the operator `global` scope). */
export interface AdminScope {
  kind: ScopeKind
  id?: string
  /** For a `space` scope only: the Space's type, so the admin rail can resolve its editor Apps by
   *  `{ on:'spaceType', type }` (a Space's surfaces are keyed by type + per-Space function, not by
   *  Capability). Absent on every other kind and on a path-derived Space scope (the URL can't know the
   *  type); the Space "Customize" trigger carries it on the AdminBar detail. Serializable (a plain enum). */
  spaceType?: SpaceType
  /** For a `space` scope only (modular menu P3b, ADR-546b): the owner's Module Manager menu overrides
   *  (spaces.preferences.moduleMenu — the module `order` + `hidden` set), so the rail honors them exactly
   *  as the /manage console does. The Space "Customize" trigger carries them on the AdminBar detail
   *  (read fail-safe via `readModuleMenuPrefs`); `appsForScope` drops hidden modules + applies the order.
   *  Serializable (plain string arrays). Absent ⇒ the manifest's default (catalog) order + no hiding. */
  moduleMenu?: { order?: readonly string[]; hidden?: readonly string[] }
}

// Entity-detail route prefixes → the scope kind they manage; the SECOND path segment is the
// entity id/slug. Mirrors the old settings-panel PATH_SCOPE_KINDS + PageAdminBar resolver. Prefix
// (not end-anchored), so /circles/<id>/manage still resolves to the circle scope, as before.
const ADMIN_SCOPE_PREFIXES: readonly { prefix: RegExp; kind: ScopeKind }[] = [
  { prefix: /^\/circles\/([^/]+)/, kind: 'circle' },
  { prefix: /^\/hubs\/([^/]+)/, kind: 'hub' },
  { prefix: /^\/nexuses\/([^/]+)/, kind: 'nexus' },
  { prefix: /^\/events\/([^/]+)/, kind: 'event' },
  { prefix: /^\/practices\/([^/]+)/, kind: 'practice' },
  { prefix: /^\/channels\/([^/]+)/, kind: 'channel' },
  // A Journey (ADR-515 Phase 6). The 2nd segment is the slug (as for circles), so /journeys/<slug>,
  // /journeys/<slug>/learn, and /journeys/<slug>/edit all resolve to the journey scope. The bare index
  // (/journeys) has no 2nd segment and falls through to `global`; the sibling list routes (/journeys/mine,
  // /journeys/new) resolve to a journey scope whose module getters fail-safe to null (no plan by that
  // slug), so they show no rail chrome. The /journeys/<slug>/edit MINI-RAIL behavior is orthogonal (a
  // separate MINI_RAIL_PATTERNS concern below) and is untouched.
  { prefix: /^\/journeys\/([^/]+)/, kind: 'journey' },
  { prefix: /^\/people\/([^/]+)/, kind: 'profile' },
  // A Space profile (/spaces/<slug> + tabs, and the owner sub-surfaces). id = the URL slug (NOT the
  // DB id); the Space "Customize" trigger passes the DB id + type on the AdminBar detail instead. Last
  // so the more specific member routes above never shadow it (they don't overlap /spaces anyway).
  { prefix: /^\/spaces\/([^/]+)/, kind: 'space' },
]

/** The admin scope for a page — one resolver, mirroring railFor. Returns an ENTITY scope
 *  `{ kind, id }` on an entity-detail route (id = the URL slug); the operator `global` scope on
 *  every other in-app content page; and `null` on a full-viewport takeover, where nothing is
 *  manageable. Pure + client-safe like railFor. */
export function adminScopeFor(pathname: string): AdminScope | null {
  for (const { prefix, kind } of ADMIN_SCOPE_PREFIXES) {
    const m = pathname.match(prefix)
    if (m) return { kind, id: m[1] }
  }
  // Full-viewport takeovers read with zero app chrome — nothing to manage.
  const isTakeover = FULL_TAKEOVER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  if (isTakeover) return null
  // Every other in-app page is the operator `global` scope (the page-globals group).
  return { kind: 'global' }
}

// ── The rail ARCHETYPE resolver (ADR-516 Phase B) ────────────────────────────────────────────────
//
// A SECOND axis on the rail, beside `adminScopeFor`. Where scope answers "what entity can be managed
// here?", archetype answers "what SHAPE should the rail take on this page?":
//   • 'builder' — a profile/space PROFILE page where the page's own identity/layout paints. The rail
//                 mounts the page's inline editors (the member's Profile/Spotlight/Layout on their own
//                 page; a Space's Basics/Page/Mode via the Customize trigger).
//   • 'hub'     — a settings index (member /settings*, a Space /settings|/manage) OR any generic content
//                 page that is not an entity detail. The rail is a stats + quick-links Hub, NOT an inline
//                 editor: it shows glanceable stats and the bank quick-links, never a duplicated form.
//   • 'manage'  — an entity-detail scope (circle/event/hub/nexus/practice/channel/journey, and a Space's
//                 non-profile-root subpaths). The rail mounts that entity's own management editors.
// Pure + client-safe like railFor/adminScopeFor. The Space "Customize" rail (a typed space scope opened
// from the profile root) is treated like `manage` in settings-panel — it mounts the Space's inline
// editors and never the personal "You" set — even though the profile-root PATH resolves to 'builder';
// the two agree in effect (builder mounts inline editors, and the personal set is dropped on any non
// global/profile scope). No path returns 'builder' for a Space subpath, so there is no conflict.
export type RailArchetype = 'builder' | 'hub' | 'manage'

// A profile/space PROFILE page whose own identity/layout paints — the member's own /people/<handle>
// (and the standalone preview/edit grid), and the Space profile ROOT (/spaces/<slug>, no subpath).
const BUILDER_PATTERNS: readonly RegExp[] = [
  /^\/people\/[^/]+(?:\/profile-preview(?:\/edit)?)?$/,
  /^\/spaces\/[^/]+$/,
]

// A settings INDEX — the member settings tree (/settings and every /settings/* sub-page) and a Space's
// owner settings/manage consoles (/spaces/<slug>/settings*, /spaces/<slug>/manage*). These become the
// stats + quick-links Hub, never an inline editor (the page body already IS the editor).
const HUB_PATTERNS: readonly RegExp[] = [
  /^\/settings(?:$|\/)/,
  /^\/spaces\/[^/]+\/settings(?:$|\/)/,
  /^\/spaces\/[^/]+\/manage(?:$|\/)/,
]

/** The rail archetype for a page — the shape the standardized rail takes (ADR-516 Phase B). `builder`
 *  on a profile/space profile-root page (inline editors), `hub` on a settings index or any generic
 *  content page (stats + quick-links), `manage` on an entity-detail scope (that entity's editors). Pure
 *  + client-safe like railFor. */
export function railArchetypeFor(pathname: string): RailArchetype {
  if (BUILDER_PATTERNS.some((re) => re.test(pathname))) return 'builder'
  if (HUB_PATTERNS.some((re) => re.test(pathname))) return 'hub'
  // An entity-detail scope (circle/event/hub/nexus/practice/channel/journey, or a Space subpath that is
  // not the profile root) manages that entity. The `global` operator scope is not an entity, so it is
  // NOT manage — it falls through to the Hub default (a generic content page shows stats + links, not
  // the personal inline editor, which was mismatch B).
  const scope = adminScopeFor(pathname)
  if (scope && scope.kind !== 'global') return 'manage'
  return 'hub'
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
  { route: '/spaces/directory', label: 'Spaces (directory)', area: 'Member' },
  // The "Spaces you run" hub (operator-context switcher): the personal list of every Space the
  // caller owns/admins, each linking to its /manage console. It keeps the GLOBAL community rail
  // like every other member browse surface (it falls through to 'global' in railFor); this catalog
  // entry registers it as an explicitly managed surface an operator can reframe.
  { route: '/spaces/operating', label: 'Spaces you run', area: 'Member' },
  { route: '/spaces/_/crm', label: 'Space CRM board', area: 'Focus surfaces' },
  // The Mode and focus settings page (Space Modes M3, ADR-461/464): a centered Focus surface that
  // composes <FocusTemplate> inside the unified console. It falls through to 'global' in railFor (the
  // console manage root is full-width 'none', but its /manage/mode sub-page is a Focus form that keeps
  // the global rail beside its centered body); this catalog entry makes it an explicitly managed surface.
  { route: '/spaces/_/manage/mode', label: 'Space mode and focus', area: 'Focus surfaces' },
  // The Layout settings page (ADR-472): a centered Focus surface (the public-page layout picker + preview
  // gallery) inside the unified console. Like /manage/mode it falls through to 'global' in railFor (a
  // Focus form that keeps the global rail beside its centered body); this catalog entry makes it an
  // explicitly managed surface an operator can reframe.
  { route: '/spaces/_/manage/layout', label: 'Space layout', area: 'Focus surfaces' },
  { route: '/practices', label: 'Practices', area: 'Member' },
  { route: '/practices/new', label: 'Practice builder', area: 'Member' },
  { route: '/journeys', label: 'Journeys', area: 'Member' },
  { route: '/messages', label: 'Messages (inbox)', area: 'Member' },
  { route: '/connections', label: 'Connections (index)', area: 'Member' },
  { route: '/friends', label: 'Friends', area: 'Member' },
  { route: '/search', label: 'Search', area: 'Member' },
  { route: '/broadcast', label: 'Broadcast', area: 'Member' },
  { route: '/crew', label: 'Crew', area: 'Member' },
  { route: '/outreach', label: 'Outreach', area: 'Member' },
  // The Beta referral + Circle-starter contest hub (phase P3). A member browse/dashboard
  // surface that keeps the GLOBAL community rail (falls through to 'global' in railFor);
  // this catalog entry registers it as an explicitly managed surface. The route 404s while
  // platform_flags.beta_referral_contest is off, so the rail decision is moot until it is live.
  { route: '/referral', label: 'Referral contest', area: 'Member' },
  { route: '/lead', label: 'Leadership', area: 'Member' },
  { route: '/lead/training-library', label: 'Leader Training', area: 'Member' },
  // Settings + the centered single-task surfaces now keep the GLOBAL community rail too
  // (owner directive, 2026-06-20: the right rail shows on every member page).
  { route: '/settings', label: 'Settings', area: 'Member' },
  { route: '/settings/profile', label: 'Profile editor', area: 'Member' },
  { route: '/codes', label: 'Personal codes / QR hub', area: 'Member' },
  { route: '/journal', label: 'Journal (Capture)', area: 'Member' },
  { route: '/training', label: 'Role training', area: 'Member' },
  { route: '/upgrade', label: 'Upgrade', area: 'Member' },
  // ── Full-viewport takeovers (default NONE — zero app chrome, no rail) ──
  { route: '/on-air', label: 'On Air (practice timer)', area: 'Focus surfaces' },
  { route: '/scan', label: 'QR scanner', area: 'Focus surfaces' },
  // ── Operator workspace (default NONE — full-width admin) ──
  { route: '/admin', label: 'Admin workspace', area: 'Operator' },
  // The Resonance cockpit (Phase 2 · ADR-383): the platform CRM dashboard. It lives under
  // /admin/*, so railFor already returns 'none' (the admin workspace mounts its OWN info rail;
  // adding it to SCOPED_PREFIXES would be a no-op because the /admin/* branch wins first). This
  // catalog entry makes the cockpit an explicitly managed operator surface; the rail decision
  // stays the admin default, exactly like Phase 1's /admin/crm/today.
  { route: '/admin/crm', label: 'Resonance cockpit', area: 'Operator' },
  // The CRM 2-way Inbox (ADR-629) + Tasks (ADR-628). Both live under /admin/*, so railFor already
  // returns 'none' (the admin workspace mounts its own info rail); these entries just register them as
  // explicitly managed operator surfaces. The rail decision stays the admin default.
  { route: '/admin/crm/inbox', label: 'CRM Inbox', area: 'Operator' },
  { route: '/admin/crm/tasks', label: 'CRM Tasks', area: 'Operator' },
  // The practice library curation workspace (Phase 1 "Scale it", ADR-438). Lives under /admin/*,
  // so railFor already returns 'none' (the admin workspace mounts its own info rail); the in-page
  // facet rail is a body column, NOT the shell rail. This catalog entry only makes it an explicitly
  // managed operator surface — the rail decision stays the admin default.
  { route: '/admin/content/practices', label: 'Practice library', area: 'Operator' },
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
