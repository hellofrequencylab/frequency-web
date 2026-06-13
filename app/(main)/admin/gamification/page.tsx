import Link from 'next/link'
import { Award, Target, Flame, Trophy, Zap, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import type { StatusTone } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_CONFIG, DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { AchievementTier, ChallengeDifficulty } from '@/lib/gamification'
import type { Database } from '@/lib/database.types'
import { AwardDialog } from './award-dialog'
import { Suspense } from 'react'
import { getCurrentSeason } from '@/lib/seasons'
import { SeasonControl } from './season-control'
import { RewardConfig, type RewardRow } from './reward-config'
import { MetricsPanel } from './metrics-panel'

// Gamification — achievements, challenges, and engagement stats. INDEX / TABLE (ADR-233 §3.3).
// TIER_CONFIG/.bg/.color and DIFFICULTY_CONFIG/.bg/.color are NOT applied directly to markup —
// instead we render their .label inside StatusChip with a neutral tone to avoid bespoke hex.
// The lib/gamification constants are not edited (shared lib).

// zap_config / gem_config aren't in the generated types yet (read via untyped handle).
type ZapCfgRow = { action_type: string; zaps_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }
type GemCfgRow = { action_type: string; gems_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }

type TopEarner = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'handle' | 'achievement_count' | 'lifetime_zaps' | 'current_streak'
>

// Tone map for achievement tiers (label-only; raw .bg/.color from TIER_CONFIG are not used)
const TIER_TONE: Record<AchievementTier, StatusTone> = {
  bronze:   'warning',
  silver:   'neutral',
  gold:     'warning',
  platinum: 'info',
}

// Tone map for challenge difficulties
const DIFF_TONE: Record<ChallengeDifficulty, StatusTone> = {
  easy:      'success',
  normal:    'info',
  hard:      'warning',
  legendary: 'danger',
}

type AchievementRow = { id: string; slug: string; name: string; tier: string; category: string; zaps_reward: number }
type ChallengeRow   = { id: string; slug: string; name: string; difficulty: string; target: number; zaps_reward: number }

export default async function AdminGamificationPage() {
  const { role } = await requireAdmin('host', { staff: 'community' })

  const admin = createAdminClient()

  // Stats
  const [
    { count: totalAchievements },
    { count: totalUnlocked },
    { count: totalChallenges },
    { count: totalChallengesCompleted },
    { data: topEarners },
    { data: achievements },
    { data: challenges },
    { data: allMembers },
  ] = await Promise.all([
    admin.from('achievements').select('id', { count: 'exact', head: true }),
    admin.from('user_achievements').select('id', { count: 'exact', head: true }),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('challenge_progress').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null),
    admin.from('profiles')
      .select('id, display_name, handle, achievement_count, lifetime_zaps, current_streak')
      .order('achievement_count', { ascending: false })
      .limit(5),
    admin.from('achievements').select('id, slug, name, tier, category, zaps_reward').order('sort_order'),
    admin.from('season_challenges').select('id, slug, name, difficulty, target, zaps_reward').eq('is_active', true).order('sort_order'),
    admin.from('profiles').select('id, display_name, handle').eq('is_active', true).order('display_name').limit(200),
  ] as const)

  const currentSeason = await getCurrentSeason()
  const isJanitor = role === 'janitor'

  // Live reward-economy config (janitor-only editor below).
  let zapRewards: RewardRow[] = []
  let gemRewards: RewardRow[] = []
  if (isJanitor) {
    const cfg = admin
    const [{ data: zapRows }, { data: gemRows }] = await Promise.all([
      cfg.from('zap_config').select('action_type, zaps_amount, daily_cap, is_active, description').order('action_type'),
      cfg.from('gem_config').select('action_type, gems_amount, daily_cap, is_active, description').order('action_type'),
    ])
    zapRewards = ((zapRows as ZapCfgRow[] | null) ?? []).map((r) => ({
      action_type: r.action_type, amount: r.zaps_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
    }))
    gemRewards = ((gemRows as GemCfgRow[] | null) ?? []).map((r) => ({
      action_type: r.action_type, amount: r.gems_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
    }))
  }

  // DataTable column definitions — tier/diff labels come from the shared config (.label only)
  const achievementColumns: ColumnDef<AchievementRow>[] = [
    {
      key: 'name',
      header: 'Achievement',
      render: (a) => <span className="text-sm font-medium text-text truncate">{a.name}</span>,
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (a) => {
        const tier = TIER_CONFIG[a.tier as AchievementTier]
        return <StatusChip tone={TIER_TONE[a.tier as AchievementTier] ?? 'neutral'}>{tier?.label ?? a.tier}</StatusChip>
      },
    },
    {
      key: 'category',
      header: 'Category',
      render: (a) => <span className="text-xs text-muted capitalize">{a.category}</span>,
    },
    {
      key: 'zaps_reward',
      header: 'Zaps',
      align: 'right',
      type: 'number',
      render: (a) => (
        <span className="tabular-nums text-muted flex items-center justify-end gap-0.5">
          <Zap className="w-2.5 h-2.5 text-primary" aria-hidden />
          +{a.zaps_reward}
        </span>
      ),
    },
  ]

  const challengeColumns: ColumnDef<ChallengeRow>[] = [
    {
      key: 'name',
      header: 'Challenge',
      render: (c) => <span className="text-sm font-medium text-text truncate">{c.name}</span>,
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      render: (c) => {
        const diff = DIFFICULTY_CONFIG[c.difficulty as ChallengeDifficulty]
        return <StatusChip tone={DIFF_TONE[c.difficulty as ChallengeDifficulty] ?? 'neutral'}>{diff?.label ?? c.difficulty}</StatusChip>
      },
    },
    {
      key: 'target',
      header: 'Target',
      align: 'right',
      type: 'number',
      render: (c) => <span className="tabular-nums text-muted">{c.target}</span>,
    },
    {
      key: 'zaps_reward',
      header: 'Zaps',
      align: 'right',
      type: 'number',
      render: (c) => (
        <span className="tabular-nums text-muted flex items-center justify-end gap-0.5">
          <Zap className="w-2.5 h-2.5 text-primary" aria-hidden />
          +{c.zaps_reward}
        </span>
      ),
    },
  ]

  const achievementRows = (achievements ?? []) as AchievementRow[]
  const challengeRows   = (challenges ?? []) as ChallengeRow[]

  return (
    <AdminTemplate
      title="Gamification"
      eyebrow="Community"
      description="Overview of achievements, challenges, and engagement stats."
      width="default"
      actions={
        <AwardDialog
          achievements={(achievements ?? []).map(a => ({ id: a.id, name: a.name, tier: a.tier }))}
          members={(allMembers ?? []).map(m => ({ id: m.id, display_name: m.display_name, handle: m.handle }))}
        />
      }
    >
      <SeasonControl season={currentSeason} isJanitor={isJanitor} />

      {isJanitor && <RewardConfig zaps={zapRewards} gems={gemRewards} />}

      {/* Rewards Economy v2 health metrics (brief §10) — heavier reads, so they
          stream in behind the fold rather than blocking the page. */}
      <Suspense fallback={null}>
        <MetricsPanel />
      </Suspense>

      <AdminSection>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Achievements" value={totalAchievements ?? 0} icon={Award} />
          <StatCard label="Times unlocked" value={totalUnlocked ?? 0} icon={Trophy} />
          <StatCard label="Season challenges" value={totalChallenges ?? 0} icon={Target} />
          <StatCard label="Challenges completed" value={totalChallengesCompleted ?? 0} icon={Flame} />
        </div>
      </AdminSection>

      {/* Top achievers — compact leaderboard panel */}
      <AdminSection title="Top achievers">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {((topEarners ?? []) as TopEarner[]).length === 0 ? (
            <EmptyState
              variant="first-use"
              icon={Users}
              title="No achievements earned yet"
              description="Members who unlock achievements will appear here."
            />
          ) : (
            <div>
              {((topEarners ?? []) as TopEarner[]).map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < (topEarners?.length ?? 0) - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <span className="text-sm font-bold text-subtle w-5 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <Link href={`/people/${p.handle}`} className="text-sm font-medium text-text hover:underline truncate block">
                      {p.display_name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted">
                    <span className="flex items-center gap-1 tabular-nums">
                      <Award className="w-3 h-3 text-signal" aria-hidden />
                      {p.achievement_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Zap className="w-3 h-3 text-primary" aria-hidden />
                      {(p.lifetime_zaps ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Flame className="w-3 h-3 text-primary" aria-hidden />
                      {p.current_streak ?? 0}w
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminSection>

      {/* All achievements — DataTable */}
      <AdminSection title={`All achievements (${achievementRows.length})`}>
        <DataTable
          caption="All achievements"
          columns={achievementColumns}
          rows={achievementRows}
          getRowId={(a) => a.id}
          empty={
            <EmptyState
              variant="first-use"
              icon={Award}
              title="No achievements yet"
              description="Achievements you configure will appear here."
            />
          }
        />
      </AdminSection>

      {/* Season challenges — DataTable */}
      <AdminSection title={`Season challenges (${challengeRows.length})`}>
        <DataTable
          caption="Active season challenges"
          columns={challengeColumns}
          rows={challengeRows}
          getRowId={(c) => c.id}
          empty={
            <EmptyState
              variant="first-use"
              icon={Target}
              title="No active challenges"
              description="Active challenges for the current season will appear here."
            />
          }
        />
      </AdminSection>
    </AdminTemplate>
  )
}
