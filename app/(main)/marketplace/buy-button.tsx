'use client'

import { useState, useTransition } from 'react'
import { ShoppingBag } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { startCheckoutAction } from './commerce-actions'
import CheckoutPanel from '@/components/billing/checkout-panel'

// Buy control for a commerce product (maker / shop). Calls the checkout action and takes the card
// RIGHT HERE (LIVE-359) or, when the on-page form cannot be offered, hands off to Stripe Checkout;
// surfaces the friendly error inline when payments aren't on yet (billing off) or the seller isn't
// payout-ready.
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
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  async function buy() {
    setError(null)
    const res = await startCheckoutAction(productId, variantId, entryPoint ?? null)
    // Branch on what CAME BACK, never on what was asked for: the server declines the on-page path
    // whenever it cannot be honoured, and the url branch catches that.
    if (res.clientSecret) setClientSecret(res.clientSecret)
    else if (res.url) window.location.href = res.url
    else setError(res.error ?? 'Could not start checkout.')
  }

  /** The LAST line of defence: if the form cannot mount or confirm, ask again and take the URL.
   *  A commerce retry writes a SECOND pending order; the first is swept by the
   *  `checkout.session.expired` arm this path already has (abandonCommerceOrderFromSession). */
  function fallBackToHosted() {
    setClientSecret(null)
    setError('Opening secure checkout…')
    start(async () => {
      const res = await startCheckoutAction(productId, variantId, entryPoint ?? null, {
        forceHosted: true,
      })
      if (res.url) window.location.href = res.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending || disabled}
        className={buttonClasses('primary', 'md')}
        onClick={() => start(buy)}
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-2 text-body-sm text-warning">{error}</p>}
      {clientSecret && (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={clientSecret}
            onFellBack={fallBackToHosted}
            // Closing after a completed payment reloads so the page shows what was just bought.
            onClose={() => window.location.reload()}
            doneTitle="Order placed."
            doneBody="A receipt is on its way to your email. You can follow the order from Orders."
          />
        </div>
      )}
    </div>
  )
}
