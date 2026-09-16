'use client'

import { useState, useTransition } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { startTip } from './tip-actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { TIP_PRESETS_CENTS, TIP_MIN_CENTS, TIP_MAX_CENTS } from '@/lib/billing/tips-core'
import { isError } from '@/lib/action-result'

// "Tip" entry on a host/partner profile. Opens a small composer (preset chips + custom amount +
// optional note), then takes the card RIGHT HERE (LIVE-359) or, when the on-page form cannot be
// offered, redirects to Stripe Checkout. Only rendered when the recipient is payouts-ready (the
// server decides; see page.tsx).
export function TipButton({ toProfileId, recipientName }: { toProfileId: string; recipientName: string }) {
  const [open, setOpen] = useState(false)
  const [amountCents, setAmountCents] = useState<number>(TIP_PRESETS_CENTS[1])
  const [custom, setCustom] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Custom field (in dollars) wins when non-empty.
  const effectiveCents = custom.trim() ? Math.round(parseFloat(custom) * 100) : amountCents
  const valid = Number.isFinite(effectiveCents) && effectiveCents >= TIP_MIN_CENTS && effectiveCents <= TIP_MAX_CENTS

  /**
   * The LAST line of defence, the same one the ticket doors carry. If the form cannot mount or
   * confirm at all -- Stripe.js blocked, the session unloadable, confirm throwing -- the tipper
   * must still be able to pay, so we ask the server again and take whatever it gives.
   *
   * ⚠️ This asks for a SECOND session, and `createTipCheckout` records a `pending` tip per session.
   * The orphan never settles and nothing sweeps it: `checkout.session.expired` abandons commerce
   * orders and Space donations but has no tip arm (LIVE-364). That is pre-existing and the reason
   * this path stays last-resort rather than routine.
   */
  function fallBackToHosted() {
    setClientSecret(null)
    setError('Opening secure checkout…')
    startTransition(async () => {
      const r = await startTip(toProfileId, effectiveCents, message.trim() || undefined, {
        forceHosted: true,
      })
      if (!isError(r) && r.data.url) window.location.href = r.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  function send() {
    setError(null)
    warmStripeBrowser()
    if (!valid) {
      setError(`Enter an amount between $${TIP_MIN_CENTS / 100} and $${TIP_MAX_CENTS / 100}.`)
      return
    }
    startTransition(async () => {
      const r = await startTip(toProfileId, effectiveCents, message.trim() || undefined)
      if (isError(r)) {
        setError(r.error)
      } else if (r.data.clientSecret) {
        // ON-PAGE: the card form opens under the composer. Branching on what CAME BACK rather
        // than on what was asked for is deliberate -- the server declines the on-page path
        // whenever it cannot be honoured, and the next branch catches that.
        setClientSecret(r.data.clientSecret)
      } else if (r.data.url) {
        window.location.href = r.data.url
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-control border border-primary-bg bg-primary-bg px-3 py-1.5 text-body-sm font-medium text-primary-strong transition-colors hover:bg-primary-bg/70"
      >
        <Heart className="h-3.5 w-3.5" />
        Tip
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-card border border-border bg-surface p-4 lift-1">
      <p className="text-body-sm font-bold text-text">Tip {recipientName}</p>
      <p className="mt-0.5 text-meta text-muted">Sends directly to them. Frequency takes a small fee.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {TIP_PRESETS_CENTS.map((c) => (
          <button
            key={c}
            onClick={() => { setAmountCents(c); setCustom('') }}
            className={`rounded-xl px-3 py-1.5 text-body-sm font-semibold transition-colors ${
              !custom.trim() && amountCents === c
                ? 'bg-primary text-on-primary'
                : 'border border-border text-text hover:bg-surface-elevated'
            }`}
          >
            ${c / 100}
          </button>
        ))}
        <div className="flex items-center gap-1 rounded-card border border-border px-2.5 py-1.5">
          <span className="text-body-sm text-subtle">$</span>
          <Input
            variant="seamless"
            type="number"
            inputMode="decimal"
            aria-label="Another tip amount, in dollars"
            min={TIP_MIN_CENTS / 100}
            max={TIP_MAX_CENTS / 100}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other"
            className="w-16 text-body-sm text-text"
          />
        </div>
      </div>

      <Input
        type="text"
        aria-label="Add a note"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={280}
        placeholder="Add a note (optional)"
        className="mt-3"
      />

      {error && <p className="mt-2 text-body-sm text-danger">{error}</p>}

      {clientSecret && (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={clientSecret}
            priceLabel={`$${(effectiveCents / 100).toFixed(2)}`}
            onFellBack={fallBackToHosted}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={send}
          onPointerEnter={warmStripeBrowser}
          onFocus={warmStripeBrowser}
          onTouchStart={warmStripeBrowser}
          disabled={isPending || !valid}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" />}
          Tip ${(effectiveCents / 100).toFixed(2)}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="rounded-control px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-surface-elevated"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
