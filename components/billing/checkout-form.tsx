'use client'

// The card form itself. Mounted ONLY through checkout-panel.tsx's
// `dynamic(..., { ssr: false })`, never imported directly by a page — see that file for why.
//
// Everything Stripe here is reached from this module or below it, so the whole integration is one
// lazily-fetched chunk that a visitor who never clicks buy never downloads.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import type { Stripe } from '@stripe/stripe-js'
import { loadStripeBrowser } from '@/lib/billing/stripe-browser'
import { Button } from '@/components/ui/button'

/**
 * The submit half, inside the provider so it can reach the checkout session.
 *
 * `useCheckout()` is the back-compat hook that works under either provider shape in
 * @stripe/react-stripe-js v6; the Elements-specific one is `useCheckoutElements()`.
 */
function PayForm({ priceLabel, onFellBack }: { priceLabel: string; onFellBack: () => void }) {
  // ⚠️ `useCheckout()` returns a DISCRIMINATED UNION, not a checkout object:
  //   { type: 'loading' } | { type: 'success'; checkout } | { type: 'error'; error }
  // `confirm` lives on the success variant's `checkout` (StripeCheckoutElementsActions), so it has
  // to be narrowed before it can be called. The compiler caught this -- which is worth noting,
  // because the SERVER half of this integration has no types at all and would not have.
  const result = useCheckout()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (result.type === 'loading') {
    return (
      <div className="flex items-center gap-2 py-4 text-body-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing checkout…
      </div>
    )
  }

  if (result.type === 'error') {
    // The session itself could not be loaded. Nothing here can recover it, and the hosted page can.
    console.error('[checkout] checkout session failed to load', result.error)
    onFellBack()
    return null
  }

  const checkout = result.checkout

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // `confirm()` either completes here or redirects away and comes back to the session's
      // `return_url` (3DS, a bank app). Both paths land on the event page carrying session_id,
      // which is what settles the ticket without waiting on the webhook.
      const res = await checkout.confirm()
      if (res.type === 'error') {
        setError(res.error.message ?? 'That card was declined.')
        setBusy(false)
      }
      // On success Stripe navigates. `busy` stays true through the handover so the button cannot
      // be pressed a second time against the same session.
    } catch (err) {
      // A THROWN confirm is not a decline -- a decline comes back as { type: 'error' }. This is the
      // integration failing, so the buyer goes to the hosted page rather than being trapped on a
      // form that cannot take their money.
      console.error('[checkout] confirm threw; falling back to hosted', err)
      setBusy(false)
      onFellBack()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <PaymentElement />
      {error && (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Pay {priceLabel}
      </Button>
    </form>
  )
}

export default function CheckoutForm({
  clientSecret,
  priceLabel,
  onFellBack,
}: {
  clientSecret: string
  priceLabel: string
  /** Called when the form cannot be used at all, so the caller can send the buyer to Stripe. */
  onFellBack: () => void
}) {
  const [stripe, setStripe] = useState<Stripe | null>(null)
  const [dead, setDead] = useState(false)

  useEffect(() => {
    let live = true
    loadStripeBrowser()
      .then((s) => {
        if (live) setStripe(s)
      })
      .catch((err: unknown) => {
        // Blocked by an extension, offline, no key, or the 10s watchdog. None of these are the
        // buyer's problem to solve, and all of them have the same answer: the hosted page still
        // works. Reported rather than swallowed -- a silent fallback would make on-page checkout
        // quietly stop existing with no symptom but a redirect nobody filed.
        console.error('[checkout] Stripe.js did not load; falling back to hosted', err)
        if (live) {
          setDead(true)
          onFellBack()
        }
      })
    return () => {
      live = false
    }
  }, [onFellBack])

  if (dead) return null
  if (!stripe) {
    return (
      <div className="flex items-center gap-2 py-4 text-body-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading secure payment…
      </div>
    )
  }

  return (
    <CheckoutElementsProvider stripe={stripe} options={{ clientSecret }}>
      <PayForm priceLabel={priceLabel} onFellBack={onFellBack} />
    </CheckoutElementsProvider>
  )
}
