'use client'

import { useId, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { startGuestTicket } from '@/app/(main)/events/[slug]/ticket-actions'
import { ticketRowToPrice, type Price } from '@/lib/commerce/types'
import { PriceInput, type PriceSelection } from '@/components/commerce/price-input'
import { RateOptions, type FlowRate } from '@/components/events/rate-options'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'

// THE SIGNED-OUT TICKET DOOR. What stood here was the sentence "Sign in to get your ticket." on a
// priced event, and a "Sign in to RSVP" link on a priced RSVP with tiers. On 14 of 15 upcoming
// events that was the whole path: someone followed a shared link to a thing they wanted to pay for
// and was asked to make an account first.
//
// This is `guest-rsvp-form.tsx` with money attached, and it keeps that file's care on purpose:
// email is the only required field, the name is asked for the host's sake, the honeypot is hidden
// from sight AND from the accessibility tree AND from tab order, and the error is text beside the
// field rather than a colour alone.
//
// WHEN THE ACCOUNT IS OFFERED: after payment, in the ticket email. Never in front of the purchase.
// The address collected here is what the ticket is sent to, which is why it is the one thing this
// form insists on.
//
// ── WHAT THIS FORM MAY SAY ───────────────────────────────────────────────────────────────────────
// A successful submit on a PRICED tier sends the browser to hosted Stripe Checkout, so this page is
// GONE a moment later. On-page copy therefore promises nothing past the start of checkout: no seat,
// no confirmation, no "you're going". The ticket email is where any of that is stated, because it
// goes to the address in question rather than to whoever is looking at this screen.
//
// A FREE tier (LIVE-318) is the guest RSVP with a tier attached: the same email form, and the
// same confirmation `guest-rsvp-form.tsx` shows, for the same reason. The seat is written under an
// unproven address and the reply is identical on every path, so the screen says only what is true
// on all of them ("check your email") and the email says whether the room had space.

/** What the reader sees after a free tier is claimed. Same words on every path, by design, and the
 *  same words the guest RSVP form uses: the claim IS a guest RSVP. */
const FREE_CONFIRMATION = {
  heading: 'Check your email',
  body: 'We sent the details there, including whether the room had space. No account needed.',
} as const

/** A tier as this form needs it. `TicketTierView` satisfies it; its extra fields are ignored. */
export type GuestTicketTier = {
  id: string
  name: string
  description: string | null
  pricingMode: 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
  priceCents: number | null
  minCents: number | null
  suggestedCents: number | null
  soldOut: boolean
  /** Paying members (Crew+) only. */
  memberOnly: boolean
  /** Active members of the hosting Space's membership program only (ADR-823). */
  spaceMembersOnly: boolean
}

const dollars = (cents: number | null | undefined) =>
  cents != null ? `$${(cents / 100).toFixed(2)}` : ''

function isBuyerChosen(mode: GuestTicketTier['pricingMode']) {
  return mode === 'pwyc' || mode === 'sliding_scale' || mode === 'donation'
}

function tierPriceLabel(t: GuestTicketTier): string {
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

function tierToPrice(t: GuestTicketTier): Price {
  return ticketRowToPrice({
    pricing_mode: t.pricingMode,
    price_cents: t.priceCents,
    min_cents: t.minCents,
    suggested_cents: t.suggestedCents,
  })
}

/** A guest holds neither a paid membership nor a Space membership, so a gated tier is not an offer
 *  to them: `createTicketCheckout` refuses it, and a row that cannot be bought is a dead end
 *  dressed as a choice. Those rates stay out of the guest's list. */
function offerableToGuest(t: GuestTicketTier) {
  return !t.memberOnly && !t.spaceMembersOnly
}

export function GuestTicketForm({
  eventId,
  priceLabel,
  tiers,
  signInHref,
}: {
  eventId: string
  /** The event's flat price, used when there are no tier rows. */
  priceLabel?: string
  /** The event's ticket tiers; empty or omitted = the implicit flat-price tier. */
  tiers?: GuestTicketTier[]
  /** Where this points someone whose account is the only way through. */
  signInHref: string
}) {
  const fieldId = useId()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [selection, setSelection] = useState<PriceSelection | null>(null)
  const [pending, startTransition] = useTransition()

  const offerable = useMemo(() => (tiers ?? []).filter(offerableToGuest), [tiers])
  const hasTiers = offerable.length > 0
  const [selectedId, setSelectedId] = useState<string>(
    () => (offerable.find((t) => !t.soldOut) ?? offerable[0])?.id ?? '',
  )
  const selected = hasTiers ? offerable.find((t) => t.id === selectedId) ?? null : null

  // Every tier on this event is gated. A guest genuinely cannot buy one, so name the door that
  // works instead of showing a control the server would refuse.
  if ((tiers?.length ?? 0) > 0 && !hasTiers) {
    return (
      <p className="text-body-sm text-muted">
        Every ticket here is for members.{' '}
        <Link href={signInHref} className="font-semibold text-text underline underline-offset-2">
          Sign in
        </Link>{' '}
        with the membership that covers it.
      </p>
    )
  }

  const rates: FlowRate[] = offerable.map((t) => ({
    id: t.id,
    name: t.name,
    priceLabel: tierPriceLabel(t),
    kind: 'general',
    ticketTypeId: t.id,
    covered: t.pricingMode === 'free',
    tag: null,
    soldOut: t.soldOut,
    description: t.description,
  }))

  const isFree = hasTiers ? selected?.pricingMode === 'free' : false
  const buyerChosen = selected ? isBuyerChosen(selected.pricingMode) : false
  const payLabel = hasTiers ? (selected ? tierPriceLabel(selected) : '') : priceLabel ?? ''
  const submitLabel = payLabel ? `Get ticket · ${payLabel}` : 'Get ticket'
  const soldOut = !!selected?.soldOut

  function selectRate(r: FlowRate) {
    setSelectedId(r.id)
    setError(null)
    setSelection(null)
  }

  if (done) {
    return (
      <div
        // Announced rather than silently swapped: the submit button is gone by the time this
        // renders, so a screen reader user has nothing left to move back to.
        role="status"
        className="flex items-start gap-2.5 rounded-card bg-success-bg px-4 py-3 text-success"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body-sm font-semibold">{FREE_CONFIRMATION.heading}</p>
          <p className="text-meta">{FREE_CONFIRMATION.body}</p>
        </div>
      </div>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        setError(null)

        // Client-side floor hint for a buyer-chosen tier. The server re-enforces it.
        let amountCents: number | undefined
        if (selected && isBuyerChosen(selected.pricingMode)) {
          if (!selection || !selection.valid || selection.amountCents == null) {
            setError(selection?.error ?? 'Enter an amount.')
            return
          }
          amountCents = selection.amountCents
        }

        const email = String(data.get('email') || '')
          .trim()
          .toLowerCase()
        const name = String(data.get('name') || '').trim()

        startTransition(async () => {
          const result = await startGuestTicket({
            eventId,
            email,
            name: name || undefined,
            ticketTypeId: selected?.id ?? null,
            amountCents,
            qty: 1,
            company: String(data.get('company') || ''),
          })
          if (isError(result)) {
            setError(result.error)
          } else if (result.data.url) {
            // Hosted Stripe Checkout. This page is gone after this line.
            window.location.href = result.data.url
          } else if (result.data.free) {
            // The free tier is claimed: a guest RSVP row under this address, receipt email sent.
            // The same confirmation the guest RSVP form shows, for the same reason (header). Also
            // where a session that turned up between render and submit lands: the action then
            // hands off to the member path, whose recorder sends its own confirmation.
            setDone(true)
          }
        })
      }}
    >
      {hasTiers && <RateOptions rates={rates} selectedId={selectedId} onSelect={selectRate} />}

      {/* Buyer-chosen amount for a pwyc / sliding-scale / donation tier: the shared PriceInput
          pre-fills the suggested anchor and enforces the floor. Keyed by tier so it re-seeds. */}
      {selected && buyerChosen && !selected.soldOut && (
        <PriceInput
          key={selected.id}
          price={tierToPrice(selected)}
          disabled={pending}
          idPrefix={`guest-tier-${selected.id}`}
          onChange={setSelection}
        />
      )}

      {/* The same fields for every offerable rate. A FREE tier used to swap these for "a free
          ticket needs an account"; since LIVE-318 the address is the claim (a guest RSVP row), so
          the form asks for exactly what a free RSVP asks for. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`${fieldId}-email`}>Email</Label>
          <Input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            // The error is text next to the field, not a colour change alone, and the field
            // points at it so it is read on focus rather than only seen.
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={`${fieldId}-name`}>
            Name <span className="font-normal text-subtle">(optional)</span>
          </Label>
          <Input
            id={`${fieldId}-name`}
            name="name"
            type="text"
            autoComplete="name"
            placeholder="First name"
          />
        </div>
      </div>

      {/* Honeypot. Hidden from sight AND from the accessibility tree AND from tab order, so no
          real person can reach it by any route — a bot filling it is therefore unambiguous.
          `aria-hidden` alone would still leave it tabbable, which is how these turn into a trap
          for keyboard users instead of for bots. It stays a real text Input rather than
          type="hidden" because a bot that fills forms fills text fields; a hidden input would
          never be touched and the trap would catch nothing. */}
      <div aria-hidden="true" className="hidden">
        <Label htmlFor={`${fieldId}-company`}>Company</Label>
        <Input
          id={`${fieldId}-company`}
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* `loading` rather than a label swap: the primitive marks the control aria-busy and
            disables it while keeping the label the same width, which is the one thing a
            pending state must not change (INTERACTION-STATES §4 rule 3). */}
        <Button type="submit" loading={pending} disabled={soldOut}>
          {soldOut ? 'Sold out' : submitLabel}
        </Button>
        <p className="text-meta text-muted">
          {isFree
            ? 'No account needed. The details go to this email.'
            : 'No account needed. Payment happens on the next screen, and your ticket goes to this email.'}
        </p>
      </div>

      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
