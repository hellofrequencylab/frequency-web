// The right rail's PAGE PANELS — which contextual stat panels a given route shows.
// The rail (components/sidebar/right-sidebar.tsx) always renders the SITE-WIDE
// STANDING panels (the player cockpit + demo notice); on top of those it renders the
// page panels this registry returns for the current path. To give a route different
// panels, edit the map here — that is the whole API (mirrors page-chrome.ts for the
// rail's CONTENT the way page-chrome decides the rail's PRESENCE).
//
// This file owns WHICH keys a route shows; what each key RENDERS (its data needs + gate)
// lives in the rail WidgetSlot registry, components/sidebar/rail-registry.tsx (ADR-250
// step 2). A new vertical's rail panel = a key here + an entry there.

export type PanelKey =
  | 'dispatches' | 'events' | 'members' | 'leaderboard' | 'online' | 'circles'
  | 'newcircles' | 'activenow' | 'pulse'

// Ordered, longest-prefix-wins. The first matching rule supplies the page panels.
const RULES: { test: (p: string) => boolean; panels: PanelKey[] }[] = [
  // Quest — the game board: who's climbing + who's around to play with.
  { test: (p) => p === '/crew' || p.startsWith('/crew/'), panels: ['leaderboard', 'online'] },
  // Leadership — a volunteer leader stewarding their community: the standings, who's active,
  // and circles/events to point people at. (host+ only reach /lead, so leaderboard always shows.)
  { test: (p) => p === '/lead' || p.startsWith('/lead/'), panels: ['pulse', 'leaderboard', 'activenow', 'events'] },
  // Events — what's coming up, who's going, and circles to find more.
  { test: (p) => p === '/events' || p.startsWith('/events/'), panels: ['events', 'online', 'circles'] },
  // Circles — discover more circles (incl. just-launched ones) + who's active + what's on.
  { test: (p) => p === '/circles' || p.startsWith('/circles/') || p.startsWith('/hubs') || p.startsWith('/nexuses'), panels: ['circles', 'newcircles', 'activenow', 'events'] },
  // People-led browse — who's online + circles to join + what's on.
  {
    test: (p) => ['/channels', '/people', '/market'].some((s) => p === s || p.startsWith(s + '/')),
    panels: ['online', 'circles', 'events'],
  },
  // Practice — keep momentum: the board + who's around.
  {
    test: (p) => ['/journeys', '/practices', '/library'].some((s) => p === s || p.startsWith(s + '/')),
    panels: ['leaderboard', 'online'],
  },
  // Home (feed / Around You) — the community pulse. Each panel self-falls-back so
  // the rail is always full: events (yours → community), people (active → newest),
  // circles (new → popular), plus recent broadcasts.
  { test: (p) => p === '/feed' || p === '/broadcast' || p.startsWith('/broadcast/'), panels: ['events', 'activenow', 'dispatches', 'newcircles'] },
]

// The baseline for any page not matched above. Uses panels that effectively ALWAYS render —
// `pulse` (aggregate counts) plus the self-falling-back people/circles/events tiles — so an
// unmapped route (e.g. /lead before its rule, or a new section) still gets a full, relevant
// rail instead of collapsing to just the standing panels. (Was ['dispatches','online'], which
// both self-hide with no fallback, leaving the rail bare.)
const DEFAULT_PANELS: PanelKey[] = ['pulse', 'activenow', 'newcircles', 'events']

/** The page panels for a path. Always returns at least the default pulse panel. */
export function pageRailPanels(pathname: string): PanelKey[] {
  for (const rule of RULES) if (rule.test(pathname)) return rule.panels
  return DEFAULT_PANELS
}
