import { NETWORK_PLAN, SPACE_PLAN_LABEL, networkFoundingYearCents, networkPackageYearCents, type SpacePlan } from '@/lib/pricing/plans'
import { spacePlanPriceCents, SPACE_PLAN_PRICE_CENTS } from '@/lib/pricing/feature-tiers'
import { formatCents } from '@/lib/pricing/display'
import { COLLECTIVE_FOUNDING_ENDS_LABEL, FOUNDING_RATE_NOTE, networkFoundingOpen } from '@/lib/pricing/beta'
import { yearlyFromMonthly, type BillingInterval } from '@/lib/billing/pricing-keys'
import { PlanLadderRungs, type LadderRung, type RungIcon } from './plan-ladder-rungs'

// THE COMMUNITY COLLECTIVE plan ladder — the tier map on the Space billing surface, on the five-tier
// ladder (ADR-1709). It shows where a Space sits and what each rung is for, leading with the promise
// that matters most: hosting is free, selling starts at Business, and you keep 100% of what you bring
// in. The network fee is an introduction fee on the plans that sell, never a reason to take a plan.
//
// Business carries the inline Choose action for a FREE Space (gated on billingLive + its per-plan
// switch) and keeps its richer CTA below (GoBusinessCta, with the seat picker). The rows themselves are
// drawn by PlanLadderRungs (client), which holds the Monthly / Yearly choice (LIVE-990): this file
// resolves both intervals' prices on the server and hands them over as plain strings. Collective is the rung
// above it for groups of groups: "Available" once its per-plan switch is on, else "Coming soon",
// truthful, not a dark pattern. Prices come from the ONE placeholder map (feature-tiers), never
// hardcoded here. Non Profit points at the existing verify flow. No em dashes (CONTENT-VOICE §10); plain,
// no hype, no guilt. Beta anchors resolve through SPACE_PLAN_PRICE_CENTS (feature-tiers), the ONE source
// shared with the marketing pricing page, so they never drift between the two surfaces. (This note used
// to name a COLLECTIVE_BETA_CENTS import that this file never had; the constant is gone as of
// 2026-08-10 and the map it aliased is what was always being read.)

type RungState = 'current' | 'available' | 'soon' | 'verify'

interface Rung {
  plan: SpacePlan
  icon: RungIcon
  blurb: string
  /** An optional secondary price note (e.g. the beta anchor). */
  note?: string
}

const RUNGS: Rung[] = [
  {
    plan: 'business',
    icon: 'check',
    blurb: 'Selling starts here: paid tickets, memberships, donations, your shop and booking deposits. Higher limits, your own website, two seats, and Collaborator hosting.',
  },
  {
    plan: 'collective',
    icon: 'users',
    blurb: 'For separate groups that partner: a hub linking partner Spaces, cross-listed Circles and Journeys, a shared calendar, more seats, and Vera AI included. Each partner keeps its own members and payouts.',
  },
  {
    plan: 'network',
    icon: 'network',
    blurb: 'One organization with chapters: three chapters to start, one membership that works in every chapter, central admins and a roll-up report.',
  },
  {
    plan: 'nonprofit',
    icon: 'shield',
    blurb: 'Everything Business does, for verified 501(c)(3) organizations, with no network fee.',
  },
]

// 🔴 THE INDEPENDENT RUNG IS NOT AN OFFER, IT IS A LABEL FOR A SPACE ALREADY ON IT.
//
// The tier is sold by hand and advertised nowhere (owner ruling 2026-09-08, LIVE-227): the standalone
// white-label site it is sold on is not finished, so no public or in-app surface may present it as a
// plan to move to. It stays here for ONE reason: a Space that already holds the plan has to see its own
// rung marked "Your plan". Deleting it would leave that Space looking at a ladder whose lowest rung
// reads as available, which is a downgrade dressed as an upgrade.
//
// So it renders only when it IS the Space's current plan, it never carries a Choose action, and its
// blurb states what the Space has rather than selling it. Do not add it to RUNGS.
const CURRENT_PLAN_ONLY_RUNG: Rung = {
  plan: 'independent',
  icon: 'globe',
  blurb: 'Your own brand and domain, standalone. Outside the collective, on your existing agreement.',
}

const STATE_CHIP: Record<RungState, { label: string; className: string }> = {
  current: { label: 'Your plan', className: 'bg-primary text-on-primary' },
  available: { label: 'Available below', className: 'bg-success-bg/40 text-success' },
  soon: { label: 'Coming soon', className: 'border border-dashed border-border text-subtle' },
  verify: { label: 'By verification', className: 'border border-border text-muted' },
}

/** Resolve the state chip for a rung given the Space's current plan and which rungs are sellable now.
 *  Business's live CTA lives below (always "available"); Collective is "available" once its per-plan
 *  switch is on (else "Coming soon"); Non Profit is by verification. Independent is never "available":
 *  it is sold by hand (LIVE-227), and it only ever reaches this function as the Space's current plan. */
function rungState(
  plan: SpacePlan,
  currentPlan: SpacePlan,
  sellable: Partial<Record<SpacePlan, boolean>>,
): RungState {
  if (plan === currentPlan) return 'current'
  if (plan === 'business') return 'available'
  if (plan === 'collective') return sellable.collective ? 'available' : 'soon'
  if (plan === 'network') return sellable.network ? 'available' : 'soon'
  if (plan === 'nonprofit') return 'verify'
  return 'soon'
}

/** The plain, honest price label for a rung: what the Space would be charged TODAY.
 *
 *  🔴 It used to read the LIST price while /pricing quoted the beta one, so an operator comparing the
 *  two saw Business at $29 here and $19 there, and the in-app number was the one that looked
 *  authoritative. Collective had been patched around with a one-off beta constant; Business never was,
 *  which is exactly what an ad-hoc patch buys you. `spacePlanPriceCents` resolves through the same beta
 *  window the checkout does, so this rung and the marketing page cannot disagree again. */
function priceLabel(plan: SpacePlan, interval: BillingInterval = 'month'): string {
  const cents = spacePlanPriceCents(plan)
  if (cents <= 0) return 'Free'
  return interval === 'year' ? `${formatCents(yearlyFromMonthly(cents))}/yr` : `${formatCents(cents)}/mo`
}

/** The Founding note for a rung currently charged under its list price, else null. Derived through the
 *  same predicate the checkout bills on (spacePlanPriceCents → foundingOpenForPlan), so a plan that is
 *  not actually discounted can never advertise a discount, and every discounted plan says so rather than
 *  only the one somebody remembered to hand-write a note for. */
function foundingNote(plan: SpacePlan, interval: BillingInterval = 'month'): string | null {
  // Network's Founding offer is a coupon on the first yearly invoice (nine months of the monthly total),
  // not a lower list price, so it cannot come from the list-versus-now comparison below.
  if (plan === 'network') {
    if (interval !== 'year' || !networkFoundingOpen()) return null
    const first = networkFoundingYearCents(NETWORK_PLAN.includedChapters)
    return first === null ? null : `Founding: ${formatCents(first)} for the first year (nine months), then ${formatCents(yearlyFromMonthly(NETWORK_PLAN.monthlyCents))}/yr. Offer ends ${COLLECTIVE_FOUNDING_ENDS_LABEL}.`
  }
  const list = SPACE_PLAN_PRICE_CENTS[plan]?.listCents ?? 0
  const now = spacePlanPriceCents(plan)
  if (list <= now) return null
  return interval === 'year'
    ? `Founding ${formatCents(yearlyFromMonthly(now))}/yr, list ${formatCents(yearlyFromMonthly(list))}/yr. ${FOUNDING_RATE_NOTE}`
    : `Founding ${formatCents(now)}/mo, list ${formatCents(list)}/mo. ${FOUNDING_RATE_NOTE}`
}

/** The plain rows PlanLadderRungs draws: every price and note resolved for BOTH intervals here, on the
 *  server, so the client island never computes a price. PURE given its inputs. */
export function ladderRungs(
  rungs: Rung[],
  currentPlan: SpacePlan,
  sellable: Partial<Record<SpacePlan, boolean>>,
  isFree: boolean,
  hasSlug: boolean,
  unbilledPlan: SpacePlan | null = null,
): LadderRung[] {
  return rungs.map((rung) => {
    const state = rungState(rung.plan, currentPlan, sellable)
    const choosable =
      rung.plan === 'business' || rung.plan === 'collective' || rung.plan === 'network' ? rung.plan : null
    // A paid plan that was set by hand holds no subscription, so its own rung may start one (the only
    // paid case where a Choose is safe: there is no subscription to bill twice).
    const canChoose = hasSlug && !!choosable && !!sellable[choosable] && (isFree || unbilledPlan === rung.plan)
    return {
      plan: rung.plan,
      icon: rung.icon,
      label: SPACE_PLAN_LABEL[rung.plan],
      blurb: rung.blurb,
      price: { month: priceLabel(rung.plan, 'month'), year: priceLabel(rung.plan, 'year') },
      note: {
        month: rung.note ?? foundingNote(rung.plan, 'month'),
        year: rung.note ?? foundingNote(rung.plan, 'year'),
      },
      chip: canChoose ? null : STATE_CHIP[state],
      choose: canChoose ? choosable : null,
      package:
        canChoose && rung.plan === 'network'
          ? { price: `${formatCents(networkPackageYearCents())}/yr`, blurb: `${NETWORK_PLAN.packageChapters} chapters, pay for ${NETWORK_PLAN.packagePaidChapters}. Yearly, with an onboarding session and priority support.` }
          : null,
    }
  })
}

/**
 * The Community Collective ladder for a Space's billing surface. Reads the Space's current plan to mark
 * its rung; a FREE Space gets an inline Choose action on the sellable higher rung (Collective), gated
 * server-side. `sellable` is the resolved per-plan switch map (billingLive AND the per-plan flag);
 * `slug` + `isFree` decide whether to render the action. No charge happens here.
 */
export function PlanLadder({
  currentPlan,
  slug,
  sellable = {},
  isFree = false,
  unbilledPlan = null,
}: {
  currentPlan: SpacePlan
  slug?: string
  sellable?: Partial<Record<SpacePlan, boolean>>
  isFree?: boolean
  /** The Space's paid plan when it was set by hand and no subscription backs it: that rung offers Choose. */
  unbilledPlan?: SpacePlan | null
}) {
  // The Founding note shows exactly while a rung is charged under its list (foundingNote reads the same
  // predicate the checkout bills on, lib/pricing/beta.ts foundingOpenFor), so it clears the instant the
  // checkout starts charging list for that plan, with no clock of its own here.
  // The Independent rung only appears for a Space already ON it, so the ladder can mark its current
  // plan. It is not an upgrade path and carries no Choose action (LIVE-227).
  const rungs = currentPlan === 'independent' ? [...RUNGS, CURRENT_PLAN_ONLY_RUNG] : RUNGS
  return (
    <section aria-labelledby="collective-ladder-heading" className="rounded-card border border-border bg-surface px-5 py-5 lift-1">
      <h2 id="collective-ladder-heading" className="text-body font-bold text-text">
        The Community Collective
      </h2>
      {/* The promise, stated plainly (CONTENT-VOICE §1a, brand promise #1 + #4). No guilt, no hype. */}
      <p className="mt-1 text-body-sm leading-relaxed text-muted">
        Hosting is free, with every tool on launch-sized limits and tips at no platform fee, plus card processing. Selling starts at
        Business. You keep 100% of what you bring in, and we earn only on a customer the network
        introduces, once.
      </p>

      {/* The rows and the Monthly / Yearly switch (LIVE-990). A FREE Space gets a one-click Choose on
          every sellable flat rung: Business, Collective (the Founding intro, OWN-096) and Network
          (SCAN-980). Non Profit routes through verification, not a direct buy; Independent is sold by
          hand and is never offered here (LIVE-227). Only a FREE Space: a paid Space already holds a
          subscription, and a second checkout would bill it twice. */}
      <PlanLadderRungs slug={slug} rungs={ladderRungs(rungs, currentPlan, sellable, isFree, !!slug, unbilledPlan)} />
    </section>
  )
}
