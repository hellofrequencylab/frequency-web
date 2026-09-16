'use client'

import { useState } from 'react'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import { hasAnnualOption, type BillingInterval } from '@/lib/spaces/membership-pricing'
import type { MembershipTier } from '@/lib/spaces/memberships'
import { Button } from '@/components/ui/button'

// MEMBERSHIP TIER PICKER (client). The plans surface: a free tier as a full-width bar, the paid
// tiers as a comparison grid beneath it, and the cadence toggle between them (ADR-1374). It is the
// ONLY client state on the join surface; the server half (membership-join.tsx) still reads the
// tiers, the viewer's membership, the included events and the capacity counts and hands them down.
//
// WHY THE FREE TIER IS A BAR AND NOT A CARD. A free tier carries one short list and no price, so in
// a grid of paid plans it renders as a mostly-empty column that drags every sibling's height down to
// match it. As a bar it reads as what it is: the way in, above the decision. The paid plans then
// compare against each other rather than against a blank.
//
// THE GROUND IS THE CANVAS. The mount (entity-cta.tsx) uses ModuleCard's borderless default rather
// than its tile skin, so these cards sit on the canvas and their own fill, hairline and lift
// actually read as cards. A white card on a white panel is invisible, which is what the tile
// variant produced.
//
// THE TOGGLE IS CONDITIONAL ON PURPOSE. When no tier has a yearly price, a monthly/yearly control
// would be a dead switch: every card would read the same on both sides. It appears the moment an
// owner sets one yearly price, and defaults to monthly, which is the low-friction default the
// public pricing page already uses (components/marketing/pricing-billing-toggle.tsx).
//
// Semantic tokens only, no hex, no literal type or radius steps. Voice: sentence case, plain
// labels, no em dashes, no urgency (CONTENT-VOICE §10).

export interface MembershipTierCardData {
  tier: MembershipTier
  /** Upcoming events whose members-only ticket THIS tier unlocks (ADR-823). */
  includedEvents: { slug: string; title: string }[]
  /** Remaining capacity (ADR-824); null = unlimited. */
  spotsLeft: number | null
}

/**
 * Which paid plan the grid leans on, resolved ONCE here.
 *
 * The rule is positional and deliberately dumb: the MIDDLE paid rung, or the first when there are
 * fewer than three. Pricing research is consistent that the middle of three carries most of the
 * volume, and one rule beats a per-site prop. The marketing pricing page's own comment records what
 * happens otherwise: two callers disagreed and the page crowned two different plans.
 *
 * It is not a claim about THIS space's sales. When a tier model carries a real featured flag, this
 * function is the single place that has to change.
 */
export function featuredIndex(paidCount: number): number {
  if (paidCount <= 0) return -1
  if (paidCount < 3) return 0
  return Math.floor((paidCount - 1) / 2)
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

  // Free tiers lead, paid tiers compare. `priceCents === 0` is the whole test: a free tier is the
  // one the toggle cannot change and the one with nothing to weigh against a sibling.
  const freeCards = cards.filter((c) => c.tier.priceCents === 0)
  const paidCards = cards.filter((c) => c.tier.priceCents > 0)
  const featured = featuredIndex(paidCards.length)

  return (
    <div className="space-y-5">
      {freeCards.map((c) => (
        <MembershipJoinCard
          key={c.tier.id ?? c.tier.name}
          spaceId={spaceId}
          tier={c.tier}
          billingOn={billingOn}
          includedEvents={c.includedEvents}
          spotsLeft={c.spotsLeft}
          interval={interval}
          layout="bar"
        />
      ))}

      {paidCards.length > 0 && (
        <>
          {anyYearly && (
            <div className="flex flex-col items-center gap-2">
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
              {interval === 'year' && (
                <p className="text-body-sm font-semibold text-primary-strong">
                  Yearly plans are billed once.
                </p>
              )}
            </div>
          )}

          {/* Three across on a wide column, two on a medium one, stacked on a phone. The cards sit
              in a container-query context on the entity tabs, so the breakpoints follow the column
              they are in rather than the viewport; the sm/lg pair is the fallback for a mount that
              is not a container. items-stretch keeps the featured card's extra padding from making
              its siblings match its height. */}
          <div className="grid items-stretch gap-4 @md:grid-cols-2 @3xl:grid-cols-3 sm:grid-cols-2 lg:grid-cols-3">
            {paidCards.map((c, i) => (
              <MembershipJoinCard
                key={c.tier.id ?? c.tier.name}
                spaceId={spaceId}
                tier={c.tier}
                billingOn={billingOn}
                includedEvents={c.includedEvents}
                spotsLeft={c.spotsLeft}
                interval={interval}
                featured={i === featured}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** One segment of the cadence toggle. Composes Button rather than drawing a fill on a raw element:
 *  the variant carries the palette and its focus treatment, and a hand-rolled primary fill on a bare
 *  button is a debt class the adoption ratchet holds at its baseline. */
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
    <Button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      variant={active ? 'primary' : 'ghost'}
      size="sm"
    >
      {label}
    </Button>
  )
}
