// The catalog of assignable page-LAYOUT modules (ADR-270, the module-assignment engine).
// METADATA ONLY — kept free of the React components (those live in registry.tsx) so the
// editor, the actions, and the resolver can import this without pulling server components.
// Adding a module = add a meta entry here + bind its component in registry.tsx.
//
// ROUTE-SCOPING (ADR-294): a module belongs to a route's module SET, not to every page.
// `ROUTE_MODULE_IDS` maps a scope key ('*', a section '/seg/*', or an exact route) to the
// ids that page offers; `moduleIdsForScope` resolves the set for any key (most-specific
// wins). The renderer + the editor both read through it, so a page only ever shows ITS OWN
// blocks (My Quest's gauges never leak onto the Leadership dashboard, and vice versa).

export interface LayoutModuleMeta {
  id: string
  label: string
  description: string
}

// The union of every known module's metadata (any route's blocks live here). `moduleMeta`
// looks an id up across the whole set; ROUTE_MODULE_IDS decides which subset a page offers.
export const LAYOUT_MODULES: readonly LayoutModuleMeta[] = [
  // ── Community blocks — the generic default set (the global '*' scope) ──
  { id: 'community-pulse', label: 'Community pulse', description: 'Member and active-circle counts at a glance.' },
  { id: 'newest-members', label: 'Newest members', description: 'The latest people to join.' },
  { id: 'popular-channels', label: 'Channels', description: 'The public channels to tune into.' },
  { id: 'top-circles', label: 'Active circles', description: 'Circles filling up across the community.' },

  // ── My Quest blocks (/crew) — the member's season home ──
  { id: 'quest-finish-celebration', label: 'Finish celebration', description: 'The rank-up moment that greets a member after they finish a Journey.' },
  { id: 'quest-season-map', label: 'Season map', description: 'The four-Pillar gauges, the one next step, and the log-a-practice action.' },
  { id: 'quest-journeys', label: 'Your Journeys', description: "The member's adopted and built Journeys, each with its progress." },
  { id: 'quest-tasks', label: 'Tasks', description: 'Circle tasks plus the global task list members complete to earn Zaps.' },
  { id: 'quest-explore', label: 'Explore links', description: 'Quick links to Journeys, Practices, Challenges, and The Vault.' },
  { id: 'quest-leaderboard', label: 'Circle leaderboard', description: "The member's circle ranked by season Zaps." },

  // ── Admin Journeys blocks (/admin/content/journeys) — the curation surface ──
  { id: 'admin-journeys-stats', label: 'Journey stats', description: 'Headline counts: library size, awaiting review, official, and active adoptions.' },
  { id: 'admin-journeys-review', label: 'Review queue', description: 'Member-submitted Journeys waiting for an approve or reject decision.' },
  { id: 'admin-journeys-library', label: 'Journey library', description: 'The ranked public library with the official, feature, and restore controls.' },

  // ── Journeys blocks (/journeys) — the member browse + build page ──
  { id: 'journeys-start', label: 'Start a journey', description: 'The two ways in: build your own, or open this season’s official Quest.' },
  { id: 'journeys-mine', label: 'Your journeys', description: 'The journeys the viewer has kept or built.' },
  { id: 'journeys-library', label: 'Community library', description: 'The open library of public journeys to browse and adopt.' },

  // ── Practices blocks (/practices) — the personal sections above the fixed library ──
  { id: 'practices-stats', label: 'Practice stats', description: 'The three-up strip: your practices, days logged in the last 14, and the library size.' },
  { id: 'practices-activity', label: 'Your activity', description: 'A 14-day heatmap of the days the member logged a practice.' },
  { id: 'practices-mine', label: 'Your practices', description: 'The member’s adopted and built practices, each with its log and edit controls.' },
] as const

// ── Route module SETS (ADR-294) ────────────────────────────────────────────────
// The generic blocks any page can carry — the default everywhere ('*').
const COMMUNITY_MODULE_IDS = ['community-pulse', 'newest-members', 'popular-channels', 'top-circles'] as const

// My Quest's own blocks, in default render order (the order they appear when no layout is
// saved — unplaced modules append to the template's first slot in this order).
const CREW_MODULE_IDS = [
  'quest-finish-celebration',
  'quest-season-map',
  'quest-journeys',
  'quest-tasks',
  'quest-explore',
  'quest-leaderboard',
] as const

// The admin Journeys curation surface, in default render order.
const ADMIN_JOURNEYS_MODULE_IDS = [
  'admin-journeys-stats',
  'admin-journeys-review',
  'admin-journeys-library',
] as const

// The Journeys member page (/journeys), in default render order.
const JOURNEYS_MODULE_IDS = ['journeys-start', 'journeys-mine', 'journeys-library'] as const

// The Practices page (/practices) upper, personal blocks, in default render order. The faceted
// Practice Library below them stays a FIXED section the page renders (it reads searchParams, which
// blocks never receive), so only these three are module-driven.
const PRACTICES_MODULE_IDS = ['practices-stats', 'practices-activity', 'practices-mine'] as const

/** Scope key → the module ids that page offers. A key is the global default ('*'), a section
 *  ('/seg/*'), or an exact route. Add a route's set here when you convert its page to
 *  `<PageModules>` (and list it in lib/widgets/module-routes.ts). */
export const ROUTE_MODULE_IDS: Record<string, readonly string[]> = {
  '*': COMMUNITY_MODULE_IDS,
  '/crew': CREW_MODULE_IDS,
  '/admin/content/journeys': ADMIN_JOURNEYS_MODULE_IDS,
  '/journeys': JOURNEYS_MODULE_IDS,
  '/practices': PRACTICES_MODULE_IDS,
}

/** Back-compat: the default (global) module id set. */
export const LAYOUT_MODULE_IDS: readonly string[] = COMMUNITY_MODULE_IDS

// The scope keys that can carry a module set for `key`, MOST-SPECIFIC FIRST: an exact route
// inherits its section then the global default; a section inherits the global default; '*' is
// itself. Mirrors the layout scope cascade (lib/page-settings/layout.ts) but stays self-
// contained so this file keeps zero dependencies.
function moduleScopeChain(key: string): string[] {
  if (key === '*') return ['*']
  if (key.endsWith('/*')) return [key, '*']
  const seg = key.split('/').filter(Boolean)[0]
  return seg ? [key, `/${seg}/*`, '*'] : ['*']
}

/** The module ids offered at a scope key (an exact route, a section '/seg/*', or '*'): the
 *  most-specific level in the chain that declares a set wins; else the global default. Both
 *  the renderer (PageModules) and the editor (page-settings/actions) resolve through this, so
 *  what an operator can arrange always matches what the page actually renders. */
export function moduleIdsForScope(key: string): readonly string[] {
  for (const k of moduleScopeChain(key)) {
    const ids = ROUTE_MODULE_IDS[k]
    if (ids) return ids
  }
  return ROUTE_MODULE_IDS['*'] ?? LAYOUT_MODULE_IDS
}

export function moduleMeta(id: string): LayoutModuleMeta | undefined {
  return LAYOUT_MODULES.find((m) => m.id === id)
}
