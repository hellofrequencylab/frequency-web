'use client'

import { useState, useTransition } from 'react'
import { redeemItem, equipCosmetic } from '@/app/(main)/crew/store/actions'
import { isError } from '@/lib/action-result'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { CosmeticType } from '@/lib/store/cosmetics'

// THE VAULT STORE GRID, IN THE KIT (LIVE-1104, LIVE-938 area 4). Same items, rules and server actions as DAWN's
// app/(main)/crew/store/store-grid.tsx (redeem, equip, remove; the action is the authority on balance, stock and
// rank). Drawn in the members kit's own pieces (`.card`, `.ic`, `.t1`/`.t2`, `.btn`) so the Vault stops nesting
// DAWN cards and `bg-primary` buttons that members-ui.css had to repaint.

const ICON_MAP: Record<string, FqIconName> = {
  circle: 'circle', flame: 'streak', star: 'award', crown: 'trophy', zap: 'zap', sparkles: 'award',
  'credit-card': 'membership', award: 'award', heart: 'giveback', badge: 'award', gem: 'gem', gift: 'gem',
}

export interface FqStoreItem {
  id: string
  slug: string
  name: string
  description: string
  category: string
  gem_cost: number
  icon: string
  stock: number | null
  owned: boolean
  undeliverable?: boolean
  cosmeticSlot?: CosmeticType | null
  equipped?: boolean
}

export function FqStoreGrid({ items, balance }: { items: FqStoreItem[]; balance: number }) {
  return (
    <div className="g3">
      {items.map((item) => (
        <FqStoreCard key={item.id} item={item} balance={balance} />
      ))}
    </div>
  )
}

function FqStoreCard({ item, balance }: { item: FqStoreItem; balance: number }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null)

  const canAfford = balance >= item.gem_cost
  const outOfStock = item.stock !== null && item.stock <= 0

  function handleRedeem() {
    startTransition(async () => {
      const res = await redeemItem(item.id)
      if (isError(res)) setResult({ text: res.error, ok: false })
      else setResult({ text: res.data.pending ? 'Recorded' : 'Redeemed', ok: true })
      setTimeout(() => setResult(null), 3000)
    })
  }

  function handleEquip(wear: boolean) {
    if (!item.cosmeticSlot) return
    const slot = item.cosmeticSlot
    startTransition(async () => {
      const res = await equipCosmetic(wear ? item.id : null, slot)
      if (isError(res)) {
        setResult({ text: res.error, ok: false })
        setTimeout(() => setResult(null), 3000)
      }
    })
  }

  let action: React.ReactNode
  if (result) {
    action = (
      <span className={result.ok ? 't2 mc-strong' : 't2'} role="status">
        {result.text}
      </span>
    )
  } else if (item.owned && item.cosmeticSlot) {
    action = item.equipped ? (
      <span className="row mc-gap-8">
        <span className="tag">
          <FqIcon name="check" /> Equipped
        </span>
        <button type="button" className="btn sm txt" onClick={() => handleEquip(false)} disabled={isPending}>
          Remove
        </button>
      </span>
    ) : (
      <button type="button" className="btn sm pa" onClick={() => handleEquip(true)} disabled={isPending}>
        <FqIcon name="check" /> Equip
      </button>
    )
  } else if (item.owned) {
    action = (
      <span className="tag">
        <FqIcon name="check" /> Owned
      </span>
    )
  } else if (item.undeliverable) {
    action = <span className="t2">Not ready yet</span>
  } else if (outOfStock) {
    action = <span className="t2">Sold out</span>
  } else if (!canAfford) {
    action = <span className="t2">Need {(item.gem_cost - balance).toLocaleString()} more</span>
  } else {
    action = (
      <button type="button" className="btn sm pa" onClick={handleRedeem} disabled={isPending}>
        {isPending ? 'Redeeming' : 'Redeem'}
      </button>
    )
  }

  return (
    <div className={item.owned || canAfford ? 'card stack mc-gap-12' : 'card stack mc-gap-12 mc-dim'}>
      <div className="row mc-gap-12">
        <span className={item.owned ? 'ic mc-done' : 'ic'} aria-hidden>
          <FqIcon name={ICON_MAP[item.icon] ?? 'gem'} />
        </span>
        <span className="stack grow mc-gap-4">
          <span className="t1">{item.name}</span>
          <span className="t2">{item.description}</span>
        </span>
      </div>
      <div className="row mc-between mc-gap-8">
        <span className="t2 mc-strong">💎 {item.gem_cost.toLocaleString()}</span>
        {action}
      </div>
      {item.stock !== null && item.stock > 0 && !item.owned && <span className="t2">{item.stock} remaining</span>}
    </div>
  )
}
