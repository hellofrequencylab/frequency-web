'use client'

import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { describePrice, type Offering, type OfferingOption } from '@/lib/commerce/types'
import { orderedPackageOptions } from '@/lib/commerce/buyer-price'
import { PriceInput, type PriceSelection } from './price-input'

// PACKAGE PICKER (Pricing Options P2). The buyer-side Good / Better / Best selector. Given an Offering
// with `options`, it renders 2 to 4 option cards ordered low to high (the priciest anchors perception
// downward), highlights the middle "Most popular" one, and defaults the selection to it. Picking a card
// sets the chosen option; the chosen option's own Price renders through the shared buyer control below,
// so a package option can itself be Choose-your-price. See docs/PRICING-OPTIONS-STRATEGY.md.
//
// MONEY STAYS OFF. This is DISPLAY + validation only; nothing here charges. Copy follows CONTENT-VOICE:
// plain sentences, no em or en dashes.

export function PackagePicker({
  offering,
  onChange,
  onEnquire,
  disabled,
  idPrefix = 'package',
}: {
  offering: Offering
  /** Reports the chosen option (its index in the ordered set) and its buyer selection. */
  onChange?: (choice: { index: number; option: OfferingOption; selection: PriceSelection }) => void
  onEnquire?: () => void
  disabled?: boolean
  idPrefix?: string
}) {
  const { options, recommendedIndex } = useMemo(
    () => orderedPackageOptions(offering.options ?? []),
    [offering.options],
  )
  const [selectedIndex, setSelectedIndex] = useState(() =>
    recommendedIndex >= 0 ? recommendedIndex : 0,
  )

  // Nothing to pick: fall back to the single price control so the surface still renders a choice.
  if (options.length === 0) {
    return <PriceInput price={offering.price} onEnquire={onEnquire} disabled={disabled} idPrefix={idPrefix} />
  }

  const selected = options[Math.min(selectedIndex, options.length - 1)]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 @sm:grid-cols-2 @lg:grid-cols-3">
        {options.map((opt, idx) => {
          const active = idx === selectedIndex
          return (
            <button
              key={opt.id ?? idx}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              disabled={disabled}
              aria-pressed={active}
              className={`relative flex flex-col rounded-2xl border p-4 text-left transition-colors disabled:opacity-50 ${
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-border bg-surface hover:border-border-strong'
              }`}
            >
              {opt.recommended && (
                <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-on-primary">
                  <Star className="h-3 w-3" aria-hidden /> Most popular
                </span>
              )}
              <span className="text-sm font-bold text-text">{opt.name || `Option ${idx + 1}`}</span>
              <span className="mt-1 text-sm text-muted">{describePrice(opt.price)}</span>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-semibold text-subtle">
          {selected.name ? `You picked ${selected.name}` : 'Your pick'}
        </p>
        <PriceInput
          price={selected.price}
          onEnquire={onEnquire}
          disabled={disabled}
          idPrefix={`${idPrefix}-opt${selectedIndex}`}
          onChange={(selection) =>
            onChange?.({ index: selectedIndex, option: selected, selection })
          }
        />
      </div>
    </div>
  )
}
