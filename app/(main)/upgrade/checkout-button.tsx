'use client'

import { useState, useTransition } from 'react'
import { Zap, Loader2 } from 'lucide-react'
import { startMembershipCheckout } from './actions'
import { isError } from '@/lib/action-result'

// Sends the member to Stripe Checkout for the paid membership (P2.2). Rendered only
// when billing is configured; otherwise /upgrade shows the beta free toggle.
export function CheckoutButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await startMembershipCheckout()
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {isPending ? 'Redirecting to checkout…' : 'Join the Crew'}
      </button>
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  )
}
