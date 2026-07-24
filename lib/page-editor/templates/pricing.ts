import type { Data } from '@/lib/page-editor/types'
import {
  BETA_CTA_LABEL,
  BETA_CTA_HREF,
  BETA_CTA_SECONDARY_LABEL,
  BETA_CTA_SECONDARY_HREF,
} from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// PRICING — the honest, warm version. Copies THE COMMUNITY's shape and rhythm.
//
// The one idea: membership keeps the room open. Paying is how you hold the door
// for the next person (circulation, per The Community), never how you buy features
// or a place at the front. Member is free, forever, and featured.
// Crew is the paid member tier (docs/NAMING.md: "Crew = paid"). Prices below are the
// GA defaults (lib/pricing/settings.ts, PRICING_DEFAULTS) and are NOT to be edited.
//
// HOW TO READ THIS FILE (the contract, same as the-community.ts):
//  • One `const L` layout literal, reused on every block so the spacing rhythm is
//    consistent. Override per-block only with intent.
//  • Honest at day zero: billing is gated OFF by the `billing_live` master flag, so
//    nothing charges today. Plans that are built-but-not-yet-buyable show their REAL
//    price with a "Coming soon" (or "Invite only") badge and a disabled CTA. No
//    countdowns, no fake scarcity.
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
        title: 'Free to show up. Paid to hold the door.', titleAccent: 'hold the door',
        subtitle: "Being a Member is free, forever. Browse Circles and Events, show up, earn Zaps, and meet Vera. When you pay, you're not buying extras. You're keeping the room open for the next person who walks in.",
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
        kicker: 'Free to join. Pay when you want more, or pay so someone else can join too.',
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
            name: 'Crew', price: '$9', strikePrice: '', cadence: '/mo',
            priceNote: 'Or $90 a year. Two months free on annual.',
            tagline: 'The full community and the full game. Author your own Quest. Your dues keep the lights on.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Member' },
              { text: 'Full community access' },
              { text: 'Full game: Gems and Vault cash-in' },
              { text: 'Author and share your own Quest' },
              { text: 'Vera, unlimited' },
              { text: 'The leaderboard' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Crew shows its real price so you know what it will cost. Nothing charges today.',
        tone: 'surface', width: 'wide', align: 'left', layout: L,
      },
    },

    // ── Section 2: For Spaces (practitioners, businesses, orgs) ──────────────────
    // Seven plans, so two Tiers blocks (three + four) keep the cards readable.
    {
      type: 'Tiers',
      props: {
        id: 'pr-spaces-a',
        eyebrow: 'For Spaces',
        title: 'For practitioners and businesses.', titleAccent: '',
        kicker: 'Run your community as a Space. You keep 100% of your own bookings, always. The only take-rate is on business the network sends you, and each step up buys it down: Business 5%, Collective 3%, Non Profit and Independent 0%.',
        items: [
          {
            name: 'Free', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
            tagline: 'A simple front door for your Space.',
            highlight: 'normal', badge: 'none',
            features: [
              { text: 'A basic Space listing' },
              { text: 'Show up in Discover' },
            ],
            ctaLabel: 'Start free', ctaHref: '/sign-in', ctaStyle: 'secondary',
          },
          {
            name: 'Business', price: '$19', strikePrice: '$29', cadence: '/mo',
            priceNote: 'Founder price through 2026-09-01, then $29. Or $190 a year. 0% on your own bookings, 5% only on business the network sends you.',
            tagline: 'Run your practice.',
            highlight: 'featured', badge: 'founder',
            features: [
              { text: 'Everything in Free' },
              { text: 'The full CRM, email, and reporting' },
              { text: 'Bookings, tickets, and memberships' },
              { text: 'Your own website' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Collective', price: '$49', strikePrice: '$79', cadence: '/mo',
            priceNote: 'Founder price through 2026-09-01, then $79. Or $490 a year. 0% on your own, 3% only on business the network sends you.',
            tagline: 'Collaborate and host.',
            highlight: 'normal', badge: 'founder',
            features: [
              { text: 'Everything in Business' },
              { text: 'Automations and multiple pipelines' },
              { text: 'Team roles' },
              { text: 'Host collaborators inside your Space' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
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
            name: 'Non Profit', price: '$39', strikePrice: '', cadence: '/mo',
            priceNote: 'Flat, no founder discount. Or $390 a year. 0% take-rate, always. Verified 501(c)(3).',
            tagline: 'The full Collective toolkit for a verified 501(c)(3).',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'The full Collective feature set' },
              { text: 'Donations built in' },
              { text: 'For verified 501(c)(3) nonprofits' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Partner', price: 'Comped', strikePrice: '', cadence: '+ revenue share',
            priceNote: 'Assigned by our team. This one is not for sale.',
            tagline: 'For partners we build with directly.',
            highlight: 'normal', badge: 'inviteOnly',
            features: [
              { text: 'The full Business feature set' },
              { text: 'Operator-assigned, not sold' },
            ],
            ctaLabel: 'Invite only', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Independent', price: '$249', strikePrice: '', cadence: '/mo',
            priceNote: 'Flat, no founder discount. Or $2,490 a year. Standalone and off the network, so 0% take-rate.',
            tagline: 'Everything in Collective, standalone, with your brand on everything.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Collective' },
              { text: 'Your own brand and custom domain, badge off' },
              { text: 'Standalone and off the network' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Business and Collective show their founder price, locked in through 2026-09-01, then they revert to list. Billing is not turned on yet, so nothing charges today.',
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
            name: 'Resonance Engine', price: '+$20', strikePrice: '', cadence: '/mo',
            priceNote: 'A flat add-on on any paid plan.',
            tagline: 'The AI add-on. It turns the community signals into live matches and next-best actions.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Live matches from the community signals' },
              { text: 'Next-best actions for you and your members' },
              { text: 'Works on any paid Space plan' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
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
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Set your own tiers and prices' },
              { text: 'Recurring monthly support from members' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Bookings', price: 'Owner-set', strikePrice: '', cadence: 'per slot',
            priceNote: 'You set the price for each slot.',
            tagline: 'Paid one-on-one sessions on your calendar.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Sell time on your Space calendar' },
              { text: 'One-on-one sessions, your rate' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Donations', price: 'Suggested', strikePrice: '', cadence: 'amounts',
            priceNote: 'You set the suggested amounts.',
            tagline: 'Let people chip in to support your Space.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Suggested amounts you choose' },
              { text: 'Support your Space fund directly' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Add-ons are shown so you can see what is coming. They are display-only today.',
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
          { icon: 'Heart', image: '', title: 'Free stays free', body: 'The free Member tier is here to stay. Paid plans only add more.', href: '' },
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
          { q: 'What does "Coming soon" mean?', a: 'It means we have built the plan and set its price, but you cannot buy it yet. We show the real numbers so you know what to expect. Nothing charges until we turn billing on and you choose a paid plan.' },
          { q: 'What is the difference between Member and Crew?', a: 'Member is the free tier, forever. Crew adds the full community and the full game, with Gems, Vault cash-in, your own Quest to author, unlimited Vera, and the leaderboard, for $9 a month or $90 a year.' },
          { q: 'What is the founder window on Space plans?', a: 'Business and Collective are open at a founder price during our beta: Business at $19 a month under the $29 list, and Collective at $49 a month under the $79 list. Both hold through 2026-09-01, then revert to list. Non Profit ($39) and Independent ($249) are flat, with no founder discount.' },
          { q: 'How does the take-rate work?', a: 'You keep 100% of your own bookings, always. There is a small take-rate only on business the network sends you, and it shrinks as your plan grows: Business is 5%, Collective is 3%, and Non Profit and Independent are 0%. Independent runs standalone and off the network, so there is no network take-rate at all.' },
          { q: 'What about refunds?', a: 'There is nothing to refund today, since nothing is charged. When paid plans go live, we will publish clear billing and refund terms before you ever enter a card, and you can cancel at any time.' },
          { q: 'Can I buy my way into a Host or Guide role?', a: 'No, and that is on purpose. Host, Guide, and Mentor are earned by showing up and looking after the people around you. Those roles come from the community, never from a checkout page.' },
          { q: 'Where does the money go?', a: 'Into keeping the room open. A membership sustains the physical spaces, the lights, the insurance, the thermal circuit, and the community that gathers in them. People who pay more hold the door for neighbors who cannot pay yet, so connection keeps circulating instead of sitting behind a paywall.' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },

    // ── Close ── the single ink beat. Shared beta CTA, quiet member link beside
    // it. The promise is the whole page in one line: show up free, hold the door
    // when you can. ──────────────────────────────────────────────────────────────
    {
      type: 'CallToAction',
      props: {
        id: 'pr-cta', eyebrow: '', heading: 'Pull up a chair.', headingAccent: 'chair',
        body: 'Being a Member is free. No card today, leave anytime. Find your people, and when you can, hold the door open for the next person.',
        ctaPrimaryLabel: BETA_CTA_LABEL, ctaPrimaryHref: BETA_CTA_HREF,
        ctaSecondaryLabel: BETA_CTA_SECONDARY_LABEL, ctaSecondaryHref: BETA_CTA_SECONDARY_HREF,
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
