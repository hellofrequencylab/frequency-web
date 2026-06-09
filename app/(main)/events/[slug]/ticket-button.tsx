'use client'

import { useState, useTransition } from 'react'
import { Ticket, Loader2 } from 'lucide-react'
import { startTicket, refundTicketAction } from './ticket-actions'
import { isError } from '@/lib/action-result'

export type TicketTierView = {
  id: string
  name: string
  description: string | null
  pricingMode: 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
  priceCents: number | null
  minCents: number | null
  suggestedCents: number | null
  /** Remaining inventory; null = unlimited. */
  spotsLeft: number | null
  soldOut: boolean
  memberOnly: boolean
}

const dollars = (cents: number | null | undefined) =>
  cents != null ? `$${(cents / 100).toFixed(2)}` : ''

function isBuyerChosen(mode: TicketTierView['pricingMode']) {
  return mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'
}

function modeLabel(t: TicketTierView): string {
  switch (t.pricingMode) {
    case 'free':
      return 'Free'
    case 'fixed':
      return dollars(t.priceCents)
    case 'pwyc':
      return 'Pay what you can'
    case 'sliding_scale':
      return 'Sliding scale'
    case 'donation':
      return 'Donation'
  }
}

// Ticket selector on a paid event (EVENTS-SYSTEM §2.2). When the event has tiers we
// render a chooser; for pay-what-you-can / sliding-scale / donation tiers an amount
// input prefilled with the suggested value, floored at the tier minimum. A single
// implicit fixed tier (event flat price, no tier rows) renders the simple button.
export function TicketButton({
  eventId,
  priceLabel,
  tiers,
}: {
  eventId: string
  /** Used only for the implicit flat-price (no-tier) case. */
  priceLabel: string
  /** The event's ticket tiers; empty = implicit flat-price fixed tier. */
  tiers?: TicketTierView[]
}) {
  const hasTiers = !!tiers && tiers.length > 0
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Selected tier id (tiered events) and the per-tier buyer amount (dollars string).
  const [selectedId, setSelectedId] = useState<string | null>(
    hasTiers ? (tiers!.find((t) => !t.soldOut)?.id ?? tiers![0].id) : null,
  )
  const selected = hasTiers ? tiers!.find((t) => t.id === selectedId) ?? null : null
  const [amount, setAmount] = useState<string>(
    selected && isBuyerChosen(selected.pricingMode)
      ? ((selected.suggestedCents ?? selected.minCents ?? 0) / 100).toFixed(2)
      : '',
  )

  function selectTier(t: TicketTierView) {
    setSelectedId(t.id)
    setError(null)
    setAmount(
      isBuyerChosen(t.pricingMode)
        ? ((t.suggestedCents ?? t.minCents ?? 0) / 100).toFixed(2)
        : '',
    )
  }

  function go() {
    setError(null)
    const tier = selected
    // Client-side floor hint (the server re-enforces it authoritatively).
    let amountCents: number | undefined
    if (tier && isBuyerChosen(tier.pricingMode)) {
      const n = Number(amount)
      if (!Number.isFinite(n) || n <= 0) {
        setError('Enter an amount.')
        return
      }
      amountCents = Math.round(n * 100)
      const floor = tier.minCents ?? 0
      if (amountCents < floor) {
        setError(`Minimum is ${dollars(floor)}.`)
        return
      }
    }
    startTransition(async () => {
      const r = await startTicket(eventId, {
        qty: 1,
        ticketTypeId: tier?.id ?? null,
        amountCents,
      })
      if (isError(r)) {
        setError(r.error)
      } else if (r.data.free) {
        // A free tier: nothing to charge. Refresh so the page reflects the claim.
        window.location.reload()
      } else if (r.data.url) {
        window.location.href = r.data.url
      }
    })
  }

  // ── Implicit flat-price (no tiers): the original simple button ──
  if (!hasTiers) {
    return (
      <div className="space-y-2">
        <button
          onClick={go}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          Get ticket — {priceLabel}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  // ── Tiered selector ──
  const buyerChosen = selected ? isBuyerChosen(selected.pricingMode) : false
  const ctaDisabled = isPending || !selected || selected.soldOut

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {tiers!.map((t) => {
          const active = t.id === selectedId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTier(t)}
              disabled={t.soldOut}
              aria-pressed={active}
              className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                active
                  ? 'border-primary bg-primary-bg'
                  : 'border-border bg-surface hover:border-border-strong'
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-text">
                  {t.name}
                  {t.memberOnly && (
                    <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                      Members
                    </span>
                  )}
                </p>
                {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
                {t.spotsLeft != null && !t.soldOut && (
                  <p className="mt-0.5 text-xs text-subtle">{t.spotsLeft} left</p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-text">
                {t.soldOut ? <span className="text-subtle">Sold out</span> : modeLabel(t)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Buyer-chosen amount for pwyc / sliding_scale / donation tiers. */}
      {selected && buyerChosen && !selected.soldOut && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            {selected.pricingMode === 'donation' ? 'Your contribution' : 'Choose your price'}
            {selected.minCents ? (
              <span className="font-normal text-subtle"> · min {dollars(selected.minCents)}</span>
            ) : null}
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-subtle">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={selected.minCents != null ? (selected.minCents / 100).toFixed(2) : '0'}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
              className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30"
            />
          </div>
          {selected.suggestedCents != null && (
            <p className="mt-1 text-xs text-subtle">Suggested: {dollars(selected.suggestedCents)}</p>
          )}
        </div>
      )}

      <button
        onClick={go}
        disabled={ctaDisabled}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
        {selected?.pricingMode === 'free' ? 'Claim ticket' : 'Get ticket'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

// Host-facing refund control for one sold ticket (EVENTS-SYSTEM §7). Confirms, then
// calls the authz-checked refund action. The Stripe refund reverses the transfer
// and returns the platform fee; the row flips to `refunded` and frees capacity.
export function RefundTicketButton({
  ticketId,
  eventId,
  slug,
  amountLabel,
}: {
  ticketId: string
  eventId: string
  slug: string
  amountLabel: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function refund() {
    if (!confirm(`Refund this ${amountLabel} ticket? The buyer is refunded in full and the spot is freed.`)) return
    setError(null)
    startTransition(async () => {
      const r = await refundTicketAction(ticketId, eventId, slug)
      if (isError(r)) setError(r.error)
      else setDone(true)
    })
  }

  if (done) return <span className="text-xs font-medium text-muted">Refunded</span>

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={refund}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-xs font-medium text-subtle underline underline-offset-2 hover:text-danger transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        Refund
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
