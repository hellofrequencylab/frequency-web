'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, Target, Flame, Trophy } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { AwardDialog } from '@/app/(main)/admin/gamification/award-dialog'
import { SeasonControl } from '@/app/(main)/admin/gamification/season-control'
import { RewardConfig } from '@/app/(main)/admin/gamification/reward-config'
import { loadGamification } from '@/app/(main)/admin/gamification/gamification-action'

// In-place Gamification (ADR-138 — Engage). Renders the actionable controls
// (SeasonControl · AwardDialog · janitor RewardConfig) + a stat summary inside the
// page admin console, reusing the existing admin components. The full achievement /
// challenge catalogs stay on /admin/gamification (linked below). Fetches on mount via
// a capability-gated action; renders nothing unless the viewer is an operator.

type Data = NonNullable<Awaited<ReturnType<typeof loadGamification>>>

export function GamificationModule() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadGamification().then((d) => {
      if (active) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Achievements" value={data.stats.achievements} icon={Award} />
        <StatCard label="Unlocked" value={data.stats.unlocked} icon={Trophy} />
        <StatCard label="Challenges" value={data.stats.challenges} icon={Target} />
        <StatCard label="Completed" value={data.stats.completed} icon={Flame} />
      </div>

      <SeasonControl season={data.season} isJanitor={data.isJanitor} />
      <AwardDialog achievements={data.awardAchievements} members={data.members} />
      {data.isJanitor && <RewardConfig zaps={data.zapRewards} gems={data.gemRewards} />}

      <Link
        href="/admin/gamification"
        className="block px-2.5 py-1.5 text-center text-xs text-subtle transition-colors hover:text-primary-strong"
      >
        View full achievements &amp; challenges →
      </Link>
    </div>
  )
}
