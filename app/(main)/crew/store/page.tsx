import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Gem, ShoppingBag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getStoreData } from './actions'
import { StoreGrid } from './store-grid'

export default async function StorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { items, balance, equipped } = await getStoreData()

  const categories = [
    { key: 'cosmetic',    label: 'Profile Cosmetics',  desc: 'Borders, flair icons, and visual upgrades' },
    { key: 'title',       label: 'Custom Titles',       desc: 'Display a special title on your profile' },
    { key: 'collectible', label: 'Collectible Badges',  desc: 'Exclusive badges for your collection' },
    { key: 'membership',  label: 'Membership Credits',  desc: 'Redeem gems for free membership months' },
  ] as const

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link href="/crew" className="text-sm text-subtle hover:text-muted dark:hover:text-subtle transition-colors">Crew</Link>
          <span className="text-subtle">/</span>
          <h1 className="text-xl font-semibold text-text">Gem Store</h1>
        </div>
        <p className="text-sm text-muted mt-1">
          Spend your Community Gems on cosmetics, titles, badges, and membership credits.
        </p>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl border border-success/60 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-success-bg flex items-center justify-center">
              <Gem className="w-6 h-6 text-signal-strong" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-signal-strong">Your Balance</p>
              <p className="text-3xl font-bold text-emerald-900">{balance.toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-signal-strong">Community Gems</p>
            <p className="text-[11px] text-signal dark:text-signal mt-0.5">
              Earn gems by posting, commenting, and participating
            </p>
          </div>
        </div>

        {/* Equipped items */}
        {(equipped.border || equipped.flair || equipped.title) && (
          <div className="mt-4 pt-3 border-t border-success/50 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-signal">Equipped:</span>
            {equipped.border && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success">
                Border: {equipped.border.replace('ring-', '').replace('-500', '')}
              </span>
            )}
            {equipped.flair && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success">
                Flair: {equipped.flair}
              </span>
            )}
            {equipped.title && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success">
                Title: {equipped.title}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Store categories */}
      <div className="space-y-8">
        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat.key)
          if (catItems.length === 0) return null

          return (
            <section key={cat.key}>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-text">{cat.label}</h2>
                <p className="text-xs text-subtle mt-0.5">{cat.desc}</p>
              </div>
              <StoreGrid items={catItems} balance={balance} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
