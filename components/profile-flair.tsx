import { Flame, Award, Gem } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

interface ProfileFlairProps {
  rank?: SeasonRank | string | null
  streak?: number | null
  achievementCount?: number | null
  gems?: number | null
  compact?: boolean
  /** Whether the rank badge is *endorsed* (shown publicly). Crew+ only; free
   *  members earn a rank but don't display it (ADR-141). Streak/gems/achievements
   *  are earned stats and show regardless. Defaults true (Beta = everyone Crew). */
  endorsed?: boolean
}

export function ProfileFlair({ rank, streak, achievementCount, gems, compact = false, endorsed = true }: ProfileFlairProps) {
  const validRank = endorsed && rank && rank !== 'ghost' ? (rank as SeasonRank) : null
  const hasStreak = (streak ?? 0) > 0
  const hasAchievements = (achievementCount ?? 0) > 0
  // Gem tiers (New → Legend) are retired (Rewards Economy v2): the count shows
  // as plain spendable currency; Amplitude is the lifetime progression layer.
  const gemCount = gems ?? 0

  if (!validRank && !hasStreak && !hasAchievements && gemCount <= 0) return null

  return (
    <>
      {validRank && (
        <span
          className="rank-badge text-3xs font-bold leading-tight"
          style={seasonRankStyle(validRank)}
        >
          {compact ? validRank.charAt(0).toUpperCase() : RANK_LABELS[validRank] ?? validRank}
        </span>
      )}
      {hasStreak && (
        <span className="text-2xs font-semibold text-primary dark:text-primary flex items-center gap-0.5">
          <Flame className="w-3 h-3" />{streak}
        </span>
      )}
      {gemCount > 0 && !compact && (
        <span className="text-2xs font-medium text-signal-strong flex items-center gap-0.5">
          <Gem className="w-3 h-3" />{gemCount.toLocaleString()}
        </span>
      )}
      {hasAchievements && !compact && (
        <span className="text-2xs font-medium text-signal dark:text-signal flex items-center gap-0.5">
          <Award className="w-3 h-3" />{achievementCount}
        </span>
      )}
    </>
  )
}
