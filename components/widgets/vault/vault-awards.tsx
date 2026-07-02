import {
  Award, Lock, Trophy, Zap, Flame, Star, Users, Link as LinkIcon,
  Calendar, Mic, Edit, BookOpen, Volume2, MessageCircle, PenTool,
  Compass, Shield, Sun, Gem, Crown, TrendingUp, HandMetal,
} from 'lucide-react'
import { getAchievementsData } from '@/app/(main)/crew/gamification-actions'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { TIER_CONFIG, CATEGORY_CONFIG } from '@/lib/gamification'
import type { AchievementCategory, AchievementTier } from '@/lib/gamification'

// Vault layout module: Your Awards — the badge collection. Awards sit with the Trophy Case: the case
// holds finished Journeys and season trophies; the badges are everything else you've earned by
// showing up. Self-fetching (its own Suspense in the module grid).

const ACHIEVEMENT_ICON_MAP: Record<string, React.ElementType> = {
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
  const Icon = ACHIEVEMENT_ICON_MAP[icon] ?? Award
  return <Icon className={className} />
}

export async function VaultAwards() {
  const { achievements, stats } = await getAchievementsData()

  return (
    <section id="awards" className="scroll-mt-24">
      <SectionHeader title="Your Awards" />
      <p className="-mt-2 mb-3 text-xs text-subtle">
        Badges you earn by showing up. Some are secret. Keep exploring to find them all.
      </p>

      {stats.total === 0 ? (
        <EmptyState
          icon={Award}
          title="No Awards yet"
          description="Earn badges by joining Circles, sharing posts, and showing up. Some are secret. Keep exploring to find them all."
        />
      ) : (
        <AwardsCollection achievements={achievements} stats={stats} />
      )}
    </section>
  )
}

function AwardsCollection({
  achievements,
  stats,
}: {
  achievements: Awaited<ReturnType<typeof getAchievementsData>>['achievements']
  stats: Awaited<ReturnType<typeof getAchievementsData>>['stats']
}) {
  // Group by category.
  const byCategory = new Map<AchievementCategory, typeof achievements>()
  for (const a of achievements) {
    const list = byCategory.get(a.category) ?? []
    list.push(a)
    byCategory.set(a.category, list)
  }

  const earnedPct = stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) : 0

  return (
    <div>
      {/* Collection progress bar. */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Collection Progress</span>
          <span className="text-xs text-subtle">{stats.earned} of {stats.total}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${earnedPct}%` }} />
        </div>
      </div>

      {/* Badge categories. */}
      <div className="space-y-8">
        {Array.from(byCategory.entries()).map(([category, items]) => {
          const catConfig = CATEGORY_CONFIG[category]
          const earned = items.filter((a) => a.earned).length

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

              <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
                {items.map((a) => {
                  const tier = TIER_CONFIG[a.tier as AchievementTier]
                  const isSecret = a.is_secret && !a.earned

                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl px-4 py-3 transition-all ${
                        a.earned ? `${tier.bg} ${tier.glow ? `shadow-sm ${tier.glow}` : ''}` : 'bg-surface-elevated/60 opacity-70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            a.earned ? `${tier.bg} ${tier.color}` : 'bg-surface-elevated text-subtle'
                          }`}
                        >
                          {isSecret ? <Lock className="h-5 w-5" /> : <AchievementIcon icon={a.icon} className="h-5 w-5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${a.earned ? 'text-text' : 'text-muted'}`}>
                              {isSecret ? '???' : a.name}
                            </span>
                            <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${tier.bg} ${tier.color}`}>
                              {tier.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted">
                            {isSecret ? 'Keep exploring to discover this Award.' : a.description}
                          </p>
                          {a.earned && a.unlockedAt && (
                            <p className="mt-1 text-xs text-subtle">
                              Unlocked {new Date(a.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                          {!a.earned && a.zaps_reward > 0 && !isSecret && (
                            <div className="mt-1 flex items-center gap-1">
                              <Zap className="h-3 w-3 text-primary" />
                              <span className="text-xs font-medium text-subtle">+{a.zaps_reward} Zaps</span>
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
