'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Loader2, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { joinTier, startSpaceMembershipCheckout } from '@/lib/spaces/memberships-actions'
import type { MembershipInterval, MembershipTier } from '@/lib/spaces/memberships'

// MEMBER JOIN CARD (client). One tier rendered as a kit card (name, price, interval, benefits) with
// a Join button. The server re-validates the tier + that the caller is not already a member, so this
// card is convenience, not the gate.
//
// TWO PATHS (Pricing P3): while billing is OFF (billingOn=false) the button keeps the EXACT
// display-only behavior — joinTier records a membership and takes no charge. When billing is live AND
// the tier is paid, Join opens Stripe Checkout (startSpaceMembershipCheckout); if checkout no-ops
// (e.g. the owner is not payout-ready), it falls back to the free join path, so the button is never
// broken. A free ($0) tier always uses joinTier.
//
// HONESTY (CONTENT-VOICE skeptic test): while OFF the price is labeled as what membership WILL cost;
// the button says "Join" (not "Pay") and the helper line says no payment is taken yet. No narrated
// feelings, no em/en dashes (CONTENT-VOICE §10).

/** Cents to a plain price label, e.g. 2500 -> "$25", 2550 -> "$25.50". Whole dollars drop the
 *  cents. USD only in v1 (a currency column is a later, additive expansion). */
export function formatPrice(cents: number): string {
  const dollars = cents / 100
  const whole = Number.isInteger(dollars)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

/** A short per-interval suffix for the price label. */
export function intervalLabel(interval: MembershipInterval): string {
  if (interval === 'month') return 'per month'
  if (interval === 'year') return 'per year'
  return 'one time'
}

export function MembershipJoinCard({
  spaceId,
  tier,
  billingOn = false,
  includedEvents = [],
  spotsLeft = null,
}: {
  spaceId: string
  tier: MembershipTier
  /** When true (billing live), a PAID tier joins via Stripe Checkout; otherwise the display-only
   *  joinTier path is used (unchanged OFF behavior). */
  billingOn?: boolean
  /** Upcoming events whose members-only ticket THIS tier unlocks (ADR-823) — advertised on the
   *  card so a configured ticket gate markets the membership by itself. */
  includedEvents?: { slug: string; title: string }[]
  /** Remaining capacity (ADR-824); null = unlimited. 0 = full (waitlist or closed). */
  spotsLeft?: number | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const free = tier.priceCents === 0
  const full = spotsLeft != null && spotsLeft <= 0
  // Join-and-return (ADR-823): an event page's "join their membership" pointer carries
  // ?return_to=/events/<slug>, so after joining the member lands back on the ticket they came
  // for. SAFETY: only a same-origin absolute path is honored (a leading single slash) — anything
  // else (full URLs, protocol-relative "//host") is dropped, so the param can never redirect off-site.
  const rawReturn = searchParams.get('return_to')
  const returnTo = rawReturn && /^\/(?!\/)/.test(rawReturn) ? rawReturn : null

  function join() {
    if (!tier.id) return
    setError(null)
    const tierId = tier.id
    start(async () => {
      // Paid tier with billing live: try secure checkout first. If it no-ops (owner not payout-ready,
      // billing off, etc.) fall back to the free join path so the button is never broken. A FULL tier
      // skips checkout entirely: a waitlist spot is not a purchase (ADR-824).
      if (billingOn && !free && !full) {
        const checkout = await startSpaceMembershipCheckout(spaceId, tierId)
        if (!isError(checkout)) {
          window.location.href = checkout.data.url
          return
        }
      }
      const result = await joinTier(spaceId, tierId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      if (returnTo) {
        router.push(returnTo)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 lift-1">
      <h3 className="text-body font-bold leading-tight text-text">{tier.name}</h3>
      <p className="mt-1 text-body-sm text-muted">
        {free ? (
          'Free'
        ) : (
          <>
            <span className="font-semibold text-text">{formatPrice(tier.priceCents)}</span>{' '}
            {intervalLabel(tier.interval)}
          </>
        )}
      </p>

      {tier.description && (
        <p className="mt-3 text-body-sm leading-relaxed text-muted">{tier.description}</p>
      )}

      {tier.benefits.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {tier.benefits.map((benefit, i) => (
            <li key={i} className="flex items-start gap-2 text-body-sm text-text">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      )}

      {includedEvents.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {includedEvents.map((e) => (
            <li key={e.slug} className="flex items-start gap-2 text-body-sm text-text">
              <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                Member ticket to{' '}
                <Link href={`/events/${e.slug}`} className="font-medium underline underline-offset-2">
                  {e.title}
                </Link>{' '}
                included
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-4">
        {/* Capacity states (ADR-824): open (spots shown when limited), full-with-waitlist, or
            closed. The server re-checks on join, so these are honest hints, not the gate. */}
        {spotsLeft != null && spotsLeft > 0 && (
          <p className="mb-2 text-2xs text-muted">
            {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
          </p>
        )}
        {full && !tier.waitlist ? (
          <Button type="button" disabled className="w-full justify-center">
            Full
          </Button>
        ) : (
          <Button type="button" onClick={join} disabled={pending} className="w-full justify-center">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Joining
              </>
            ) : full ? (
              'Join the waitlist'
            ) : (
              'Join'
            )}
          </Button>
        )}
        {full && tier.waitlist && (
          <p className="mt-2 text-2xs text-muted">
            This tier is full. Joining adds you to the waitlist; you become a member when a spot
            opens.
          </p>
        )}
        {!free && !full && (
          <p className="mt-2 text-2xs text-muted">
            {billingOn
              ? 'Join opens secure checkout. You can cancel any time.'
              : 'No payment is taken yet. Paid billing comes later.'}
          </p>
        )}
        {error && (
          <p className="mt-2 text-2xs font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
