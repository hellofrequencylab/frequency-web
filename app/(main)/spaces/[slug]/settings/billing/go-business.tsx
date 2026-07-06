'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Lock } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout } from './actions'

// GO BUSINESS CTA (client · ADR-552). The single upgrade action on the billing surface: a free Space
// goes Business (the one paid tier; paid is a usage state within Business, not a separate plan name). It
// wires to startSpaceLoadoutCheckout, which is DOUBLE-GATED server-side (billingLive AND the per-plan
// switch), so while billing is OFF this renders a tasteful disabled "Available soon" preview and nothing
// charges. No em dashes (CONTENT-VOICE §10).

export function GoBusinessCta({
  slug,
  sellable,
  trialDays,
}: {
  slug: string
  /** Whether the Business checkout is live (billingLive AND the per-plan switch). False while OFF. */
  sellable: boolean
  trialDays: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function goBusiness() {
    if (!sellable) return
    setError(null)
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval: 'month' })
      if (isError(res)) setError(res.error)
      else window.location.href = res.data.url
    })
  }

  return (
    <div className="rounded-2xl border border-primary bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">Go Business</h2>
          <p className="mt-1 text-sm text-muted">
            Keep everything you already have, with the caps lifted: multi-page and a custom domain, more
            seats, higher limits, and a lower take-rate. You stay Business and pay as you grow.
          </p>
          {/* Mission framing (PRICING-LADDER-PLAN §1a, voice-bound): plain, no guilt, no hype. */}
          <p className="mt-2 text-xs text-subtle">
            Going Business keeps Frequency independent and funds the small team that builds it.
          </p>
        </div>
        <div className="min-w-[12rem]">
          {sellable ? (
            <button
              type="button"
              onClick={goBusiness}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
              {pending ? 'Redirecting' : 'Go Business'}
            </button>
          ) : (
            <div
              aria-disabled
              className="flex w-full cursor-default items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-xs font-semibold text-subtle"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden /> Available soon
            </div>
          )}
          {trialDays > 0 && sellable && (
            <p className="mt-2 text-center text-2xs text-subtle">{trialDays}-day free trial. Cancel anytime.</p>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-3 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
