'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Lock, X } from 'lucide-react'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import type { MembershipTier } from '@/lib/spaces/memberships'

// MEMBERSHIP CHECKOUT FOLD (ADR-826 polish, owner spec): on an event whose ticket a membership
// includes, the membership price ROW is the package selector — tapping it folds the FULL checkout
// experience open right in the column: the unlocking tier card(s) with price, benefits, the
// included event, and the Join action (Stripe Checkout when billing is live; the recorded join
// while billing is off). A successful join refreshes in place, so the row flips to
// Member · Included with the RSVP switch ready. Signed-out visitors get the sign-in step.

export function MembershipCheckoutFold({
  rowName,
  priceLabel,
  spaceId,
  spaceName,
  tiers,
  includedEvent,
  billingOn,
  signedIn,
  signInHref,
}: {
  /** The ticket row title (e.g. "Royal Temple Member"). */
  rowName: string
  /** The membership price shown on the row (e.g. "$44/mo"). */
  priceLabel: string
  spaceId: string
  spaceName: string
  /** The membership tier(s) that unlock this ticket (the named one, else all active). */
  tiers: MembershipTier[]
  /** This event, advertised on the join card ("Member ticket to … included"). */
  includedEvent: { slug: string; title: string }
  billingOn: boolean
  signedIn: boolean
  signInHref: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-start justify-between gap-3 rounded-card border px-3.5 py-2.5 text-left transition-colors ${
          open ? 'border-primary bg-primary-bg/40' : 'border-border hover:border-border-strong'
        }`}
      >
        <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold text-text">{rowName}</p>
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 rounded-pill bg-success-bg px-1.5 py-0.5 text-2xs font-medium text-success">
              <Lock className="h-2.5 w-2.5" />
              Membership
            </span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-body-sm font-semibold text-text">
          {priceLabel}
          <ChevronDown
            className={`h-4 w-4 text-subtle transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 rounded-card border border-primary/40 bg-surface-elevated/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-body-sm font-bold text-text">Join {spaceName}</p>
              <p className="mt-0.5 text-meta text-muted">
                Membership includes your ticket to {includedEvent.title}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="shrink-0 rounded-control p-1.5 text-subtle transition-colors hover:bg-surface hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {signedIn ? (
            <div className="space-y-4">
              {tiers.map((tier) => (
                <MembershipJoinCard
                  key={tier.id ?? tier.name}
                  spaceId={spaceId}
                  tier={tier}
                  billingOn={billingOn}
                  includedEvents={[includedEvent]}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href={signInHref}
                className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Sign in to join
              </Link>
              <p className="text-meta text-muted">
                Sign in and the membership takes a minute to join.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
