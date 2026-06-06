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
const FOCUS_PREFIXES = [
  '/settings', // narrow account forms
  '/marketing', // operator workspace (its own tab bar)
  '/crm', // steward member workspace
  '/outreach', // steward composer
  '/codes', // personal codes / QR hub
  '/entry-points', // crew "My Entry Points" builder (ADR-126)
  '/founder', // Founder's First Week checklist (build item 1.4)
  '/journal', // your Capture daily-log (build item §6 Phase 3)
  '/training', // role-advancement training (ADR-157 §7)
  '/upgrade', // single conversion card
  '/g/', // gift-a-zap confirm
  '/n/', // scan-landing claim
]

// FOCUS by pattern — compose / edit surfaces that live one segment deep, plus the
// message threads. The section INDEX (e.g. /messages, /connections) keeps the
// rail; only the nested work surface goes full-width.
const FOCUS_PATTERNS: RegExp[] = [
  /^\/messages\/.+/, // a DM or room thread (the /messages inbox keeps the rail)
  /^\/events\/new$/, // create an event
  /^\/practices\/[^/]+\/edit$/, // edit a practice
  /^\/connections\/.+/, // a contact editor / new contact (the index keeps the rail)
]

// SCOPED — entity-detail sections that render their own in-body scope rail
// (members / events / health for THIS circle or channel). One path segment past
// the section keeps the index (/circles) on the global rail.
const SCOPED_PREFIXES = ['/circles/', '/channels/']

export function railFor(pathname: string): Rail {
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
