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
  const seats = extras.find((e) => e.key === 'seats')!
  const ladder = spaces
    .map((s) => `${s.label} is ${s.monthly}${s.listAnchor ? ` at the beta rate, under ${s.listAnchor}` : ''}: ${s.tagline.toLowerCase()} ${s.forWho}`)
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
            q: 'What is the beta rate, and do I keep it?',
            a: `Some plans are sold at a beta rate below their list price: ${betaPlans
              .map((s) => `${s.label} at ${s.monthly} under ${s.listAnchor}`)
              .join(' and ')}. If you subscribe on that rate you keep it for as long as you keep the plan. The other plans have one price, and we do not cross out a number we never charged.`,
          },
        ]
      : []

  const collectiveFaq = collective
    ? [
        {
          q: 'What is Collective?',
          a: `${PLAN_STORY.collective} It is ${collective.monthly}${extraSpace ? `, and a member Space past the ones included is ${formatCents(extraSpace.month.foundingCents)} a month each` : ''}. Its network fee is ${feeFigure(collective)}, charged the same way as Business: once, on a customer the network introduced.${npCollective ? ` A network of verified nonprofits can take Non Profit Collective at ${formatCents(npCollective.month.foundingCents)} a month, with no network fee.` : ''}`,
        },
      ]
    : []

  // Network (SCAN-961): one organization with chapters, quoted until its Stripe price exists. Every
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
      a: `${PLAN_STORY.lines} ${PLAN_STORY.ladder} ${PLAN_STORY.paid} There are two lines. For you: ${member!.label} is free forever, and ${crew!.label} is ${crew!.monthly}, contribute what you want. For your Space: ${ladder} ${annualDiscountNote(input.values)}`,
    },
    {
      q: 'Can I run a Space for free?',
      a: `Yes, and anyone can. A free Space is a real Space, not a trial: your page, Circles, Events, posts, members, contacts, email, bookings and Journeys, with limits sized for a launch. People can tip you, and we take nothing from tips. When you want to charge for something, that is Business. You do not need Crew to run a Space. No card, no clock.`,
    },
    {
      q: 'Why does selling start at Business?',
      a: `Because free hosting is the point. Opening a Space, gathering your people and running your Circles and Events should never cost anything. ${PLAN_STORY.selling} When you set a price on a free Space, you see what Business adds and can start its trial right there, or keep the thing free. Nothing you built is lost either way.`,
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
      q: 'What stays free forever?',
      a: 'The people part, hosting, and tips. Joining Frequency, belonging to Circles, going to events, following Spaces, and messaging never cost anything, for members or for you. Opening a Space and running it is free. Tips carry no platform fee on any tier, only card processing. A business never pays for access to people.',
    },
    ...betaFaq,
    {
      q: 'Do you take a cut of my sales?',
      a: `Not of your own. You keep 100% of the bookings and sales you bring in yourself, ${PLAN_STORY.afterProcessing}, and we never take a share of a tip. ${PLAN_STORY.rate}${fees ? ` Where each selling plan lands: ${fees}.` : ''} Once a buyer is yours, meaning they follow you, they are one of your members, they are in your contacts, or they have bought before, we take nothing on them again. We charge once for the introduction.`,
    },
    ...collectiveFaq,
    ...networkFaq,
    {
      q: 'What does Crew get me?',
      a: `${PLAN_STORY.crew} ${crew!.label} is ${crew!.monthly}, and it lives on your personal upgrade page. Crew does not take payments: selling runs through a Space on Business, which any member can open.`,
    },
    {
      q: 'How do team seats work?',
      a: `Your own seat is included on every plan. ${seats.availability} ${seats.detail} ${seats.price === 'Owner-priced today' ? 'Seats are owner-priced today, so you bring on the people you need without a locked public per-seat price.' : `Extra seats are ${seats.price}.`}`,
    },
    {
      q: 'What is the Vera AI add-on?',
      a: `${ai.detail} ${ai.availability} It is ${ai.price}${trial ? `, with a ${trial.toLowerCase().replace(/\.$/, '')}` : ''}.${collective ? ' Collective includes it.' : ''}`,
    },
    {
      q: 'Is there a free trial?',
      a: trial
        ? `${trial} on every paid Space plan, card upfront, cancel before it ends and you are not billed. Members need no trial: the free tier is the trial, for as long as you want it.`
        : 'A free Space and a free membership are open-ended, so the free tier is the trial for as long as you want it.',
    },
    {
      q: 'What does yearly billing save?',
      a: `${annualDiscountNote(input.values)} You pay for ten months and get twelve. Monthly is the low-friction default; yearly is the way to save on any plan.`,
    },
    {
      q: 'What happens if I downgrade?',
      a: 'Nothing disappears. Your contacts, posts, events, and history stay visible and stay yours, and you go back to the free limits. What stops is selling: new paid tickets, memberships and orders need Business again, and tips keep working. You can export your contacts and your data before, during, or after, anytime.',
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
