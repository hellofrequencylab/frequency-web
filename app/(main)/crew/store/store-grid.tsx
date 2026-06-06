'use client'

import { useState, useTransition } from 'react'
import {
  Gem, Check, Loader2, Lock, ShoppingBag,
  Circle, Flame, Star, Crown, Zap, Sparkles,
  CreditCard, Award, Heart, BadgeCheck,
} from 'lucide-react'
import { redeemItem } from './actions'
import { isError } from '@/lib/action-result'

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
      if (isError(res)) {
        setResult(res.error)
      } else {
        setResult('Redeemed!')
      }
      setTimeout(() => setResult(null), 3000)
    })
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 transition-all ${
      item.owned
        ? 'border-success bg-success-bg/30'
        : 'border-border bg-surface'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          item.owned
            ? 'bg-success-bg text-signal-strong'
            : canAfford
            ? 'bg-primary-bg text-primary-strong'
            : 'bg-surface-elevated text-subtle'
        }`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text">{item.name}</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.description}</p>

          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-bold text-signal-strong flex items-center gap-1">
              <Gem className="w-3.5 h-3.5" />
              {item.gem_cost.toLocaleString()}
            </span>

            {result ? (
              <span className={`text-xs font-semibold ${result === 'Redeemed!' ? 'text-signal-strong' : 'text-danger'}`}>
                {result}
              </span>
            ) : item.owned ? (
              <span className="text-xs font-semibold text-signal-strong flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Owned
              </span>
            ) : outOfStock ? (
              <span className="text-xs font-medium text-subtle flex items-center gap-1">
                <Lock className="w-3 h-3" /> Sold out
              </span>
            ) : (
              <button
                onClick={handleRedeem}
                disabled={!canAfford || isPending}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  canAfford
                    ? 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50'
                    : 'bg-surface-elevated text-subtle cursor-not-allowed'
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
            <p className="text-3xs text-subtle mt-1">{item.stock} remaining</p>
          )}
        </div>
      </div>
    </div>
  )
}
