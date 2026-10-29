'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowRight, Check, Heart, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startMembershipCheckout, settleMembershipCheckoutAction } from '@/app/(main)/upgrade/actions'
import CheckoutPanel from '@/components/billing/checkout-panel'
import { buttonClasses } from '@/components/ui/button'
import { trackClient } from '@/components/analytics/track-provider'
import { warmStripeBrowser } from '@/lib/billing/stripe-browser'
import { onTopPersonalRung, type SpotlightCapReached } from '@/lib/spotlight/caps'

// THE SPOTLIGHT CAP MOMENT (SPL-11, LIVE-1884). When a save is refused for the block cap, the in-rail Layout
// builder shows this instead of only a red line: what the member hit, what Crew adds, the contribute presets,
// and "Keep it as it is" as an equal choice. A sibling of components/pricing/upgrade-moment.tsx: same panel
// tokens, same one-class-for-both-choices rule.
//
//  - EVERY FIGURE IS READ ON THE SERVER (saveMemberGridLayout hands them in as `cap`). Nothing is typed here.
//  - CREW IS CONTRIBUTE WHAT YOU WANT (docs/NAMING.md): the presets and the floor are the catalog's, every
//    amount buys identical access, and the checkout is the existing one (startMembershipCheckout +
//    CheckoutPanel, docs/CHECKOUT.md). A hosted fallback opens in a NEW TAB so the draft stays on this page.
//  - KEEP IT AS IT IS has the same size and prominence as joining. It only dismisses; the saved page is
//    untouched and nothing is removed.
//  - A Crew member at the top cap is told the plain fact and offered no purchase.
//  - ONE GENERIC EVENT, `pricing.upgrade_moment`, with the surface and the choice only.
//
// No em dashes (CONTENT-VOICE §10). No countdown, no weekly promise.

type Action = 'shown' | 'checkout_started' | 'kept'

function logMoment(action: Action, crew: boolean) {
  trackClient('pricing.upgrade_moment', { surface: 'spotlight_blocks', action, scope: crew ? 'crew' : 'personal' })
}

/** Whole-dollar label from cents, with cents only when there are some. */
function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

/** ONE class for both choices, so they carry equal weight by construction. */
const CHOICE = buttonClasses('secondary', 'md', 'w-full')

/** A contribute preset: the chosen one carries the primary border, the rest the quiet one. */
const PRESET = 'min-h-11 rounded-control border px-3 py-2 text-body-sm font-semibold transition-colors'
const presetClass = (on: boolean) =>
  `${PRESET} ${on ? 'border-primary bg-primary-bg text-primary-strong' : 'border-border bg-surface text-text hover:bg-surface-elevated'}`

export function SpotlightCapPanel({ cap }: { cap: SpotlightCapReached }) {
  const crew = onTopPersonalRung(cap)
  const [amount, setAmount] = useState(() =>
    cap.presetCents.includes(cap.suggestedCents) ? cap.suggestedCents : (cap.presetCents[0] ?? 0),
  )
  const [kept, setKept] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [session, setSession] = useState<{ clientSecret: string; sessionId: string | null } | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current) return
    shown.current = true
    logMoment('shown', crew)
  }, [crew])

  if (kept) {
    return (
      <p className="rounded-control bg-surface-elevated px-3 py-2 text-meta font-medium text-text" role="status">
        Your Spotlight stays as it is. Take a block off whenever you want room for another.
      </p>
    )
  }

  const hasPresets = cap.presetCents.length > 0 && amount > 0

  /** A hosted session opens in a new tab, so the member's page stays exactly where it is. */
  function openHosted(url: string) {
    window.open(url, '_blank', 'noopener')
    setNote('Checkout opened in a new tab. Finish there, then come back. Your page is still here.')
  }

  function join() {
    if (!hasPresets) {
      window.open('/upgrade', '_blank', 'noopener')
      return
    }
    setError(null)
    logMoment('checkout_started', false)
    start(async () => {
      warmStripeBrowser()
      const res = await startMembershipCheckout(amount, 'monthly')
      if (isError(res)) setError(res.error)
      else if (res.data.clientSecret) setSession({ clientSecret: res.data.clientSecret, sessionId: res.data.sessionId ?? null })
      else if (res.data.url) openHosted(res.data.url)
    })
  }

  function fallBackToHosted() {
    setSession(null)
    start(async () => {
      const res = await startMembershipCheckout(amount, 'monthly', { forceHosted: true })
      if (!isError(res) && res.data.url) openHosted(res.data.url)
      else setError('Could not start checkout. Please try again.')
    })
  }

  function keep() {
    logMoment('kept', crew)
    setKept(true)
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4" role="region" aria-label="Spotlight blocks">
      <p className="text-body-sm font-semibold text-text">Your Spotlight is full at {cap.allowed} blocks</p>

      {crew ? (
        <p className="mt-1 text-meta leading-relaxed text-muted">
          That is the most a page holds today. Take a block off to make room for a new one.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            <li className="flex items-start gap-2 text-meta leading-relaxed text-muted">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              Crew adds room for {cap.crewAllowed} blocks.
            </li>
            <li className="flex items-start gap-2 text-meta leading-relaxed text-muted">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              Everything on your page stays exactly as it is.
            </li>
          </ul>

          {hasPresets && (
            <div className="mt-3">
              <p className="text-meta font-medium text-text" id="spl-cap-presets">
                Crew is contribute what you want, a month. Every amount gets the same access.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="spl-cap-presets">
                {cap.presetCents.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={amount === c}
                    aria-label={`${usd(c)} a month`}
                    onClick={() => setAmount(c)}
                    className={presetClass(amount === c)}
                  >
                    {usd(c)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2">
        {!crew && (
          <button type="button" onClick={join} onPointerEnter={warmStripeBrowser} onFocus={warmStripeBrowser} disabled={pending} className={CHOICE}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
            {hasPresets ? `Join Crew at ${usd(amount)} a month` : 'See Crew'}
          </button>
        )}
        <button type="button" onClick={keep} className={CHOICE}>
          <Heart className="h-4 w-4" aria-hidden />
          Keep it as it is
        </button>
      </div>

      {!crew && (
        <p className="mt-2 text-meta leading-relaxed text-muted">
          {cap.minCents > 0 ? `From ${usd(cap.minCents)} a month. ` : ''}Cancel anytime. Keeping it as it is costs nothing.
        </p>
      )}

      {session && (
        <div className="mt-3">
          <CheckoutPanel
            clientSecret={session.clientSecret}
            onFellBack={fallBackToHosted}
            onPaid={session.sessionId ? () => settleMembershipCheckoutAction(session.sessionId as string) : undefined}
            onClose={() => setSession(null)}
            doneTitle="Welcome to Crew."
            doneBody="Your page has room for more now. Add that block again and it will save."
          />
        </div>
      )}
      {note && (
        <p className="mt-2 text-meta font-medium text-text" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="mt-2 text-meta font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** The builder's one line for a save error: the calm panel for a block-cap refusal, the red line otherwise.
 *  The panel only shows when the server named the cap, so an older caller still gets the error string. */
export function SaveErrorOrCapPanel({ error, capReached }: { error: string | null; capReached: SpotlightCapReached | null | undefined }) {
  if (!error) return null
  if (capReached) return <SpotlightCapPanel cap={capReached} />
  return (
    <p className="rounded-control bg-danger-bg px-3 py-2 text-meta font-medium text-danger" role="alert">
      {error}
    </p>
  )
}
