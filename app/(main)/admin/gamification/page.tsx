import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Award, Target, Flame, Trophy, Zap, Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
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

// zap_config / gem_config aren't in the generated types yet (read via untyped handle).
type ZapCfgRow = { action_type: string; zaps_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }
type GemCfgRow = { action_type: string; gems_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }

type TopEarner = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'handle' | 'achievement_count' | 'lifetime_zaps' | 'current_streak'
>

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
    const cfg = admin as unknown as SupabaseClient
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

  return (
    <AdminPage
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
          <StatCard label="Times Unlocked" value={totalUnlocked ?? 0} icon={Trophy} />
          <StatCard label="Season Challenges" value={totalChallenges ?? 0} icon={Target} />
          <StatCard label="Challenges Completed" value={totalChallengesCompleted ?? 0} icon={Flame} />
        </div>
      </AdminSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top achievers */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-text flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Top Achievers
            </h2>
          </div>
          <div>
            {((topEarners ?? []) as TopEarner[]).map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < (topEarners?.length ?? 0) - 1 ? 'border-b border-border' : ''
                }`}
              >
                <span className="text-sm font-bold text-subtle w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link href={`/people/${p.handle}`} className="text-sm font-medium text-text hover:underline truncate block">
                    {p.display_name}
                  </Link>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3 text-signal" />
                    {p.achievement_count ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-primary" />
                    {(p.lifetime_zaps ?? 0).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-primary" />
                    {p.current_streak ?? 0}w
                  </span>
                </div>
              </div>
            ))}
            {!(topEarners?.length) && (
              <div className="px-4 py-8 text-center text-sm text-subtle">No achievements earned yet.</div>
            )}
          </div>
        </section>

        {/* Achievement list */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-text flex items-center gap-2">
              <Award className="w-3.5 h-3.5" />
              All Achievements ({achievements?.length ?? 0})
            </h2>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(achievements ?? []).map(a => {
              const tier = TIER_CONFIG[a.tier as AchievementTier]
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2 border-b border-border dark:border-border/30 last:border-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${tier.bg} ${tier.color}`}>
                    {tier.label}
                  </span>
                  <span className="text-xs text-text flex-1 truncate">{a.name}</span>
                  {a.zaps_reward > 0 && (
                    <span className="text-xs text-subtle flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5 text-primary" />+{a.zaps_reward}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Season challenges list */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold text-text flex items-center gap-2">
              <Target className="w-3.5 h-3.5" />
              Season 1 Challenges ({challenges?.length ?? 0})
            </h2>
          </div>
          <div className="divide-y divide-border/30">
            {(challenges ?? []).map(c => {
              const diff = DIFFICULTY_CONFIG[c.difficulty as ChallengeDifficulty]
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${diff.bg} ${diff.color}`}>
                    {diff.label}
                  </span>
                  <span className="text-xs text-text flex-1">{c.name}</span>
                  <span className="text-xs text-subtle">Target: {c.target}</span>
                  <span className="text-xs text-subtle flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5 text-primary" />+{c.zaps_reward}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </AdminPage>
  )
}
