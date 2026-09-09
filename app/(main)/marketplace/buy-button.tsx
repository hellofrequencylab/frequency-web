'use client'

import { useState, useTransition } from 'react'
import { ShoppingBag } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { startCheckoutAction } from './commerce-actions'

// Buy control for a commerce product (maker / shop). Calls the checkout action and
// hands off to Stripe Checkout; surfaces the friendly error inline when payments
// aren't on yet (billing off) or the seller isn't payout-ready.
export function BuyButton({
  productId,
  variantId,
  entryPoint,
  label = 'Buy now',
  disabled = false,
}: {
  productId: string
  /** Optional selected variant (Etsy-Grade Phase 2). Passed through to checkout. */
  variantId?: string | null
  /** Set to 'marketplace' by the Market browse surfaces ONLY (LIVE-219) — the places where Frequency
   *  made the introduction, so the order classifies `network` and the tier's take rate applies.
   *  Omitted on `/store/[id]`, a seller's own storefront link, which stays `self` at 0%.
   *  This never overrides the promise: `classifyOrderSource` runs the self-scan and the ADR-913
   *  relationship check ABOVE the entry point, so an existing follower/member/CRM contact is still 0%. */
  entryPoint?: 'marketplace' | null
  label?: string
  disabled?: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending || disabled}
        className={buttonClasses('primary', 'md')}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await startCheckoutAction(productId, variantId, entryPoint ?? null)
            if (res.url) window.location.href = res.url
            else setError(res.error ?? 'Could not start checkout.')
          })
        }
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-2 text-body-sm text-warning">{error}</p>}
    </div>
  )
}
