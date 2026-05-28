'use client'

import { useState, useTransition } from 'react'
import {
  Gem, Check, Loader2, Lock, ShoppingBag,
  Circle, Flame, Star, Crown, Zap, Sparkles,
  CreditCard, Award, Heart, BadgeCheck,
} from 'lucide-react'
import { redeemItem } from './actions'

const ICON_MAP: Record<string, React.ElementType> = {
  circle: Circle, flame: Flame, star: Star, crown: Crown, zap: Zap,
  sparkles: Sparkles, 'credit-card': CreditCard, award: Award, heart: Heart,
  badge: BadgeCheck, gem: Gem, gift: ShoppingBag,
}

interface StoreItem {
  id: string
  slug: string
  name: string
  description: string
  category: string
  gem_cost: number
  icon: string
  stock: number | null
  owned: boolean
}

export function StoreGrid({ items, balance }: { items: StoreItem[]; balance: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map(item => (
        <StoreCard key={item.id} item={item} balance={balance} />
      ))}
    </div>
  )
}

function StoreCard({ item, balance }: { item: StoreItem; balance: number }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  const Icon = ICON_MAP[item.icon] ?? ShoppingBag
  const canAfford = balance >= item.gem_cost
  const outOfStock = item.stock !== null && item.stock <= 0

  function handleRedeem() {
    startTransition(async () => {
      const res = await redeemItem(item.id)
      if (res.success) {
        setResult('Redeemed!')
      } else {
        setResult(res.error ?? 'Failed')
      }
      setTimeout(() => setResult(null), 3000)
    })
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 transition-all ${
      item.owned
        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20'
        : 'border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          item.owned
            ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400'
            : canAfford
            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
        }`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{item.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.description}</p>

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Gem className="w-3.5 h-3.5" />
              {item.gem_cost.toLocaleString()}
            </span>

            {result ? (
              <span className={`text-xs font-semibold ${result === 'Redeemed!' ? 'text-emerald-600' : 'text-red-500'}`}>
                {result}
              </span>
            ) : item.owned ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Owned
              </span>
            ) : outOfStock ? (
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Sold out
              </span>
            ) : (
              <button
                onClick={handleRedeem}
                disabled={!canAfford || isPending}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  canAfford
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : !canAfford ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <ShoppingBag className="w-3 h-3" />
                )}
                {canAfford ? 'Redeem' : `Need ${(item.gem_cost - balance).toLocaleString()} more`}
              </button>
            )}
          </div>

          {item.stock !== null && item.stock > 0 && !item.owned && (
            <p className="text-[10px] text-gray-400 mt-1">{item.stock} remaining</p>
          )}
        </div>
      </div>
    </div>
  )
}
