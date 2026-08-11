'use client'

import { useState, useTransition } from 'react'
import { Zap, Loader2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { startMembershipCheckout } from './actions'
import { isError } from '@/lib/action-result'
import { Input } from '@/components/ui/field'

// THE CREW PAY-WHAT-YOU-WANT PICKER (ADR-908).
//
// 🔴 THE INVARIANT THIS COMPONENT EXISTS TO PROTECT: every amount buys IDENTICAL access. So there is
// no per-amount feature list, no "best value" badge, no tier names, and no label claiming a higher
// amount covers another member's seat (there is no comped Crew, so that would simply be false). The
// number decides what you contribute, never what you get.
//
// WHY PRESETS AND AN OPEN FIELD, not one or the other: a bare open field anchors people at the floor,
// which costs real ARPU; presets alone would not be pay-what-you-want. So the presets anchor, the
// open field keeps the promise honest, and any amount at or above the floor is payable.
//
// The floor is re-validated SERVER-SIDE in startMembershipCheckout. A floor enforced only here
// is not a floor. `maxCents` is a SOFT ceiling: crossing it asks for a confirmation (a very large
// recurring amount is more often a slip than a gift) but never refuses.
//
// Copy follows docs/CONTENT-VOICE.md: plain, no em dashes, no urgency, no narrating the reader's
// feelings, and nothing here counts down or manufactures scarcity.

/** Cents to a plain price label: "$4.99", and "$9" when the amount is whole dollars. */
function priceLabel(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

export function PwywPicker({
  presetCents,
  suggestedCents,
  minCents,
  maxCents,
  runningCostCents,
}: {
  presetCents: number[]
  suggestedCents: number
  minCents: number
  maxCents: number
  /** What a seat actually costs us to run, when the operator has set a real number. Omitted rather
   *  than guessed: a made-up figure here would break the honesty the whole tier rests on. */
  runningCostCents?: number | null
}) {
  // Open on the suggested amount. It is the anchor, and an unselected picker converts worse.
  const [amount, setAmount] = useState<number>(suggestedCents)
  const [custom, setCustom] = useState('')
  const [annual, setAnnual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const usingCustom = custom.trim() !== ''
  const customCents = usingCustom ? Math.round(Number(custom.replace(/[^0-9.]/g, '')) * 100) : NaN
  const chosen = usingCustom ? customCents : amount
  const valid = Number.isFinite(chosen) && chosen >= minCents

  function go() {
    setError(null)
    if (!valid) {
      setError(`Please choose ${priceLabel(minCents)} a month or more.`)
      return
    }
    // The soft ceiling: confirm rather than refuse, so a real gift is never blocked.
    if (chosen > maxCents) {
      const monthly = priceLabel(chosen)
      if (!window.confirm(`That is ${monthly} a month, every month. Is that what you meant?`)) return
    }
    startTransition(async () => {
      const r = await startMembershipCheckout(chosen, annual ? 'annual' : 'monthly')
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-body-sm font-semibold text-text">Pay what it is worth to you.</p>
        <p className="mt-1 text-body-sm text-muted">
          {runningCostCents
            ? `A seat costs us about ${priceLabel(runningCostCents)} a month to run. Anything above that goes into building the first Outpost.`
            : 'Everything Crew does is the same at every amount. Anything above the cost of running a seat goes into building the first Outpost.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {presetCents.map((c) => {
          const selected = !usingCustom && amount === c
          return (
            <button
              key={c}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setAmount(c)
                setCustom('')
                setError(null)
              }}
              className={`rounded-xl border px-3 py-3 text-body-sm font-semibold transition-colors ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text hover:border-primary/50'
              }`}
            >
              {priceLabel(c)}
            </button>
          )
        })}
      </div>

      <label className="block">
        <span className="text-meta font-medium text-muted">Another amount</span>
        <div className="mt-1 flex items-center gap-2 rounded-card border border-border px-3 py-2 focus-within:border-primary">
          <span className="text-body-sm text-muted">$</span>
          <Input
            variant="seamless"
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
            placeholder={(suggestedCents / 100).toString()}
            aria-label="Another amount per month, in dollars"
            className="w-full text-body-sm text-text"
          />
          <span className="text-meta text-muted">/mo</span>
        </div>
      </label>

      {/* Two months free is the house convention; the server computes the charge from the monthly
          pick so the number shown here can never disagree with the number billed. */}
      <Checkbox
        checked={annual}
        onChange={(e) => setAnnual(e.target.checked)}
        wrapperClassName="flex"
        label={
          <>
            Pay for a year and get two months free
            {valid ? <span className="font-medium text-text">{` (${priceLabel(chosen * 10)})`}</span> : null}
          </>
        }
      />

      <button
        onClick={go}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-body-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {isPending ? 'Redirecting to checkout…' : 'Join the Crew'}
      </button>

      <p className="text-center text-meta text-muted">
        Change what you give any time, or stop. No penalty either way.
      </p>
      {error && <p className="text-center text-body-sm text-danger">{error}</p>}
    </div>
  )
}
