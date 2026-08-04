'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, CreditCard, Loader2, Lock } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { startTicket } from '@/app/(main)/events/[slug]/ticket-actions'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import type { MembershipTier } from '@/lib/spaces/memberships'

// RSVP + PAYMENT FLOW (ADR-826, owner spec): the PROGRESSIVE join experience for an RSVP-mode
// priced event (MELD). Three phases, each revealed in turn:
//   1. RATE — pick between the general rate (Day pass) and the membership rate. A member's
//      included rate preselects; a non-member defaults to the general rate.
//   2. ANSWER — Going / Maybe / Can't go. Maybe records and lands the guest in the host's
//      follow-up funnel (the RSVP'd-without-buying bucket); Can't go just files.
//   3. PAYMENT — tapping Going with an unpaid rate slides the payment area open UNDER the
//      answer row: the general rate completes through secure checkout (or confirms a
//      pay-at-the-door RSVP while the host's payouts aren't connected); the membership rate
//      folds the join/checkout cards open. A covered viewer (member on their included rate)
//      goes straight to Going with no payment phase.

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
}

export function RsvpPaymentFlow({
  eventId,
  slug,
  rates,
  status,
  plusOnes,
  isFull,
  initialNote,
  membership,
  paymentsReady,
  signedIn,
  signInHref,
}: {
  eventId: string
  slug: string
  rates: FlowRate[]
  status: 'going' | 'maybe' | 'waitlist' | 'not_going' | null
  plusOnes: number
  isFull: boolean
  initialNote: string
  /** The membership join context (the unlocking tier cards) for the membership rate's fold. */
  membership: {
    spaceId: string
    spaceName: string
    tiers: MembershipTier[]
    includedEvent: { slug: string; title: string }
    billingOn: boolean
  } | null
  /** Checkout can actually charge (ticketing on + the payee's payouts ready). When false, a
   *  paid Going confirms as a pay-at-the-door RSVP — honest, and the host still gets the count. */
  paymentsReady: boolean
  signedIn: boolean
  signInHref: string
}) {
  const isGoing = status === 'going'
  const [selectedId, setSelectedId] = useState<string>(
    () => (rates.find((r) => r.covered) ?? rates[0])?.id ?? '',
  )
  const [payOpen, setPayOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = rates.find((r) => r.id === selectedId) ?? null

  // Phase 3 applies only when Going costs something: an unpaid general rate, or the membership
  // rate for a non-member. A covered rate records Going directly (no intercept).
  const needsPayment = !!selected && !selected.covered
  const showPayment = payOpen && needsPayment && !isGoing

  function selectRate(r: FlowRate) {
    setSelectedId(r.id)
    setError(null)
    if (r.covered) setPayOpen(false)
  }

  // Complete a GENERAL-rate Going: hold the spot (the RSVP is the reservation, first come
  // first served), then hand off to secure checkout when payments are live. An abandoned
  // checkout leaves the RSVP standing and the host's follow-up funnel picks it up.
  function payAndGo() {
    setError(null)
    startTransition(async () => {
      await setRsvpStatus(eventId, 'going', { slug })
      if (!paymentsReady || !selected || selected.kind !== 'general') return
      const r = await startTicket(eventId, {
        qty: 1,
        ticketTypeId: selected.ticketTypeId,
      })
      if (isError(r)) {
        setError(r.error)
      } else if (r.data.url) {
        window.location.href = r.data.url
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* Phase 1 — pick your rate. */}
      <div className="space-y-2">
        {rates.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => selectRate(r)}
            aria-pressed={r.id === selectedId}
            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              r.id === selectedId
                ? 'border-primary bg-primary-bg/40'
                : 'border-border hover:border-border-strong'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{r.name}</p>
              {r.tag && (
                <div className="mt-1">
                  {r.tag === 'member' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-1.5 py-0.5 text-2xs font-medium text-primary-strong">
                      <Check className="h-2.5 w-2.5" /> Member
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
                      <Lock className="h-2.5 w-2.5" /> Membership
                    </span>
                  )}
                </div>
              )}
            </div>
            <span className="shrink-0 text-sm font-semibold text-text">{r.priceLabel}</span>
          </button>
        ))}
      </div>

      {/* Phase 2 — your answer. A paid selection intercepts Going into the payment phase;
          Maybe funnels to follow-up; Can't go just files. */}
      {signedIn ? (
        <RsvpControls
          eventId={eventId}
          slug={slug}
          status={status}
          plusOnes={plusOnes}
          isFull={isFull}
          initialNote={initialNote}
          onGoingIntercept={needsPayment && !isGoing ? () => setPayOpen(true) : null}
        />
      ) : (
        <div className="space-y-2">
          <Link
            href={signInHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Sign in to RSVP
          </Link>
          <p className="text-xs text-muted">Sign in and you&rsquo;re two taps from the list.</p>
        </div>
      )}

      {/* Phase 3 — the payment area slides open under the answer. */}
      {showPayment && selected && (
        <div className="space-y-3 rounded-card border border-primary/40 bg-surface-elevated/40 p-4 motion-safe:animate-[slideUp_0.2s_ease-out]">
          {selected.kind === 'general' ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text">{selected.name}</p>
                <p className="text-sm font-semibold text-text">{selected.priceLabel}</p>
              </div>
              {paymentsReady ? (
                <>
                  <button
                    type="button"
                    onClick={payAndGo}
                    disabled={pending}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    Pay {selected.priceLabel} and complete your RSVP
                  </button>
                  <p className="text-2xs text-muted">
                    Your RSVP holds the spot; payment completes in secure checkout.
                  </p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={payAndGo}
                    disabled={pending}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirm RSVP
                  </button>
                  <p className="text-2xs text-muted">
                    Pay the {selected.priceLabel} at the door. Online payment opens once the host
                    connects payouts.
                  </p>
                </>
              )}
              {error && <p className="text-sm text-danger">{error}</p>}
            </>
          ) : membership ? (
            <>
              <div>
                <p className="text-sm font-bold text-text">Join {membership.spaceName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Membership includes your ticket to {membership.includedEvent.title}. Once you
                  join, tap Going and you&rsquo;re in.
                </p>
              </div>
              {membership.tiers.map((tier) => (
                <MembershipJoinCard
                  key={tier.id ?? tier.name}
                  spaceId={membership.spaceId}
                  tier={tier}
                  billingOn={membership.billingOn}
                  includedEvents={[membership.includedEvent]}
                />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
