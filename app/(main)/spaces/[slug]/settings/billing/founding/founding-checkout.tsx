'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Lock, MapPin, Percent, Store } from 'lucide-react'
import { startFoundingBusinessCheckout } from './actions'

// FOUNDING BUSINESS CHECKOUT (client · ADR-804). The live buy surface for a Space to lock the founding
// Business rate: a Monthly / Annual toggle, the locked price + the bought-down take-rate, the city the
// spot counts against, and one buy button. DOUBLE-GATED server-side (owner authz + billingLive + the
// double-subscribe guard + the per-city cap inside startFoundingBusinessCheckout), so while billing is
// OFF this renders a tasteful disabled "Available soon" preview and nothing charges. No em dashes
// (CONTENT-VOICE §10).

type Period = 'monthly' | 'annual'

function usd(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars.toLocaleString('en-US')}` : `$${dollars.toFixed(2)}`
}

/** Map the seam's non-open gate state to a member-facing line (the button path; the page renders the
 *  full states, this only covers a race where the state flips between render and click). */
const STATE_MESSAGE: Record<'not_open' | 'already_active' | 'sold_out', string> = {
  not_open: 'Founding checkout is not open yet.',
  already_active: 'This space already has an active plan.',
  sold_out: 'Every founding spot in this city is taken.',
}

export function FoundingCheckout({
  slug,
  monthlyCents,
  annualCents,
  annualSavingsCents,
  takeBps,
  cityCap,
  spotsRemaining,
  defaultCity,
  sellable,
}: {
  slug: string
  monthlyCents: number
  annualCents: number
  annualSavingsCents: number
  takeBps: number
  cityCap: number
  spotsRemaining: number
  defaultCity: string
  /** Whether the checkout is live (billingLive AND spots remain AND not already paying). False while
   *  billing is OFF: the button renders as a disabled "Available soon" preview and nothing charges. */
  sellable: boolean
}) {
  const [period, setPeriod] = useState<Period>('annual')
  const [city, setCity] = useState(defaultCity)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const takePct = (takeBps / 100).toString()
  const price = period === 'annual' ? annualCents : monthlyCents
  const unit = period === 'annual' ? 'a year' : 'a month'

  function buy() {
    if (!sellable) return
    setError(null)
    if (!city.trim()) {
      setError('Enter the city your business operates in.')
      return
    }
    start(async () => {
      const res = await startFoundingBusinessCheckout(slug, { period, city: city.trim() })
      if (res.ok) {
        window.location.href = res.url
        return
      }
      setError('error' in res ? res.error : STATE_MESSAGE[res.state])
    })
  }

  return (
    <div className="space-y-6">
      {/* The period toggle. */}
      <div
        role="radiogroup"
        aria-label="Billing period"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-canvas p-1"
      >
        {(['monthly', 'annual'] as const).map((p) => {
          const active = period === p
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              {p === 'monthly' ? 'Monthly' : 'Annual'}
              {p === 'annual' && annualSavingsCents > 0 && (
                <span className="ml-1.5 text-2xs font-semibold text-primary-strong">two months free</span>
              )}
            </button>
          )
        })}
      </div>

      {/* The price + what it locks. */}
      <div className="rounded-2xl border border-primary bg-surface p-6 shadow-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl leading-none text-text">{usd(price)}</span>
          <span className="text-sm font-medium text-muted">{unit}, locked for life</span>
        </div>
        {period === 'annual' && annualSavingsCents > 0 && (
          <p className="mt-1 text-sm text-primary-strong">You save {usd(annualSavingsCents)} a year.</p>
        )}

        <ul className="mt-5 space-y-3 text-sm text-muted">
          <li className="flex gap-3">
            <Percent className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span>
              A {takePct}% marketplace fee, the lowest on the platform, bought down from the standard 5 to
              8 percent. Grandfathered for life.
            </span>
          </li>
          <li className="flex gap-3">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span>The founding Business rate, locked. When the round closes, Business resets to standard pricing.</span>
          </li>
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span>
              {cityCap} founding spots per city.{' '}
              {spotsRemaining > 0
                ? `${spotsRemaining} left where your business operates.`
                : 'Enter your city to check spots.'}
            </span>
          </li>
        </ul>
      </div>

      {/* The city the founding spot counts against (spaces have no stored city). */}
      <div>
        <label htmlFor="founding-city" className="block text-sm font-semibold text-text">
          City your business operates in
        </label>
        <input
          id="founding-city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Austin"
          autoComplete="address-level2"
          className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-subtle focus:border-primary focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-subtle">
          Each city holds a limited founding cohort. Your spot counts against this city.
        </p>
      </div>

      {/* The buy / preview button. */}
      {sellable ? (
        <button
          type="button"
          onClick={buy}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {pending ? 'Redirecting' : `Lock the founding rate, ${usd(price)} ${unit}`}
        </button>
      ) : (
        <div
          aria-disabled
          className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3.5 text-xs font-semibold text-subtle"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden /> Available soon
        </div>
      )}

      <p className="text-center text-xs text-subtle leading-relaxed">
        Your founder rate and the bought-down fee lock in at checkout. A founding Business membership is a
        membership, not an investment. Cancel anytime.
      </p>

      {error && (
        <p className="text-center text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
