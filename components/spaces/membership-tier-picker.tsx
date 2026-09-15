'use client'

import { useState } from 'react'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import { hasAnnualOption, type BillingInterval } from '@/lib/spaces/membership-pricing'
import type { MembershipTier } from '@/lib/spaces/memberships'

// MEMBERSHIP TIER PICKER (client). The cadence toggle plus the two-column grid of join cards
// (ADR-1374). It is the ONLY client state on the join surface: the server half
// (membership-join.tsx) still reads the tiers, the viewer's membership, the included events and the
// capacity counts, and hands them down as props.
//
// THE TOGGLE IS CONDITIONAL ON PURPOSE. When no tier has a yearly price, a monthly/yearly control
// would be a dead switch: every card would read the same on both sides. It appears the moment an
// owner sets one yearly price, and defaults to monthly, which is the low-friction default the
// public pricing page already uses (components/marketing/pricing-billing-toggle.tsx).
//
// Accessible the same way that page is: a labelled radiogroup of two buttons with the active one
// marked. Semantic tokens only, no hex. Voice: plain labels, sentence case, no em dashes.

export interface MembershipTierCardData {
  tier: MembershipTier
  /** Upcoming events whose members-only ticket THIS tier unlocks (ADR-823). */
  includedEvents: { slug: string; title: string }[]
  /** Remaining capacity (ADR-824); null = unlimited. */
  spotsLeft: number | null
}

export function MembershipTierPicker({
  spaceId,
  billingOn,
  cards,
}: {
  spaceId: string
  billingOn: boolean
  cards: MembershipTierCardData[]
}) {
  const [interval, setInterval] = useState<BillingInterval>('month')
  const anyYearly = cards.some((c) => hasAnnualOption(c.tier))

  return (
    <div className="space-y-4">
      {anyYearly && (
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="flex w-fit items-center gap-1 rounded-pill border border-border bg-surface p-1"
        >
          <IntervalButton
            active={interval === 'month'}
            onClick={() => setInterval('month')}
            label="Monthly"
          />
          <IntervalButton
            active={interval === 'year'}
            onClick={() => setInterval('year')}
            label="Yearly"
          />
        </div>
      )}

      {/* Two columns from the container's large width down to one on a phone. The cards sit in a
          container-query context on the entity tabs, so the breakpoint follows the column they are
          in rather than the viewport. */}
      <div className="grid gap-4 @lg:grid-cols-2 sm:grid-cols-2">
        {cards.map((c) => (
          <MembershipJoinCard
            key={c.tier.id ?? c.tier.name}
            spaceId={spaceId}
            tier={c.tier}
            billingOn={billingOn}
            includedEvents={c.includedEvents}
            spotsLeft={c.spotsLeft}
            interval={interval}
          />
        ))}
      </div>
    </div>
  )
}

function IntervalButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-pill px-4 py-1.5 text-body-sm font-semibold transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  )
}
