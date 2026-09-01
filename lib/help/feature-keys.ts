// Canonical feature-key registry — the shared vocabulary that ties code areas to
// help articles. Article front-matter `featureKeys` (see docs/HELP-CENTER.md) MUST
// use keys from this list; the coverage tool (scripts/help-coverage.mts) reports
// which keys have a published article and flags any article key that isn't here.
//
// This is the "what is everything?" measure that the living-docs loop builds on
// (docs/SUPPORT-SYSTEM.md, ADR-067). Add a key here when you ship a documentable
// member- or operator-facing feature.

export type FeatureArea =
  | 'community' // the group hierarchy and belonging
  | 'discovery' // finding people, groups, and gatherings
  | 'content' // feeds, posts, broadcasts, practices
  | 'comms' // messages, notifications, friends
  | 'engagement' // gamification: zaps, gems, ranks, store
  | 'account' // profile, settings, onboarding
  | 'membership' // the Vault / paid membership
  | 'safety' // moderation, blocking
  | 'operator' // staff/host tooling (admin, crm, marketing)

export interface FeatureKey {
  /** Canonical key used in article front-matter `featureKeys`. */
  key: string
  /** Human-readable label for reports + UI. */
  label: string
  area: FeatureArea
  /** Representative route(s) this feature documents (for the drift signal). */
  routes: string[]
  /** Core member-facing feature — should have a published, member-voice article. */
  core: boolean
}

export const FEATURE_KEYS: FeatureKey[] = [
  // ── Community ───────────────────────────────────────────────────────────────
  { key: 'circles', label: 'Circles', area: 'community', routes: ['/circles'], core: true },
  { key: 'memberships', label: 'Joining & leaving circles', area: 'community', routes: ['/circles'], core: true },
  { key: 'hubs', label: 'Hubs', area: 'community', routes: ['/hubs'], core: true },
  { key: 'nexuses', label: 'Nexuses', area: 'community', routes: ['/nexuses'], core: false },
  { key: 'channels', label: 'Channels', area: 'community', routes: ['/channels'], core: true },
  { key: 'community', label: 'Community basics', area: 'community', routes: ['/feed'], core: true },

  // ── Discovery ───────────────────────────────────────────────────────────────
  { key: 'people', label: 'People directory', area: 'discovery', routes: ['/people'], core: true },
  { key: 'search', label: 'Search', area: 'discovery', routes: ['/search'], core: true },
  { key: 'events', label: 'Events & RSVPs', area: 'discovery', routes: ['/events'], core: true },
  { key: 'marketplace', label: 'Classifieds', area: 'discovery', routes: ['/classifieds'], core: true },

  // ── Content ─────────────────────────────────────────────────────────────────
  { key: 'feed', label: 'The feed', area: 'content', routes: ['/feed'], core: true },
  { key: 'posts', label: 'Posts, reactions & comments', area: 'content', routes: ['/feed'], core: true },
  { key: 'broadcast', label: 'Dispatches', area: 'content', routes: ['/nearby'], core: true },
  { key: 'practices', label: 'Practices', area: 'content', routes: ['/practices'], core: true },

  // ── Comms ───────────────────────────────────────────────────────────────────
  { key: 'messages', label: 'Direct messages & rooms', area: 'comms', routes: ['/messages'], core: true },
  { key: 'notifications', label: 'Notifications', area: 'comms', routes: ['/notifications'], core: true },
  { key: 'friends', label: 'Friends', area: 'comms', routes: ['/friends'], core: true },

  // ── Engagement (gamification) ────────────────────────────────────────────────
  { key: 'gamification', label: 'Gamification overview', area: 'engagement', routes: ['/settings'], core: true },
  { key: 'zaps', label: 'Zaps', area: 'engagement', routes: ['/settings'], core: true },
  { key: 'gems', label: 'Gems', area: 'engagement', routes: ['/settings'], core: true },
  { key: 'ranks', label: 'Season ranks', area: 'engagement', routes: ['/settings'], core: true },
  { key: 'store', label: 'Vault Store & redemptions', area: 'engagement', routes: ['/settings'], core: false },
  { key: 'codes', label: 'QR codes & check-ins', area: 'engagement', routes: ['/codes', '/n', '/admin/qr'], core: true },

  // ── Account ─────────────────────────────────────────────────────────────────
  { key: 'account', label: 'Account & profile', area: 'account', routes: ['/settings'], core: true },
  { key: 'settings', label: 'Settings & preferences', area: 'account', routes: ['/settings'], core: true },
  { key: 'onboarding', label: 'Getting started / onboarding', area: 'account', routes: ['/feed'], core: true },

  // ── Membership ──────────────────────────────────────────────────────────────
  { key: 'vault', label: 'The Vault (membership)', area: 'membership', routes: ['/vault', '/upgrade'], core: true },

  // ── Added 2026-08-10 (ADR-970). These ten keys were already in use by PUBLISHED
  //    articles and simply had no registry row, so `pnpm help:coverage` reported them as
  //    "featureKeys not in the registry" — the article existed and the key it declared did
  //    not resolve. Every route below was verified to exist before it was written down;
  //    `location` and `resonance` have no route of their own and point at the surfaces that
  //    actually own them (the Connections settings section). Names follow docs/NAMING.md.
  { key: 'on-air', label: 'On Air sessions', area: 'content', routes: ['/on-air'], core: true },
  { key: 'journeys', label: 'Journeys', area: 'content', routes: ['/journeys'], core: true },
  { key: 'challenges', label: 'Season challenges', area: 'engagement', routes: ['/crew/challenges'], core: true },
  { key: 'achievements', label: 'Achievements', area: 'engagement', routes: ['/crew'], core: true },
  { key: 'leaderboard', label: 'Leaderboard', area: 'engagement', routes: ['/crew/leaderboard'], core: true },
  { key: 'profile', label: 'Your profile', area: 'account', routes: ['/profile', '/settings/profile'], core: true },
  { key: 'connections', label: 'Connections', area: 'comms', routes: ['/connections'], core: true },
  { key: 'location', label: 'Your location', area: 'account', routes: ['/settings/connections'], core: true },
  { key: 'resonance', label: 'Resonance matching', area: 'discovery', routes: ['/settings/connections'], core: true },
  { key: 'billing', label: 'Plans and billing (Space)', area: 'operator', routes: ['/spaces'], core: false },

  // ── Safety ──────────────────────────────────────────────────────────────────
  { key: 'moderation', label: 'Reporting & moderation', area: 'safety', routes: ['/feed'], core: true },
  { key: 'blocking', label: 'Blocking', area: 'safety', routes: ['/settings'], core: true },

  // ── Operator (staff / host tooling) ──────────────────────────────────────────
  { key: 'crew', label: 'Crew tasks', area: 'operator', routes: ['/crew'], core: false },
  { key: 'crm', label: 'CRM / contacts', area: 'operator', routes: ['/admin/growth'], core: false },
  { key: 'profiles', label: 'Profile Creator (network intake)', area: 'operator', routes: ['/connections'], core: false },
  { key: 'marketing', label: 'Marketing console', area: 'operator', routes: ['/admin/growth'], core: false },
  { key: 'outreach', label: 'Outreach', area: 'operator', routes: ['/outreach'], core: false },
  { key: 'partners', label: 'Partners', area: 'operator', routes: ['/partners'], core: false },
  { key: 'pages', label: 'Page editor', area: 'operator', routes: ['/pages'], core: false },
]

/** Fast membership check for the coverage tool + any future validation. */
export const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_KEYS.map((f) => f.key))
