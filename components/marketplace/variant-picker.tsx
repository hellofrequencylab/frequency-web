'use client'

import { useMemo, useState } from 'react'
import { effectiveVariantPriceCents, effectiveVariantStock } from '@/lib/commerce/types'
import type { CommerceVariant } from '@/lib/commerce/types'
import { BuyButton } from '@/app/(main)/marketplace/buy-button'

// Buyer-facing variant picker (Etsy-Grade Phase 2). When a product has active variants, the buyer
// chooses one; the selection sets the price shown + the quantity available and passes its variantId
// into the existing BuyButton -> checkout path. A product with no variants never renders this (the
// detail page falls back to a plain BuyButton). Tokens only, no hex, no em dashes.

function usd(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export function VariantPicker({
  productId,
  priceCents,
  currency,
  variants,
}: {
  productId: string
  priceCents: number
  currency: string
  variants: CommerceVariant[]
}) {
  // Default to the first in-stock variant so the buyer lands on something purchasable.
  const firstAvailable = useMemo(() => {
    const stocked = variants.find((v) => {
      const s = effectiveVariantStock(v)
      return s == null || s > 0
    })
    return (stocked ?? variants[0])?.id ?? null
  }, [variants])
  const [selectedId, setSelectedId] = useState<string | null>(firstAvailable)

  const selected = variants.find((v) => v.id === selectedId) ?? null
  const selectedStock = selected ? effectiveVariantStock(selected) : null
  const selectedSoldOut = selectedStock != null && selectedStock <= 0
  const selectedPrice = selected ? effectiveVariantPriceCents({ priceCents }, selected) : priceCents

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`variant-${productId}`} className="mb-1 block text-sm font-medium text-text">
          Options
        </label>
        <select
          id={`variant-${productId}`}
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary"
        >
          {variants.map((v) => {
            const stock = effectiveVariantStock(v)
            const soldOut = stock != null && stock <= 0
            return (
              <option key={v.id} value={v.id} disabled={soldOut}>
                {v.name} · {usd(effectiveVariantPriceCents({ priceCents }, v), currency)}
                {soldOut ? ' (sold out)' : stock != null && stock <= 5 ? ` (${stock} left)` : ''}
              </option>
            )
          })}
        </select>
      </div>

      <p className="text-sm font-semibold text-text">{usd(selectedPrice, currency)}</p>

      {selectedSoldOut ? (
        <p className="text-sm font-medium text-subtle">This option is sold out.</p>
      ) : (
        <BuyButton productId={productId} variantId={selectedId} disabled={!selectedId} />
      )}
    </div>
  )
}
