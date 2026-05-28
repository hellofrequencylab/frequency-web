import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Award, Target, Flame, Trophy, Zap, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TIER_CONFIG, DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { AchievementTier, ChallengeDifficulty } from '@/lib/gamification'
import type { Database } from '@/lib/database.types'
import { AwardDialog } from './award-dialog'

type TopEarner = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'display_name' | 'handle' | 'achievement_count' | 'lifetime_zaps' | 'current_streak'
>

export default async function AdminGamificationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)) {
    notFound()
  }

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
    admin.from('season_challenges').select('id, slug, name, difficulty, target, zaps_reward').order('sort_order'),
    admin.from('profiles').select('id, display_name, handle').eq('is_active', true).order('display_name').limit(200),
  ] as const)

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Gamification</h1>
          <p className="text-sm text-muted mt-1">
            Overview of achievements, challenges, and engagement stats.
          </p>
        </div>
        <AwardDialog
          achievements={(achievements ?? []).map(a => ({ id: a.id, name: a.name, tier: a.tier }))}
          members={(allMembers ?? []).map(m => ({ id: m.id, display_name: m.display_name, handle: m.handle }))}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Achievements" value={String(totalAchievements ?? 0)} Icon={Award} color="text-signal-strong bg-signal-bg dark:text-signal" />
        <StatCard label="Times Unlocked" value={String(totalUnlocked ?? 0)} Icon={Trophy} color="text-warning bg-warning-bg dark:text-primary" />
        <StatCard label="Season Challenges" value={String(totalChallenges ?? 0)} Icon={Target} color="text-primary-strong bg-primary-bg dark:text-primary-strong" />
        <StatCard label="Challenges Completed" value={String(totalChallengesCompleted ?? 0)} Icon={Flame} color="text-warning bg-warning-bg dark:text-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top achievers */}
        <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-subtle flex items-center gap-2">
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
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-subtle flex items-center gap-2">
              <Award className="w-3.5 h-3.5" />
              All Achievements ({achievements?.length ?? 0})
            </h2>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(achievements ?? []).map(a => {
              const tier = TIER_CONFIG[a.tier as AchievementTier]
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 dark:border-border/30 last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tier.bg} ${tier.color}`}>
                    {tier.label}
                  </span>
                  <span className="text-xs text-text flex-1 truncate">{a.name}</span>
                  {a.zaps_reward > 0 && (
                    <span className="text-[11px] text-subtle flex items-center gap-0.5">
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
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-subtle flex items-center gap-2">
              <Target className="w-3.5 h-3.5" />
              Season 1 Challenges ({challenges?.length ?? 0})
            </h2>
          </div>
          <div className="divide-y divide-border/30">
            {(challenges ?? []).map(c => {
              const diff = DIFFICULTY_CONFIG[c.difficulty as ChallengeDifficulty]
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${diff.bg} ${diff.color}`}>
                    {diff.label}
                  </span>
                  <span className="text-xs text-text flex-1">{c.name}</span>
                  <span className="text-[11px] text-subtle">Target: {c.target}</span>
                  <span className="text-[11px] text-subtle flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5 text-primary" />+{c.zaps_reward}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ label, value, Icon, color }: { label: string; value: string; Icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-bold text-text leading-none">{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  )
}
