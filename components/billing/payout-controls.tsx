'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Settings } from 'lucide-react'
// The two server actions stay in app/(main)/settings/billing/actions.ts on purpose. A component
// importing a 'use server' module out of app/ is the established shape here (30+ sites), and
// check-client-server-boundary stops graph traversal at a server action, so nothing server-side
// enters the browser bundle. Moving them to lib/ would pull two publicly-reachable action
// endpoints OUT of check-authz-guards, whose per-export scan covers app/** only - trading real
// coverage for tidiness. What moved is the BUTTONS, so a space surface can reach them at all.
import { startPayoutOnboarding, openPayoutDashboard } from '@/app/(main)/settings/billing/actions'
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
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {label}
        {!isPending && <ArrowRight className="h-4 w-4" />}
      </button>
      {error && <p className="text-body-sm text-danger">{error}</p>}
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
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-4 py-2.5 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        Manage payouts
      </button>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
