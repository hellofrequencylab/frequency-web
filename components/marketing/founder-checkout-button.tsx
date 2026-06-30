'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { createFounderCheckout } from '@/app/(marketing)/founders/checkout/actions'
import type { FounderTier } from '@/lib/billing/founders'

// The LIVE founding-checkout CTA. Only rendered when billingLive() is true (the page
// branch decides that; this component never decides whether to charge). It calls the
// gated createFounderCheckout server action and, on success, redirects to the hosted
// Stripe Checkout URL. If the action returns notOpen (the flag flipped back OFF between
// render and click), it shows the not-open message instead of charging.
const TIERS: { id: FounderTier; label: string; price: string; note: string }[] = [
  { id: 'supporter', label: 'Founding Supporter', price: '$25', note: 'Believe in it, get in early.' },
  { id: 'member', label: 'Founding Member', price: '$250', note: 'The core founding offer, locked for life.' },
  { id: 'patron', label: 'Founding Patron', price: '$1,000', note: 'Go all in.' },
]

export function FounderCheckoutButton({ defaultTier = 'member' }: { defaultTier?: FounderTier }) {
  const [tier, setTier] = useState<FounderTier>(defaultTier)
  const [status, setStatus] = useState<'idle' | 'loading'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onCheckout() {
    setError(null)
    setStatus('loading')
    const res = await createFounderCheckout({ tier })
    if (res.ok) {
      // Hand off to Stripe's hosted checkout.
      window.location.assign(res.url)
      return
    }
    if ('notOpen' in res) {
      setError('Founding checkout is not open yet. Your spot is held at the founder rate.')
    } else if ('needsAuth' in res) {
      setError('Please sign in to complete your founding membership.')
    } else {
      setError(res.error)
    }
    setStatus('idle')
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-left">
      <fieldset>
        <legend className="block text-sm font-semibold text-text mb-2">Choose your founding tier</legend>
        <div className="space-y-2.5">
          {TIERS.map((t) => {
            const active = tier === t.id
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  active ? 'border-primary bg-primary-bg/50' : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="founder-checkout-tier"
                  value={t.id}
                  checked={active}
                  onChange={() => setTier(t.id)}
                  className="mt-1 accent-primary"
                />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-text">{t.label}</span>
                    <span className="text-sm font-bold text-primary-strong">{t.price}</span>
                  </span>
                  <span className="block text-sm text-muted leading-snug mt-0.5">{t.note}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <button
        type="button"
        onClick={onCheckout}
        disabled={status === 'loading'}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'Taking you to checkout...' : 'Complete your founding membership'}
        {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
      </button>

      <p className="mt-4 text-xs text-subtle leading-relaxed text-center">
        Your founder rate is locked in at checkout. A membership, not an investment.
      </p>
    </div>
  )
}
