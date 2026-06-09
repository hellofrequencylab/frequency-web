'use client'

import { useState, useTransition } from 'react'
import { Ticket, Loader2 } from 'lucide-react'
import { startTicket } from './ticket-actions'
import { isError } from '@/lib/action-result'

// "Get ticket" on a paid event. Redirects to Stripe Checkout. Only rendered when
// the host is payouts-ready and the viewer hasn't already bought (page decides).
export function TicketButton({ eventId, priceLabel }: { eventId: string; priceLabel: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await startTicket(eventId, 1)
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
        Get ticket — {priceLabel}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
