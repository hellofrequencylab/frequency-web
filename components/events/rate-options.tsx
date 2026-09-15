'use client'

import { Check, Lock } from 'lucide-react'

// THE RATE LIST, IN ONE PLACE.
//
// This markup was phase 1 of `rsvp-payment-flow.tsx` (ADR-826) and nothing else could use it, so
// the signed-out ticket door was about to redraw it. One list, two callers: the RSVP+payment flow
// and the guest ticket form. A guest never sees a membership row (they cannot hold a membership
// without an account), which is why `soldOut` and `description` are optional additions rather than
// a second component: the shape is the same, the offer differs.

export interface FlowRate {
  id: string
  name: string
  priceLabel: string
  /** 'general' pays per event (ticket); 'membership' joins the Space membership. */
  kind: 'general' | 'membership'
  /** The event_ticket_types id to buy for a general rate (null = the event's flat price). */
  ticketTypeId: string | null
  /** True when this rate costs the viewer nothing more (their membership covers it). */
  covered: boolean
  /** Tag under the name: 'member' (warm check) or 'membership' (green lock). */
  tag: 'member' | 'membership' | null
  /** Nothing left to sell. The row stays visible and unselectable rather than disappearing. */
  soldOut?: boolean
  /** ADR-1373: this rate's sales window hasn't opened yet, or has closed. Same treatment as
   *  soldOut (visible, unselectable) because the answer is the same: you cannot take this one now.
   *  `priceLabel` already carries the when-line, so the row says WHY without a second slot. */
  offSale?: boolean
  /** The tier's own line of explanation, when it has one. */
  description?: string | null
}

/** The rate rows. Selection lives with the caller, because what a selection MEANS differs:
 *  the flow opens a payment phase, the guest form re-seeds its amount field. */
export function RateOptions({
  rates,
  selectedId,
  onSelect,
}: {
  rates: FlowRate[]
  selectedId: string
  onSelect: (rate: FlowRate) => void
}) {
  return (
    <div className="space-y-2">
      {rates.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r)}
          disabled={r.soldOut || r.offSale}
          aria-pressed={r.id === selectedId}
          className={`flex w-full items-start justify-between gap-3 rounded-card border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
            r.id === selectedId
              ? 'border-primary bg-primary-bg/40'
              : 'border-border hover:border-border-strong'
          }`}
        >
          <div className="min-w-0">
            {/* Title stays ONE line; tags sit on their own row so a long name never wraps a chip. */}
            <p className="truncate text-body-sm font-semibold text-text">{r.name}</p>
            {r.tag && (
              <div className="mt-1">
                {r.tag === 'member' ? (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-1.5 py-0.5 text-2xs font-medium text-primary-strong">
                    <Check className="h-2.5 w-2.5" /> Member
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
                    <Lock className="h-2.5 w-2.5" /> Membership
                  </span>
                )}
              </div>
            )}
            {r.description && <p className="mt-0.5 text-meta text-muted">{r.description}</p>}
          </div>
          <span
            className={`shrink-0 text-body-sm font-semibold ${r.offSale ? 'text-subtle' : 'text-text'}`}
          >
            {r.soldOut ? <span className="text-subtle">Sold out</span> : r.priceLabel}
          </span>
        </button>
      ))}
    </div>
  )
}
