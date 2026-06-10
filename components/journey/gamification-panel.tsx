import { Zap, Gem, Flame, Trophy } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { rankForZaps, RANK_LABELS, seasonRankStyle } from '@/lib/season-ranks'
import { StatCard } from '@/components/ui/stat-card'

// The gamification panel (docs/JOURNEYS.md §10) — Zaps · rank · streak · Gems. A REQUIRED
// active-mode widget. Async Server Component: it self-fetches the player's totals from
// `profiles` (same source as the rail dock's loadGameStats) so it can sit behind its own
// <Suspense> on the page and never block the shell (PAGE-FRAMEWORK §5). Best-effort — a
// read failure degrades to zeros, never throws.

async function loadStats(profileId: string) {
  try {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId)
      .maybeSingle()
    const p = data as { current_season_zaps?: number; lifetime_gems?: number; current_streak?: number } | null
    return {
      zaps: p?.current_season_zaps ?? 0,
      gems: p?.lifetime_gems ?? 0,
      streak: p?.current_streak ?? 0,
    }
  } catch {
    return { zaps: 0, gems: 0, streak: 0 }
  }
}

export async function GamificationPanel({ profileId }: { profileId: string }) {
  const { zaps, gems, streak } = await loadStats(profileId)
  const rank = rankForZaps(zaps)

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight text-text">Your standing</h2>
        {rank && (
          <span className="rank-badge text-2xs" style={seasonRankStyle(rank)}>
            {RANK_LABELS[rank] ?? rank}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Zaps" value={zaps.toLocaleString()} icon={Zap} />
        <StatCard label="Rank" value={rank ? (RANK_LABELS[rank] ?? rank) : '–'} icon={Trophy} />
        <StatCard label="Streak" value={`${streak}d`} icon={Flame} />
        <StatCard label="Gems" value={gems.toLocaleString()} icon={Gem} />
      </div>
    </section>
  )
}
