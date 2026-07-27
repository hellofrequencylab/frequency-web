'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Lock } from 'lucide-react'
import { isError } from '@/lib/action-result'
import type { BillingPeriod } from '@/lib/billing/pricing-keys'
import { startFoundingBusinessCheckout } from './actions'

// FOUNDING BUSINESS CTA (client · ADR-599 / ADR-803). The buy seam for the per-city founding cohort.
//
// The city is a REAL input, not decoration: it places the founder in a cohort and is what the per-city
// cap counts, so the server re-resolves the offer with this exact value before it will create a
// session. Prefilled from any spot the Space already reserved.
//
// The action is gated server-side (billing live, not already paying, spots left in that city), so when
// the offer is not open this renders a disabled preview and nothing can charge. No em dashes.

export function FoundingCta({
  slug,
  open,
  blockedReason,
  defaultCity,
}: {
  slug: string
  /** Whether a real checkout can start (offer state === 'open'). */
  open: boolean
  /** Why it cannot, when it cannot — rendered instead of the button's helper line. */
  blockedReason?: string | null
  defaultCity: string
}) {
  const [city, setCity] = useState(defaultCity)
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function go() {
    if (!open) return
    const trimmed = city.trim()
    if (!trimmed) {
      setError('Enter the city your business operates in.')
      return
    }
    setError(null)
    start(async () => {
      const res = await startFoundingBusinessCheckout(slug, trimmed, period)
      if (isError(res)) {
        setError(res.error)
        return
      }
      window.location.href = res.data.url
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="founding-city" className="block text-sm font-semibold text-text">
          The city your business operates in
        </label>
        <input
          id="founding-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          disabled={!open || pending}
          aria-describedby="founding-city-help"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle disabled:opacity-60"
          placeholder="Portland"
        />
        <p id="founding-city-help" className="text-2xs text-subtle">
          Founding spots are counted per city.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold text-text">How you want to pay</legend>
        <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
          {(['monthly', 'annual'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              disabled={!open || pending}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                period === p ? 'bg-surface-elevated text-text' : 'text-muted hover:text-text'
              }`}
            >
              {p === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={go}
        disabled={!open || pending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-strong px-4 py-2 text-sm font-semibold text-on-primary transition-opacity disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : open ? <ArrowRight className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {open ? 'Take a founding spot' : 'Available soon'}
      </button>

      {error ? (
        <p role="alert" className="text-2xs text-danger">
          {error}
        </p>
      ) : blockedReason ? (
        <p className="text-2xs text-subtle">{blockedReason}</p>
      ) : null}
    </div>
  )
}
