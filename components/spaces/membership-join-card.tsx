'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { joinTier } from '@/lib/spaces/memberships-actions'
import type { MembershipInterval, MembershipTier } from '@/lib/spaces/memberships'

// MEMBER JOIN CARD (client). One tier rendered as a kit card (name, price, interval, benefits) with
// a Join button that calls the joinTier server action. The server re-validates the tier + that the
// caller is not already a member, so this card is convenience, not the gate. On success it refreshes
// so the surface flips to the "you are a member" state.
//
// HONESTY (CONTENT-VOICE skeptic test): the price is labeled as what membership WILL cost; the
// button says "Join" (not "Pay" / "Subscribe") and the helper line says no payment is taken yet. No
// narrated feelings, no em/en dashes (CONTENT-VOICE §10).

/** Cents to a plain price label, e.g. 2500 -> "$25", 2550 -> "$25.50". Whole dollars drop the
 *  cents. USD only in v1 (a currency column is a later, additive expansion). */
export function formatPrice(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** A short per-interval suffix for the price label. */
export function intervalLabel(interval: MembershipInterval): string {
  if (interval === 'month') return 'per month'
  if (interval === 'year') return 'per year'
  return 'one time'
}

export function MembershipJoinCard({
  spaceId,
  tier,
}: {
  spaceId: string
  tier: MembershipTier
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function join() {
    if (!tier.id) return
    setError(null)
    const tierId = tier.id
    start(async () => {
      const result = await joinTier(spaceId, tierId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const free = tier.priceCents === 0

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h3 className="text-base font-bold leading-tight text-text">{tier.name}</h3>
      <p className="mt-1 text-sm text-muted">
        {free ? (
          'Free'
        ) : (
          <>
            <span className="font-semibold text-text">{formatPrice(tier.priceCents)}</span>{' '}
            {intervalLabel(tier.interval)}
          </>
        )}
      </p>

      {tier.description && (
        <p className="mt-3 text-sm leading-relaxed text-muted">{tier.description}</p>
      )}

      {tier.benefits.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {tier.benefits.map((benefit, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-text">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        <Button type="button" onClick={join} disabled={pending} className="w-full justify-center">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Joining
            </>
          ) : (
            'Join'
          )}
        </Button>
        {!free && (
          <p className="mt-2 text-2xs text-subtle">
            No payment is taken yet. Paid billing comes later.
          </p>
        )}
        {error && (
          <p className="mt-2 text-2xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
