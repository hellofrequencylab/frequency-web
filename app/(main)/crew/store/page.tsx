import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Gem, Zap, Flame, Trophy, Receipt, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreData } from './actions'
import { StoreGrid } from './store-grid'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { SectionHeader } from '@/components/ui/section-header'

export default async function StorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { items, balance, equipped } = await getStoreData()
  // Winnings collected — owned store items (cosmetics, titles, badges).
  const ownedCount = items.filter((i) => (i as { owned?: boolean }).owned).length

  // The Store now holds the Vault: everything you earn by showing up, alongside
  // your spendable Gem balance.
  const { data: prof } = await createAdminClient()
    .from('profiles')
    .select('current_season_zaps, current_streak, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const zaps = (prof?.current_season_zaps as number | null) ?? 0
  const streak = (prof?.current_streak as number | null) ?? 0
  const isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes(
    (prof?.community_role as string) ?? '',
  )

  const categories = [
    { key: 'cosmetic',    label: 'Profile Cosmetics',  desc: 'Borders, flair icons, and visual upgrades' },
    { key: 'title',       label: 'Custom Titles',       desc: 'Display a special title on your profile' },
    { key: 'collectible', label: 'Collectible Badges',  desc: 'Exclusive badges for your collection' },
    { key: 'membership',  label: 'Membership Credits',  desc: 'Redeem gems for free membership months' },
  ] as const

  return (
    <div>
      {!isCrew && <CrewPreviewBanner />}

      {/* Header: title left, the Vault (with all its winnings) pinned top-right.
          Mirrors the shared PageHeading grammar, with the Vault as a right rail. */}
      <div className="mb-8 flex flex-col gap-6 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-xl">
          <h1 className="mb-1 text-2xl font-bold text-text">Vault Store</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Your Vault and the Gem Store in one place. Everything you earn by showing up, and what you can spend it on.
          </p>
        </div>

        {/* The Vault — top-right, holding all your winnings. */}
        <aside className="w-full shrink-0 rounded-2xl border border-success/60 bg-gradient-to-br from-success-bg to-signal-bg shadow-sm p-5 lg:w-80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-success-bg flex items-center justify-center shrink-0">
              <Gem className="w-6 h-6 text-signal-strong" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-signal-strong">Your Vault · Gems to spend</p>
              <p className="text-3xl font-bold text-success leading-tight">{balance.toLocaleString()}</p>
            </div>
          </div>

          {/* The winnings: what you've earned by showing up. */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-success-bg/50 px-2 py-2 text-center" title="Zaps this season">
              <div className="flex items-center justify-center gap-1 text-signal-strong">
                <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="text-base font-bold tabular-nums text-success">{zaps.toLocaleString()}</span>
              </div>
              <p className="text-3xs text-signal mt-0.5">Zaps</p>
            </div>
            <div className="rounded-xl bg-success-bg/50 px-2 py-2 text-center" title="Current streak">
              <div className="flex items-center justify-center gap-1 text-signal-strong">
                <Flame className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="text-base font-bold tabular-nums text-success">{streak.toLocaleString()}</span>
              </div>
              <p className="text-3xs text-signal mt-0.5">Streak</p>
            </div>
            <div className="rounded-xl bg-success-bg/50 px-2 py-2 text-center" title="Items won">
              <div className="flex items-center justify-center gap-1 text-signal-strong">
                <Trophy className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="text-base font-bold tabular-nums text-success">{ownedCount.toLocaleString()}</span>
              </div>
              <p className="text-3xs text-signal mt-0.5">Won</p>
            </div>
          </div>

          {/* How you earned — the points & streaks ledger. */}
          <Link
            href="/crew/store/ledger"
            className="mt-3 flex items-center gap-2 rounded-xl bg-success-bg/50 px-3 py-2.5 text-signal-strong transition-colors hover:bg-success-bg"
          >
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-xs font-semibold">How you earned — points &amp; streaks log</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>

          {/* Equipped winnings */}
          {(equipped.border || equipped.flair || equipped.title) && (
            <div className="mt-4 pt-3 border-t border-success/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-signal">Equipped</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {equipped.border && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-success-bg text-success">
                    Border: {equipped.border.replace('ring-', '').replace('-500', '')}
                  </span>
                )}
                {equipped.flair && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-success-bg text-success">
                    Flair: {equipped.flair}
                  </span>
                )}
                {equipped.title && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-success-bg text-success">
                    Title: {equipped.title}
                  </span>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Store categories. Members can browse everything but can't spend —
          the grid renders muted and a click opens the upgrade lightbox. */}
      <CrewGate locked={!isCrew}>
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
    </div>
  )
}
