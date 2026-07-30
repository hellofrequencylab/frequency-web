import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'
import { priceStrings, pricingCatalog, CREW_NOTE, MISSION_FRAMING } from '@/lib/pricing/pricing-page'
import { formatLoadoutCents } from '@/lib/pricing/loadout'
import { NETWORK_TAKE_RATE_DEFAULT } from '@/lib/billing/pricing-keys'

// Every dollar figure in this template interpolates from the ONE code catalog (priceStrings /
// pricingCatalog) and the CREW_NOTE labels, so the CMS fallback can never drift from /pricing.
const P = priceStrings()

// 🔴 RATES ARE DERIVED, NEVER TYPED (ADR-914). Every take-rate below reads the same vector the
// charging path applies (lib/billing/fees.ts), so a rate this template publishes is the rate a seller
// is actually charged. It used to type them as prose, which is how a CMS document ships a fee ladder
// the product stopped using: the free-Member rung did not exist here at all, and the free-Space rung
// was written into one FAQ answer and nowhere else.
const R = (bps: number) => `${bps / 100}%`
const RATE = {
  memberFree: R(NETWORK_TAKE_RATE_DEFAULT.memberFree),
  member: R(NETWORK_TAKE_RATE_DEFAULT.member),
  free: R(NETWORK_TAKE_RATE_DEFAULT.free),
  business: R(NETWORK_TAKE_RATE_DEFAULT.business),
  collective: R(NETWORK_TAKE_RATE_DEFAULT.collective),
  nonprofit: R(NETWORK_TAKE_RATE_DEFAULT.nonprofit),
}
const CAT = pricingCatalog()
const BUSINESS_YEAR_BETA = formatLoadoutCents(CAT.business_base.year.foundingCents)
const COLLECTIVE_YEAR_BETA = formatLoadoutCents(CAT.collective_base.year.foundingCents)
const NONPROFIT_YEAR = formatLoadoutCents(CAT.nonprofit_seat.year.foundingCents)

// ─────────────────────────────────────────────────────────────────────────────
// PRICING — the honest, warm version. Copies THE COMMUNITY's shape and rhythm.
//
// The one idea (docs/VALUE-LADDER.md): never gate the transaction, gate the repeat.
// Selling is free on every rung, and your own people are always free. Paying buys a
// lower rate on the sales the network introduces, plus the tools that build the list
// which takes that rate to zero. It never buys features you cannot otherwise reach,
// and it never buys a place at the front. Member is free, forever, and featured.
// Crew is the paid member tier (docs/NAMING.md: "Crew = paid"). Prices below are the
// GA defaults (lib/pricing/settings.ts, PRICING_DEFAULTS) and are NOT to be edited.
//
// HOW TO READ THIS FILE (the contract, same as the-community.ts):
//  • One `const L` layout literal, reused on every block so the spacing rhythm is
//    consistent. Override per-block only with intent.
//  • Honest numbers, one source: every dollar figure interpolates from the code catalog
//    (priceStrings / pricingCatalog above), so this template can never drift from /pricing.
//    Nothing here charges (PLACEHOLDER_PRICING is on; CTAs are plain links). The ladder is
//    the founder's ladder (ADR-878): Member free and Crew on the personal side, then Free
//    Space, Business, Collective, Non Profit. Independent and Partner are not listed (not sold
//    from this page). No countdowns, no fake scarcity.
//  • Tone beat alternates (surface → canvas → surface …) with a `Statement`
//    interstitial and exactly ONE dark (`ink`) beat at the close.
//  • Compose ONLY from registered blocks (lib/page-editor/config.tsx). Canon terms
//    render verbatim (Member, Crew, Circle, Zaps, Gems, Vault, Vera). No em dashes.
//    Sentence-case headings. Contractions always. Never narrate the reader's feelings.
//  • CTA SYSTEM: the primary action is the shared BETA_CTA (label/href from
//    @/lib/site), with ONE quiet secondary text link beside it. The free Member tier
//    cards keep their own "Start free" entry into the game; the page-level asks (hero
//    and the ink close) carry the shared beta CTA so Pricing speaks the same language
//    as the rest of the site.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    // ── Hero ── the one idea: being a Member is free, and paying keeps the room
    // open for the next person. Shared beta CTA primary, quiet member link beside
    // it. The note carries honest billing status, not urgency. ───────────────────
    {
      type: 'Hero',
      props: {
        id: 'pr-hero', variant: 'image',
        eyebrow: 'Pricing',
        title: 'Your own people are always free.', titleAccent: 'always free',
        subtitle: "Being a Member is free, forever, and so is selling. Browse Circles and Events, show up, earn Zaps, meet Vera, and run a ticketed event and get paid on day one. A business never pays for access to people either. What a paid plan buys is a lower rate on the sales the network introduces, and your own people are always free.",
        image: '/images/site/lab-lounge.jpg', focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: BETA_CTA_LABEL, ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL, ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        note: 'No card today. Leave anytime.',
        tone: 'surface', width: 'default', align: 'center', layout: L,
      },
    },

    // ── Section 1: Membership (Member is featured) ──────────────────────────────
    {
      type: 'Tiers',
      props: {
        id: 'pr-membership',
        eyebrow: 'Membership',
        title: 'For people.', titleAccent: '',
        kicker: 'Free to join, and both rungs sell. Crew takes the rate down and lifts the caps.',
        items: [
          {
            name: 'Member', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
            tagline: 'The free tier. Show up and see who is here.',
            highlight: 'featured', badge: 'none',
            features: [
              { text: 'Browse Circles, Events, and Channels' },
              { text: 'Attend gatherings in person' },
              { text: 'Earn Zaps for real-world activity' },
              { text: 'Vera, your guide, up to 10 messages a day' },
            ],
            ctaLabel: 'Start free', ctaHref: '/sign-in', ctaStyle: 'primary',
          },
          {
            name: 'Crew', price: CREW_NOTE.foundingLabel, strikePrice: '', cadence: '/mo',
            priceNote: `${CREW_NOTE.foundingLabel} a month, or ${CREW_NOTE.yearlyLabel} a year.`,
            tagline: 'The same selling at a lower rate, plus the full game, the Crew badge, and the tools that build your list.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Everything in Member, at a lower network rate' },
              { text: 'Full game: Gems and Vault cash-in' },
              { text: 'Author and share your own Quest' },
              { text: 'Vera, unlimited' },
              { text: 'The leaderboard' },
              { text: 'The Crew badge' },
            ],
            ctaLabel: 'Upgrade', ctaHref: '/upgrade', ctaStyle: 'secondary',
          },
        ],
        footnote: `Crew is one price: ${CREW_NOTE.foundingLabel} a month, or ${CREW_NOTE.yearlyLabel} a year.`,
        tone: 'surface', width: 'wide', align: 'left', layout: L,
      },
    },

    // ── Section 2: For Spaces (practitioners, businesses, orgs) ──────────────────
    // Four plans (Free Space, Business, Collective, Non Profit), so two Tiers blocks
    // (three + one) keep the cards readable. Independent and Partner are not sold here.
    {
      type: 'Tiers',
      props: {
        id: 'pr-spaces-a',
        eyebrow: 'For Spaces',
        title: 'For practitioners and businesses.', titleAccent: '',
        kicker: `Run your community as a Space. You keep 100% of your own bookings, always. The only take-rate is on business the network sends you, and each step up buys it down: Free ${RATE.free}, Business ${RATE.business}, Collective ${RATE.collective}, Non Profit ${RATE.nonprofit}.`,
        items: [
          {
            name: 'Free Space', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
            tagline: 'Put your business on the map. A real Space, free for as long as you want.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Your storefront, page, events, posts, and members' },
              { text: 'Show up in Discover' },
              { text: 'Be a Collaborator on other Spaces’ events' },
            ],
            ctaLabel: 'Start free', ctaHref: '/sign-in', ctaStyle: 'secondary',
          },
          {
            name: 'Business', price: P.businessBeta, strikePrice: P.businessList, cadence: '/mo',
            priceNote: `Opening Beta price through 2026-09-01, then ${P.businessList}. Or ${BUSINESS_YEAR_BETA} a year. 0% on your own bookings, ${RATE.business} only on business the network sends you.`,
            tagline: 'Own your audience.',
            highlight: 'featured', badge: 'none',
            features: [
              { text: 'Everything in Free' },
              { text: 'Unlimited contacts and campaigns at volume' },
              { text: 'The full CRM, email branding, reporting, and exports' },
              { text: 'Bookings, tickets, memberships, and your own website' },
            ],
            ctaLabel: 'Start a Space', ctaHref: '/spaces', ctaStyle: 'primary',
          },
          {
            name: 'Collective', price: P.collectiveBeta, strikePrice: P.collectiveList, cadence: '/mo',
            priceNote: `Opening Beta price through 2026-09-01, then ${P.collectiveList}. Or ${COLLECTIVE_YEAR_BETA} a year. 0% on your own, ${RATE.collective} only on business the network sends you.`,
            tagline: 'Be the venue.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Everything in Business' },
              { text: 'Automations and multiple pipelines' },
              { text: 'Team seats and roles' },
              { text: 'Membership tickets, Collaborator hosting, and shared events' },
            ],
            ctaLabel: 'Start a Space', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
        ],
        footnote: '',
        tone: 'canvas', width: 'wide', align: 'left', layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },
    {
      type: 'Tiers',
      props: {
        id: 'pr-spaces-b',
        eyebrow: '',
        title: '', titleAccent: '',
        kicker: '',
        items: [
          {
            name: 'Non Profit', price: P.nonprofit, strikePrice: '', cadence: '/mo',
            priceNote: `Flat, no beta discount. Or ${NONPROFIT_YEAR} a year. ${RATE.nonprofit} take-rate, always. Verified 501(c)(3).`,
            tagline: 'The full Collective toolkit for a verified 501(c)(3).',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'The full Collective feature set' },
              { text: 'Donations built in' },
              { text: 'For verified 501(c)(3) nonprofits' },
            ],
            ctaLabel: 'Get verified', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
        ],
        footnote: 'Business and Collective hold their Opening Beta price through 2026-09-01, then they revert to list. A plan you start during the beta keeps its rate.',
        tone: 'canvas', width: 'wide', align: 'left', layout: { spaceTop: 'sm', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Section 3a: Plan add-ons (what you add to a paid plan) ────────────────────
    {
      type: 'Tiers',
      props: {
        id: 'pr-plan-addons',
        eyebrow: 'Add to any paid plan',
        title: 'Add-ons for your plan.', titleAccent: '',
        kicker: 'Flat, never a percentage. Add them to any paid Space plan.',
        items: [
          {
            name: 'Vera AI', price: `+${P.veraAi}`, strikePrice: '', cadence: '/mo',
            priceNote: 'A flat add-on on any paid plan.',
            tagline: 'The AI add-on. It turns the community signals into live matches and next-best actions.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Live matches from the community signals' },
              { text: 'Next-best actions for you and your members' },
              { text: 'Works on any paid Space plan' },
            ],
            ctaLabel: 'Add it from your Space billing', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
          {
            name: 'Operator seats', price: 'from $9', strikePrice: '', cadence: '/seat/mo',
            priceNote: 'A placeholder, not yet activated. Your first operator seat is always free.',
            tagline: 'Add operators to help run your Space.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Your owner seat is free' },
              { text: 'Add editors, moderators, and admins' },
              { text: 'Available on any paid Space plan' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Add-ons are flat, never a percentage. Operator seats are a soft placeholder, so their price is not locked in yet.',
        tone: 'surface', width: 'wide', align: 'left', layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },

    // ── Section 3b: Add-ons (Space owner earning tools, display-only) ─────────────
    {
      type: 'Tiers',
      props: {
        id: 'pr-addons',
        eyebrow: 'Ways to earn',
        title: 'Tools for Space owners.', titleAccent: '',
        kicker: 'Ways a Space owner can earn. Each one is set by the owner.',
        items: [
          {
            name: 'Space Memberships', price: 'Owner-set', strikePrice: '', cadence: '',
            priceNote: 'For example, $25 to $100 a month.',
            tagline: 'Paid member tiers a Space owner defines.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Set your own tiers and prices' },
              { text: 'Recurring monthly support from members' },
            ],
            ctaLabel: 'Start a Space', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
          {
            name: 'Bookings', price: 'Owner-set', strikePrice: '', cadence: 'per slot',
            priceNote: 'You set the price for each slot.',
            tagline: 'Paid one-on-one sessions on your calendar.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Sell time on your Space calendar' },
              { text: 'One-on-one sessions, your rate' },
            ],
            ctaLabel: 'Start a Space', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
          {
            name: 'Donations', price: 'Suggested', strikePrice: '', cadence: 'amounts',
            priceNote: 'You set the suggested amounts.',
            tagline: 'Let people chip in to support your Space.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'Suggested amounts you choose' },
              { text: 'Support your Space fund directly' },
            ],
            ctaLabel: 'Start a Space', ctaHref: '/spaces', ctaStyle: 'secondary',
          },
        ],
        footnote: 'Each one is set by the Space owner, from their own settings.',
        tone: 'surface', width: 'wide', align: 'left', layout: L,
      },
    },

    // ── What your membership funds ──────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'pr-funds-h', eyebrow: 'Where it goes',
        title: 'What your membership funds.', titleAccent: '',
        kicker: 'Access, not extraction. A real room costs real money to keep open, so here is where the money goes.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'pr-funds-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Sun', image: '', title: "The room's lights", body: 'Power, heat, and water for the spaces where Circles meet.', href: '' },
          { icon: 'Shield', image: '', title: 'Insurance', body: 'The boring, necessary coverage that lets a real room open its doors.', href: '' },
          { icon: 'Flame', image: '', title: 'The thermal circuit', body: 'The sauna, the cold pool, and the connection bar at The Lab.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: { spaceTop: 'sm', spaceBottom: 'default', visibility: 'all' },
      },
    },
    {
      type: 'Statement',
      props: { id: 'pr-stmt-circulate', text: 'Connection should circulate, not sit behind a velvet rope.', accent: 'circulate', tone: 'surface', layout: L },
    },

    // ── Roles are earned, not bought ────────────────────────────────────────────
    {
      type: 'Heading',
      props: {
        id: 'pr-roles-h', eyebrow: 'A note on roles',
        title: 'Host, Guide, and Mentor are earned, not bought.', titleAccent: '',
        kicker: 'You cannot buy your way to the front of the room.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },
    {
      type: 'Text',
      props: {
        id: 'pr-roles-b',
        body: 'A membership is how you join and access the community. Leadership is something you grow into. Host, Guide, and Mentor come from showing up and looking after the people around you, never from a checkout page.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: { spaceTop: 'sm', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Risk reversal ───────────────────────────────────────────────────────────
    {
      type: 'FeatureGrid',
      props: {
        id: 'pr-assure-grid', eyebrow: 'No catch', title: 'Low risk, by design.', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Shield', image: '', title: 'No card today', body: 'Being a Member is free. We do not ask for a card to join.', href: '' },
          { icon: 'Handshake', image: '', title: 'Leave anytime', body: 'No contracts, no lock-in. Switch plans or step away whenever you like.', href: '' },
          { icon: 'Heart', image: '', title: 'Free stays free', body: 'The free Member tier is here to stay, and it sells. Paid plans only buy the rate down and lift the caps.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },

    // ── FAQ ─────────────────────────────────────────────────────────────────────
    {
      type: 'Accordion',
      props: {
        id: 'pr-faq', eyebrow: 'Straight answers', title: 'Questions, answered plainly.', titleAccent: '',
        items: [
          { q: 'Is being a Member really free?', a: 'Yes. The Member tier is free, forever. You can browse Circles and Events, attend gatherings in person, earn Zaps, and message Vera up to 10 times a day, all without paying.' },
          { q: 'What is the Opening Beta price?', a: `The Opening Beta price is the lower rate every early Space plan holds while we are in beta: Business at ${P.businessBeta} under the ${P.businessList} list, and Collective at ${P.collectiveBeta} under the ${P.collectiveList} list. A plan you start during the beta keeps its rate. Crew is one plain price, ${CREW_NOTE.foundingLabel} a month, with no anchor above it.` },
          { q: 'What is the difference between Member and Crew?', a: `Member is the free tier, forever, and the community itself is never behind it. Both tiers can sell: a free Member can run a ticketed event and get paid. Crew takes the rate on network-sourced sales from ${RATE.memberFree} down to ${RATE.member}, lifts the caps, and adds the full game, with Gems, Vault cash-in, your own Quest to author, unlimited Vera, and the leaderboard, for ${CREW_NOTE.foundingLabel} a month or ${CREW_NOTE.yearlyLabel} a year. Those two are the whole member ladder.` },
          { q: 'What is the Opening Beta price on Space plans?', a: `Business and Collective are open at an Opening Beta price during our beta: Business at ${P.businessBeta} a month under the ${P.businessList} list, and Collective at ${P.collectiveBeta} a month under the ${P.collectiveList} list. Both hold through 2026-09-01, then revert to list. Non Profit (${P.nonprofit}) is flat, with no beta discount.` },
          { q: 'How does the take-rate work?', a: `You keep 100% of the business you bring yourself, always, on every tier. Someone who already follows you, is on your list, or has bought from you before is yours, and Frequency takes nothing on them. There is a rate only on someone the network introduces, and every step up buys it down: a free Member or a free Space is ${RATE.memberFree}, Crew is ${RATE.member}, Business is ${RATE.business}, Collective is ${RATE.collective}, and Non Profit is ${RATE.nonprofit}.` },
          { q: 'What about refunds?', a: 'Every plan is month to month, and you can cancel at any time. Cancel and your plan simply runs out its paid period. No contracts, no lock-in.' },
          { q: 'Can I buy my way into a Host or Guide role?', a: 'No, and that is on purpose. Host, Guide, and Mentor are earned by showing up and looking after the people around you. Those roles come from the community, never from a checkout page.' },
          { q: 'Where does the money go?', a: MISSION_FRAMING },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },

    // ── Close ── the single ink beat. Shared beta CTA, quiet member link beside
    // it. The promise is the whole page in one line: show up free, sell free, and
    // never pay on the people who were already yours. ───────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'pr-cta', eyebrow: '', heading: 'Pull up a chair.', headingAccent: 'chair',
        body: 'Being a Member is free, and it sells from day one. No card today, leave anytime. Find your people, and keep every dollar the ones you brought yourself spend.',
        ctaPrimaryLabel: BETA_CTA_LABEL, ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL, ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
