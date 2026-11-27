'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { refundTicketAction } from '../ticket-actions'

// Refund a ticket from the guest list (LIVE-2548). The same host refund the public page's Sales list
// offers (refundTicketAction re-checks the caller and runs the money path server-side); it lives here
// as its own small button so the manage page does not pull in the whole checkout button file.
// Two taps on purpose: a refund sends real money back and cannot be undone.
export function RefundTicketFromRosterButton({
  ticketId,
  eventId,
  slug,
  amountLabel,
}: {
  ticketId: string
  eventId: string
  slug: string
  amountLabel: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = () =>
    start(async () => {
      setError(null)
      const r = await refundTicketAction(ticketId, eventId, slug)
      if (isError(r)) {
        setError(r.error)
        return
      }
      setAsking(false)
      router.refresh()
    })

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      {asking ? (
        <>
          <Button size="sm" variant="danger" onClick={run} disabled={pending}>
            {pending ? 'Refunding…' : `Refund ${amountLabel}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
            Keep
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAsking(true)} aria-label="Refund ticket">
          <RotateCcw className="h-3.5 w-3.5" />
          Refund
        </Button>
      )}
      {error && (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </span>
  )
}
