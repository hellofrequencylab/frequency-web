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
          <Link href="/crew" className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Crew</Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Gem Store</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Spend your Community Gems on cosmetics, titles, badges, and membership credits.
        </p>
      </div>

      {/* Balance card */}
      <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center">
              <Gem className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Your Balance</p>
              <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-50">{balance.toLocaleString()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Community Gems</p>
            <p className="text-[11px] text-emerald-500 dark:text-emerald-500 mt-0.5">
              Earn gems by posting, commenting, and participating
            </p>
          </div>
        </div>

        {/* Equipped items */}
        {(equipped.border || equipped.flair || equipped.title) && (
          <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Equipped:</span>
            {equipped.border && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                Border: {equipped.border.replace('ring-', '').replace('-500', '')}
              </span>
            )}
            {equipped.flair && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                Flair: {equipped.flair}
              </span>
            )}
            {equipped.title && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
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
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cat.label}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{cat.desc}</p>
              </div>
              <StoreGrid items={catItems} balance={balance} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
