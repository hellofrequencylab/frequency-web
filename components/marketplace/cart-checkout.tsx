'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { trackClient } from '@/components/analytics/track-provider'
import { clearCartAction, startCartCheckoutAction } from '@/app/(main)/marketplace/cart-actions'
import { settleCommerceOrderAction } from '@/app/(main)/marketplace/commerce-actions'

// Pay for the saved cart (DEF-ETSY P5, /cart). Same shape as the single-item Buy control: take the card right here,
// or hand off to hosted checkout when the form cannot be offered. The cart is emptied only after the payment
// settles, so closing the form leaves it as it was.
export function CartCheckout({ priceLabel }: { priceLabel?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  async function pay() {
    setError(null)
    trackClient('commerce.checkout_started', { kind: 'commerce_order' })
    warmStripeBrowser()
    const res = await startCartCheckoutAction()
    if (res.clientSecret) {
      setSessionId(res.sessionId ?? null)
      setClientSecret(res.clientSecret)
    } else if (res.url) window.location.href = res.url
    else setError(res.error ?? 'Could not start checkout.')
  }

  function fallBackToHosted() {
    setClientSecret(null)
    setSessionId(null)
    setError('Opening secure checkout…')
    start(async () => {
      const res = await startCartCheckoutAction({ forceHosted: true })
      if (res.url) window.location.href = res.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={buttonClasses('primary', 'md')}
        onClick={() => start(pay)}
        onPointerEnter={warmStripeBrowser}
        onFocus={warmStripeBrowser}
        onTouchStart={warmStripeBrowser}
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : 'Check out'}
      </button>
      {error ? <p className="mt-2 text-body-sm text-warning">{error}</p> : null}
      {clientSecret ? (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={clientSecret}
            priceLabel={priceLabel}
            onFellBack={fallBackToHosted}
            onPaid={async () => {
              if (sessionId) await settleCommerceOrderAction(sessionId)
              await clearCartAction()
            }}
            onClose={() => router.push('/orders')}
            doneTitle="Order placed."
            doneBody="A receipt is on its way to your email. You can follow each order from Orders."
          />
        </div>
      ) : null}
    </div>
  )
}
