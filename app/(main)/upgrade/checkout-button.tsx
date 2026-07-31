'use client'

import { useState, useTransition } from 'react'
import { Zap, Loader2 } from 'lucide-react'
import { startMembershipCheckout } from './actions'
import { isError } from '@/lib/action-result'
import { formatCents } from '@/lib/pricing/display'

// CREW IS PAY WHAT YOU WANT. A member picks any recurring monthly amount at or above the operator's
// floor and every amount buys IDENTICAL access. This is the picker plus the checkout hand-off.
//
// 🔴 WHY THIS EXISTS AT ALL. `createMembershipCheckout` has accepted a chosen `amountCents` since the
// membership rework, and the action never passed one, so every member fell through to a fixed $9
// catalog price. The whole PWYW system was built and sat behind a hardcoded number. The presets and
// the open field are the missing half.
//
// CHOICE ARCHITECTURE, not a dark pattern. A bare open field anchors people at the floor, so the
// operator's presets are offered and the suggested amount is PRE-SELECTED. Nothing is hidden: the
// floor is stated, the open field accepts any amount from the floor up, and no amount buys more
// access than any other. That last fact is said out loud on the surface rather than left implied,
// because a picker that looks like a tier ladder would be exactly the wrong read.
export function CheckoutButton({
  minCents,
  suggestedCents,
  presetCents,
}: {
  minCents: number
  suggestedCents: number
  presetCents: number[]
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Pre-select the suggested amount, falling back to the floor if an operator has set them equal.
  const [amount, setAmount] = useState<number>(Math.max(suggestedCents, minCents))
  const [custom, setCustom] = useState('')

  // The open field wins whenever it holds a usable number, so typing always beats the last chip.
  const typed = Math.round(parseFloat(custom.replace(/[^0-9.]/g, '')) * 100)
  const chosen = Number.isFinite(typed) && typed > 0 ? typed : amount
  const belowFloor = chosen < minCents

  function go() {
    setError(null)
    if (belowFloor) {
      setError(`Choose ${formatCents(minCents)} a month or more.`)
      return
    }
    startTransition(async () => {
      // The server re-validates against the operator floor. This check is for the member, not a gate.
      const r = await startMembershipCheckout(chosen)
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  const presets = presetCents.filter((c) => c >= minCents)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-text">Pick what you pay each month</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Anything from {formatCents(minCents)}. Every amount buys exactly the same Crew, so pay what it
          is worth to you.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Monthly amount">
        {presets.map((cents) => {
          const active = !custom && cents === amount
          return (
            <button
              type="button"
              key={cents}
              onClick={() => {
                setAmount(cents)
                setCustom('')
                setError(null)
              }}
              disabled={isPending}
              className={`rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition-colors ${
                active
                  ? 'border-primary bg-primary-bg text-primary-strong ring-2 ring-primary/30'
                  : 'border-border bg-surface text-text hover:border-border-strong'
              } disabled:opacity-60`}
            >
              {formatCents(cents)}
              {cents === suggestedCents && (
                <span className="mt-0.5 block text-3xs font-medium uppercase tracking-wider text-muted">
                  Suggested
                </span>
              )}
            </button>
          )
        })}
      </div>

      <label className="block">
        <span className="sr-only">Another amount, in dollars per month</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={minCents / 100}
            step="0.01"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
            placeholder="Another amount"
            disabled={isPending}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-7 pr-3 text-sm text-text placeholder:text-subtle disabled:opacity-60"
          />
        </div>
      </label>

      <button
        onClick={go}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {isPending ? 'Redirecting to checkout…' : `Join the Crew at ${formatCents(chosen)} a month`}
      </button>

      {chosen >= suggestedCents && !belowFloor && (
        <p className="text-center text-xs text-muted">
          At {formatCents(suggestedCents)} or more you also wear the Supporter badge.
        </p>
      )}
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  )
}
