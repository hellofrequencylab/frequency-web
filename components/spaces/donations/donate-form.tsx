'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { startSpaceDonationCheckout } from '@/lib/billing/donation-actions'
import { isError } from '@/lib/action-result'
import { formatPriceCents } from '@/lib/commerce/types'

// THE DONATE CHECKOUT CONTROL (LIVE-235). The member half of the fund: quick-pick chips from the
// owner's ask, a custom amount, and a button that opens Stripe Checkout.
//
// WHAT IT REPLACES. The Donate card used to render a DISPLAY-ONLY amount picker under a line
// admitting that pressing it took no payment, because there was no donation checkout at all. This
// control posts to the one server action (startSpaceDonationCheckout), which resolves the donor from
// the session and creates a Connect destination charge to the space owner.
//
// GIVING DOES NOT REQUIRE AN ACCOUNT, deliberately: a gift is the lowest-friction way a community
// pays a business, and a sign-in wall is the highest-friction thing that could be put in front of it.
// A signed-out gift simply classifies as self-sourced (0% fee) because there is no relationship to
// read either way.
//
// The floor is enforced SERVER-SIDE too (resolveDonationCents); this only saves a round trip.
// Copy: plain, no narrated feelings, no em dashes (CONTENT-VOICE §10).

/** The server's DONATION_MIN_CENTS, mirrored so the control can refuse before a round trip. The
 *  server is still the authority; a mismatch costs one rejected submit, never a wrong charge. */
const MIN_CENTS = 100

export function DonateForm({
  spaceId,
  suggestedAmountsCents,
  idPrefix,
}: {
  spaceId: string
  suggestedAmountsCents: number[]
  idPrefix: string
}) {
  const chips = suggestedAmountsCents.filter((c) => Number.isFinite(c) && c >= MIN_CENTS)
  const [selected, setSelected] = useState<number | null>(chips[0] ?? null)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // The custom field wins whenever it holds anything, so a donor who types over a chip gets what they
  // typed. An empty field falls back to the selected chip.
  const customCents = custom.trim() ? Math.round(Number(custom) * 100) : null
  const cents = customCents ?? selected

  function give() {
    setError(null)
    if (!cents || !Number.isFinite(cents) || cents < MIN_CENTS) {
      setError(`Minimum gift is ${formatPriceCents(MIN_CENTS)}.`)
      return
    }
    start(async () => {
      const result = await startSpaceDonationCheckout(spaceId, cents)
      if (isError(result)) {
        setError(result.error)
        return
      }
      window.location.href = result.data.url
    })
  }

  return (
    <div className="space-y-3">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested amounts">
          {chips.map((amount) => {
            const active = customCents == null && selected === amount
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelected(amount)
                  setCustom('')
                  setError(null)
                }}
                className={`rounded-control border px-4 py-2 text-body-sm font-semibold transition-colors ${
                  active
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-surface text-text hover:bg-surface-elevated'
                }`}
              >
                {formatPriceCents(amount)}
              </button>
            )
          })}
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-custom`} className="mb-1 block text-meta font-semibold text-text">
          Or enter an amount
        </label>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-body font-semibold text-muted">
            $
          </span>
          <input
            id={`${idPrefix}-custom`}
            type="number"
            inputMode="decimal"
            min={MIN_CENTS / 100}
            step="1"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
            placeholder="0.00"
            aria-label="Gift amount in dollars"
            className="w-32 rounded-control border border-border bg-surface px-3 py-2 text-body-sm text-text"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={give}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {cents && cents >= MIN_CENTS ? `Give ${formatPriceCents(cents)}` : 'Give'}
        {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
      </button>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
