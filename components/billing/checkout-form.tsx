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
 * Stripe's fields, drawn with this page's own tokens (LIVE-363).
 *
 * Without this the Payment Element renders Stripe's default theme: its own font, its own radius,
 * and a STROKED BOX around the saved-payment / Link block. Dropped into a card that already has a
 * border, that reads as a second, foreign panel bolted onto ours rather than part of the page.
 *
 * 🔴 NO HEX FALLBACKS. Every value is read from the live custom properties, and a property that
 * does not resolve is OMITTED rather than defaulted, because a hardcoded colour here would be a
 * raw hex in member-facing UI (check:tokens) AND would silently ignore the member's theme -- this
 * app has light, dark, Midnight and a light-lock, and the Appearance object is built per mount, so
 * it follows whichever is active.
 */
function appearanceFromTokens(): Record<string, unknown> {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string): string => cs.getPropertyValue(name).trim()
  const put = (into: Record<string, string>, key: string, name: string) => {
    const v = read(name)
    if (v) into[key] = v
  }

  const variables: Record<string, string> = {}
  put(variables, 'colorPrimary', '--color-primary')
  put(variables, 'colorBackground', '--color-surface')
  put(variables, 'colorText', '--color-text')
  put(variables, 'colorTextSecondary', '--color-text-muted')
  put(variables, 'colorDanger', '--color-danger')
  put(variables, 'borderRadius', '--radius-control')

  const border = read('--color-border')
  const surface = read('--color-surface')

  // `.Block` is the saved-payment / Link container. Ours is already inside the RSVP card, so its
  // own border and shadow are the "box within a box" the owner asked to remove.
  const rules: Record<string, Record<string, string>> = {
    '.Block': { border: 'none', boxShadow: 'none', ...(surface ? { backgroundColor: surface } : {}) },
    '.Tab': { boxShadow: 'none', ...(border ? { border: `1px solid ${border}` } : {}) },
    '.Input': { boxShadow: 'none', ...(border ? { border: `1px solid ${border}` } : {}) },
  }

  return { variables, rules }
}

/**
 * The submit half, inside the provider so it can reach the checkout session.
 *
 * `useCheckout()` is the back-compat hook that works under either provider shape in
 * @stripe/react-stripe-js v6; the Elements-specific one is `useCheckoutElements()`.
 */
function PayForm({
  priceLabel,
  onFellBack,
  onDone,
}: {
  priceLabel?: string
  onFellBack: () => void
  /** Paid without leaving the page. The panel swaps to its confirmation. */
  onDone: () => void
}) {
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
      // `redirect: 'if_required'` is what keeps the buyer here. Without it Stripe navigates on
      // EVERY success, so the purchase always ended on a page reload -- the thing that made this
      // flow feel like leaving. With it, a card that needs no extra step resolves in place and we
      // render the confirmation ourselves.
      //
      // ⚠️ 'if_required' is not 'never'. A 3DS challenge or a bank app STILL redirects, and lands
      // on the session's `return_url` carrying session_id, which settles the purchase without
      // waiting for the webhook. Both endings stay correct; only the common one changed.
      const res = await checkout.confirm({ redirect: 'if_required' })
      if (res.type === 'error') {
        setError(res.error.message ?? 'That card was declined.')
        setBusy(false)
        return
      }
      // Paid, and still here. `busy` stays true through the handover so the button cannot be
      // pressed a second time against a session that is already paid.
      onDone()
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
        {priceLabel ? `Pay ${priceLabel}` : 'Pay'}
      </Button>
    </form>
  )
}

export default function CheckoutForm({
  clientSecret,
  priceLabel,
  onFellBack,
  onDone,
}: {
  clientSecret: string
  /** Shown on the submit button as "Pay <label>". Omitted where the control has no single price
   *  to name (a cart, a variable order): the button then reads simply "Pay". */
  priceLabel?: string
  /** Called when the form cannot be used at all, so the caller can send the buyer to Stripe. */
  onFellBack: () => void
  /** Called once the payment succeeded WITHOUT leaving the page. */
  onDone: () => void
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
    <CheckoutElementsProvider
      stripe={stripe}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: appearanceFromTokens(),
          // ── SAVE THIS CARD (LIVE-362) ──────────────────────────────────────────────────
          // Stripe renders the checkbox itself, and only when the session can actually honour
          // it -- that is, when the server attached a customer. A member gets the option; a
          // guest never sees it, because a guest session carries no customer and there is no
          // account for the card to belong to. Letting Stripe own the control also means the
          // regional consent wording it is required to show comes for free, which a checkbox
          // of ours would have to reproduce and keep current.
          //
          // `enableRedisplay: 'auto'` is the other half: it is what lets a saved card be OFFERED
          // back on the next purchase. Without it a card can be saved and never shown again.
          savedPaymentMethod: { enableSave: 'auto', enableRedisplay: 'auto' },
          // Stripe draws its own loading state; ours already ran above. Two spinners for one wait
          // is what made this feel slower than it was.
          loader: 'never',
        },
      }}
    >
      <PayForm priceLabel={priceLabel} onFellBack={onFellBack} onDone={onDone} />
    </CheckoutElementsProvider>
  )
}
