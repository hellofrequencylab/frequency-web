'use client'

// The BUY control for the Household bundle offer (ADR-370; wired by OWNER RULING, LIVE-062 batch 6,
// 2026-08-20 — startBundleCheckout was a deliberate mount waiting for this UI). A thin client wrapper
// over the server action in ./actions.ts, mirroring StartPayoutButton exactly: call the action, show
// its plain error, or send the browser to the Stripe Checkout URL. No co-seats are posted here — the
// buyer is seated by the webhook and offers the other seats afterwards from the seat manager
// (bundle-seat-controls.tsx), so nobody is ever charged for a seat they have not deliberately filled.
// GATED upstream: the section renders this only when bundleSellable() is true, and the action's own
// createBundleCheckout re-gates, so the button can never fire a broken checkout.

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { startBundleCheckout } from './actions'
import { isError } from '@/lib/action-result'

/** Start the bundle checkout, monthly by default, with a quiet yearly alternative when the operator
 *  sells one. Both go through the same action; the period is the only difference. */
export function BuyBundleButtons({ hasAnnual }: { hasAnnual: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go(period: 'monthly' | 'annual') {
    setError(null)
    startTransition(async () => {
      const r = await startBundleCheckout(period)
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => go('monthly')}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Get the bundle
          {!pending && <ArrowRight className="h-4 w-4" />}
        </button>
        {hasAnnual && (
          <button
            onClick={() => go('annual')}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-control border border-border px-4 py-2.5 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            Pay for a year
          </button>
        )}
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
