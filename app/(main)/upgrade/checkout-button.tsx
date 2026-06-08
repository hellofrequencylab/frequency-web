'use client'

import { useState, useTransition } from 'react'
import { Zap, Heart, Loader2 } from 'lucide-react'
import { startMembershipCheckout } from './actions'
import { isError } from '@/lib/action-result'

// Sends the member to Stripe Checkout for a paid tier (P2.2/P2.4). Rendered only when
// billing is configured; otherwise /upgrade shows the beta free toggle. The `supporter`
// variant is the pay-more tier — a secondary, lighter CTA under the primary Crew join.
export function CheckoutButton({ tier = 'crew' }: { tier?: 'crew' | 'supporter' }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const supporter = tier === 'supporter'

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await startMembershipCheckout(tier)
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className={
          supporter
            ? 'flex w-full items-center justify-center gap-2 rounded-xl border border-signal/40 bg-signal-bg/40 px-4 py-3 text-sm font-bold text-signal-strong transition-colors hover:bg-signal-bg/60 disabled:opacity-60'
            : 'flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-60'
        }
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : supporter ? (
          <Heart className="h-4 w-4" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {isPending ? 'Redirecting to checkout…' : supporter ? 'Become a Supporter' : 'Join the Crew'}
      </button>
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  )
}
