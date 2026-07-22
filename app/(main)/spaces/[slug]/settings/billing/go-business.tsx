'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Lock, Minus, Plus } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startSpaceLoadoutCheckout } from './actions'

// GO BUSINESS CTA (client · ADR-552). The single upgrade action on the billing surface: a free Space
// goes Business (the one paid tier; paid is a usage state within Business, not a separate plan name). It
// wires to startSpaceLoadoutCheckout, which is DOUBLE-GATED server-side (billingLive AND the per-plan
// switch), so while billing is OFF this renders a tasteful disabled "Available soon" preview and nothing
// charges. No em dashes (CONTENT-VOICE §10).

/** Hard ceiling on extra operator seats bought in one go (a sane picker bound, not a plan limit). */
const MAX_EXTRA_SEATS = 25

/** Whole-dollar money label (no cents when even). Client-side, so no project money lib. */
function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

export function GoBusinessCta({
  slug,
  sellable,
  trialDays,
  seatsSellable = false,
  seatMonthlyCents = 0,
}: {
  slug: string
  /** Whether the Business checkout is live (billingLive AND the per-plan switch). False while OFF. */
  sellable: boolean
  trialDays: number
  /** Whether operator SEATS can be bought (the seat is activated + priced). Hides the picker when false. */
  seatsSellable?: boolean
  /** The resolved per-seat monthly price in cents, so the picker can show N x $X = $Y/mo. */
  seatMonthlyCents?: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [extraSeats, setExtraSeats] = useState(0)
  const [pending, start] = useTransition()

  function goBusiness() {
    if (!sellable) return
    setError(null)
    start(async () => {
      // seatQuantity is the LICENSED count (the owner's own seat is the free base, so the picker adds
      // EXTRA operators). Only sent when seats are sellable; otherwise the seat item stays inert.
      const seatQuantity = seatsSellable && extraSeats > 0 ? extraSeats : undefined
      const res = await startSpaceLoadoutCheckout(slug, { plan: 'business', interval: 'month', seatQuantity })
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
          {/* Operator-seat picker (A4/A5). Only shown when seats are actually sellable (activated + priced);
              your own seat is free, so this buys EXTRA operators. Hidden until seats go live. */}
          {sellable && seatsSellable && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs font-semibold text-text">Extra operator seats</span>
              <div className="inline-flex items-center gap-1 rounded-lg border border-border">
                <button
                  type="button"
                  aria-label="Remove a seat"
                  onClick={() => setExtraSeats((n) => Math.max(0, n - 1))}
                  disabled={pending || extraSeats <= 0}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-text" aria-live="polite">
                  {extraSeats}
                </span>
                <button
                  type="button"
                  aria-label="Add a seat"
                  onClick={() => setExtraSeats((n) => Math.min(MAX_EXTRA_SEATS, n + 1))}
                  disabled={pending || extraSeats >= MAX_EXTRA_SEATS}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <span className="text-2xs text-subtle">Your own seat is included.</span>
            </div>
          )}
          {/* What the chosen seats cost, so the count is never priceless. Prorated on the first invoice. */}
          {sellable && seatsSellable && seatMonthlyCents > 0 && extraSeats > 0 && (
            <p className="mt-2 text-xs font-medium text-text">
              {extraSeats} {extraSeats === 1 ? 'seat' : 'seats'} x {usd(seatMonthlyCents)} ={' '}
              {usd(seatMonthlyCents * extraSeats)}/mo, prorated on your first invoice.
            </p>
          )}
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
