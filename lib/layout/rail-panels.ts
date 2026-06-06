// The right rail's PAGE PANELS — which contextual stat panels a given route shows.
// The rail (components/sidebar/right-sidebar.tsx) always renders the SITE-WIDE
// STANDING panels (the player cockpit + demo notice); on top of those it renders the
// page panels this registry returns for the current path. To give a route different
// panels, edit the map here — that is the whole API (mirrors page-chrome.ts for the
// rail's CONTENT the way page-chrome decides the rail's PRESENCE).

export type PanelKey = 'dispatches' | 'events' | 'members' | 'leaderboard'

// Ordered, longest-prefix-wins. The first matching rule supplies the page panels.
const RULES: { test: (p: string) => boolean; panels: PanelKey[] }[] = [
  // Quest — the game board: who's climbing.
  { test: (p) => p === '/crew' || p.startsWith('/crew/'), panels: ['leaderboard'] },
  // Events — what's coming up, and who's around to go with.
  { test: (p) => p === '/events' || p.startsWith('/events/'), panels: ['events', 'members'] },
  // Community browse — the people side: who's active + what's on.
  {
    test: (p) =>
      ['/circles', '/channels', '/people', '/market', '/hubs', '/nexuses'].some(
        (s) => p === s || p.startsWith(s + '/'),
      ),
    panels: ['members', 'events'],
  },
  // Home (feed / Around You) — the community pulse: broadcasts + the board.
  { test: (p) => p === '/feed' || p === '/broadcast' || p.startsWith('/broadcast/'), panels: ['dispatches', 'leaderboard'] },
]

// The baseline for any page not matched above: the community pulse (broadcasts).
const DEFAULT_PANELS: PanelKey[] = ['dispatches']

/** The page panels for a path. Always returns at least the default pulse panel. */
export function pageRailPanels(pathname: string): PanelKey[] {
  for (const rule of RULES) if (rule.test(pathname)) return rule.panels
  return DEFAULT_PANELS
}
