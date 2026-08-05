// Gamification system — types, constants, and helpers.
// Drives achievements, streaks, season challenges, and the Zap economy.

// ---------------------------------------------------------------------------
// Achievement types
// ---------------------------------------------------------------------------

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'
export type AchievementCategory =
  | 'social'
  | 'events'
  | 'content'
  | 'leadership'
  | 'streak'
  | 'seasonal'
  | 'special'

export interface Achievement {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: AchievementCategory
  tier: AchievementTier
  criteria: AchievementCriteria
  zaps_reward: number
  is_secret: boolean
  sort_order: number
}

// ---------------------------------------------------------------------------
// Achievement criteria — machine-readable unlock conditions
// ---------------------------------------------------------------------------

export type AchievementCriteria =
  | { type: 'circle_join';    count: number }
  | { type: 'welcome_member'; count: number }
  | { type: 'referral';       count: number }
  | { type: 'event_attend';   count: number }
  | { type: 'event_host';     count: number }
  | { type: 'post_create';    count: number }
  | { type: 'post_replies';   count: number }
  | { type: 'role_earned';    role: string }
  | { type: 'streak';         streak_type: StreakType; count: number }
  // The DAILY practice streak (profiles.current_streak, lib/practice-streak.ts) —
  // distinct from the weekly `streaks`-table types above.
  | { type: 'practice_streak'; count: number }
  | { type: 'season_zaps';    count: number }
  | { type: 'rank_reached';   rank: string }
  | { type: 'task_complete';  count: number }
  | { type: 'all_challenges' }
  | { type: 'manual' }
  // Amplitude milestones (Rewards Economy v2) — lifetime XP totals.
  | { type: 'amplitude';      count: number }
  // Playbook completions (Resonance Engine Phase 5 · ADR-386): finishing a governed
  // playbook (a winback, an advocacy ask, an intro) can fire a retroactive milestone, so
  // the advocate state earns recognition (e.g. `connector` / `facilitator`). Counts
  // `playbook_runs` rows for this member as subject with status 'done'.
  | { type: 'playbook_complete'; count: number }
  // Connector achievement (ADR-154 / ADR-777) — the event-invite capture loop. Counts
  // this member's REAL connections: captured event guests (event_guests) who at least
  // RSVP'd going/maybe. A bare capture never counts (reward the outcome, anti-farm).
  | { type: 'connections'; count: number }

// ---------------------------------------------------------------------------
// Streak types
// ---------------------------------------------------------------------------

export type StreakType = 'attendance' | 'posting' | 'hosting' | 'login'

export interface Streak {
  id: string
  profile_id: string
  streak_type: StreakType
  current_count: number
  longest_count: number
  last_activity_at: string | null
  freeze_tokens: number
  updated_at: string
}

export const STREAK_CONFIG: Record<StreakType, {
  label: string
  icon: string
  description: string
  window_days: number
}> = {
  attendance: {
    label: 'Attendance',
    icon: 'calendar-check',
    description: 'Attend at least one event per week',
    window_days: 9,
  },
  posting: {
    label: 'Posting',
    icon: 'pen-tool',
    description: 'Share at least one post per week',
    window_days: 9,
  },
  hosting: {
    label: 'Hosting',
    icon: 'mic',
    description: 'Host at least one event per week',
    window_days: 14,
  },
  login: {
    label: 'Activity',
    icon: 'log-in',
    description: 'Log in at least once per week',
    window_days: 9,
  },
}

// ---------------------------------------------------------------------------
// Season challenges
// ---------------------------------------------------------------------------

export type ChallengeDifficulty = 'easy' | 'normal' | 'hard' | 'legendary'

// ---------------------------------------------------------------------------
// Tier display config
// ---------------------------------------------------------------------------

// These two records were the ONLY place in the repo carrying raw Tailwind palette
// classes (amber-700, gray-500, violet-600 …), and because they are exported and
// consumed by every achievement, award and challenge surface, those strings
// propagated everywhere while answering to nothing: not a skin, not an occasion, not
// a feel generation, not even DAWN's own dark mode — they carried Tailwind's `dark:`
// palette instead. A member on the Midnight skin saw Tailwind violet.
//
// They now draw from the DAWN rank spectrum, which exists for exactly this ("the rest
// serve Amplitude tiers, Pillars and Space accents"). The contract per rank is
// core = fill · deep = text on light · bright = text on dark, so a text field pairs
// `-deep` with a `dark:` `-bright`, and tints are alpha over the core.
export const TIER_CONFIG: Record<AchievementTier, {
  label: string
  color: string
  bg: string
  border: string
  glow: string
}> = {
  // bronze→clay, silver→stone, gold→gold, platinum→indigo. Earthy metals map onto the
  // spectrum's own earthy primitives; platinum takes the one cool jewel step, so the
  // ladder still climbs in perceived value without leaving the palette.
  bronze: {
    label: 'Bronze',
    color: 'text-rank-clay-deep dark:text-rank-clay-bright',
    bg: 'bg-rank-clay/10 dark:bg-rank-clay/15',
    border: 'border-rank-clay/30 dark:border-rank-clay/40',
    glow: '',
  },
  silver: {
    label: 'Silver',
    color: 'text-rank-stone-deep dark:text-rank-stone-bright',
    bg: 'bg-rank-stone/10 dark:bg-rank-stone/15',
    border: 'border-rank-stone/30 dark:border-rank-stone/40',
    glow: '',
  },
  gold: {
    label: 'Gold',
    color: 'text-rank-gold-deep dark:text-rank-gold-bright',
    bg: 'bg-rank-gold/10 dark:bg-rank-gold/15',
    border: 'border-rank-gold/35 dark:border-rank-gold/45',
    glow: 'ring-1 ring-rank-gold/45',
  },
  platinum: {
    label: 'Platinum',
    color: 'text-rank-indigo-deep dark:text-rank-indigo-bright',
    bg: 'bg-rank-indigo/10 dark:bg-rank-indigo/15',
    border: 'border-rank-indigo/35 dark:border-rank-indigo/45',
    glow: 'ring-1 ring-rank-indigo/45',
  },
}

export const CATEGORY_CONFIG: Record<AchievementCategory, {
  label: string
  icon: string
}> = {
  social:     { label: 'Social',     icon: 'users' },
  events:     { label: 'Events',     icon: 'calendar' },
  content:    { label: 'Content',    icon: 'edit' },
  leadership: { label: 'Leadership', icon: 'crown' },
  streak:     { label: 'Streaks',    icon: 'flame' },
  seasonal:   { label: 'Seasonal',   icon: 'zap' },
  special:    { label: 'Special',    icon: 'star' },
}

export const DIFFICULTY_CONFIG: Record<ChallengeDifficulty, {
  label: string
  color: string
  bg: string
  bar: string
}> = {
  // easy→jade, normal→slate, hard→clay, legendary→plum. Note easy is a JADE and not a
  // green: DAWN's success tone is a teal so that "done" reads cohesive with Signal, and
  // a true green would be the one hue the system deliberately does not own. The bar is
  // the rank CORE (a fill), the label its `-deep`/`-bright` pair (text).
  easy:      { label: 'Easy',      color: 'text-rank-jade-deep dark:text-rank-jade-bright',     bg: 'bg-rank-jade/10 dark:bg-rank-jade/15',     bar: 'bg-rank-jade' },
  normal:    { label: 'Normal',    color: 'text-rank-slate-deep dark:text-rank-slate-bright',   bg: 'bg-rank-slate/10 dark:bg-rank-slate/15',   bar: 'bg-rank-slate' },
  hard:      { label: 'Hard',      color: 'text-rank-clay-deep dark:text-rank-clay-bright',     bg: 'bg-rank-clay/10 dark:bg-rank-clay/15',     bar: 'bg-rank-clay' },
  legendary: { label: 'Legendary', color: 'text-rank-plum-deep dark:text-rank-plum-bright',     bg: 'bg-rank-plum/10 dark:bg-rank-plum/15',     bar: 'bg-rank-plum' },
}

// ---------------------------------------------------------------------------
// The Quest — completion-model rewards (ADR-Quest)
// ---------------------------------------------------------------------------
// A Journey finishes when a member logs one of its Practices on enough DISTINCT
// days inside the Journey window AND completes its Expression Challenge. Finishing
// pays a flat Zap purse, an escalating Gem bonus by the NEW rank reached, and a
// Trophy (the journey_completions row itself). The Expression Challenge pays on its
// own: in person at a Circle earns Zaps, posted solo online earns Gems. These are
// the tunable-fallback constants; the live numbers (where applicable) come from
// zap_config / gem_config, so a grant never breaks if a config row is missing.
export const QUEST = {
  /** Distinct days a Journey's Practices must be logged inside its window. The
   *  spec band is 14-16; 14 is the bar. */
  DAYS_TO_FINISH_JOURNEY: 14,
  /** The member-anchored completion window for a member-built (library) Journey:
   *  ~4 weeks from the member's enrollment. Official season Journeys use their own
   *  fixed window (journey_plans.window_starts_at/ends_at) instead. */
  JOURNEY_WINDOW_DAYS: 28,
  /** Flat Zap purse for finishing a Journey. */
  JOURNEY_FINISH_ZAPS: 75,
  /** Escalating Gem bonus by the NEW rank reached on finishing. */
  JOURNEY_GEM_BONUS: { initiate: 25, adept: 50, master: 100 } as Record<string, number>,
  /** Expression Challenge done in person at a Circle. */
  EXPRESSION_CIRCLE_ZAPS: 50,
  /** Expression Challenge posted solo online. */
  EXPRESSION_ONLINE_GEMS: 30,
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isStreakActive(lastActivityAt: string | null, windowDays: number): boolean {
  if (!lastActivityAt) return false
  const last = new Date(lastActivityAt)
  const now = new Date()
  const diffMs = now.getTime() - last.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= windowDays
}
