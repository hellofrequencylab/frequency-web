'use client'

import { useState, useTransition } from 'react'
import { Check, Stamp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { claimLoyaltyReward } from './loyalty-actions'

// A member's loyalty stamps at a partner (LIVE-710): one stamp per visit (a plaque tap), and once it
// is full, a Claim button the member taps at the counter with staff watching. The claimed state
// names the time, so staff can see it was claimed just now and hand the reward over.
export function LoyaltyStamps({
  offerId,
  title,
  visits,
  required,
}: {
  offerId: string
  title: string
  visits: number
  required: number
}) {
  const [claimedAt, setClaimedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const shown = claimedAt ? required : visits
  const earned = shown >= required

  function claim() {
    setError(null)
    startTransition(async () => {
      const r = await claimLoyaltyReward(offerId)
      if (isError(r)) setError(r.error)
      else setClaimedAt(r.data.claimedAt)
    })
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm font-semibold text-text">{title}</p>
        <span className="text-meta text-muted">
          {shown} of {required} visits
        </span>
      </div>
      <ol aria-label={`${shown} of ${required} visits`} className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: required }, (_, i) => (
          <li
            key={i}
            className={`flex h-7 w-7 items-center justify-center rounded-pill border ${
              i < shown ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border text-subtle'
            }`}
          >
            <Stamp className="h-3.5 w-3.5" aria-hidden />
          </li>
        ))}
      </ol>
      {claimedAt ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-body-sm font-semibold text-success">
          <Check className="h-4 w-4" aria-hidden /> Claimed at{' '}
          {new Date(claimedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Show this to staff.
        </p>
      ) : earned ? (
        <div className="mt-3 space-y-1.5">
          <Button type="button" size="sm" onClick={claim} disabled={isPending}>
            Claim it at the counter
          </Button>
          <p className="text-meta text-subtle">Tap with staff watching. Your card starts again after.</p>
        </div>
      ) : (
        <p className="mt-3 text-meta text-muted">Tap their plaque each visit to collect a stamp.</p>
      )}
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
    </div>
  )
}
