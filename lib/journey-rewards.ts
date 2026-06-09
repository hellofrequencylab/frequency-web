// Journey reward firing (ADR-200; docs/JOURNEYS.md §6). Pure decision logic for the three
// bonuses that ride a practice log — Full Day, Weekly Rhythm, Journey completion — plus the
// stable idempotency keys they grant under. The DB layer (lib/journey-grants.ts) computes the
// inputs, calls evaluateLogRewards, then for each returned bonus inserts a reward_grants row
// (UNIQUE(rule_key, profile_id) → exactly-once) and writes the gem/zap ledger. Currency
// follows ADR-139: practice consistency → Zaps; the season-completion payoff → Gems.
//
// The standard per-log Zap (+12) is granted by the existing practice-log loop, not here;
// practiceLogZaps() is exposed only so callers share one source for that value.

export type RewardKind = 'zaps' | 'gems' // matches reward_grants.reward_kind / the ledgers

export interface RewardBonus {
  /** Stable rule key for reward_grants idempotency. The table adds profile_id. */
  key: string
  kind: RewardKind
  amount: number
  /** Short label for the toast + the ledger detail. */
  label: string
}

export const STANDARD_LOG_ZAPS = 12
export const FULL_DAY_ZAPS = 25
export const WEEKLY_RHYTHM_ZAPS = 50
export const DEFAULT_COMPLETION_GEMS = 30

/** The per-practice standard log value: a practice's own override, else the standard 12.
 *  (The 8–15 band in the brief is authoring guidance, not enforced here.) */
export function practiceLogZaps(rewardZapsOverride: number | null | undefined): number {
  return rewardZapsOverride ?? STANDARD_LOG_ZAPS
}

export function fullDayKey(date: string): string {
  return `journey.fullday:${date}`
}
export function weeklyRhythmKey(planId: string, season: number | string, bucket: number): string {
  return `journey.rhythm:${planId}:${season}:${bucket}`
}
export function completionKey(planId: string, season: number | string): string {
  return `journey.complete:${planId}:${season}`
}

export interface LogRewardInput {
  /** YYYY-MM-DD of the log. */
  date: string
  /** Full Day — distinct journey steps due today vs. how many the member has logged today. */
  stepsDueToday: number
  distinctStepsLoggedToday: number
  /** Weekly Rhythm + Completion are scoped to one plan. */
  planId: string
  /** The plan's season (or a stable token for an evergreen plan). */
  season: number | string
  /** The current Arc-clock bucket (null = outside the season window). */
  seasonWeekBucket: number | null
  /** All of the plan's steps on track in the rolling 7-day window? */
  allStepsOnTrack: boolean
  /** Completion — distinct qualifying weeks vs. the plan's target. */
  qualifyingWeeks: number
  targetWeeks: number
  completionGems: number
  /** Keys already granted to this member (so a bonus is proposed at most once). */
  alreadyGranted: ReadonlySet<string>
}

/**
 * Decide which bonuses a log fires. Pure: no side effects, no DB. Returns the bonuses to
 * grant (already filtered against alreadyGranted), each carrying its idempotency key.
 */
export function evaluateLogRewards(input: LogRewardInput): RewardBonus[] {
  const out: RewardBonus[] = []
  const propose = (b: RewardBonus) => {
    if (!input.alreadyGranted.has(b.key)) out.push(b)
  }

  // Full Day — every step due today is logged. Once per member per day.
  if (input.stepsDueToday > 0 && input.distinctStepsLoggedToday >= input.stepsDueToday) {
    propose({ key: fullDayKey(input.date), kind: 'zaps', amount: FULL_DAY_ZAPS, label: 'Full Day' })
  }

  // Weekly Rhythm — every step on track this bucket. Once per plan per season-week.
  if (input.allStepsOnTrack && input.seasonWeekBucket !== null) {
    propose({
      key: weeklyRhythmKey(input.planId, input.season, input.seasonWeekBucket),
      kind: 'zaps',
      amount: WEEKLY_RHYTHM_ZAPS,
      label: 'Weekly Rhythm',
    })
  }

  // Completion — qualifying weeks reached the target. Once per plan per season.
  if (input.targetWeeks > 0 && input.qualifyingWeeks >= input.targetWeeks) {
    propose({
      key: completionKey(input.planId, input.season),
      kind: 'gems',
      amount: input.completionGems,
      label: 'Journey complete',
    })
  }

  return out
}
