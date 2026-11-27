'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RefundableSaleKind } from '@/lib/commerce/space-refunds'
import { refundSpaceSaleAction } from './shop-actions'

// Refund a sale from the Orders tab (LIVE-2550): a shop order, a ticket or a donation. The action
// re-checks the caller (owner or Space admin) and pins the sale to this Space before money moves.
// Two taps on purpose: a refund sends real money back and cannot be undone.
export function RefundSaleButton({
  slug,
  kind,
  id,
  amountLabel,
}: {
  slug: string
  kind: RefundableSaleKind
  id: string
  amountLabel: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = () =>
    start(async () => {
      setError(null)
      const r = await refundSpaceSaleAction(slug, kind, id)
      if ('error' in r) {
        setError(r.error)
        return
      }
      setAsking(false)
      router.refresh()
    })

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {asking ? (
        <>
          <Button size="sm" variant="danger" onClick={run} disabled={pending}>
            {pending ? 'Refunding…' : `Refund ${amountLabel}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
            Keep
          </Button>
          <span className="text-meta text-muted">The full amount goes back to the buyer and comes out of your payout.</span>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
          <RotateCcw className="h-3.5 w-3.5" />
          Refund
        </Button>
      )}
      {error && (
        <span role="alert" className="text-meta text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
