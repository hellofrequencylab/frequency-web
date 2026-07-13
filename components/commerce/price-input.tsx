'use client'

import { useEffect, useRef, useState } from 'react'
import { fieldClasses } from '@/components/ui/field'
import { formatPriceCents, type Price } from '@/lib/commerce/types'
import { initialChosenCents, validateChosenAmount } from '@/lib/commerce/buyer-price'

// BUYER PRICE INPUT (Pricing Options P2). ONE reusable buyer-side control for every sellable thing.
// Given a Price it renders the buyer's choice and reports the amount they would pay + whether it is
// valid, so the owning surface can enable / disable its own CTA. See docs/PRICING-OPTIONS-STRATEGY.md.
//
//   fixed             -> the price, plain (no input).
//   choose            -> a "Choose your price" box pre-filled to the suggested anchor, floored at the
//                        minimum with a clear message, showing "Suggested $X".
//   choose + donation -> a range of quick-pick chips (from pickAmountsCents) + a custom amount, gift
//                        framing.
//   free              -> "Free".
//   contact           -> an Enquire button (no amount).
//
// MONEY STAYS OFF. This is DISPLAY + validation only; it never charges. Client validation is the pure
// mirror of the server's authoritative check (validateChosenAmount) — the server stays the authority,
// gated behind payoutsLive() + canTakePayments. Copy follows CONTENT-VOICE: plain sentences, gift
// framing for donations, no em or en dashes.

/** What the buyer's current choice resolves to. `amountCents` is what they would pay (undefined for
 *  contact, or while a choose input is blank / invalid); `valid` is whether the surface may proceed. */
export interface PriceSelection {
  amountCents: number | undefined
  valid: boolean
  error?: string
}

function centsToDollarStr(cents: number): string {
  const d = cents / 100
  return Number.isInteger(d) ? String(d) : d.toFixed(2)
}

function dollarsToCents(text: string): number | undefined {
  const t = text.trim()
  if (!t || !/^\d+(\.\d{1,2})?$/.test(t)) return undefined
  const c = Math.round(Number(t) * 100)
  return Number.isFinite(c) ? c : undefined
}

function buildSelection(price: Price, cents: number | undefined): PriceSelection {
  const error = validateChosenAmount(price, cents)
  return {
    amountCents: price.mode === 'contact' ? undefined : cents,
    valid: error == null,
    error: error ?? undefined,
  }
}

const HINT = 'mt-1 text-xs text-subtle'

export function PriceInput({
  price,
  onChange,
  onEnquire,
  disabled,
  idPrefix = 'buy-price',
}: {
  price: Price
  /** Reports the buyer's current selection on mount and on every change. */
  onChange?: (selection: PriceSelection) => void
  /** The Enquire action for a `contact` price. Omit to render the button disabled. */
  onEnquire?: () => void
  disabled?: boolean
  idPrefix?: string
}) {
  const [cents, setCents] = useState<number | undefined>(() => initialChosenCents(price))
  const [text, setText] = useState(() => {
    const init = initialChosenCents(price)
    return init != null && price.mode === 'choose' ? centsToDollarStr(init) : ''
  })

  // Report through a ref so an inline onChange prop never re-fires the effect (no render loop).
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // Reset the chosen amount when the Price itself changes (e.g. the buyer switches package / tier).
  // React's documented "adjust state during render" pattern, so it never resets state inside an effect.
  const priceKey = JSON.stringify(price)
  const [prevPriceKey, setPrevPriceKey] = useState(priceKey)
  if (priceKey !== prevPriceKey) {
    setPrevPriceKey(priceKey)
    const init = initialChosenCents(price)
    setCents(init)
    setText(init != null && price.mode === 'choose' ? centsToDollarStr(init) : '')
  }

  // Report the selection on mount and whenever the chosen amount (or Price) changes.
  useEffect(() => {
    onChangeRef.current?.(buildSelection(price, cents))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents, priceKey])

  function setDollars(next: string) {
    setText(next)
    setCents(dollarsToCents(next))
  }

  function pickChip(amount: number) {
    setText(centsToDollarStr(amount))
    setCents(amount)
  }

  // ── fixed ──
  if (price.mode === 'fixed') {
    return (
      <p className="text-lg font-bold text-text">
        {price.amountCents ? formatPriceCents(price.amountCents) : 'No price set yet'}
      </p>
    )
  }

  // ── free ──
  if (price.mode === 'free') {
    return <p className="text-lg font-bold text-text">Free</p>
  }

  // ── contact ──
  if (price.mode === 'contact') {
    return (
      <button
        type="button"
        onClick={onEnquire}
        disabled={disabled || !onEnquire}
        className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated disabled:opacity-50"
      >
        Enquire
      </button>
    )
  }

  // ── choose (+ optional donation) ──
  const donation = price.donation === true
  const floor = price.minCents ?? 0
  const chips = donation ? price.pickAmountsCents ?? [] : []
  const error = validateChosenAmount(price, cents)

  return (
    <div className="space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick-pick amounts">
          {chips.map((amount) => {
            const active = cents === amount
            return (
              <button
                key={amount}
                type="button"
                onClick={() => pickChip(amount)}
                disabled={disabled}
                aria-pressed={active}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-text hover:border-border-strong'
                }`}
              >
                {formatPriceCents(amount)}
              </button>
            )
          })}
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-amount`} className="mb-1 block text-sm font-medium text-text">
          {donation
            ? chips.length > 0
              ? 'Or enter another amount'
              : 'Choose your gift'
            : 'Choose your price'}
          {floor > 0 && (
            <span className="font-normal text-subtle"> (min {formatPriceCents(floor)})</span>
          )}
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-subtle">$</span>
          <input
            id={`${idPrefix}-amount`}
            type="number"
            min={floor > 0 ? (floor / 100).toFixed(2) : '0'}
            step="0.01"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            placeholder="0.00"
            aria-invalid={error != null}
            className={`${fieldClasses} max-w-40`}
            onChange={(e) => setDollars(e.target.value)}
          />
        </div>
        {price.suggestedCents != null && (
          <p className={HINT}>
            {donation ? 'Suggested gift' : 'Suggested'} {formatPriceCents(price.suggestedCents)}
          </p>
        )}
        {error && cents != null && (
          <p className="mt-1 text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
