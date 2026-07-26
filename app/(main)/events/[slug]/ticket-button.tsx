'use client'

import { useState, useTransition } from 'react'
import { Ticket, Loader2, Lock, Check } from 'lucide-react'
import { startTicket, refundTicketAction } from './ticket-actions'
import { isError } from '@/lib/action-result'
import { ticketRowToPrice, type Price } from '@/lib/commerce/types'
import { PriceInput, type PriceSelection } from '@/components/commerce/price-input'

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
  /** ADR-823: restricted to active members of the hosting Space's membership program. */
  spaceMembersOnly: boolean
  /** The specific membership tier that unlocks this ticket; null = any active membership. */
  spaceTierId: string | null
  /** What the unlocking membership costs (e.g. "$44/mo") — shown as the price to NON-members so
   *  the row communicates the real cost of access; members see the ticket's own price. */
  membershipPriceLabel: string | null
}

const dollars = (cents: number | null | undefined) =>
  cents != null ? `$${(cents / 100).toFixed(2)}` : ''

function isBuyerChosen(mode: TicketTierView['pricingMode']) {
  return mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'
}

/** Map a tier's legacy pricing columns onto the unified buyer Price (Pricing Options P2), so the shared
 *  PriceInput drives the buyer-chosen amount. */
function tierToPrice(t: TicketTierView): Price {
  return ticketRowToPrice({
    pricing_mode: t.pricingMode,
    price_cents: t.priceCents,
    min_cents: t.minCents,
    suggested_cents: t.suggestedCents,
  })
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
  membershipSpace,
  viewerIsSpaceMember,
  viewerSpaceTierId,
  eventSlug,
  previewMode,
}: {
  eventId: string
  /** Used only for the implicit flat-price (no-tier) case. */
  priceLabel: string
  /** The event's ticket tiers; empty = implicit flat-price fixed tier. */
  tiers?: TicketTierView[]
  /** The hosting Space (ADR-823) — names the members-only chip + the join pointer. */
  membershipSpace?: { name: string; slug: string } | null
  /** Does the viewer hold an active membership in the hosting Space? */
  viewerIsSpaceMember?: boolean
  /** The viewer's membership tier id in the hosting Space (tier-specific gates compare on it). */
  viewerSpaceTierId?: string | null
  /** This event's slug — the join pointer carries it as return_to so joining loops back here. */
  eventSlug?: string
  /** Manager-only payments preview: render the full buyer UI with checkout disabled (payouts not
   *  connected yet). The page gates who sees this; the server would refuse a checkout anyway. */
  previewMode?: boolean
}) {
  const hasTiers = !!tiers && tiers.length > 0
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Does the viewer's membership unlock a gated tier (ADR-823)? Tier-specific gates need THE
  // named membership tier; a plain members gate takes any active membership.
  const unlocked = (t: TicketTierView) =>
    !!viewerIsSpaceMember && (t.spaceTierId == null || t.spaceTierId === viewerSpaceTierId)
  // Selected tier id (tiered events) and the per-tier buyer amount (dollars string). A MEMBER's
  // included ticket preselects — a member landing on their own event should not find the paid
  // Day pass highlighted over the ticket their membership already covers.
  const [selectedId, setSelectedId] = useState<string | null>(
    hasTiers
      ? (tiers!.find((t) => !t.soldOut && t.spaceMembersOnly && unlocked(t))?.id ??
          tiers!.find((t) => !t.soldOut)?.id ??
          tiers![0].id)
      : null,
  )
  const selected = hasTiers ? tiers!.find((t) => t.id === selectedId) ?? null : null
  // The buyer-chosen amount for a pwyc / sliding_scale / donation tier, surfaced by the shared
  // PriceInput (which pre-fills the suggested anchor and enforces the floor). null for a fixed / free tier.
  const [selection, setSelection] = useState<PriceSelection | null>(null)

  function selectTier(t: TicketTierView) {
    setSelectedId(t.id)
    setError(null)
    setSelection(null)
  }

  function go() {
    setError(null)
    const tier = selected
    // Client-side floor hint (the server re-enforces it authoritatively).
    let amountCents: number | undefined
    if (tier && isBuyerChosen(tier.pricingMode)) {
      if (!selection || !selection.valid || selection.amountCents == null) {
        setError(selection?.error ?? 'Enter an amount.')
        return
      }
      amountCents = selection.amountCents
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
          disabled={isPending || previewMode}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          Get ticket · {priceLabel}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  // ── Tiered selector ──
  const buyerChosen = selected ? isBuyerChosen(selected.pricingMode) : false
  const ctaDisabled = isPending || !selected || selected.soldOut || previewMode

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
                  {t.spaceMembersOnly &&
                    (unlocked(t) ? (
                      // Member: their membership covers this ticket — the warm "Included" tag.
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-medium text-primary-strong">
                        <Check className="h-2.5 w-2.5" />
                        Included
                      </span>
                    ) : (
                      // Non-member / signed out: this row IS the membership offer.
                      <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
                        <Lock className="h-2.5 w-2.5" />
                        Membership
                      </span>
                    ))}
                </p>
                {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
                {t.spotsLeft != null && !t.soldOut && (
                  <p className="mt-0.5 text-xs text-subtle">{t.spotsLeft} left</p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-text">
                {t.soldOut ? (
                  <span className="text-subtle">Sold out</span>
                ) : t.spaceMembersOnly && !unlocked(t) && t.membershipPriceLabel ? (
                  // Non-member (or signed out) on a members ticket: the price of ACCESS is the
                  // membership, so show that instead of a misleading bare "Free".
                  t.membershipPriceLabel
                ) : t.spaceMembersOnly && unlocked(t) && t.pricingMode === 'free' ? (
                  // A member's free members ticket costs them nothing more: it's Included.
                  'Included'
                ) : (
                  modeLabel(t)
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Members-included ticket the viewer's membership doesn't unlock (ADR-823): an honest lock
          with a join pointer, instead of a surprise refusal at checkout. The link carries return_to
          so joining loops straight back to this event. Server gate stays authoritative. */}
      {selected && selected.spaceMembersOnly && !unlocked(selected) && membershipSpace && (
        <p className="rounded-lg bg-surface-elevated px-3 py-2 text-xs text-muted">
          This ticket is included with a {membershipSpace.name} membership.{' '}
          <a
            href={`/spaces/${membershipSpace.slug}${eventSlug ? `?return_to=${encodeURIComponent(`/events/${eventSlug}`)}` : ''}`}
            className="font-semibold text-text underline underline-offset-2"
          >
            Join on their page
          </a>{' '}
          and it brings you back here.
        </p>
      )}

      {/* Buyer-chosen amount for pwyc / sliding_scale / donation tiers (Pricing Options P2): the shared
          PriceInput pre-fills the suggested anchor and enforces the floor. Keyed by tier so it re-seeds. */}
      {selected && buyerChosen && !selected.soldOut && (
        <PriceInput
          key={selected.id}
          price={tierToPrice(selected)}
          disabled={isPending}
          idPrefix={`tier-${selected.id}`}
          onChange={setSelection}
        />
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
