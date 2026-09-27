// The right rail's PAGE PANELS — which contextual stat panels a given route shows.
// The rail (components/sidebar/right-sidebar.tsx) always renders the SITE-WIDE
// STANDING panels (the player cockpit + demo notice); on top of those it renders the
// page panels this registry returns for the current path. To give a route different
// panels, edit the map here — that is the whole API (mirrors page-chrome.ts for the
// rail's CONTENT the way page-chrome decides the rail's PRESENCE).
//
// This file owns the BASE map (which keys a route shows); what each key RENDERS (its data
// needs + gate) lives in the rail WidgetSlot registry, components/sidebar/rail-registry.tsx.
// A VERTICAL owns its own routes' rail via its descriptor (`rail` in lib/verticals/*), which
// pageRailPanels consults BEFORE this base map — so adding a vertical's rail is a descriptor
// edit, not a core edit (ADR-250 step 2 / ADR-278).

import { verticalRailRules } from '@/lib/verticals'

export type PanelKey =
  | 'dispatches' | 'events' | 'members' | 'leaderboard' | 'online' | 'circles'
  | 'newcircles' | 'activenow' | 'pulse' | 'community'
  // SPACE-SCOPED keys (LIVE-518). Every one of these renders the Space the viewer is standing in
  // and nothing else, so they are only ever selected by the /spaces rule below.
  | 'spaceevents' | 'spacecircles' | 'spaceteam'

/** True on The Quest surfaces (the `/crew` tree: hub, journey, leaderboard, streaks, store, …).
 *  These pages OWN the member's standing — the Quest hub's StandingHero/SeasonMap plus the
 *  Journey pages — so the rail SUPPRESSES its own standing panels here (ControlCenterPanel's
 *  "Your Quest" hero + the GameStatsDock cockpit) to avoid showing the same zaps/gems/streak/rank
 *  two or three times in one viewport (UI audit). Off-Quest (feed, channels, …) the page does NOT
 *  render standing, so the rail keeps it — it's valuable there. Declarative route-conditional that
 *  the rail reads; the rail never inspects the path itself. Single source of truth for "is this a
 *  Quest route" — the page-panel rule below reuses it too. */
export function isQuestSurface(pathname: string): boolean {
  return pathname === '/crew' || pathname.startsWith('/crew/')
}

/** Reserved FIRST segments under /spaces that are NOT a Space: the in-app directory, the
 *  provisioning wizard, the my-Spaces list, and the invite landing (whose path carries a TOKEN, not a
 *  slug, so there is nothing to scope to). These keep the platform rail, which is the right rail for
 *  them — a member browsing the directory is being pointed OUTWARD on purpose. */
const SPACE_NON_SLUG_SEGMENTS = new Set(['directory', 'new', 'operating', 'invite'])

/** Second segments that make a /spaces/<slug>/… route an OWNER CONSOLE rather than a member-facing
 *  Space surface. These deliberately keep the platform rail:
 *    • they are operator workspaces, not a membership experience — the rail beside them is the
 *      operator's settings drawer (components/sidebar/right-sidebar.tsx), not the Space's own life;
 *    • /crm already resolves to NO rail at all (DASHBOARD_NONE_PATTERNS in page-chrome.ts), so a
 *      Space rule that claimed it would describe panels nobody renders; and
 *    • none of them puts getSpaceContentData on the request, so scoping them would buy a cold
 *      content round for a surface whose owner is not shopping for their own events. */
const SPACE_OWNER_CONSOLE_SEGMENTS = new Set(['manage', 'settings', 'crm', 'edit-page', 'marketing', 'loom'])

/** The Space slug a MEMBER-FACING /spaces route is standing in, or null for every other path.
 *
 *  This is the seam the Space rail turns on, and it is deliberately the SAME thing that drives
 *  `pageRailPanels`: the pathname. The rail renders from the (main) layout, which is a PARENT of
 *  `app/(main)/spaces/[slug]/layout.tsx` — so `getActiveSpace()` (lib/spaces/active-space.ts) is
 *  still null when the rail runs, because the profile layout has not stamped it yet. The path is
 *  the only Space identity the rail can read, and it is the one the route already resolves from.
 *
 *  Anchored on the /spaces/<slug> SHAPE (two segments, first exactly 'spaces'), not on a prefix, so
 *  it can neither be swallowed by nor swallow a neighbouring rule. */
export function spaceSlugFromPath(pathname: string): string | null {
  const [first, slug, third] = pathname.split('/').filter(Boolean)
  if (first !== 'spaces') return null
  if (!slug || SPACE_NON_SLUG_SEGMENTS.has(slug)) return null
  // A slug is lowercase-alphanumeric-dash; anything else is not a Space route we know.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null
  if (third && SPACE_OWNER_CONSOLE_SEGMENTS.has(third)) return null
  return slug
}

// Ordered, longest-prefix-wins. The first matching rule supplies the page panels.
const RULES: { test: (p: string) => boolean; panels: PanelKey[] }[] = [
  // Spaces — a member standing INSIDE a Space gets that Space's own life (LIVE-518). Until this
  // rule existed every /spaces route fell through to DEFAULT_PANELS, so the prime column beside
  // Royal Temple spent all four of its panels on platform pulse, platform presence, OTHER
  // communities' new circles and platform-wide events: 100% of a membership surface recruiting the
  // member away from the membership. railFor() keeps the rail MOUNTED on /spaces (owner directive,
  // 2026-06-20, page-chrome.ts SCOPED_PREFIXES) — so the fix is what the column SAYS, not whether
  // it is there.
  //
  // FIRST in the array on purpose: it is the narrowest test here (an exact two-segment shape with
  // its own exclusion lists, spaceSlugFromPath above), so nothing it matches can belong to a later
  // rule, and putting it first means a future /spaces-prefixed rule cannot quietly shadow it.
  //
  // ALL THREE PANELS SELF-HIDE when the Space has no rows (honest empty). A brand-new Space with no
  // events, no Circles and no team therefore shows NO page panels at all, and that is the intended
  // reading: the rail still carries its standing panels, and silence about this Space beats four
  // panels pointing at somebody else's.
  { test: (p) => spaceSlugFromPath(p) !== null, panels: ['spaceevents', 'spacecircles', 'spaceteam'] },
  // Quest — the game board: who's climbing + who's around to play with.
  { test: isQuestSurface, panels: ['leaderboard', 'online'] },
  // Leadership — a volunteer leader stewarding their community: the standings, who's active,
  // and circles/events to point people at. (host+ only reach /lead, so leaderboard always shows.)
  { test: (p) => p === '/lead' || p.startsWith('/lead/'), panels: ['pulse', 'leaderboard', 'activenow', 'events'] },
  // Events — what's coming up, who's going, and circles to find more.
  { test: (p) => p === '/events' || p.startsWith('/events/'), panels: ['events', 'online', 'circles'] },
  // Circles — discover more circles (incl. just-launched ones) + who's active + what's on.
  { test: (p) => p === '/circles' || p.startsWith('/circles/') || p.startsWith('/hubs') || p.startsWith('/nexuses'), panels: ['circles', 'newcircles', 'activenow', 'events'] },
  // People-led browse — who's online + circles to join + what's on. (/market moved to the
  // marketplace vertical descriptor, ADR-278.)
  {
    // '/network' is the Members hub's real route; this rule read '/people' long after the
    // rail row was repointed (ADR-868), so every /network page silently fell through to
    // DEFAULT_PANELS. Both are listed: /people is still a live profile route.
    test: (p) => ['/channels', '/people', '/network'].some((s) => p === s || p.startsWith(s + '/')),
    panels: ['online', 'circles', 'events'],
  },
  // Practice — keep momentum: the board + who's around.
  {
    test: (p) => ['/journeys', '/practices', '/library'].some((s) => p === s || p.startsWith(s + '/')),
    panels: ['leaderboard', 'online'],
  },
  // Home (/feed) — the community board LEADS the rail (ADR-1362). The practice board is back at
  // the top of the PAGE on every viewport, because this column is `hidden lg:flex` and the board
  // carries the one-tap Start Practice button; the community board took its place here, where a
  // desktop-only panel costs a phone nothing. `events` stays out of this rule: the community
  // board names the member's next gathering, and a rail panel never repeats the function the
  // panel above it already shows (the rail's own rule, right-sidebar.tsx). The rest self-fall-back
  // so the column is never bare: people (active → newest), circles (new → popular), plus Dispatches.
  { test: (p) => p === '/feed', panels: ['community', 'activenow', 'dispatches', 'newcircles'] },
  // Around You — the community pulse, unchanged: this page owns no gathering of its own, so the
  // events panel stays, and the feed's board does not belong on a place page.
  { test: (p) => p === '/nearby' || p.startsWith('/nearby/'), panels: ['events', 'activenow', 'dispatches', 'newcircles'] },
]

// The baseline for any page not matched above. Uses panels that effectively ALWAYS render —
// `pulse` (aggregate counts) plus the self-falling-back people/circles/events tiles — so an
// unmapped route (e.g. /lead before its rule, or a new section) still gets a full, relevant
// rail instead of collapsing to just the standing panels. (Was ['dispatches','online'], which
// both self-hide with no fallback, leaving the rail bare.)
const DEFAULT_PANELS: PanelKey[] = ['pulse', 'activenow', 'newcircles', 'events']

/** The page panels for a path: a vertical's own rail rules win first (so a vertical owns its
 *  routes), then the base map, then the default. Always returns at least the default pulse
 *  panel. Vertical panel keys are PanelKey strings; any unknown key is skipped at render. */
export function pageRailPanels(pathname: string): PanelKey[] {
  for (const rule of verticalRailRules()) if (rule.test(pathname)) return rule.panels as PanelKey[]
  for (const rule of RULES) if (rule.test(pathname)) return rule.panels
  return DEFAULT_PANELS
}
