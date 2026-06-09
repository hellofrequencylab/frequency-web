'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Settings } from 'lucide-react'
import { startPayoutOnboarding, openPayoutDashboard } from './actions'
import { isError } from '@/lib/action-result'

/** Start (or resume) Stripe Express onboarding, then redirect to the hosted flow. */
export function StartPayoutButton({ label = 'Set up payouts' }: { label?: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await startPayoutOnboarding()
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {label}
        {!isPending && <ArrowRight className="h-4 w-4" />}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

/** Open the connected host's Express dashboard (manage bank, payouts, details). */
export function ManagePayoutButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await openPayoutDashboard()
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        Manage payouts
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
