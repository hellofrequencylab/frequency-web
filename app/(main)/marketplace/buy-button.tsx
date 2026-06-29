'use client'

import { useState, useTransition } from 'react'
import { ShoppingBag } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { startCheckoutAction } from './commerce-actions'

// Buy control for a commerce product (maker / shop). Calls the checkout action and
// hands off to Stripe Checkout; surfaces the friendly error inline when payments
// aren't on yet (billing off) or the seller isn't payout-ready.
export function BuyButton({ productId, label = 'Buy now' }: { productId: string; label?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={buttonClasses('primary', 'md')}
        onClick={() =>
          start(async () => {
            setError(null)
            const res = await startCheckoutAction(productId)
            if (res.url) window.location.href = res.url
            else setError(res.error ?? 'Could not start checkout.')
          })
        }
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-2 text-sm text-warning">{error}</p>}
    </div>
  )
}
