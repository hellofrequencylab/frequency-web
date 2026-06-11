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
  /^\/practices\/[^/]+\/edit$/, // edit a practice
  /^\/connections\/.+/, // a contact editor / new contact (the index keeps the rail)
]

// SCOPED — entity-detail sections that render their OWN in-body scope rail
// (the double-rail trap is avoided by suppressing the global rail). Nothing is
// scoped today: both Circle and Channel detail pages ride the GLOBAL community
// rail (like events) — their scope content (feed / circles / members) lives
// inline in a single main column, and the community rail frames them on the
// right. Re-add a prefix here only if a section grows a genuine in-body rail.
const SCOPED_PREFIXES: string[] = []

// The admin WORKSPACE (Phase 4, ADR-228): under /admin/* the global member LEFT
// rail is suppressed (the admin layout mounts a sticky top-nav menubar instead of a
// left sidebar). The shell reads BOTH axes: `leftRailFor` for the left column,
// `railFor` for the right — and admin now returns 'none' on BOTH (full-width
// operator workspace). To swap the left rail for another workspace, add its prefix
// here — never path-sniff in the shell.
const LEFT_WORKSPACE_PREFIXES = ['/admin']

export type LeftRail = 'global' | 'none'

/** Whether the global MEMBER left rail frames a page. 'none' = a workspace
 *  (today: /admin/*) mounts its OWN left nav in its layout and the shell suppresses
 *  the member rail to avoid a double left rail. */
export function leftRailFor(pathname: string): LeftRail {
  const inWorkspace = LEFT_WORKSPACE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return inWorkspace ? 'none' : 'global'
}

export function railFor(pathname: string): Rail {
  // The admin WORKSPACE (Phase 4, ADR-228) is a full-width operator surface: no
  // right rail, just the sticky top-nav menubar (app/(main)/admin/layout.tsx) over
  // a wide content column. The member community rail is irrelevant in admin, so it
  // is dropped on both axes (leftRailFor already returns 'none' for /admin/*).
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
