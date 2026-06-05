import { notFound } from 'next/navigation'
import { Gem, Zap, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreData } from './actions'
import { StoreGrid } from './store-grid'
import { CrewPreviewBanner } from '@/components/crew/crew-preview-banner'
import { CrewGate } from '@/components/crew/upgrade-lightbox'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'

export default async function StorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { items, balance, equipped } = await getStoreData()

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
      <IndexTemplate
        title="Store"
        description="Your Vault and the Gem Store in one place. Everything you earn by showing up, and what you can spend it on."
      >
      {/* Vault + balance — one calm Vault module on a soft success surface. */}
      <div className="rounded-2xl bg-success-bg/50 p-5 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-success-bg flex items-center justify-center">
              <Gem className="w-6 h-6 text-signal-strong" />
            </div>
            <div>
              <p className="text-xs font-medium text-signal-strong">Your Vault · Gems to spend</p>
              <p className="text-3xl font-bold text-success">{balance.toLocaleString()}</p>
            </div>
          </div>
          {/* Everything else you've earned by showing up. */}
          <div className="flex items-center gap-5">
            <div className="text-center" title="Zaps this season">
              <div className="flex items-center justify-center gap-1 text-signal-strong">
                <Zap className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-xl font-bold tabular-nums text-success">{zaps.toLocaleString()}</span>
              </div>
              <p className="text-xs text-signal mt-0.5">Zaps this season</p>
            </div>
            <div className="text-center" title="Current streak">
              <div className="flex items-center justify-center gap-1 text-signal-strong">
                <Flame className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-xl font-bold tabular-nums text-success">{streak.toLocaleString()}</span>
              </div>
              <p className="text-xs text-signal mt-0.5">Day streak</p>
            </div>
          </div>
        </div>

        {/* Equipped items */}
        {(equipped.border || equipped.flair || equipped.title) && (
          <div className="mt-4 pt-3 border-t border-success/30 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-signal">Equipped:</span>
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
        )}
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
      </IndexTemplate>
    </div>
  )
}
