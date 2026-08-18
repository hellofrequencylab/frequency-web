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
  /** LIVE-013: nothing in the product renders this cosmetic, so it is not for sale. */
  undeliverable?: boolean
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
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null)

  const Icon = ICON_MAP[item.icon] ?? ShoppingBag
  const canAfford = balance >= item.gem_cost
  const outOfStock = item.stock !== null && item.stock <= 0

  function handleRedeem() {
    startTransition(async () => {
      const res = await redeemItem(item.id)
      if (isError(res)) {
        setResult({ text: res.error, ok: false })
      } else {
        // Cosmetics apply instantly; operator-honored perks are recorded for fulfillment.
        setResult({ text: res.data.pending ? 'Recorded ✓' : 'Redeemed!', ok: true })
      }
      setTimeout(() => setResult(null), 3000)
    })
  }

  return (
    <div className={`rounded-card border px-4 py-3 transition-all motion-reduce:transition-none ${
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
          <p className="text-body-sm font-semibold text-text">{item.name}</p>
          <p className="text-meta text-muted mt-0.5 leading-relaxed">{item.description}</p>

          <div className="flex items-center justify-between mt-3">
            <span className="text-body-sm font-bold text-signal-strong flex items-center gap-1">
              <Gem className="w-3.5 h-3.5" />
              {item.gem_cost.toLocaleString()}
            </span>

            {result ? (
              <span className={`text-meta font-semibold ${result.ok ? 'text-signal-strong' : 'text-danger'}`}>
                {result.text}
              </span>
            ) : item.owned ? (
              <span className="text-meta font-semibold text-signal-strong flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Owned
              </span>
            ) : item.undeliverable ? (
              // Not "sold out" and not disabled-with-a-price: this one is not on sale at all,
              // because nothing in the product would show it once bought (LIVE-013).
              <span className="text-meta font-medium text-subtle flex items-center gap-1">
                <Lock className="w-3 h-3" /> Not ready yet
              </span>
            ) : outOfStock ? (
              <span className="text-meta font-medium text-subtle flex items-center gap-1">
                <Lock className="w-3 h-3" /> Sold out
              </span>
            ) : (
              <button
                onClick={handleRedeem}
                disabled={!canAfford || isPending}
                className={`flex min-h-11 items-center gap-1 rounded-control px-3 py-1 text-meta font-semibold transition-colors motion-reduce:transition-none ${
                  canAfford
                    ? 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50'
                    : 'bg-surface-elevated text-subtle cursor-not-allowed'
                }`}
              >
                {isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
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
            <p className="text-3xs text-muted mt-1">{item.stock} remaining</p>
          )}
        </div>
      </div>
    </div>
  )
}
