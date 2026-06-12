import { notFound } from 'next/navigation'
import {
  Award, Lock, Trophy, Zap, Flame, Star, Users, Link as LinkIcon,
  Calendar, Mic, Edit, BookOpen, Volume2, MessageCircle, PenTool,
  Compass, Shield, Sun, Gem, Crown, TrendingUp, HandMetal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAchievementsData } from '../gamification-actions'
import { TIER_CONFIG, CATEGORY_CONFIG } from '@/lib/gamification'
import type { AchievementCategory, AchievementTier } from '@/lib/gamification'
import { IndexTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'

const ICON_MAP: Record<string, React.ElementType> = {
  award: Award,
  trophy: Trophy,
  zap: Zap,
  flame: Flame,
  star: Star,
  users: Users,
  link: LinkIcon,
  calendar: Calendar,
  mic: Mic,
  edit: Edit,
  'book-open': BookOpen,
  'volume-2': Volume2,
  'message-circle': MessageCircle,
  'pen-tool': PenTool,
  compass: Compass,
  shield: Shield,
  sun: Sun,
  gem: Gem,
  crown: Crown,
  'trending-up': TrendingUp,
  'hand-metal': HandMetal,
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
    <IndexTemplate
      title="Achievements"
      description="Earn badges by engaging with your community. Some are secret. Keep exploring to find them all."
    >
      {/* Progress overview — the gamified counts behind the collection (§2): the
          badges earned, plus the lifetime zaps and streak that drive them. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label={`Earned · ${earnedPct}%`} value={`${stats.earned}/${stats.total}`} icon={Award} />
        <StatCard label="Lifetime Zaps" value={stats.lifetimeZaps.toLocaleString()} icon={Zap} href="/crew/leaderboard" />
        <StatCard label="Current Streak" value={`${stats.currentStreak}w`} icon={Flame} href="/crew/streaks" />
        <StatCard label="Longest Streak" value={`${stats.longestStreak}w`} icon={Trophy} />
      </div>

      {/* Global progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted">
            Collection Progress
          </span>
          <span className="text-xs text-subtle">{stats.earned} of {stats.total}</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
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
              <SectionHeader
                title={catConfig.label}
                action={
                  <span className="text-xs font-medium tabular-nums text-subtle">
                    {earned}/{items.length}
                  </span>
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(a => {
                  const tier = TIER_CONFIG[a.tier as AchievementTier]
                  const isSecret = a.is_secret && !a.earned

                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl px-4 py-3 transition-all ${
                        a.earned
                          ? `${tier.bg} ${tier.glow ? `shadow-sm ${tier.glow}` : ''}`
                          : 'bg-surface-elevated/60 opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          a.earned
                            ? `${tier.bg} ${tier.color}`
                            : 'bg-surface-elevated text-subtle'
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
                                ? 'text-text'
                                : 'text-muted'
                            }`}>
                              {isSecret ? '???' : a.name}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${tier.bg} ${tier.color}`}>
                              {tier.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5 leading-relaxed">
                            {isSecret ? 'Keep exploring to discover this achievement.' : a.description}
                          </p>
                          {a.earned && a.unlockedAt && (
                            <p className="text-xs text-subtle mt-1">
                              Unlocked {new Date(a.unlockedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          )}
                          {!a.earned && a.zaps_reward > 0 && !isSecret && (
                            <div className="flex items-center gap-1 mt-1">
                              <Zap className="w-3 h-3 text-primary" />
                              <span className="text-xs font-medium text-subtle">+{a.zaps_reward} zaps</span>
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
    </IndexTemplate>
  )
}
