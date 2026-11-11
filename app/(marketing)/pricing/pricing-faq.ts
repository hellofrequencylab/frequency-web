// The /pricing FAQ and the one fee helper it shares with the fee ladder. Split out of page.tsx so the
// page reads as its sections; every answer is still built from the live model, so no answer can quote a
// stale price (the reasoning lives on `pricingFaq` below).
import { annualDiscountNote, formatBps, formatCents, trialNote } from '@/lib/pricing/display'
import {
  memberOfferings,
  planExtras,
  spaceOfferings,
  type Offering,
  type PricingGridInput,
} from '@/lib/pricing/pricing-grid'
import { MISSION_FRAMING, PLAN_STORY, paidWalls } from '@/lib/pricing/pricing-page'
import { COLLECTIVE_FOUNDING_ENDS_LABEL } from '@/lib/pricing/beta'
import { BETA_ENDS_DAY_LABEL } from '@/lib/core/launch-dates'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'

/** The seats every plan includes, read off the ONE meter map so the answer can never quote a number the
 *  gate does not use. Seats are included per tier and never sold (ADR-1810). PURE. */
function seatsAnswer(): string {
  const seats = PLACEHOLDER_METER_LIMITS.space_team!
  const n = (tier: string) => String(seats[tier] ?? 0)
  return `Every plan includes its operator seats: ${n('free')} on Free (the owner), ${n('business')} on Business, ${n('collective')} on Collective plus two per member Space, and ${n('network')} on Network, one per central admin.`
}

/** The network fee on an offering that sells, as a bare figure ("5%"), read off the offering's own
 *  number. Never typed. */
export function feeFigure(offering: Offering): string {
  return formatBps(offering.networkRateBps)
}

/** The answer-first FAQ, built from the live model so no answer can quote a stale price. Mirrored into
 *  the FAQPage schema, so the structured data matches the page. The five-tier ladder (ADR-1709): every
 *  plan name and figure reads off the offerings and the catalog, every argument off PLAN_STORY. */
export function pricingFaq(input: PricingGridInput): { q: string; a: string }[] {
  const spaces = spaceOfferings(input)
  const [member, crew] = memberOfferings(input)
  const extras = planExtras(input)
  const ai = extras.find((e) => e.key === 'ai')!
  const ladder = spaces
    .map((s) => `${s.label} is ${s.monthly}: ${s.tagline.toLowerCase()} ${s.forWho}`)
    .join(' ')
  const trial = trialNote(input.values)
  const sellers = spaces.filter((s) => s.sells)
  const fees = sellers.map((s) => `${s.label} ${feeFigure(s)}`).join(', ')
  const collective = spaces.find((s) => s.id === 'collective')
  const extraSpace = input.catalog.collective_space
  const npCollective = input.catalog.nonprofit_collective
  // The walls are READ off the gate map through the operator's overrides (the same merge the grid
  // does), so the plan each one names is the plan the product enforces, never a typed tier name.
  const walls = paidWalls(input.gateOverrides)

  // The beta answer only exists while there IS a beta rate. Once the window closes every plan has one
  // price, the anchors are gone from the model, and an answer about "the rate you keep" would be
  // describing an offer nobody can take (ADR-880). The question drops out with the offer.
  const betaPlans = spaces.filter((s) => s.listAnchor)
  const betaFaq =
    betaPlans.length > 0
      ? [
          {
            q: 'What is the Founding Year offer?',
            a: `Founding Year is a paid first-year offer. It closes ${COLLECTIVE_FOUNDING_ENDS_LABEL}, 2027. Check /pricing for current availability, eligibility and catalog pricing.`,
          },
        ]
      : []

  const collectiveFaq = collective
    ? [
        {
          q: 'What is Collective?',
          // Price and availability read the catalog. Founding Year eligibility and the close date are separate from free Founding Member recognition.
          a: `${PLAN_STORY.collective} It is ${collective.monthly}. A Founding Year is a paid first-year offer that closes ${COLLECTIVE_FOUNDING_ENDS_LABEL}, 2027; check /pricing for current availability, eligibility and terms. Its network fee is ${feeFigure(collective)} on customers the network introduces. On Business and higher, your own audience has no network fee; card processing still applies. Collectives that already run member Spaces keep them${extraSpace ? `, and a member Space past the ones included stays ${formatCents(extraSpace.month.foundingCents)} a month each` : ''}; one organization with chapters takes Network instead.${npCollective ? ` A network of verified nonprofits can take Non Profit Collective at ${formatCents(npCollective.month.foundingCents)} a month, with no network fee.` : ''}`,
        },
      ]
    : []

  // Network (SCAN-961): one organization with chapters, self-serve once its Stripe price exists. Every
  // figure reads NETWORK_PLAN through the offering.
  const network = spaces.find((s) => s.id === 'network')
  const networkFaq = network
    ? [
        {
          q: 'Collective or Network: which one is mine?',
          a: `Ask who owns the Spaces. If separate groups own their own Spaces and want to work together, that is Collective: you share a calendar and cross-list each other's Circles and Journeys, and each group keeps its own members and payouts. If one organization runs many chapters, that is Network: ${network.forWho} Network is ${network.monthly}. ${network.billing} Its network fee is ${feeFigure(network)}. To set one up, talk to us from the Networks page.`,
        },
      ]
    : []

  return [
    {
      q: 'How does Frequency pricing work?',
      a: `${PLAN_STORY.lines} ${PLAN_STORY.ladder} ${PLAN_STORY.paid} For you: ${member!.label} is free to join, and ${crew!.label} is ${crew!.monthly}, contribute what you want. For your Space: ${ladder} ${annualDiscountNote(input.values)}`,
    },
    {
      q: 'Do I need Crew to open a Space?',
      a: `No. Crew is a personal membership, and a Space is separate. Hosting a Space is free. The beta runs through ${BETA_ENDS_DAY_LABEL}, 2027. Check /pricing for current tools, limits and selling fees. Founding Member recognition is free; Founding Year is a separate paid first-year offer.`,
    },
    {
      q: 'How do selling fees work?',
      a: `Selling options and fees depend on your Space plan and the transaction. Business and higher plans have no network fee on sales to their own audience; card processing still applies. The pricing page shows current details and available features.`,
    },
    {
      q: 'What actually needs a paid plan?',
      a: walls.length > 0
        ? `A short list, and we name it plainly. ${walls
            .map((w) => `${w.what.charAt(0).toUpperCase()}${w.what.slice(1)}: ${w.plan}, because ${w.why}.`)
            .join(' ')} ${PLAN_STORY.meters}`
        : `${PLAN_STORY.selling} ${PLAN_STORY.meters}`,
    },
    {
      q: 'What is free?',
      a: 'Joining Frequency and hosting a Space are free. Tips have no platform fee on any plan, though card processing still applies. Selling fees, tools and limits depend on plan; check /pricing for current details.',
    },
    ...betaFaq,
    {
      q: 'Do you take a cut of my sales?',
      a: `Fees depend on your Space plan and the transaction. Business and higher plans have no network fee on sales to their own audience; card processing still applies. See /pricing for current rates.${fees ? ` Current selling-plan rates: ${fees}.` : ''}`,
    },
    ...collectiveFaq,
    ...networkFaq,
    {
      q: 'What does Crew get me?',
      a: `${PLAN_STORY.crew} ${crew!.label} is ${crew!.monthly}, and it lives on your personal upgrade page. Crew is separate from Space selling. Selling options and fees depend on the Space plan; see /pricing for current details.`,
    },
    {
      q: 'How do team seats work?',
      a: `${seatsAnswer()} Seats are never sold separately, and the plan price never multiplies by headcount.`,
    },
    {
      q: 'What is the Vera AI add-on?',
      a: `${ai.detail} ${ai.availability} It is ${ai.price}${trial ? `, with a ${trial.toLowerCase().replace(/\.$/, '')}` : ''}.${collective && network ? ' Collective and Network include it.' : collective ? ' Collective includes it.' : ''}`,
    },
    {
      q: 'Is there a free trial?',
      a: trial
        ? `${trial} on every paid Space plan, card upfront, cancel before it ends and you are not billed. Members need no trial: the free tier is the trial, for as long as you want it.`
        : 'A free Space and a free membership are open-ended, so the free tier is the trial for as long as you want it.',
    },
    {
      q: 'What does yearly billing save?',
      a: `${annualDiscountNote(input.values)} Check /pricing for current monthly and yearly prices and offer terms.`,
    },
    {
      q: 'What happens if I downgrade?',
      a: 'Nothing disappears. Your contacts, posts, events, and history stay visible and stay yours, and you go back to the free limits. Your selling options change to those available on the free Space plan; see /pricing for current details. Tips keep working. You can export your contacts and your data before, during, or after, anytime.',
    },
    {
      q: 'Can I leave and take my people with me?',
      a: 'Yes. Month to month, and your people are yours. You can export your contacts and your data any time. We earn your stay, we do not trap it.',
    },
    {
      q: 'Where does the money go?',
      a: MISSION_FRAMING,
    },
  ]
}
