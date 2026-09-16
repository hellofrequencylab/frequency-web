'use client'

// The seam that keeps Stripe out of everyone else's bundle (LIVE-347, generalised in LIVE-359).
//
// Entity-blind on purpose: it takes a client secret, a price label and a fallback, so every one of
// the nine checkout creators mounts THIS, rather than each growing its own card form.
//
// 🔴 WHY THIS FILE EXISTS AT ALL. `dynamic(..., { ssr: false })` is NOT allowed in a Server
// Component in this version of Next — node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md
// §"Skipping SSR": "ssr: false is not allowed with next/dynamic in Server Components. Please move
// it into a Client Component." This is that Client Component. Same shape, and the same reason, as
// components/maps/map-canvas.tsx.
//
// ⚠️ AND SSR MUST BE SKIPPED. A 'use client' module still EXECUTES ON THE SERVER during render
// (server-and-client-boundary.md: Client Components run in both places). Stripe.js touches
// `window`, so the form has to be excluded from the server pass rather than merely marked client.
//
// The split is what keeps this cheap: everything Stripe is reached only through the `import()`
// below, so it lands in its own chunk. A visitor who reads an event page and never clicks buy
// downloads none of it. `import()` is invisible to the static-import walk in
// scripts/check-shell-weight.mjs for exactly that reason — that is the point of the split, not a
// way around the gate.
//
// 🔴 'use client' IS ON LINE 1 ON PURPOSE. scripts/check-client-server-boundary.mjs detects a
// client entry with /^\s*['"]use client['"]/ — whitespace only, no comment skipping — while
// scripts/check-shell-weight.mjs skips leading banners. Putting the directive below this comment
// would make the two gates disagree about what this file is.
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'

const CheckoutForm = dynamic(() => import('./checkout-form'), { ssr: false })

export default function CheckoutPanel({
  clientSecret,
  priceLabel,
  onFellBack,
  onClose,
  onPaid,
  doneTitle = 'You are in.',
  doneBody = 'Your ticket is confirmed. A receipt is on its way to your email.',
}: {
  clientSecret: string
  priceLabel?: string
  onFellBack: () => void
  /**
   * Run the moment the payment succeeds on-page, BEFORE the confirmation shows (LIVE-366).
   *
   * 🔴 THE CONFIRMATION IS A PROMISE, so something has to make it true. `redirect: 'if_required'`
   * means the buyer never navigates, so the session's `return_url` reconcile never runs and the
   * webhook is the only thing that would flip the row and send the receipt. A caller passes its
   * settle action here and the panel waits for it, so the panel says "a receipt is on its way"
   * only once something has actually been asked to send one.
   *
   * IT IS NEVER ALLOWED TO FAIL THE PAYMENT. A rejection is logged and the confirmation shows
   * anyway: the money moved, the webhook still owes them the ticket, and an error screen after a
   * successful charge is the worst thing this panel could say.
   */
  onPaid?: () => Promise<unknown>
  /**
   * Dismiss the panel after a completed payment. The caller clears its client secret and
   * refreshes, so the page reflects the purchase. Optional: a caller that navigates on its own
   * does not need it, and then the confirmation simply has no close control.
   */
  onClose?: () => void
  /** What the confirmation says. Defaults are ticket copy; a tip or a gift passes its own. */
  doneTitle?: string
  doneBody?: string
}) {
  const [done, setDone] = useState(false)
  const [settling, setSettling] = useState(false)

  /** Paid. Settle first if the caller gave us a way to, then show the confirmation either way. */
  async function paid() {
    if (!onPaid) {
      setDone(true)
      return
    }
    setSettling(true)
    try {
      await onPaid()
    } catch (err) {
      console.error('[checkout] settle after payment failed; the webhook is now the only path', err)
    }
    setSettling(false)
    setDone(true)
  }

  // The half-second between "charged" and "confirmed". Named rather than blank, because a form
  // that goes quiet right after a card is submitted is the moment a buyer presses again.
  if (settling) {
    return (
      <div className="flex items-center gap-2 pt-3 text-body-sm text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Confirming your payment…
      </div>
    )
  }

  // ── PAID, AND STILL HERE ──────────────────────────────────────────────────────────────────
  // The form resolves in place (`redirect: 'if_required'`), so the last thing a buyer sees is a
  // confirmation rather than a page reload. It replaces the form instead of sitting under it:
  // leaving a live card field on screen after the money moved invites a second submission
  // against a session that is already paid.
  if (done) {
    return (
      <div
        className="motion-safe:animate-[slideUp_0.3s_ease-out] rounded-control bg-surface-elevated p-3"
        role="status"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
            <Check className="h-4 w-4 text-on-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-bold text-text">{doneTitle}</p>
            <p className="mt-0.5 text-meta text-muted">{doneBody}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 shrink-0 rounded-control p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    // ── NO BOX. ────────────────────────────────────────────────────────────────────────────
    // This used to be `rounded-lg border border-border p-4`, which put a bordered panel inside
    // the bordered RSVP card: a box in a box, reading as a foreign widget bolted on. The layer
    // now belongs to the card it opens in -- it simply appears under the button and pushes what
    // follows down. Stripe's own `.Block` stroke is removed in the Appearance rules for the same
    // reason; a stroke there would put the box back one level deeper.
    <div className="motion-safe:animate-[slideUp_0.3s_ease-out] pt-3">
      <CheckoutForm
        clientSecret={clientSecret}
        priceLabel={priceLabel}
        onFellBack={onFellBack}
        onDone={paid}
      />
    </div>
  )
}
