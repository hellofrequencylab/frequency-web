'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Heart, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout, settleSpaceLoadoutAction } from '@/app/(main)/spaces/[slug]/settings/billing/actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { trackClient } from '@/components/analytics/track-provider'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { BUSINESS_ADDS, KEEP_IT_FREE_LINE } from '@/lib/pricing/payments-copy'
import type { UpgradeOffer, UpgradeTarget } from '@/lib/pricing/business-offer'

// THE UPGRADE MOMENT (ADR-1709 §2, LIVE-758). One panel wherever a host on a free tier sets a price:
// an Event ticket, a membership tier, a booking deposit, a Journey, a shop listing. The payments gate
// (lib/pricing/payments-gate.ts, LIVE-753) refuses the write; this is what the host sees instead of a
// dead end.
//
//  - WHAT BUSINESS ADDS, as capabilities (lib/pricing/payments-copy.ts). The one figure on the panel,
//    the Business monthly price, is read from the catalog on the server and passed in. Never typed.
//  - START THE TRIAL IN PLACE, through the SAME Space plan checkout the billing page uses
//    (startSpaceLoadoutCheckout + CheckoutPanel), only for the Space's owner. A hosted fallback opens
//    in a NEW TAB, so the form behind the panel is never navigated away from.
//  - KEEP IT FREE, with equal weight: the same size and the same prominence as the trial, because it is
//    a real answer (tips stay open at no fee on every plan), not a consolation link.
//  - THE DRAFT IS NEVER LOST. The panel never submits, clears or navigates the host's form; it hands
//    back `onKeepFree` (the form flips its price to free) and `onUpgraded` (the form may save again).
//  - ONE GENERIC EVENT, `pricing.upgrade_moment`, with the surface and the choice only. Nothing about
//    the event, the practice, or anyone's wellbeing rides along.
//
// No em dashes (CONTENT-VOICE §10).

type UpgradeSurface = 'event' | 'membership' | 'booking' | 'journey' | 'product'

/** What a server price surface hands its form so the form can open this panel: who it speaks to and
 *  the Business offer. Built on the server (lib/pricing/business-offer.ts), present only when the host
 *  cannot take payments there. */
export interface UpgradeMomentSetup {
  target: UpgradeTarget
  offer: UpgradeOffer
}
type UpgradeAction = 'shown' | 'trial_started' | 'kept_free'

function logMoment(surface: UpgradeSurface, action: UpgradeAction, target: UpgradeTarget) {
  trackClient('pricing.upgrade_moment', { surface, action, scope: target.spaceSlug ? 'space' : 'personal' })
}

/** ONE class for both choices: the trial and "Keep it free" carry equal weight, by construction. */
const CHOICE =
  'flex min-h-11 items-center justify-center gap-2 rounded-control border border-primary bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60'

/** Whole-dollar money label from catalog cents. */
function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

export function UpgradeMoment({
  surface,
  target,
  offer,
  onKeepFree,
  onUpgraded,
}: {
  surface: UpgradeSurface
  target: UpgradeTarget
  offer: UpgradeOffer
  /** The host chose to keep it free: flip the price control back to free. The rest of the draft stays. */
  onKeepFree: () => void
  /** The trial started. The host's form may save again; nothing was cleared. */
  onUpgraded?: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [session, setSession] = useState<{ clientSecret: string; sessionId: string | null } | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current) return
    shown.current = true
    logMoment(surface, 'shown', target)
  }, [surface, target])

  const slug = target.spaceSlug
  const canStartTrial = !!slug && target.canUpgrade && offer.sellable

  /** A hosted session opens in a new tab, so the host's unsaved form stays exactly where it is. */
  function openHosted(url: string) {
    window.open(url, '_blank', 'noopener')
    setNote('Checkout opened in a new tab. Finish there, then save here. Your draft is still on this page.')
  }

  function fallBackToHosted() {
    if (!slug) return
    setSession(null)
    start(async () => {
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval: 'month', forceHosted: true })
      if (!isError(res) && res.data.url) openHosted(res.data.url)
      else setError('Could not start checkout. Please try again.')
    })
  }

  function startTrial() {
    if (!slug || !canStartTrial) return
    setError(null)
    logMoment(surface, 'trial_started', target)
    start(async () => {
      warmStripeBrowser()
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval: 'month' })
      if (isError(res)) setError(res.error)
      else if (res.data.clientSecret) setSession({ clientSecret: res.data.clientSecret, sessionId: res.data.sessionId ?? null })
      else if (res.data.url) openHosted(res.data.url)
    })
  }

  function keepFree() {
    logMoment(surface, 'kept_free', target)
    onKeepFree()
  }

  const trialLabel = offer.trialDays > 0 ? `Start the ${offer.trialDays}-day Business trial` : 'Go Business'
  const priceLine =
    offer.monthlyCents != null
      ? `${offer.trialDays > 0 ? 'After the trial, ' : ''}Business is ${usd(offer.monthlyCents)} a month. Cancel anytime.`
      : null

  return (
    <div className="rounded-card border border-border bg-surface p-4" role="region" aria-label="Taking payments">
      <p className="text-body-sm font-semibold text-text">Taking payments comes with Business</p>
      <ul className="mt-2 space-y-1">
        {BUSINESS_ADDS.map((line) => (
          <li key={line} className="flex items-start gap-2 text-2xs leading-relaxed text-muted">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {canStartTrial ? (
          <button
            type="button"
            onClick={startTrial}
            onPointerEnter={warmStripeBrowser}
            onFocus={warmStripeBrowser}
            disabled={pending}
            className={CHOICE}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
            {trialLabel}
          </button>
        ) : slug ? (
          <p className="flex min-h-11 items-center justify-center rounded-control border border-dashed border-border px-3 py-2 text-center text-2xs text-muted">
            {target.canUpgrade ? 'The Business trial opens soon.' : 'The owner of this Space can start its Business trial.'}
          </p>
        ) : (
          <Link
            href="/spaces/new"
            target="_blank"
            onClick={() => logMoment(surface, 'trial_started', target)}
            className={CHOICE}
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            Start a Space for it
          </Link>
        )}
        <button
          type="button"
          onClick={keepFree}
          className={CHOICE}
        >
          <Heart className="h-4 w-4" aria-hidden />
          Keep it free
        </button>
      </div>

      <p className="mt-2 text-2xs leading-relaxed text-muted">
        {KEEP_IT_FREE_LINE} {slug ? priceLine : 'A Space hosts free, and taking payments comes with its Business plan.'}
      </p>

      {session && slug && (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={session.clientSecret}
            onFellBack={fallBackToHosted}
            onPaid={session.sessionId ? () => settleSpaceLoadoutAction(session.sessionId as string) : undefined}
            onClose={() => {
              setSession(null)
              onUpgraded?.()
            }}
            doneTitle="Your Business trial is on."
            doneBody="Save again and your price goes live. Nothing you wrote was lost."
          />
        </div>
      )}
      {note && <p className="mt-2 text-2xs font-medium text-text" role="status">{note}</p>}
      {error && (
        <p className="mt-2 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
