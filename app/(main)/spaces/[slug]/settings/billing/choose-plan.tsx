'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, ChevronUp } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout, settleSpaceLoadoutAction } from './actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'

// CHOOSE PLAN BUTTON (client · ADR-811). The inline upgrade action for a ladder rung the checkout can
// sell self-serve, which today is Collective alone: Independent came off the self-serve path when the
// owner made it a hand-sold tier (LIVE-227), so the prop type names the one plan this button offers and
// a second one cannot be added without a decision. It wires to startSpaceLoadoutCheckout, which is
// DOUBLE-GATED server-side (billingLive AND the per-plan switch), so the parent only renders this when
// the plan is sellable. Business keeps its own richer CTA (GoBusinessCta) with the seat picker; this is
// the plain one-click choose for the flat higher rung. No em dashes (CONTENT-VOICE §10).

export function ChoosePlanButton({
  slug,
  plan,
  label,
}: {
  slug: string
  /** The loadout plan to buy. After LIVE-228 the self-serve rung is Business. */
  plan: 'business'
  /** The button label, e.g. "Choose Business". */
  label: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [session, setSession] = useState<{ clientSecret: string; sessionId: string | null } | null>(null)
  const [open, setOpen] = useState(false)

  function fallBackToHosted() {
    setSession(null)
    setError('Opening secure checkout…')
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, { plan, interval: 'month', forceHosted: true })
      if (!isError(res) && res.data.url) window.location.href = res.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  function choose() {
    setError(null)
    if (session) {
      setOpen(true)
      return
    }
    start(async () => {
      warmStripeBrowser()
      const res = await startSpaceLoadoutCheckout(slug, { plan, interval: 'month' })
      if (isError(res)) setError(res.error)
      else if (res.data.clientSecret) {
        setSession({ clientSecret: res.data.clientSecret, sessionId: res.data.sessionId ?? null })
        setOpen(true)
      } else if (res.data.url) {
        window.location.href = res.data.url
      }
    })
  }

  return (
    <div className={open && session ? 'w-full min-w-[18rem]' : 'shrink-0 self-center'}>
      <button
        type="button"
        onClick={open ? () => setOpen(false) : choose}
        onPointerEnter={warmStripeBrowser}
        onFocus={warmStripeBrowser}
        onTouchStart={warmStripeBrowser}
        disabled={pending}
        aria-expanded={open}
        className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-meta font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : open ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        )}
        {pending ? 'Opening checkout' : label}
      </button>
      {open && session && (
        <div className="mt-2">
          <CheckoutPanel
            clientSecret={session.clientSecret}
            onFellBack={fallBackToHosted}
            onPaid={session.sessionId ? () => settleSpaceLoadoutAction(session.sessionId as string) : undefined}
            onClose={() => window.location.reload()}
            doneTitle="You are on Collective."
            doneBody="A receipt is on its way to your email."
          />
        </div>
      )}
      {error && (
        <p className="mt-1 max-w-[12rem] text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
