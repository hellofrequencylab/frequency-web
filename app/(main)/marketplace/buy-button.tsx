'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { startCheckoutAction, settleCommerceOrderAction } from './commerce-actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'

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
  priceLabel,
  doneTitle = 'Order placed.',
  doneBody = 'A receipt is on its way to your email. You can follow the order from Orders.',
  doneHref,
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
  /** Shown on the card form so the amount stays beside the fields the buyer is filling in. */
  priceLabel?: string
  /** What the confirmation says. Defaults are order copy; a Journey passes enrolment copy. */
  doneTitle?: string
  doneBody?: string
  /** Where the confirmation's close control goes. Defaults to reloading this page so it re-renders
   *  showing what was just bought; a Journey passes `/journeys/<slug>/learn` so the buyer lands in
   *  the thing they paid for rather than back on the sales page. */
  doneHref?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  async function buy() {
    setError(null)
    warmStripeBrowser()
    const res = await startCheckoutAction(productId, variantId, entryPoint ?? null)
    // 🔴 A SIGNED-OUT BUYER IS SENT SOMEWHERE, not told to go somewhere. The server cannot build
    // this URL -- it sees no calling path -- so the return leg is appended here, from the page the
    // buyer is actually reading. Without it this branch printed "Sign in to buy." and stopped,
    // which on a paid Journey is the whole signed-out path.
    if (res.signInRequired) {
      const back = `${window.location.pathname}${window.location.search}`
      // `router.push`, not a location assignment: /sign-in is an internal route, so a soft
      // navigation keeps the app shell and the warm Stripe module this control just loaded.
      router.push(`/sign-in?next=${encodeURIComponent(back)}`)
      return
    }
    // Branch on what CAME BACK, never on what was asked for: the server declines the on-page path
    // whenever it cannot be honoured, and the url branch catches that.
    if (res.clientSecret) {
      setSessionId(res.sessionId ?? null)
      setClientSecret(res.clientSecret)
    } else if (res.url) window.location.href = res.url
    else setError(res.error ?? 'Could not start checkout.')
  }

  /** The LAST line of defence: if the form cannot mount or confirm, ask again and take the URL.
   *  A commerce retry writes a SECOND pending order; the first is swept by the
   *  `checkout.session.expired` arm this path already has (abandonCommerceOrderFromSession). */
  function fallBackToHosted() {
    setClientSecret(null)
    setSessionId(null)
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
        onPointerEnter={warmStripeBrowser}
        onFocus={warmStripeBrowser}
        onTouchStart={warmStripeBrowser}
      >
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-2 text-body-sm text-warning">{error}</p>}
      {clientSecret && (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={clientSecret}
            priceLabel={priceLabel}
            onFellBack={fallBackToHosted}
            // 🔴 SETTLE FROM OUR OWN SUCCESS HANDLER. `confirm({ redirect: 'if_required' })` means
            // the card path never navigates, so the success URL's reconcile never runs and the
            // webhook was the only thing that could flip this order to `paid` -- and, for a
            // Journey, the only thing that grants the enrolment. The panel waits for this before
            // it says the purchase is done, so the confirmation is true when it appears. It can
            // never fail the payment: a rejection is logged and the confirmation shows anyway.
            onPaid={sessionId ? () => settleCommerceOrderAction(sessionId) : undefined}
            // Closing after a completed payment either lands the buyer in what they bought, or
            // reloads so this page re-renders showing it.
            onClose={() => {
              if (doneHref) router.push(doneHref)
              else window.location.reload()
            }}
            doneTitle={doneTitle}
            doneBody={doneBody}
          />
        </div>
      )}
    </div>
  )
}
