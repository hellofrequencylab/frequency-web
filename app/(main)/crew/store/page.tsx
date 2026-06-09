import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Gem, Zap, Flame, Trophy, Receipt, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getStoreData } from './actions'
import { StoreGrid } from './store-grid'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { RANK_LABELS, seasonRankStyle, type SeasonRank } from '@/lib/season-ranks'

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
    .select('current_season_zaps, current_streak, lifetime_rank')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const zaps = (prof?.current_season_zaps as number | null) ?? 0
  const streak = (prof?.current_streak as number | null) ?? 0
  // The locked, never-resetting peak (P2.6) — the durable Vault endorsement. Shown to
  // the member on their own Vault regardless of tier; 'ghost' = not yet ranked.
  const lifetimeRank = (prof?.lifetime_rank as SeasonRank | null) ?? null
  const hasLifetimeRank = !!lifetimeRank && lifetimeRank !== 'ghost'
  // Spending is the FULL Vault function; the matrix (access-matrix.ts) is the single
  // source of truth — today the crew-or-above proxy, the paid Member tier once P2 lands.
  // Limited access still browses everything (visible-but-locked + upgrade nudge).
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
        stats={
          <>
            <StatCard label="Gems to spend" value={balance.toLocaleString()} icon={Gem} href="/crew/store/ledger" />
            <StatCard label="Zaps · season" value={zaps.toLocaleString()} icon={Zap} />
            <StatCard label="Streak" value={streak.toLocaleString()} icon={Flame} />
            <StatCard label="Items won" value={ownedCount.toLocaleString()} icon={Trophy} />
          </>
        }
      >
        {/* The Vault — lifetime rank, the earning ledger, and equipped winnings. */}
        <section>
          <SectionHeader title="Your Vault" />
          <div className="rounded-2xl border border-success/60 bg-gradient-to-br from-success-bg to-signal-bg p-5 shadow-sm">
            {/* Lifetime rank — the locked peak that survives every season reset. */}
            {hasLifetimeRank && (
              <div className="flex items-center justify-between rounded-xl bg-success-bg/50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-signal">Lifetime rank</span>
                <span className="rank-badge text-2xs font-bold leading-tight" style={seasonRankStyle(lifetimeRank!)}>
                  {RANK_LABELS[lifetimeRank!]}
                </span>
              </div>
            )}

            {/* How you earned — the points & streaks ledger. */}
            <Link
              href="/crew/store/ledger"
              className={`flex items-center gap-2 rounded-xl bg-success-bg/50 px-3 py-2.5 text-signal-strong transition-colors hover:bg-success-bg ${hasLifetimeRank ? 'mt-3' : ''}`}
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-xs font-semibold">How you earned — points &amp; streaks log</span>
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
