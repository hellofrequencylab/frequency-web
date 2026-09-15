'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, CreditCard, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { startTicket } from '@/app/(main)/events/[slug]/ticket-actions'
import { GuestRsvpForm } from '@/components/events/guest-rsvp-form'
import { GuestTicketForm, type GuestTicketTier } from '@/components/events/guest-ticket-form'
import { RateOptions, type FlowRate } from '@/components/events/rate-options'
import { RsvpControls } from '@/components/events/rsvp-controls'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import type { MembershipTier } from '@/lib/spaces/memberships'

// The rate row markup now lives in `rate-options.tsx` so the signed-out ticket door can render the
// same list instead of redrawing it. `FlowRate` is re-exported here because the event page has
// imported it from this module since ADR-826.
export type { FlowRate }

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
  guestTiers,
  mode,
  rsvpWindowOpen = true,
  rsvpWindowLine,
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
  /** The event's ticket tiers, for the signed-out guest purchase door. Omit and a signed-out
   *  viewer in tickets mode gets the sign-in link instead. */
  guestTiers?: GuestTicketTier[]
  /** The event's join mode. In 'rsvp' mode money changes hands at the door, so a signed-out
   *  reader can RSVP as a guest whether or not checkout can charge (LIVE-314). In 'tickets'
   *  mode buying IS attending, so without a purchasable door the sign-in link is the honest one. */
  mode: 'rsvp' | 'tickets'
  /** The host's booking window. `capture_guest_rsvp` refuses outside it, so the guest RSVP door
   *  shows the reason instead of a form that would silently do nothing (ADR-1150). */
  rsvpWindowOpen?: boolean
  rsvpWindowLine?: string
}) {
  const isGoing = status === 'going'

  // THE SIGNED-OUT DOORS. Two of them, and they are decided before any state so the rate list
  // seeded below is the one the reader can actually act on.
  //
  // · The PURCHASE door: when there is something a guest can actually buy, the guest ticket form
  //   takes over phases 1 and 2. It owns the rate list, because the list it shows is the one a
  //   guest can buy from (a membership rate is not an offer to someone with no account).
  //   Rendering phase 1 above it as well would put two rate lists on the same card.
  // · The RSVP door (LIVE-314): an RSVP-mode event collects money at the door, not at RSVP time.
  //   Nothing goes through checkout here, and a signed-in member gets full RSVP controls whether
  //   or not the host's payouts are connected. This door used to be closed by `paymentsReady`,
  //   which refused the guest for a condition that charges nobody. The guest RSVP form stands
  //   here instead; the same `capture_guest_rsvp` that serves the free path refuses tickets-mode
  //   events, so a tickets-mode event without a purchasable door keeps the sign-in link.
  const guestDoor = !signedIn && paymentsReady && !!guestTiers && guestTiers.length > 0
  const guestRsvpDoor = !signedIn && !guestDoor && mode === 'rsvp'

  // A guest with no account cannot hold a membership, so the RSVP door lists only the general
  // rates. The selection seeds from the list this reader sees, not from the full one.
  const rateList = guestRsvpDoor ? rates.filter((r) => r.kind === 'general') : rates
  const [selectedId, setSelectedId] = useState<string>(
    () =>
      // A rate the viewer's membership covers, then any rate they can actually take today
      // (ADR-1373), then whatever is first. Landing on an off-sale rate is a dead end.
      (rateList.find((r) => r.covered && !r.offSale) ??
        rateList.find((r) => !r.offSale) ??
        rateList[0])?.id ?? '',
  )
  const [payOpen, setPayOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = rateList.find((r) => r.id === selectedId) ?? null

  // Phase 3 applies only when Going costs something: an unpaid general rate, or the membership
  // rate for a non-member. A covered rate records Going directly (no intercept).
  const needsPayment = !!selected && !selected.covered
  const showPayment = payOpen && needsPayment && !isGoing

  // The line under the guest RSVP button. The form's default says "Free to join.", which is true
  // on the free path and false here: the selected rate is paid, at the door, and the sentence
  // says so. A covered (free) rate keeps the default.
  const guestRsvpNote =
    guestRsvpDoor && selected && !selected.covered ? `Pay the ${selected.priceLabel} at the door.` : undefined

  function selectRate(r: FlowRate) {
    if (r.offSale) return
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
      {/* Phase 1 — pick your rate. The purchase door renders its own list; see `guestDoor`. */}
      {!guestDoor && rateList.length > 0 && (
        <RateOptions rates={rateList} selectedId={selectedId} onSelect={selectRate} />
      )}

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
      ) : guestDoor ? (
        /* SIGNED OUT, and the rates above cost money. A "Sign in to RSVP" link stood here, which
           asked for an account before the thing the visitor came to do. They buy as a guest; the
           account is offered afterwards, in the ticket email. Members-only rates are not in the
           guest's list, so what they see here is what they can actually buy. */
        <GuestTicketForm eventId={eventId} tiers={guestTiers!} signInHref={signInHref} />
      ) : guestRsvpDoor ? (
        /* SIGNED OUT on an RSVP-mode event with nothing to charge online. The seat is the thing
           being collected and the money is collected at the door, so the guest form that serves
           the free path serves here too. The booking window gates it the same way the free path
           is gated: the SQL behind the form refuses outside it. */
        rsvpWindowOpen ? (
          <GuestRsvpForm eventId={eventId} isFull={isFull} note={guestRsvpNote} />
        ) : (
          <p className="text-body-sm text-muted">{rsvpWindowLine}</p>
        )
      ) : (
        /* Tickets mode with no guest purchase to offer (payouts not connected, or nothing
           buyable): the sign-in link is still the honest door, because buying is attending and
           an account is the only path left. */
        <div className="space-y-2">
          <Link
            href={signInHref}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Sign in to RSVP
          </Link>
          <p className="text-meta text-muted">Sign in and you&rsquo;re two taps from the list.</p>
        </div>
      )}

      {/* Phase 3 — the payment area slides open under the answer. */}
      {showPayment && selected && (
        <div className="space-y-3 rounded-card border border-primary/40 bg-surface-elevated/40 p-4 motion-safe:animate-[slideUp_0.2s_ease-out]">
          {selected.kind === 'general' ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-body-sm font-semibold text-text">{selected.name}</p>
                <p className="text-body-sm font-semibold text-text">{selected.priceLabel}</p>
              </div>
              {paymentsReady ? (
                <>
                  <button
                    type="button"
                    onClick={payAndGo}
                    disabled={pending}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
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
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
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
              {error && <p className="text-body-sm text-danger">{error}</p>}
            </>
          ) : membership ? (
            <>
              <div>
                <p className="text-body-sm font-bold text-text">Join {membership.spaceName}</p>
                <p className="mt-0.5 text-meta text-muted">
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
