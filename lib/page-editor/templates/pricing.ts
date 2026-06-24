import type { Data } from '@measured/puck'

// Pricing, authored as a NORMAL pricing page (not a seed/beta/founder campaign).
// Member is the featured (free, forever) card. Every section is listed AND detailed:
// Membership (people), For Spaces (practitioners/businesses/orgs), and Add-ons.
// Anything not yet purchasable is shown in full with a "Coming soon" (or "Invite only")
// badge and a disabled, non-clickable CTA. Prices are the GA defaults from
// lib/pricing/settings.ts (PRICING_DEFAULTS). Billing is gated OFF by the `billing_live`
// master flag, so nothing charges today; the page is honest about that without countdowns
// or fake scarcity. Built from the standardized block library ("editor = live", ADR-055):
// three Tiers blocks, a "what membership funds" section (Heading + FeatureGrid + Statement),
// a risk-reversal strip, a roles-are-earned note, and an Accordion FAQ. No em/en dashes.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'pr-hero', variant: 'image',
        eyebrow: 'Pricing',
        title: 'Start free. Stay as long as you like.', titleAccent: 'free',
        subtitle: 'Being a Member is free, forever. Browse Circles and Events, show up, earn Zaps, and meet Vera. Paid plans add more when you want them, and what you pay keeps the room open for the next person.',
        image: '/images/site/lab-lounge.jpg', focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: 'Start free', ctaPrimaryHref: '/sign-in',
        ctaSecondaryLabel: '', ctaSecondaryHref: '', note: 'No card today. Leave anytime.',
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
        kicker: 'Free to join. Upgrade when you want more, or give more when you can.',
        items: [
          {
            name: 'Member', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
            tagline: 'The free tier. Show up and see what is here.',
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
            tagline: 'The full community and the full game.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Member' },
              { text: 'Full community access' },
              { text: 'Full game: Gems and Vault cash-in' },
              { text: 'Vera, unlimited' },
              { text: 'The leaderboard' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Supporter', price: '$24', strikePrice: '', cadence: '/mo',
            priceNote: 'Or $240 a year.',
            tagline: 'Everything in Crew, plus you hold the door.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Crew' },
              { text: 'Fund a member who cannot pay yet' },
              { text: 'Keep the room open for the next person' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Crew and Supporter show their real prices so you know what they will cost. Nothing charges today.',
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
        kicker: 'Run your community as a Space. Start free, grow when you are ready.',
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
            name: 'Practitioner', price: '$19', strikePrice: '', cadence: '/mo',
            priceNote: 'Or $190 a year. 8% on what you sell.',
            tagline: 'For the solo practitioner getting organized.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Free' },
              { text: 'Space CRM' },
              { text: 'Basic automation' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'Business', price: '$49', strikePrice: '', cadence: '/mo',
            priceNote: 'Or $490 a year. 5% on what you sell.',
            tagline: 'For a team running real programming.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Practitioner' },
              { text: 'Email and marketing tools' },
              { text: 'Team roles' },
              { text: 'Multi-pipeline' },
              { text: 'Resonance, read access' },
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
            name: 'Nonprofit', price: '$29', strikePrice: '', cadence: '/mo',
            priceNote: 'Or $290 a year. 5% on what you sell.',
            tagline: 'The Business toolkit for a verified 501(c)(3).',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'The full Business feature set' },
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
            name: 'Organization', price: '$199', strikePrice: '', cadence: '/mo',
            priceNote: '3% on what you sell. Talk to us to set it up.',
            tagline: 'For larger teams that need reporting and AI.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Business' },
              { text: 'Reporting' },
              { text: 'Full Resonance AI' },
              { text: 'Premium support' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
          {
            name: 'White-label', price: '$299', strikePrice: '', cadence: '/mo',
            priceNote: '$1,500 one-time setup. 3% on what you sell.',
            tagline: 'Organization, with your branding on everything.',
            highlight: 'normal', badge: 'comingSoon',
            features: [
              { text: 'Everything in Organization' },
              { text: 'Full Frequency branding removed' },
              { text: 'Lead form to get started' },
            ],
            ctaLabel: 'Coming soon', ctaHref: '', ctaStyle: 'disabled',
          },
        ],
        footnote: 'Space plans are listed at their real prices. Billing is not turned on yet, so nothing charges today.',
        tone: 'canvas', width: 'wide', align: 'left', layout: { spaceTop: 'sm', spaceBottom: 'default', visibility: 'all' },
      },
    },

    // ── Section 3: Add-ons (Space owner tools, display-only) ─────────────────────
    {
      type: 'Tiers',
      props: {
        id: 'pr-addons',
        eyebrow: 'Add-ons',
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
        kicker: 'Access, not extraction. Real rooms cost real money to keep open.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: { spaceTop: 'default', spaceBottom: 'none', visibility: 'all' },
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'pr-funds-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Sun', image: '', title: 'The room’s lights', body: 'Power, heat, and water for the spaces where Circles meet.', href: '' },
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
          { q: 'What is the difference between Member, Crew, and Supporter?', a: 'Member is the free tier. Crew adds the full community and the full game, with Gems, Vault cash-in, unlimited Vera, and the leaderboard, for $9 a month or $90 a year. Supporter adds everything in Crew plus funding a member who cannot pay yet, for $24 a month or $240 a year.' },
          { q: 'What about refunds?', a: 'There is nothing to refund today, since nothing is charged. When paid plans go live, we will publish clear billing and refund terms before you ever enter a card, and you can cancel at any time.' },
          { q: 'Can I buy my way into a Host or Guide role?', a: 'No, and that is on purpose. Host, Guide, and Mentor are earned by showing up and looking after the people around you. Those roles come from the community, never from a checkout page.' },
          { q: 'Where does the money go?', a: 'Into keeping the room open. A membership sustains the physical spaces, the lights, the insurance, the thermal circuit, and the community that gathers in them. People who pay more cover neighbors who cannot pay yet.' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },

    {
      type: 'CallToAction',
      props: {
        id: 'pr-cta', eyebrow: '', heading: 'Pull up a chair.', headingAccent: '',
        body: 'Being a Member is free. No card today, leave anytime. Find your people and help keep the room open.',
        ctaPrimaryLabel: 'Start free', ctaPrimaryHref: '/sign-in', ctaSecondaryLabel: 'Browse Discover', ctaSecondaryHref: '/discover',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
