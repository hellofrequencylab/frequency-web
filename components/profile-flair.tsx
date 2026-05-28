import { Flame, Award, Gem } from 'lucide-react'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { getGemTier } from '@/lib/gems'

interface ProfileFlairProps {
  rank?: SeasonRank | string | null
  streak?: number | null
  achievementCount?: number | null
  gems?: number | null
  compact?: boolean
}

export function ProfileFlair({ rank, streak, achievementCount, gems, compact = false }: ProfileFlairProps) {
  const validRank = rank && rank !== 'ghost' ? (rank as SeasonRank) : null
  const hasStreak = (streak ?? 0) > 0
  const hasAchievements = (achievementCount ?? 0) > 0
  const gemCount = gems ?? 0
  const gemTier = gemCount > 0 ? getGemTier(gemCount) : null

  if (!validRank && !hasStreak && !hasAchievements && !gemTier) return null

  return (
    <>
      {validRank && (
        <span
          className="rank-badge text-[10px] font-bold leading-tight"
          style={seasonRankStyle(validRank)}
        >
          {compact ? validRank.charAt(0).toUpperCase() : RANK_LABELS[validRank] ?? validRank}
        </span>
      )}
      {hasStreak && (
        <span className="text-[11px] font-semibold text-primary dark:text-primary flex items-center gap-0.5">
          <Flame className="w-3 h-3" />{streak}
        </span>
      )}
      {gemTier && !compact && (
        <span className="text-[11px] font-medium text-signal-strong flex items-center gap-0.5">
          <Gem className="w-3 h-3" />{gemCount.toLocaleString()}
        </span>
      )}
      {gemTier && compact && gemCount >= 100 && (
        <span className={`w-2 h-2 rounded-full ${gemTier.color}`} title={`${gemCount} gems — ${gemTier.label}`} />
      )}
      {hasAchievements && !compact && (
        <span className="text-[11px] font-medium text-signal dark:text-signal flex items-center gap-0.5">
          <Award className="w-3 h-3" />{achievementCount}
        </span>
      )}
    </>
  )
}
