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
  ExpressCheckoutElement,
  PaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import type { Stripe } from '@stripe/stripe-js'
import { loadStripeBrowser } from '@/lib/billing/stripe-browser'
import { Button } from '@/components/ui/button'
import CardSkeleton from './card-skeleton'

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
  /** Paid without leaving the page. The panel settles, then swaps to its confirmation. */
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
  /** Stripe has painted its fields. Until then the skeleton holds their exact space. */
  const [ready, setReady] = useState(false)
  /**
   * Whether the express row will render anything at all (LIVE-370). `undefined` until Stripe says;
   * `false` means this device offers no Link and no wallet, so the row is not rendered rather than
   * left as an empty gap above the card.
   */
  const [expressAvailable, setExpressAvailable] = useState<boolean | undefined>(undefined)

  // The same skeleton as everywhere else: with a promised secret this branch is now the COMMON
  // one, held from the press until the session lands, so it has to be the final shape rather than
  // a spinner the box then resizes away from.
  if (result.type === 'loading') return <CardSkeleton />

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

  /**
   * The Link / wallet buttons confirm through the SAME session as the card form (LIVE-370).
   *
   * `checkout.confirm` takes the express event as `expressCheckoutConfirmEvent`, so there is one
   * session, one settle and one confirmation whichever button the buyer used. Nothing downstream
   * needs to know which it was.
   *
   * 🔴 `event.paymentFailed(...)` IS NOT OPTIONAL ON A DECLINE. Stripe's payment interface stays
   * open waiting for a verdict, so returning without calling it leaves the buyer inside a sheet
   * that never resolves. That is why every failing branch below calls it before anything else.
   */
  async function confirmExpress(event: {
    paymentFailed: (o: { reason: 'fail' }) => void
  }) {
    setError(null)
    setBusy(true)
    try {
      const res = await checkout.confirm({
        redirect: 'if_required',
        expressCheckoutConfirmEvent: event as never,
      })
      if (res.type === 'error') {
        event.paymentFailed({ reason: 'fail' })
        setError(res.error.message ?? 'That payment did not go through.')
        setBusy(false)
        return
      }
      onDone()
    } catch (err) {
      console.error('[checkout] express confirm threw; falling back to hosted', err)
      event.paymentFailed({ reason: 'fail' })
      setBusy(false)
      onFellBack()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* ── LINK AND THE DEVICE WALLETS, AS THEIR OWN BUTTONS ──────────────────────────────────
          The owner asked for "Pay $44" and "Link" split apart. This is the only supported way to
          do it: the express element renders Link (and whatever wallet the device actually has) as
          real buttons, above the card form, confirming through the same session.

          ⚠️ WALLETS ARE NOT SUPPRESSED TO MAKE IT "Link only". Apple Pay and Google Pay are the
          fastest paths a phone has, and killing them to satisfy the letter of the ask would be a
          regression for exactly the buyers who convert best. Link is ordered FIRST instead, so it
          is the button a desktop buyer sees.

          `link` takes only 'auto' | 'never' -- there is no 'always' -- so Stripe decides whether
          the button can appear at all, and `onReady` is how we find out. A row that would render
          nothing is not rendered, rather than left as an empty gap above the card fields. */}
      {expressAvailable !== false && (
        <div className={expressAvailable ? 'space-y-3' : 'h-0 overflow-hidden'}>
          <ExpressCheckoutElement
            options={{
              buttonHeight: 44,
              buttonTheme: {},
              buttonType: {},
              layout: { maxColumns: 2, maxRows: 1, overflow: 'never' },
              paymentMethodOrder: ['link'],
              paymentMethods: {
                link: 'auto',
                applePay: 'auto',
                googlePay: 'auto',
                paypal: 'never',
                amazonPay: 'never',
                klarna: 'never',
              },
            }}
            onReady={(e) => setExpressAvailable(!!e.availablePaymentMethods)}
            onConfirm={confirmExpress}
            // The buyer closed Stripe's sheet without paying. Not an error, and not a fallback --
            // the card form below is still standing and still theirs to use.
            onCancel={() => setBusy(false)}
          />
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-2xs text-muted">or pay by card</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}
      {/* ── EVERY WAY TO PAY, IN THIS ONE AREA ────────────────────────────────────────────────
          `accordion` + `defaultCollapsed: false` puts the card fields open on arrival with the
          other methods listed beneath, so a buyer who just wants to type a card types it and a
          buyer who wants Link, a wallet or PayPal sees the row without a detour. `tabs`, the
          default, hides everything past the third method behind a "more" control -- a second
          click for the thing the owner asked to be visible.

          `radios: 'if_multiple'` and `spacedAccordionItems: false` are what keep it MINIMAL:
          no radio column when there is only one method, and no gaps turning each row into its
          own little card inside a card.

          Wallets stay `auto`, never `never`. Apple Pay and Google Pay are the fastest paths a
          phone has, and whether they appear is the DEVICE's answer, not ours. */}
      {!ready && <CardSkeleton />}
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          // 🔴 CARD FIRST, ALWAYS. Without `paymentMethodOrder` Stripe picks the order itself --
          // "a dynamic ordering that optimizes payment method display for each user" -- and what
          // it chose on the live page was Link at the top, so the one field every buyer can use
          // sat underneath a method most of them do not have. The owner's instruction was exact:
          // the card field first, Link as a button under it.
          //
          // This list is a PREFERENCE, not a filter. A method Stripe has enabled but that is not
          // named here still renders, after these; naming card and link does not hide PayPal or a
          // wallet. That is why there is no `wallets: never` anywhere near this.
          paymentMethodOrder: ['card', 'link'],
          layout: {
            type: 'accordion',
            defaultCollapsed: false,
            radios: 'if_multiple',
            spacedAccordionItems: false,
          },
          // The accordion is what makes "Link as a button under the card" literal: card renders
          // expanded, every other method is a collapsed row beneath it, and opening one closes
          // the other. That is Stripe's own behaviour, so the swap costs us no state to keep and
          // cannot drift out of sync with what the element thinks is selected.
          // The express row above owns Link and the wallets now, so the card form must not offer
          // them a second time -- that was the duplication the owner saw as "the Link section".
          // Safe because the row only hides itself when Stripe reports NO available method, which
          // is the same condition under which these would not have rendered here either.
          wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
        }}
        // Hidden rather than unmounted: the element has to be IN THE TREE to load at all, so
        // unmounting it until ready would mean it never became ready. `h-0 overflow-hidden` keeps
        // it mounted and fetching while the skeleton holds the visible space, and the swap is one
        // class change rather than a remount.
        className={ready ? undefined : 'h-0 overflow-hidden'}
      />
      {error && (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {/* The Pay button arrives WITH the fields, never before them. Rendering it over an empty
          area is what made the live page look like two stacked buttons and nothing else. */}
      {ready && (
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {priceLabel ? `Pay ${priceLabel}` : 'Pay'}
        </Button>
      )}
    </form>
  )
}

export default function CheckoutForm({
  clientSecret,
  priceLabel,
  onFellBack,
  onDone,
}: {
  /**
   * A secret, or a PROMISE of one (LIVE-371).
   *
   * 🔴 THE PROMISE IS THE POINT. `CheckoutElementsProvider` accepts `Promise<string> | string` and
   * calls `initCheckoutElementsSdk` the moment it mounts, so handing it the IN-FLIGHT server call
   * lets Stripe start initialising while the session is still being built. Waiting for a string
   * made those two waits serial for no reason -- the last one left after the script and the chunk
   * were both moved off the click.
   *
   * ⚠️ IT MUST REJECT, not hang, on every path that will never produce a secret: a sold-out tier,
   * a free claim, the hosted degrade. A promise nobody settles leaves Stripe initialising forever
   * behind a panel that looks like it is still loading.
   */
  clientSecret: string | Promise<string>
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
    // The SAME skeleton the element is about to be replaced by, so the drawer opens at its final
    // height and stays there. It used to be a centred spinner, which meant the buyer watched the
    // box change shape twice on the way to one card field.
    return <CardSkeleton />
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
