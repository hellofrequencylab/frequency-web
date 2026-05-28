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

export interface UserAchievement {
  id: string
  profile_id: string
  achievement_id: string
  unlocked_at: string
  achievement?: Achievement
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
  | { type: 'season_zaps';    count: number }
  | { type: 'rank_reached';   rank: string }
  | { type: 'task_complete';  count: number }
  | { type: 'all_challenges' }
  | { type: 'manual' }

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

export interface SeasonChallenge {
  id: string
  season: number
  slug: string
  name: string
  description: string
  category: AchievementCategory
  difficulty: ChallengeDifficulty
  criteria: Record<string, unknown>
  target: number
  zaps_reward: number
  sort_order: number
}

export interface ChallengeProgress {
  id: string
  profile_id: string
  challenge_id: string
  current: number
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// Tier display config
// ---------------------------------------------------------------------------

export const TIER_CONFIG: Record<AchievementTier, {
  label: string
  color: string
  bg: string
  border: string
  glow: string
}> = {
  bronze: {
    label: 'Bronze',
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    glow: '',
  },
  silver: {
    label: 'Silver',
    color: 'text-gray-500 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-800/60',
    border: 'border-gray-300 dark:border-gray-600',
    glow: '',
  },
  gold: {
    label: 'Gold',
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-950/40',
    border: 'border-yellow-300 dark:border-yellow-700',
    glow: 'shadow-yellow-200/40 dark:shadow-yellow-900/30',
  },
  platinum: {
    label: 'Platinum',
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-300 dark:border-violet-700',
    glow: 'shadow-violet-200/50 dark:shadow-violet-900/30',
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
  easy:      { label: 'Easy',      color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-950/40',  bar: 'bg-green-500' },
  normal:    { label: 'Normal',    color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/40',    bar: 'bg-blue-500' },
  hard:      { label: 'Hard',      color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-950/40',bar: 'bg-orange-500' },
  legendary: { label: 'Legendary', color: 'text-violet-600 dark:text-violet-400',bg: 'bg-violet-50 dark:bg-violet-950/40',bar: 'bg-violet-500' },
}

// ---------------------------------------------------------------------------
// Quest chains
// ---------------------------------------------------------------------------

export interface QuestChain {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  season: number | null
  zaps_reward: number
}

export interface QuestStep {
  id: string
  chain_id: string
  step_order: number
  name: string
  description: string
  criteria: Record<string, unknown>
  target: number
  zaps_reward: number
}

export interface QuestProgress {
  id: string
  profile_id: string
  chain_id: string
  current_step: number
  step_progress: number
  started_at: string
  completed_at: string | null
}

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

export function getStreakFreezeEarnedAt(count: number): number[] {
  const milestones = [4, 8, 13, 26, 52]
  return milestones.filter(m => count >= m)
}
