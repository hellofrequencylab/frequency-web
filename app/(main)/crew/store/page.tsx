import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Receipt, ArrowRight, Compass,
  Award, Lock, Trophy, Zap, Flame, Star, Users, Link as LinkIcon,
  Calendar, Mic, Edit, BookOpen, Volume2, MessageCircle, PenTool,
  Shield, Sun, Gem, Crown, TrendingUp, HandMetal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getStoreData } from './actions'
import { getAchievementsData } from '../gamification-actions'
import { StoreGrid } from './store-grid'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { RANK_LABELS, rankForCompletion, journeysFinishedThisSeason, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'
import { StandingHero } from '@/components/gamification/standing-hero'
import { getCurrentSeason } from '@/lib/seasons'
import { amplitudeLevel, formatAmplitude } from '@/lib/amplitude'
import { TrophyCase } from '@/components/quest/trophy-case'
import { getTrophyCase } from '@/lib/quest/trophies'
import { TIER_CONFIG, CATEGORY_CONFIG } from '@/lib/gamification'
import type { AchievementCategory, AchievementTier } from '@/lib/gamification'

// Achievement badge icons — folded in from the old Achievements page; the Awards
// area renders the badge collection that now lives in the Vault.
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

export default async function StorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { items, balance, equipped } = await getStoreData()
  // Winnings collected — owned store items (cosmetics, titles, badges).
  const ownedCount = items.filter((i) => (i as { owned?: boolean }).owned).length

  // The Store now holds the Vault: everything you earn by showing up, alongside
  // your spendable Gem balance.
  const { data: prof } = await supabase
    .from('profiles')
    .select('id, current_season_zaps, current_season_rank, current_streak, amplitude')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const profileId = (prof as { id: string } | null)?.id ?? null
  const zaps = (prof?.current_season_zaps as number | null) ?? 0
  const streak = (prof?.current_streak as number | null) ?? 0

  // Rank from Journey completions (completion-based model).
  const storeFinishedCount = profileId ? await journeysFinishedThisSeason(profileId) : 0
  const standingRank = rankForCompletion(storeFinishedCount)
  const season = await getCurrentSeason()
  // Amplitude — the lifetime layer (Rewards Economy v2, supersedes the ADR-037
  // lifetime-rank display). Shown to the member on their own Vault regardless of
  // tier, beside the season rank: "Beacon · 14,200".
  const seasonRank = (prof?.current_season_rank as SeasonRank | null) ?? null
  const amplitude = Number((prof as { amplitude?: number | null } | null)?.amplitude ?? 0)
  const hasAmplitude = amplitude > 0
  // Spending is the FULL Vault function; the matrix (access-matrix.ts) is the single
  // source of truth and the `vault` row's ✋→✅ jump is driven by `isPaid(tier)` (the real
  // membership_tier, ADR-207/225) — the same `canCashIn` predicate the redeemItem action
  // enforces server-side. Limited access still browses everything (visible-but-locked +
  // upgrade nudge).
  const canSpend = (await surfaceAccess('vault')) === 'full'

  const categories = [
    { key: 'cosmetic',    label: 'Profile Cosmetics',  desc: 'Borders, flair icons, and visual upgrades' },
    { key: 'title',       label: 'Custom Titles',       desc: 'Display a special title on your profile' },
    { key: 'collectible', label: 'Collectible Badges',  desc: 'Exclusive badges for your collection' },
    { key: 'membership',  label: 'Membership Credits',  desc: 'Redeem gems for free membership months' },
  ] as const

  return (
    <>
      {!canSpend && <CrewPreviewBanner />}

      <DashboardTemplate
        eyebrow="The Quest"
        title="Vault Store"
        description="Your Vault and the Gem Store in one place. Everything you earn by showing up, and what you can spend it on."
        back={{ href: '/crew', label: 'Crew Dashboard' }}
      >
        {/* The standing hero — the four counts (Zaps · Rank · Streak · Gems), the
            one way a member's standing renders. Gems point at the spend ledger;
            balance is the gems you can spend in the Store. */}
        <StandingHero
          zaps={zaps}
          gems={balance}
          streak={streak}
          rank={standingRank}
          journeysFinished={storeFinishedCount}
          seasonName={season?.name}
          links={{
            zaps: '/crew/leaderboard',
            rank: '/crew/store#awards',
            streak: '/crew/leaderboard',
            gems: '/crew/store/ledger',
          }}
        />

        {/* Standing — the cooperative leaderboard and your consistency (streaks) live
            in the Vault now. The hero above shows the live counts; this opens the full
            board: your Circle's shared goal, where you stand, and your streak. */}
        <section>
          <SectionHeader title="Standing" />
          <Link
            href="/crew/leaderboard"
            className="group flex items-center gap-3 rounded-2xl border border-border bg-surface/50 p-5 shadow-sm transition-colors hover:border-primary"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning-bg text-warning">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-text">Leaderboard and streaks</h3>
              <p className="mt-0.5 text-xs text-muted">
                Your Circle&apos;s shared goal, where you stand, and your daily practice streak.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-primary-strong" />
          </Link>
        </section>

        {/* The Vault — Amplitude (the lifetime layer), the earning ledger, and
            equipped winnings. */}
        <section>
          <SectionHeader title="Your Vault" action={
            <span className="text-xs font-medium tabular-nums text-subtle">
              {ownedCount} {ownedCount === 1 ? 'item won' : 'items won'}
            </span>
          } />
          <div className="rounded-2xl border border-success/60 bg-gradient-to-br from-success-bg to-signal-bg p-5 shadow-sm">
            {/* Amplitude — lifetime XP beside the season rank; never resets. */}
            {hasAmplitude && (
              <div className="flex items-center justify-between rounded-xl bg-success-bg/50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-signal">
                  Amplitude · Level {amplitudeLevel(amplitude)}
                </span>
                <span className="flex items-center gap-1.5">
                  {seasonRank && seasonRank !== 'ghost' && (
                    <span className="rank-badge text-2xs font-bold leading-tight" style={seasonRankStyle(seasonRank)}>
                      {RANK_LABELS[seasonRank]}
                    </span>
                  )}
                  <span className="text-2xs font-bold text-signal-strong">{formatAmplitude(amplitude)}</span>
                </span>
              </div>
            )}

            {/* How you earned — the points & streaks ledger. */}
            <Link
              href="/crew/store/ledger"
              className={`flex items-center gap-2 rounded-xl bg-success-bg/50 px-3 py-2.5 text-signal-strong transition-colors hover:bg-success-bg ${hasAmplitude ? 'mt-3' : ''}`}
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-xs font-semibold">How you earned: Zaps &amp; Gems log</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>

            {/* Equipped winnings */}
            {(equipped.border || equipped.flair || equipped.title) && (
              <div className="mt-4 border-t border-success/40 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-signal">Equipped</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {equipped.border && (
                    <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">
                      Border: {equipped.border.replace('ring-', '').replace('-500', '')}
                    </span>
                  )}
                  {equipped.flair && (
                    <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">
                      Flair: {equipped.flair}
                    </span>
                  )}
                  {equipped.title && (
                    <span className="rounded-md bg-success-bg px-2 py-0.5 text-xs text-success">
                      Title: {equipped.title}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Your Trophies — the lifetime Trophy Case, the permanent record beside
            the resettable seasonal rank. The case is forever; the rank resets,
            so the season turnover reads as a Fresh Start. Streamed behind its own
            Suspense so the slow completion read never blocks the Vault shell. */}
        <section>
          <SectionHeader title="Your Trophies" />
          <p className="-mt-2 mb-3 text-xs text-subtle">
            Every Journey you finish stays here for good. The season rank resets every 13 weeks for a fresh start; your Trophies and Gems do not.
          </p>
          <Suspense fallback={<TrophyCaseSkeleton />}>
            <TrophyCaseSection profileId={profileId} currentSeason={season?.season_number ?? null} />
          </Suspense>
        </section>

        {/* Your Awards — the badge collection, folded in from the old Achievements
            page. Awards sit with the Trophy Case: the case holds finished Journeys
            and season trophies, the badges are everything else you've earned by
            showing up. Streamed behind its own Suspense so the achievements read
            never blocks the Vault shell. */}
        <section id="awards" className="scroll-mt-24">
          <SectionHeader title="Your Awards" />
          <p className="-mt-2 mb-3 text-xs text-subtle">
            Badges you earn by showing up. Some are secret. Keep exploring to find them all.
          </p>
          <Suspense fallback={<AwardsSkeleton />}>
            <AwardsCollection />
          </Suspense>
        </section>

        {/* Store categories. Members can browse everything but can't spend —
            the grid renders muted and a click opens the upgrade lightbox. */}
        <CrewGate locked={!canSpend}>
          <div className="space-y-8">
            {categories.map(cat => {
              const catItems = items.filter(i => i.category === cat.key)
              if (catItems.length === 0) return null

              return (
                <section key={cat.key}>
                  <SectionHeader title={cat.label} />
                  <p className="-mt-2 mb-3 text-xs text-subtle">{cat.desc}</p>
                  <StoreGrid items={catItems} balance={balance} />
                </section>
              )
            })}
          </div>
        </CrewGate>
      </DashboardTemplate>
    </>
  )
}

// The lifetime Trophy Case, read on the server and streamed in behind its own
// Suspense. Self-fetching so the page never awaits the completion join before
// painting the Vault. Returns the celebratory empty state when nothing's earned
// yet, with a path to the Journey page.
async function TrophyCaseSection({
  profileId,
  currentSeason,
}: {
  profileId: string | null
  currentSeason: number | null
}) {
  const trophyCase = profileId
    ? await getTrophyCase(profileId)
    : { seasons: [], totalTrophies: 0, seasonsPlayed: 0 }

  if (trophyCase.totalTrophies === 0) {
    return (
      <EmptyState
        icon={Compass}
        title="Finish a Journey to earn your first Trophy"
        description="A Journey is 14 days of practice plus an Expression Challenge. Finish one and it lands here for good, with the rank it earned."
        action={
          <Link
            href="/crew"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
          >
            Go to your Quest
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        }
      />
    )
  }

  return (
    <TrophyCase
      seasons={trophyCase.seasons}
      totalTrophies={trophyCase.totalTrophies}
      currentSeason={currentSeason}
    />
  )
}

// Dimension-matched skeleton so the streamed case doesn't shift the page (CLS).
function TrophyCaseSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5 shadow-sm">
      <Skeleton className="mb-4 h-9 w-48" />
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}

// The Awards badge collection, folded in from the old Achievements page and read
// on the server. Self-fetching so the page never awaits the achievements join
// before painting the Vault. Renders the collection-progress bar plus the badges
// grouped by category, earned vs secret. The standalone StatCards that linked to
// the leaderboard and streaks (those surfaces moved) are intentionally dropped —
// the StandingHero already carries Zaps and the streak.
async function AwardsCollection() {
  const { achievements, stats } = await getAchievementsData()

  if (stats.total === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No Awards yet"
        description="Earn badges by joining Circles, sharing posts, and showing up. Some are secret. Keep exploring to find them all."
      />
    )
  }

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
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${earnedPct}%` }}
          />
        </div>
      </div>

      {/* Badge categories. */}
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          a.earned
                            ? `${tier.bg} ${tier.color}`
                            : 'bg-surface-elevated text-subtle'
                        }`}>
                          {isSecret ? (
                            <Lock className="h-5 w-5" />
                          ) : (
                            <AchievementIcon icon={a.icon} className="h-5 w-5" />
                          )}
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
                              Unlocked {new Date(a.unlockedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </p>
                          )}
                          {!a.earned && a.zaps_reward > 0 && !isSecret && (
                            <div className="mt-1 flex items-center gap-1">
                              <Zap className="h-3 w-3 text-primary" />
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
    </div>
  )
}

// Dimension-matched skeleton so the streamed Awards collection doesn't shift the
// page (CLS): the progress bar plus a first category grid.
function AwardsSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-2.5 w-full rounded-full" />
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}
