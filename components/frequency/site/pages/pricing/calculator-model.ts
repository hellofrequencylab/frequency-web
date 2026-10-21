// THE PRICING CALCULATOR'S DATA (design handoff "Pricing calculator", 2026-10-21): what the scroll-through
// walks, one step per tier, as plain serializable data for the client island (pricing-calculator.tsx).
//
// 🔴 NOTHING HERE IS TYPED MONEY. Every figure is read off the Offering model (lib/pricing/pricing-grid.ts,
// from the operator-set catalog), the Network figures off NETWORK_PLAN, the Non Profit Collective off the
// catalog. The design's own numbers ($99 beta, Network from $599, 10 chapters) were the old ladder; the
// copy keeps the design's voice and the figures come from here. The words "0%" and "100%" are only ever
// written beside "card processing" (LIVE-913).
import { formatCents } from '@/lib/pricing/display'
import { PLAN_STORY } from '@/lib/pricing/plan-story'
import { NETWORK_PLAN, networkCheckoutOpen } from '@/lib/pricing/plans'
import type { Offering, PricingGridInput } from '@/lib/pricing/pricing-grid'
import { yearlyFromMonthly } from '@/lib/billing/pricing-keys'
import { BETA_CTA_HREF } from '@/lib/site'
import { splitPrice } from './split-price'

export const CALC_STEP_IDS = ['visitor', 'member', 'crew', 'free', 'business', 'collective', 'network'] as const
export type CalcStepId = (typeof CALC_STEP_IDS)[number]

/** A price in the figure's type: a lead word ("from"), the figure, its unit, and a struck list price. */
export interface CalcPrice {
  pre: string
  amount: string
  per: string
  was: string
}

export interface CalcStep {
  id: CalcStepId
  tier: string
  /** The Non Profit name of this step ("Non Profit Collective"), or null where Non Profit does not apply. */
  npTier: string | null
  /** The rail's one-line hint. */
  sub: string
  idea: string
  line: string
  who: string[]
  badge: string | null
  price: { month: CalcPrice; year: CalcPrice; npMonth: CalcPrice | null; npYear: CalcPrice | null }
  ctaLabel: string
  pitch: string
  note: string
  /** Where a person step's button goes. Null on a Space step, which hands off to Create a Space. */
  href: string | null
  /** The `?plan=` a Space step hands over, and the one a Non Profit pick hands over. */
  plan: string | null
  npPlan: string | null
  recommended: boolean
}

export interface CalcModel {
  steps: CalcStep[]
  yearlyNote: string
}

const free = (per: string): CalcPrice => ({ pre: '', amount: 'Free', per, was: '' })

/** An Offering's display label ("$49/mo", "from $4.99/mo") as a figure, never re-priced. */
function fromLabel(label: string, perSuffix = '', was = ''): CalcPrice {
  const { lead, amount, per } = splitPrice(label)
  return { pre: lead ? `${lead} ` : '', amount, per: `${per ?? ''}${perSuffix}`, was }
}

function byId(list: readonly Offering[], id: string): Offering {
  const found = list.find((o) => o.id === id)
  if (!found) throw new Error(`pricing calculator: no ${id} offering`)
  return found
}

/** The Network's price as the real minimum, never the bare base: "from $476 /mo, 3 chapters, then $59 each". */
function networkPrice(period: 'month' | 'year', nonprofit: boolean): CalcPrice {
  const monthly = nonprofit ? NETWORK_PLAN.nonprofitMonthlyCents : NETWORK_PLAN.monthlyCents
  const chapter = nonprofit ? NETWORK_PLAN.nonprofitChapterCents : NETWORK_PLAN.chapterCents
  const unit = period === 'year' ? '/yr' : '/mo'
  const scale = (c: number) => (period === 'year' ? yearlyFromMonthly(c) : c)
  return { pre: 'from ', amount: formatCents(scale(monthly)), per: `${unit}, ${NETWORK_PLAN.includedChapters} chapters, then ${formatCents(scale(chapter))} each`, was: '' }
}

/** Build the seven steps from the models the page already holds. PURE. */
export function calculatorModel(
  members: readonly Offering[],
  spaces: readonly Offering[],
  catalog: PricingGridInput['catalog'],
  yearlyNote: string,
): CalcModel {
  const crew = byId(members, 'crew')
  const business = byId(spaces, 'business')
  const collective = byId(spaces, 'collective')
  const nonprofit = byId(spaces, 'nonprofit')
  const network = byId(spaces, 'network')
  const npCollective = catalog.nonprofit_collective?.month
  const collectiveList = catalog.collective_base?.month.listCents ?? 0
  const trial = business.trial ?? ''

  const steps: CalcStep[] = [
    {
      id: 'visitor',
      tier: 'Visitor',
      npTier: null,
      sub: 'look around',
      idea: 'You, looking in.',
      line: 'Somewhere near you, people are already gathering. Circles and Events sit around you, waiting.',
      who: ['New in town', 'Just curious', 'Invited by a friend'],
      badge: null,
      price: { month: free('to look'), year: free('to look'), npMonth: null, npYear: null },
      ctaLabel: 'Look around',
      pitch: 'See what is happening near you this week.',
      note: 'Free to look around. No account needed.',
      href: '/discover',
      plan: null,
      npPlan: null,
      recommended: false,
    },
    {
      id: 'member',
      tier: 'Member',
      npTier: null,
      sub: 'free',
      idea: 'You show up.',
      line: 'Join Circles and Events near you, and keep coming back. The people become yours.',
      who: ['Regulars', 'Newcomers', 'Anyone who shows up'],
      badge: 'Free, forever',
      price: { month: free('forever'), year: free('forever'), npMonth: null, npYear: null },
      ctaLabel: 'Join free',
      pitch: 'Find your people, then keep showing up.',
      note: 'Free forever. No card. Circles and Events near you, in one place.',
      href: BETA_CTA_HREF,
      plan: null,
      npPlan: null,
      recommended: false,
    },
    {
      id: 'crew',
      tier: 'Crew',
      npTier: null,
      sub: crew.monthly.replace(/\/mo$/, ''),
      idea: 'You back the movement.',
      line: 'Crew funds the network that keeps Circles free for everyone. You choose what you give. Every amount gets the same Crew: more Circles, Events and a monthly Boost to host with.',
      who: ['Regulars who want more of it', 'Supporters', 'Future hosts'],
      badge: 'Every Crew keeps Circles free',
      price: {
        month: fromLabel(crew.monthly),
        year: fromLabel(crew.yearly ?? crew.monthly),
        npMonth: null,
        npYear: null,
      },
      ctaLabel: 'Join Crew',
      pitch: 'Keep Circles free for everyone.',
      note: `You choose the amount, ${crew.monthly.replace(/\/mo$/, '')} and up. Every amount gets the same Crew.`,
      href: crew.cta.href,
      plan: null,
      npPlan: null,
      recommended: false,
    },
    {
      id: 'free',
      tier: 'Free Space',
      npTier: null,
      sub: 'free',
      idea: 'You give it a home.',
      line: 'Your group gets a page, its own Circles and Events, and a way to stay in touch. Tips are open, with no platform fee beyond card processing.',
      who: ['Community groups', 'Clubs', 'New studios'],
      badge: 'Free until you charge',
      price: { month: free('until you charge'), year: free('until you charge'), npMonth: null, npYear: null },
      ctaLabel: 'Start',
      pitch: 'Give your group a home that costs nothing.',
      note: 'No card, no clock. Upgrade only when you start charging.',
      href: null,
      plan: 'free',
      npPlan: null,
      recommended: false,
    },
    {
      id: 'business',
      tier: 'Business',
      npTier: 'Non Profit',
      sub: business.monthly.replace(/\/mo$/, ''),
      idea: 'It pays for itself.',
      line: 'Tickets, memberships and a shop keep the lights on. Your regulars never cost you a platform fee.',
      who: ['Studios', 'Venues', 'Teachers and coaches'],
      badge: `0% on your regulars, ${PLAN_STORY.plusProcessing}`,
      price: {
        month: fromLabel(business.monthly),
        year: fromLabel(business.yearly ?? business.monthly),
        npMonth: fromLabel(nonprofit.monthly),
        npYear: fromLabel(nonprofit.yearly ?? nonprofit.monthly),
      },
      ctaLabel: 'Start free trial',
      pitch: 'Sell tickets and memberships. Your regulars never cost you a platform fee.',
      note: `${trial} ${business.takeRate}.`.trim(),
      href: null,
      plan: 'business',
      npPlan: 'nonprofit',
      recommended: false,
    },
    {
      id: 'collective',
      tier: 'Collective',
      npTier: 'Non Profit Collective',
      sub: `${collective.monthly.replace(/\/mo$/, '')}${collective.listAnchor ? ' Founding' : ''}`,
      idea: 'You grow together.',
      line: 'Partner with other groups. Share a calendar, cross-list each other, and keep your own people.',
      who: ['Co-ops', 'Shared venues', 'Partner studios'],
      badge: 'Keep your own people',
      price: {
        month: fromLabel(collective.monthly, '', collective.listAnchor ? `${collective.listAnchor}/mo` : ''),
        year: fromLabel(
          collective.yearly ?? collective.monthly,
          '',
          collective.listAnchor && collectiveList > 0 ? `${formatCents(yearlyFromMonthly(collectiveList))}/yr` : '',
        ),
        npMonth: npCollective ? fromLabel(`${formatCents(npCollective.foundingCents)}/mo`) : null,
        npYear: npCollective ? fromLabel(`${formatCents(yearlyFromMonthly(npCollective.foundingCents))}/yr`) : null,
      },
      ctaLabel: 'Start free trial',
      pitch: 'Partner up without giving up your people.',
      note: `${trial} ${collective.betaNote ?? collective.takeRate}`.trim(),
      href: null,
      plan: 'collective',
      npPlan: 'collective',
      recommended: true,
    },
    {
      id: 'network',
      tier: 'Network',
      npTier: 'Non Profit Network',
      sub: network.monthly.replace(/\/mo$/, ''),
      idea: 'One thing, in many places.',
      line: 'Every chapter runs as one organization, with one membership that works everywhere and a chapter leader for each.',
      who: ['Multi-site studios', 'Franchises', 'National nonprofits'],
      badge: `${NETWORK_PLAN.includedChapters} chapters at the least`,
      price: {
        month: networkPrice('month', false),
        year: networkPrice('year', false),
        npMonth: networkPrice('month', true),
        npYear: networkPrice('year', true),
      },
      ctaLabel: networkCheckoutOpen() ? 'Start a Network' : network.cta.label,
      pitch: 'Run every chapter as one organization.',
      note: `${NETWORK_PLAN.includedChapters} chapters at the least, up to ${NETWORK_PLAN.maxChapters}. ${trial} One membership everywhere.`.replace(/\s+/g, ' ').trim(),
      href: networkCheckoutOpen() ? null : network.cta.href,
      plan: networkCheckoutOpen() ? 'network' : null,
      npPlan: networkCheckoutOpen() ? 'network' : null,
      recommended: false,
    },
  ]
  return { steps, yearlyNote }
}

/** Create a Space's goals, from the calculator's "what happens" picks. Several picks can mean one goal. */
export const CALC_WHAT_TO_INTENT: Record<string, string> = {
  Classes: 'classes',
  Circles: 'community',
  Events: 'events',
  Workshops: 'programs',
  Retreats: 'events',
}

/** The `?intents=` value for a set of picks: the wizard's goal ids, deduped, in pick order. PURE. */
export function intentsForPicks(picks: readonly string[]): string {
  return [...new Set(picks.map((p) => CALC_WHAT_TO_INTENT[p]).filter((x): x is string => Boolean(x)))].join(',')
}
