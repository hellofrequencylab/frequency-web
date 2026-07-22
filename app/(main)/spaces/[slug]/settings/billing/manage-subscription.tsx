'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { openSpaceBillingPortal } from './actions'

// MANAGE SUBSCRIPTION (client). The self-serve subscription control for a paying Space: opens the
// Stripe-hosted billing portal where the owner updates the payment method, changes or cancels the plan,
// and adjusts seats where the portal allows. No custom mutation here (Stripe owns the portal); the action
// is owner-gated and returns a clean error rather than a broken URL when there is nothing to manage.
// No em dashes (CONTENT-VOICE §10).
export function ManageSubscriptionButton({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function manage() {
    setError(null)
    start(async () => {
      const res = await openSpaceBillingPortal(slug)
      if (isError(res)) setError(res.error)
      else window.location.href = res.data.url
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">Manage subscription</h2>
          <p className="mt-1 text-sm text-muted">
            Update your payment method, change or cancel your plan, and adjust seats in the secure Stripe
            portal.
          </p>
        </div>
        <button
          type="button"
          onClick={manage}
          disabled={pending}
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
          {pending ? 'Opening' : 'Manage subscription'}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
