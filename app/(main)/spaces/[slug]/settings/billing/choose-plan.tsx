'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout } from './actions'

// CHOOSE PLAN BUTTON (client · ADR-811). The inline upgrade action for a ladder rung the checkout can
// sell directly (Collective / Independent). It wires to startSpaceLoadoutCheckout, which is DOUBLE-GATED
// server-side (billingLive AND the per-plan switch), so the parent only renders this when the plan is
// sellable. Business keeps its own richer CTA (GoBusinessCta) with the seat picker; this is the plain
// one-click choose for the flat higher rungs. No em dashes (CONTENT-VOICE §10).

export function ChoosePlanButton({
  slug,
  plan,
  label,
}: {
  slug: string
  /** The loadout plan to buy. Business runs through its own CTA, so this is the higher flat rungs. */
  plan: 'collective' | 'independent'
  /** The button label, e.g. "Choose Collective". */
  label: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function choose() {
    setError(null)
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, { plan, interval: 'month' })
      if (isError(res)) setError(res.error)
      else window.location.href = res.data.url
    })
  }

  return (
    <div className="shrink-0 self-center">
      <button
        type="button"
        onClick={choose}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
        {pending ? 'Redirecting' : label}
      </button>
      {error && (
        <p className="mt-1 max-w-[12rem] text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
