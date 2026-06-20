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
  { id: 'quest-intention', label: 'Season intention', description: "The season's theme in the operator's words — the orienting line for the page." },
  { id: 'quest-season-map', label: 'Season map', description: 'The four-Pillar gauges, rank, and season countdown.' },
  { id: 'quest-today', label: 'Today', description: 'The one time-aware next step — the single nudge for today.' },
  { id: 'quest-cta', label: 'Log a practice', description: 'The dominant primary action — log a practice (pinned to the thumb zone on a phone).' },
  { id: 'quest-my-practices', label: 'My practices', description: "A compact glance at the member's adopted practices, linking to the Practices page." },
  { id: 'quest-journeys', label: 'Your Journeys', description: "The member's adopted and built Journeys, each with its progress." },
  { id: 'quest-next-gathering', label: 'Next gathering', description: 'The next event to show up to in person — the member’s RSVP, or the nearest community event.' },
  // PARKED: retired from My Quest (owner ask — see CREW_MODULE_IDS) and not offered on any
  // other surface today. Its meta + component stay defined so a future page can adopt it; it
  // is intentionally absent from every ROUTE_MODULE_IDS set until then.
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
  { id: 'practices-stats', label: 'Practice stats', description: 'The headline band: your practices, days practiced, current and longest streak, and the library size.' },
  { id: 'practices-activity', label: 'Your activity', description: 'The member’s practice as a bar chart with Days, Weeks, and Months views.' },
  { id: 'practices-balance', label: 'Pillar balance', description: 'How the member’s adopted practices spread across the four Pillars.' },
  { id: 'practices-mine', label: 'Your practices', description: 'The member’s adopted and built practices, each with its log and edit controls.' },
  { id: 'practices-library', label: 'Practice library', description: 'The full, faceted community library — filterable by Pillar, tag, and search, paginated.' },

  // ── The Vault blocks (/crew/store) — the member's earnings + the Gem Store ──
  { id: 'vault-standing', label: 'Standing hero', description: 'The four counts — Zaps · Rank · Streak · Gems — the one way a member’s standing renders.' },
  { id: 'vault-leaderboard', label: 'Standing link', description: 'A card linking to the cooperative leaderboard and streaks.' },
  { id: 'vault-summary', label: 'Your Vault', description: 'Amplitude (the lifetime layer), the Zaps & Gems ledger, and equipped winnings.' },
  { id: 'vault-trophies', label: 'Your Trophies', description: 'The lifetime Trophy Case — every finished Journey, kept across seasons.' },
  { id: 'vault-awards', label: 'Your Awards', description: 'The badge collection, grouped by category, earned vs. secret.' },
  { id: 'vault-store', label: 'Gem Store', description: 'The redeemable categories — cosmetics, titles, badges, membership credits (paid-gated).' },

  // ── Practice detail blocks (/practices/<id>) — the arrangeable body of one practice ──
  { id: 'practice-detail-stats', label: 'Practice stats', description: 'The headline band: reward, cadence, time, practising now, and times logged.' },
  { id: 'practice-detail-about', label: 'Intro', description: 'The plain-language “what this is”, when it adds to the subtitle.' },
  { id: 'practice-detail-guide', label: 'The guide', description: 'The full write-up: why it works, how to do it, and logging it in The Quest.' },
  { id: 'practice-detail-tags', label: 'Tags', description: 'The practice’s tags.' },
  { id: 'practice-detail-usedin', label: 'Used in', description: 'The Journeys and Circles running this practice.' },

  // ── Entity profile blocks (/spaces/<slug>/*) — the networked profile module set ──
  // (ENTITY-SPACES-BUILD §B.2). Each is a self-fetching RSC scoped to the ACTIVE Space
  // (lib/spaces/active-space.ts); it reads only that Space's own rows and renders kit primitives,
  // returning null when the Space has nothing.
  { id: 'entity-about', label: 'About', description: 'The entity’s story, in plain prose.' },
  { id: 'entity-stats', label: 'Highlights', description: 'Live counts — sessions, offerings, practices, circles.' },
  { id: 'entity-offerings', label: 'Offerings', description: 'Upcoming sessions and events the entity hosts.' },
  { id: 'entity-practices', label: 'Practices & Journeys', description: 'The Practices and Journeys the entity shares.' },
  { id: 'entity-community', label: 'Community', description: 'The Circles the entity runs.' },
  { id: 'entity-team', label: 'Team', description: 'The people behind the entity.' },
  { id: 'entity-cta', label: 'Book', description: 'The primary action — book a session at an open time.' },
] as const

// ── Route module SETS (ADR-294) ────────────────────────────────────────────────
// The generic blocks any page can carry — the default everywhere ('*').
const COMMUNITY_MODULE_IDS = ['community-pulse', 'newest-members', 'popular-channels', 'top-circles'] as const

// The Leadership dashboard (/lead) renders <PageModules route="/lead"> and intentionally shows
// the generic community blocks as its footer. It gets its OWN explicit set (rather than falling
// through to '*') so the Layout editor's offering on that page is deliberate, not an accidental
// inherit — /lead is listed in lib/widgets/module-routes.ts, so the editor appears there.
const LEAD_MODULE_IDS = COMMUNITY_MODULE_IDS

// My Quest's own blocks, in default render order (the order they appear when no layout is
// saved — unplaced modules append to the template's first slot in this order).
// Note: 'quest-tasks' was retired from My Quest (owner ask) — the page is the member's
// season home (orient → progress → act), and the global task list muddied that. Its module
// metadata + component stay defined for any future surface; it's just not offered here.
const CREW_MODULE_IDS = [
  'quest-finish-celebration',
  'quest-intention',
  'quest-season-map',
  'quest-today',
  'quest-cta',
  'quest-my-practices',
  'quest-journeys',
  'quest-next-gathering',
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

// The Practices page (/practices) blocks, in default render order. The faceted Practice Library is
// a module too (practices-library): it's URL-driven, so it reads the page's facets from the
// `x-search` request header (proxy.ts) rather than searchParams, which a nested module never gets.
const PRACTICES_MODULE_IDS = ['practices-stats', 'practices-activity', 'practices-balance', 'practices-mine', 'practices-library'] as const

// Every practice DETAIL page (/practices/<id>) shares one layout, keyed at the '/practices/*'
// section scope — the body sections below, in default order. The page header (title · image ·
// actions) stays fixed; only the body is arrangeable.
const PRACTICE_DETAIL_MODULE_IDS = [
  'practice-detail-stats',
  'practice-detail-about',
  'practice-detail-guide',
  'practice-detail-tags',
  'practice-detail-usedin',
] as const

// The Vault (/crew/store), in default render order (the original hand-built order).
const VAULT_MODULE_IDS = [
  'vault-standing',
  'vault-leaderboard',
  'vault-summary',
  'vault-trophies',
  'vault-awards',
  'vault-store',
] as const

// Every entity-profile block, in the Practitioner default order (ENTITY-SPACES-BUILD §B.3). This
// is the FAMILY palette for the '/spaces/*' section scope — the full set the layout editor offers
// on any profile tab. The route shell passes the per-TAB subset (the blueprint's tab.modules) to
// PageModules as `moduleIds`, so a tab renders only its own blocks; this set governs what an
// operator may arrange. New role blueprints reuse the same registry bindings (one change updates
// every profile of every type — the C3 guarantee).
const SPACE_MODULE_IDS = [
  'entity-about',
  'entity-stats',
  'entity-offerings',
  'entity-practices',
  'entity-community',
  'entity-team',
  'entity-cta',
] as const

/** Scope key → the module ids that page offers. A key is the global default ('*'), a section
 *  ('/seg/*'), or an exact route. Add a route's set here when you convert its page to
 *  `<PageModules>` (and list it in lib/widgets/module-routes.ts). */
export const ROUTE_MODULE_IDS: Record<string, readonly string[]> = {
  '*': COMMUNITY_MODULE_IDS,
  '/lead': LEAD_MODULE_IDS,
  '/crew': CREW_MODULE_IDS,
  '/admin/content/journeys': ADMIN_JOURNEYS_MODULE_IDS,
  '/journeys': JOURNEYS_MODULE_IDS,
  '/practices': PRACTICES_MODULE_IDS,
  // Section scope: applies to every /practices/<id> detail page (shared layout).
  '/practices/*': PRACTICE_DETAIL_MODULE_IDS,
  '/crew/store': VAULT_MODULE_IDS,
  // Section scope: every entity profile tab (/spaces/<slug>/<tab>) shares one family module set;
  // the shell narrows it to the active tab's blocks via the `moduleIds` override (ADR-294).
  '/spaces/*': SPACE_MODULE_IDS,
}

// The scope keys that can carry a module set for `key`, MOST-SPECIFIC FIRST: an exact route
// inherits its section then the global default; a section inherits the global default; '*' is
// itself. Mirrors the layout scope cascade (lib/page-settings/layout.ts) but stays self-
// contained so this file keeps zero dependencies.
//
// SPACE LAYER (Phase 0.5a): a per-entity profile route (e.g. '/spaces/<slug>/about') is a
// concrete route, so its chain already emits the route's own key, then the SPACE-SCOPED
// SECTION key ('/spaces/*' — the family default for every entity profile), and only THEN the
// global '*' fallback. So a space's profile tabs resolve their own module set before any
// global default, with no special-casing here once those '/spaces/*' sets are registered.
export function moduleScopeChain(key: string): string[] {
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
  return ROUTE_MODULE_IDS['*'] ?? COMMUNITY_MODULE_IDS
}

export function moduleMeta(id: string): LayoutModuleMeta | undefined {
  return LAYOUT_MODULES.find((m) => m.id === id)
}
