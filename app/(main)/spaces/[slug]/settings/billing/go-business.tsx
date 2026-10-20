'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Lock, ChevronUp } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout, settleSpaceLoadoutAction } from './actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import type { BillingInterval } from '@/lib/billing/pricing-keys'
import { BillingIntervalSwitch } from './interval-switch'

// GO BUSINESS CTA (client · ADR-552). The single upgrade action on the billing surface: a free Space
// goes Business (the one paid tier; paid is a usage state within Business, not a separate plan name). It
// wires to startSpaceLoadoutCheckout, which is DOUBLE-GATED server-side (billingLive AND the per-plan
// switch), so while billing is OFF this renders a tasteful disabled "Available soon" preview and nothing
// charges. The Monthly / Yearly switch (LIVE-990) picks the interval the checkout bills; it used to be
// hardcoded to 'month', so the yearly price /pricing advertises could not be bought here. Seats are
// included per tier (ADR-1810); the old $12 operator-seat picker is gone. No em dashes (CONTENT-VOICE §10).

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
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [pending, start] = useTransition()
  const [session, setSession] = useState<{
    interval: BillingInterval
    clientSecret: string
    sessionId: string | null
  } | null>(null)
  const [open, setOpen] = useState(false)
  const liveSession = session && session.interval === interval ? session : null

  function fallBackToHosted() {
    setSession(null)
    setError('Opening secure checkout…')
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval, forceHosted: true })
      if (!isError(res) && res.data.url) window.location.href = res.data.url
      else setError('Could not start checkout. Please try again.')
    })
  }

  function goBusiness() {
    if (!sellable) return
    setError(null)
    if (liveSession) {
      setOpen(true)
      return
    }
    start(async () => {
      warmStripeBrowser()
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval })
      if (isError(res)) setError(res.error)
      else if (res.data.clientSecret) {
        setSession({
          interval,
          clientSecret: res.data.clientSecret,
          sessionId: res.data.sessionId ?? null,
        })
        setOpen(true)
      } else if (res.data.url) {
        window.location.href = res.data.url
      }
    })
  }

  return (
    <div className="rounded-card border border-primary bg-surface p-5 lift-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-body font-bold text-text">Go Business</h2>
          <p className="mt-1 text-body-sm text-muted">
            Go Business to start charging: paid tickets, memberships, donations, your shop and booking
            deposits. Everything you already have stays, with higher limits, your own website and two
            seats included. You keep 100% of what you bring in, and the network fee applies only to a customer
            the network introduces, once.
          </p>
          {/* Mission framing (CONTENT-VOICE §1a, voice-bound): plain, no guilt, no hype. */}
          <p className="mt-2 text-meta text-muted">
            Going Business keeps Frequency independent and funds the small team that builds it.
          </p>
        </div>
        <div className="min-w-[12rem]">
          {sellable && (
            <div className="mb-2">
              <BillingIntervalSwitch value={interval} onChange={setInterval} disabled={pending} />
            </div>
          )}
          {sellable ? (
            <button
              type="button"
              onClick={open ? () => setOpen(false) : goBusiness}
              onPointerEnter={warmStripeBrowser}
              onFocus={warmStripeBrowser}
              onTouchStart={warmStripeBrowser}
              disabled={pending}
              aria-expanded={open}
              className="flex w-full items-center justify-center gap-2 rounded-control bg-primary px-4 py-3 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : open ? (
                <ChevronUp className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden />
              )}
              {pending ? 'Opening checkout' : 'Go Business'}
            </button>
          ) : (
            <div
              aria-disabled
              className="flex w-full cursor-default items-center justify-center gap-2 rounded-card border border-dashed border-border px-4 py-3 text-meta font-semibold text-subtle"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden /> Available soon
            </div>
          )}
          {trialDays > 0 && sellable && (
            <p className="mt-2 text-center text-2xs text-muted">{trialDays}-day free trial. Cancel anytime.</p>
          )}
        </div>
      </div>
      {open && liveSession && (
        <div className="mt-4">
          <CheckoutPanel
            clientSecret={liveSession.clientSecret}
            onFellBack={fallBackToHosted}
            onPaid={
              liveSession.sessionId
                ? () => settleSpaceLoadoutAction(liveSession.sessionId as string)
                : undefined
            }
            onClose={() => window.location.reload()}
            doneTitle="You are on Business."
            doneBody="A receipt is on its way to your email."
          />
        </div>
      )}
      {error && (
        <p className="mt-3 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
