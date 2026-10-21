// THE ADD-ONS AND EXTRAS LIST on /pricing (owner 2026-10-21: "list the addons and make sure things work
// clearly"). One row per thing a plan can be topped up with, and one row per thing that comes with a plan
// and is never sold on its own, so a reader sees every price the product can charge in one place.
//
// 🔴 NOTHING HERE IS TYPED MONEY. Prices read the operator-set catalog (`input.catalog`), the Network figures
// NETWORK_PLAN and NETWORK_SITE_PLAN, the QR counts PLACEHOLDER_METER_LIMITS, the Crew amounts the Crew
// config. A row whose catalog item is missing is dropped rather than shown with a made-up number.
// PURE: no React, no IO.
import { INCLUDED_MEMBER_SPACES } from '@/lib/collective/member-spaces'
import { PWYW_CONFIG_DEFAULT } from '@/lib/pricing/catalog-config'
import { formatCents } from '@/lib/pricing/display'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { NETWORK_PLAN, NETWORK_SITE_PLAN, networkPackageYearCents } from '@/lib/pricing/plans'
import { planExtras, type PricingGridInput } from '@/lib/pricing/pricing-grid'

export interface AddOnRow {
  key: string
  name: string
  /** The headline price ("$19/mo"), or "Included" for a thing that comes with a plan. */
  price: string
  /** The line under it ("or $190/yr", "per chapter, after the first three"). */
  unit: string
  /** Who can have it. */
  who: string
  /** One plain sentence on what it is. */
  detail: string
}

export interface AddOnGroups {
  /** Things you pay for on top of a plan. */
  paid: AddOnRow[]
  /** Things a plan carries, never sold on their own. */
  included: AddOnRow[]
}

/** The word for how many of something, or "Unlimited". */
const count = (n: number | null | undefined): string => (n == null ? 'Unlimited' : String(n))

export function pricingAddOns(input: PricingGridInput): AddOnGroups {
  const extras = planExtras(input)
  const extra = (key: string) => extras.find((e) => e.key === key)
  const domain = extra('custom_domain')
  const ai = extra('ai')
  const collectiveSpace = input.catalog.collective_space?.month
  const [s1, s2, s3] = NETWORK_SITE_PLAN.tiers
  const qr = PLACEHOLDER_METER_LIMITS.space_qr ?? {}
  const team = PLACEHOLDER_METER_LIMITS.space_team ?? {}
  const crewPresets = PWYW_CONFIG_DEFAULT.presetCents.map((c) => formatCents(c)).join(', ')

  const paid: AddOnRow[] = []
  if (domain) {
    const [monthly, yearly] = domain.price.split(', or ')
    paid.push({
      key: 'custom_domain',
      name: 'Custom domain',
      price: monthly ?? domain.price,
      unit: yearly ? `or ${yearly}` : '',
      who: domain.availability,
      detail: 'Your Space site on your own domain. We show you the records to set, and it connects from your Space.',
    })
  }
  if (ai) {
    const [monthly, yearly] = ai.price.split(', or ')
    paid.push({
      key: 'vera_ai',
      name: 'Vera AI',
      price: monthly ?? ai.price,
      unit: yearly ? `or ${yearly}` : '',
      who: ai.availability,
      detail: "Turns your community's signals into live matches and next best actions. Turn it on or off any time.",
    })
  }
  if (collectiveSpace) {
    paid.push({
      key: 'collective_space',
      name: 'Extra partner Space',
      price: `${formatCents(collectiveSpace.foundingCents)}/mo`,
      unit: `each, after the first ${INCLUDED_MEMBER_SPACES} in a Collective`,
      who: 'Collective',
      detail: 'Add another Space to your Collective hub. Each keeps its own members and payouts.',
    })
  }
  paid.push({
    key: 'network_chapter',
    name: 'Extra Network chapter',
    price: `${formatCents(NETWORK_PLAN.extraChapterCents)}/mo`,
    unit: `each, after the first ${NETWORK_PLAN.includedChapters}. Non Profit ${formatCents(NETWORK_PLAN.nonprofitExtraChapterCents)}`,
    who: `Network, up to ${NETWORK_PLAN.maxChapters} chapters`,
    detail: `Past ${NETWORK_PLAN.maxChapters} chapters, talk to us.`,
  })
  paid.push({
    key: 'network_package',
    name: 'Network yearly package',
    price: `${formatCents(networkPackageYearCents())}/yr`,
    unit: `${NETWORK_PLAN.packageChapters} chapters for the price of ${NETWORK_PLAN.packagePaidChapters}`,
    who: 'Network, paid yearly',
    detail: 'Comes with an onboarding session, priority support and a yearly network health review. It does not stack with the Founding offer.',
  })
  if (s1 && s2 && s3) {
    paid.push({
      key: 'network_sites',
      name: 'Chapter websites',
      price: `${formatCents(s1.cents)}/mo`,
      unit: `a site for sites 1 to ${s1.upTo}, then ${formatCents(s2.cents)} to ${s2.upTo}, then ${formatCents(s3.cents)}`,
      who: 'Network',
      detail: `A website per chapter, on the plan you already pay. Remove the Frequency badge for ${formatCents(NETWORK_SITE_PLAN.badgeRemovalCents)} a site.`,
    })
  }
  paid.push({
    key: 'independent_network',
    name: 'Independent Network',
    price: `from ${formatCents(NETWORK_PLAN.independentYearFromCents)}/yr`,
    unit: `plus ${formatCents(NETWORK_PLAN.independentSetupCents)} once for setup`,
    who: 'A Network that leaves the Frequency network',
    detail: 'Your own audience, no badge, no discovery, no network fee. Set up on a call.',
  })

  const included: AddOnRow[] = [
    {
      key: 'qr',
      name: 'QR codes',
      price: 'Included',
      unit: `Free ${count(qr.free)} managed, Business ${count(qr.business)}, Collective and Non Profit ${count(qr.collective)}`,
      who: 'Every Space',
      detail: 'A free Space gets a downloadable stock code. Each Space in a Collective carries its own set.',
    },
    {
      key: 'boost',
      name: 'Boost',
      price: 'Included',
      unit: 'one a month, with Crew',
      who: 'Crew',
      detail: 'Lift a Circle you love for a week, or mark a Space as Boosted. It is a thanks, never paid placement.',
    },
    {
      key: 'crew',
      name: 'Crew contribution',
      price: `from ${formatCents(PWYW_CONFIG_DEFAULT.minCents)}/mo`,
      unit: `${crewPresets}, or your own amount`,
      who: 'Members',
      detail: 'You choose what you give. Every amount gets the same Crew.',
    },
    {
      key: 'seats',
      name: 'Team seats',
      price: 'Included',
      unit: 'never sold on their own',
      who: 'Every Space plan',
      detail: `Business comes with ${count(team.business)} seats, Collective ${count(team.collective)}, and a Network ${NETWORK_PLAN.centralAdmins} central admins.`,
    },
    {
      key: 'tips',
      name: 'Tips',
      price: 'Included',
      unit: 'open on every plan',
      who: 'Everyone',
      detail: 'No platform fee on a tip, only card processing.',
    },
  ]
  return { paid, included }
}
