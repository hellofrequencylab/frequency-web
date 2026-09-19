'use client'

// The BUY control for the Household bundle offer (ADR-370; wired by OWNER RULING, LIVE-062 batch 6,
// 2026-08-20 — startBundleCheckout was a deliberate mount waiting for this UI). Call the action,
// mount the card form on Frequency (LIVE-359), or send the browser to the Stripe Checkout URL when
// the on-page form cannot be offered. No co-seats are posted here — the buyer is seated by the
// webhook and offers the other seats afterwards from the seat manager (bundle-seat-controls.tsx),
// so nobody is ever charged for a seat they have not deliberately filled.
// GATED upstream: the section renders this only when bundleSellable() is true, and the action's own
// createBundleCheckout re-gates, so the button can never fire a broken checkout.

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, ChevronUp } from 'lucide-react'
import { startBundleCheckout, settleBundleCheckoutAction } from './actions'
import { isError } from '@/lib/action-result'
import { Button } from '@/components/ui/button'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'

/** Start the bundle checkout, monthly by default, with a quiet yearly alternative when the operator
 *  sells one. Both go through the same action; the period is the only difference. */
export function BuyBundleButtons({ hasAnnual }: { hasAnnual: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [session, setSession] = useState<{
    period: 'monthly' | 'annual'
    clientSecret: string
    sessionId: string | null
  } | null>(null)
  const [open, setOpen] = useState(false)
  const liveSession = session && session.period === period ? session : null

  function fallBackToHosted() {
    setSession(null)
    setError('Opening secure checkout…')
    const billed = period
    startTransition(async () => {
      const r = await startBundleCheckout(billed, [], { forceHosted: true })
      if (!isError(r) && r.data.url) window.location.href = r.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  function go(next: 'monthly' | 'annual') {
    setError(null)
    setPeriod(next)
    if (liveSession && liveSession.period === next) {
      setOpen(true)
      return
    }
    startTransition(async () => {
      warmStripeBrowser()
      const r = await startBundleCheckout(next)
      if (isError(r)) setError(r.error)
      else if (r.data.clientSecret) {
        setSession({
          period: next,
          clientSecret: r.data.clientSecret,
          sessionId: r.data.sessionId ?? null,
        })
        setOpen(true)
      } else if (r.data.url) {
        window.location.href = r.data.url
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={open && period === 'monthly' ? () => setOpen(false) : () => go('monthly')}
          onPointerEnter={warmStripeBrowser}
          onFocus={warmStripeBrowser}
          onTouchStart={warmStripeBrowser}
          disabled={pending}
          aria-expanded={open && period === 'monthly'}
          variant={open && period === 'monthly' ? 'secondary' : 'primary'}
        >
          {pending && period === 'monthly' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : open && period === 'monthly' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Get the bundle
        </Button>
        {hasAnnual && (
          <Button
            variant={open && period === 'annual' ? 'secondary' : 'secondary'}
            onClick={open && period === 'annual' ? () => setOpen(false) : () => go('annual')}
            onPointerEnter={warmStripeBrowser}
            onFocus={warmStripeBrowser}
            onTouchStart={warmStripeBrowser}
            disabled={pending}
            aria-expanded={open && period === 'annual'}
          >
            Pay for a year
          </Button>
        )}
      </div>
      {open && liveSession && (
        <CheckoutPanel
          clientSecret={liveSession.clientSecret}
          onFellBack={fallBackToHosted}
          onPaid={
            liveSession.sessionId
              ? () => settleBundleCheckoutAction(liveSession.sessionId as string)
              : undefined
          }
          onClose={() => window.location.reload()}
          doneTitle="The bundle is yours."
          doneBody="A receipt is on its way to your email. You can offer the other seats from here."
        />
      )}
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
