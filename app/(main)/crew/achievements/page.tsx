import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Award, Lock, Trophy, Zap, Flame, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAchievementsData } from '../gamification-actions'
import { TIER_CONFIG, CATEGORY_CONFIG } from '@/lib/gamification'
import type { AchievementCategory, AchievementTier } from '@/lib/gamification'

const ICON_MAP: Record<string, React.ElementType> = {
  award: Award,
  trophy: Trophy,
  zap: Zap,
  flame: Flame,
  star: Star,
}

function AchievementIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] ?? Award
  return <Icon className={className} />
}

export default async function AchievementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { achievements, stats } = await getAchievementsData()

  // Group by category
  const byCategory = new Map<AchievementCategory, typeof achievements>()
  for (const a of achievements) {
    const list = byCategory.get(a.category) ?? []
    list.push(a)
    byCategory.set(a.category, list)
  }

  const earnedPct = stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) : 0

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/crew"
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Crew
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Achievements</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Earn badges by engaging with your community. Some are secret — keep exploring to find them all.
        </p>
      </div>

      {/* Progress overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Earned" value={`${stats.earned}/${stats.total}`} sub={`${earnedPct}%`} />
        <StatCard label="Lifetime Zaps" value={stats.lifetimeZaps.toLocaleString()} />
        <StatCard label="Current Streak" value={`${stats.currentStreak}w`} />
        <StatCard label="Longest Streak" value={`${stats.longestStreak}w`} />
      </div>

      {/* Global progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Collection Progress
          </span>
          <span className="text-xs text-gray-400">{stats.earned} of {stats.total}</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
            style={{ width: `${earnedPct}%` }}
          />
        </div>
      </div>

      {/* Achievement categories */}
      <div className="space-y-8">
        {Array.from(byCategory.entries()).map(([category, items]) => {
          const catConfig = CATEGORY_CONFIG[category]
          const earned = items.filter(a => a.earned).length

          return (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {catConfig.label}
                </h2>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 font-medium">
                  {earned}/{items.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(a => {
                  const tier = TIER_CONFIG[a.tier as AchievementTier]
                  const isSecret = a.is_secret && !a.earned

                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl border px-4 py-3 transition-all ${
                        a.earned
                          ? `${tier.border} ${tier.bg} shadow-sm ${tier.glow ? `shadow-md ${tier.glow}` : ''}`
                          : 'border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          a.earned
                            ? `${tier.bg} ${tier.color}`
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                        }`}>
                          {isSecret ? (
                            <Lock className="w-5 h-5" />
                          ) : (
                            <AchievementIcon icon={a.icon} className="w-5 h-5" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${
                              a.earned
                                ? 'text-gray-900 dark:text-gray-50'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {isSecret ? '???' : a.name}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tier.bg} ${tier.color}`}>
                              {tier.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            {isSecret ? 'Keep exploring to discover this achievement.' : a.description}
                          </p>
                          {a.earned && a.unlockedAt && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                              Unlocked {new Date(a.unlockedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          )}
                          {!a.earned && a.zaps_reward > 0 && !isSecret && (
                            <div className="flex items-center gap-1 mt-1">
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span className="text-[11px] font-medium text-gray-400">+{a.zaps_reward} zaps</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-3">
      <div className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-none">
        {value}
        {sub && <span className="text-xs font-normal text-gray-400 ml-1">{sub}</span>}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  )
}
