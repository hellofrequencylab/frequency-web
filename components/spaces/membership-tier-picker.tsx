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
 * Which plan the grid leans on, resolved ONCE here.
 *
 * THE RULE IS THE DEAREST CARD STILL IN THE GRID, and the first version of this got it wrong in a
 * way worth keeping written down. It featured the MIDDLE rung, on the standard reading that the
 * middle of three carries the volume. But the prestige rung is lifted OUT of this grid, so on a
 * four-tier ladder the grid holds two, "middle" resolved to index 0, and the page crowned the
 * CHEAPEST paid plan. The rule outsmarted itself the moment another rule moved its inputs.
 *
 * What the grid actually shows, once prestige is gone, is the entry rung and the upgrade. The
 * upgrade is the thing a page like this exists to sell, so it is the one that gets the weight, and
 * that reads the same whether the grid holds two rungs or five.
 *
 * It is still not a claim about THIS space's sales. When a tier model carries a real featured flag,
 * this function is the single place that changes.
 */
export function featuredIndex(paidCount: number): number {
  if (paidCount <= 0) return -1
  return paidCount - 1
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
  const allPaid = cards.filter((c) => c.tier.priceCents > 0)

  // THE PRESTIGE RUNG LEAVES THE GRID. With three or more paid tiers the dearest one is lifted out
  // and rendered as a band below, because a prestige tier loses every comparison it is entered into:
  // per bullet it is arithmetically the worst value on the page, and a grid invites exactly that
  // arithmetic. Below two paid tiers there is no comparison to protect, so nothing is lifted.
  const prestige = allPaid.length >= 3 ? allPaid[allPaid.length - 1] : null
  const paidCards = prestige ? allPaid.slice(0, -1) : allPaid
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

          {/* 🔴 THE BREAKPOINT IS LATE ON PURPOSE. These cards carry five to seven benefit lines,
              and this column shares its width with the right rail: at @md each card landed near
              270px and every line wrapped, turning two plans into two tall ribbons. They stay
              STACKED until there is room for roughly 320px a card, which is the width the copy was
              written for. A stacked pair on a narrow column reads better than a cramped row.

              The cards sit in a container-query context on the entity tabs, so the breakpoints
              follow the column they are in rather than the viewport; the lg pair is the fallback
              for a mount that is not a container. items-stretch keeps the featured card's header
              band from making its sibling short. */}
          <div className="grid items-stretch gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 lg:grid-cols-2">
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

      {prestige && (
        <MembershipJoinCard
          key={prestige.tier.id ?? prestige.tier.name}
          spaceId={spaceId}
          tier={prestige.tier}
          billingOn={billingOn}
          includedEvents={prestige.includedEvents}
          spotsLeft={prestige.spotsLeft}
          interval={interval}
          layout="band"
        />
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
