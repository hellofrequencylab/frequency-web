import type { Data } from '@measured/puck'

// Pricing, rebuilt from the standardized block library so the editor mirrors the
// live page (ADR-055 / "editor = live"). The three priced membership cards now use
// the new standardized `Tiers` block; the FAQ uses the `Accordion` block. Bespoke
// coded bits approximated: the "free during beta" banner → a Statement; the role
// notes (Host/Guide/Mentor) and the risk-reversal strip → FeatureGrids, with icons
// mapped to the editor's curated 16-icon set. Review on the preview before publish.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'pr-hero', variant: 'image',
        eyebrow: 'Membership',
        title: 'Membership that keeps the room open.', titleAccent: '',
        subtitle: 'Frequency runs on circulation, not exclusion. Your membership sustains the spaces and the people in them, so connection stays within reach for the next person who walks in.',
        image: '/images/site/lab-lounge.jpg', focal: 'center',
        minHeight: 'screen',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta',
        ctaSecondaryLabel: '', ctaSecondaryHref: '', note: '',
        tone: 'surface', width: 'default', align: 'center', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'pr-stmt-beta', text: 'Free during beta. No card required, and your Founder pricing locks in for launch.', accent: 'No card required', tone: 'surface', layout: L },
    },
    {
      type: 'Tiers',
      props: {
        id: 'pr-tiers',
        eyebrow: 'Choose how you belong',
        title: 'One community. Three ways in.', titleAccent: '',
        kicker: 'Start free. Upgrade when you’re ready. Give more when you can.',
        items: [
          {
            name: 'Member', price: 'Free', strikePrice: '', cadence: 'forever', priceNote: '',
            tagline: 'For the curious. Come see what’s here.', highlight: 'normal', badge: 'none',
            features: [
              { text: 'Browse circles, events, and topics near you' },
              { text: 'Discover the people and practices around you' },
              { text: 'Attend open gatherings and community events' },
              { text: 'A profile in the founding community' },
            ],
            ctaLabel: 'Start free', ctaHref: '/sign-in', ctaStyle: 'secondary',
          },
          {
            name: 'Crew', price: 'Free', strikePrice: '$10', cadence: 'during beta',
            priceNote: '$10/mo when paid memberships launch',
            tagline: 'Full access. The whole room is yours.', highlight: 'featured', badge: 'founder',
            features: [
              { text: 'Full community feed access' },
              { text: 'Join and participate in circles' },
              { text: 'Create and RSVP to events' },
              { text: 'Access all channels' },
              { text: 'Earn Zaps and climb the leaderboard' },
              { text: 'Track your crew progress' },
            ],
            ctaLabel: 'Join the Beta', ctaHref: '/beta', ctaStyle: 'primary',
          },
          {
            name: 'Pay it forward', price: '$25+', strikePrice: '', cadence: '/mo',
            priceNote: 'When paid memberships launch',
            tagline: 'The heart of the model. Hold the door for a neighbor.', highlight: 'normal', badge: 'none',
            features: [
              { text: 'Everything in Crew, full access' },
              { text: 'Fund a membership for someone who can’t pay yet' },
              { text: 'Help sustain the physical spaces directly' },
              { text: 'Keep the room open for the next person' },
            ],
            ctaLabel: 'Join the Beta', ctaHref: '/beta', ctaStyle: 'secondary',
          },
        ],
        footnote: 'Prices show what membership will cost when paid memberships launch. Right now, during beta, every feature is unlocked for everyone and no card is required.',
        tone: 'surface', width: 'wide', align: 'left', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'pr-roles-h', eyebrow: 'A note on status',
        title: 'Host, Guide, and Mentor are earned, not bought.', titleAccent: '',
        kicker: 'You can’t buy your way to the front of the room.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'pr-roles-grid', eyebrow: '', title: '', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Users', image: '', title: 'Host', body: 'Open your home or a space and gather people. Hosts hold the room.', href: '' },
          { icon: 'Compass', image: '', title: 'Guide', body: 'Steady a circle over time. Guides rise from showing up, again and again.', href: '' },
          { icon: 'Star', image: '', title: 'Mentor', body: 'Grow other leaders. Mentors are recognized by the community, never appointed by a checkout page.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'pr-roles-b',
        body: 'Membership is how you fund and access the community. Leadership is something you grow into. Frequency is leaderful by design: those roles come from the people, not from a price tag.',
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'pr-stmt-circulate', text: 'Connection should circulate, not be locked behind a velvet rope.', accent: 'circulate', tone: 'surface', layout: L },
    },
    {
      type: 'MediaText',
      props: {
        id: 'pr-where', image: '/images/site/lab-lounge.jpg',
        alt: 'The connection bar inside The Lab, warm and low-lit',
        eyebrow: 'Where it goes', title: 'Your membership keeps the lights on.', titleAccent: '', kicker: '',
        body: 'Frequency is more than an app. It’s a physical home: movement studios, a thermal circuit, a connection bar, a floor for gatherings. Real rooms cost real money to keep open.\n\nMembership goes straight into sustaining those spaces and the community that fills them. When you can pay a little more, you cover a neighbor who can’t pay yet. That’s the whole idea: **circulation, not exclusion.**',
        side: 'left', imgAspect: 'landscape', focal: 'center', ctaLabel: '', ctaHref: '',
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'pr-assure-grid', eyebrow: 'No catch', title: 'Low risk, by design.', titleAccent: '', style: 'icon', columns: '3',
        items: [
          { icon: 'Shield', image: '', title: 'No card required', body: 'Join the beta with two words. Billing isn’t even wired up yet.', href: '' },
          { icon: 'Star', image: '', title: 'Founder pricing, locked', body: 'Early members keep their founder rate when paid memberships launch.', href: '' },
          { icon: 'Handshake', image: '', title: 'Leave anytime', body: 'No contracts, no lock-in. Switch tiers or step away whenever you like.', href: '' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Accordion',
      props: {
        id: 'pr-faq', eyebrow: 'Straight answers', title: 'Questions, answered plainly.', titleAccent: '',
        items: [
          { q: 'Is it really free right now?', a: 'Yes. Frequency is in free beta: every feature is unlocked for everyone, and we don’t ask for a card to join. The prices on this page are what membership will cost later, so you know what you’re locking in.' },
          { q: 'What happens after beta?', a: 'When paid memberships launch, Crew will be $10/mo. Everyone who joins during the beta keeps Founder pricing, locked in for you, as a thank-you for being early. We’ll give you plenty of notice before anything changes, and you’ll never be charged without choosing to.' },
          { q: 'Do I have to pay to attend anything?', a: 'No. Members can browse and attend open gatherings for free, forever. Crew unlocks the full community: feed, circles, events you create, channels, Zaps, and crew progress. But showing up and meeting people never costs you anything during beta.' },
          { q: 'Can I leave anytime?', a: 'Always. There are no contracts and no lock-in. You can switch between Member and Crew freely during beta, and step away whenever you like.' },
          { q: 'Where does the money go?', a: 'Into keeping the room open. Membership sustains the physical spaces, the studios, the thermal circuit, the connection bar, and the community that gathers in them. People who pay more cover neighbors who can’t pay yet. Circulation, not exclusion.' },
          { q: 'What about refunds?', a: 'Nothing to refund during beta, since nothing is charged. When paid memberships launch, we’ll publish clear billing and refund terms before you ever enter a card, and you can cancel at any time.' },
          { q: 'Can I buy my way into a Host or Guide role?', a: 'No, and that’s on purpose. Host, Guide, and Mentor are earned by showing up and looking after the people around you. Frequency is leaderful by design: those roles come from the community, never from a checkout page.' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'pr-cta', eyebrow: '', heading: 'Pull up a chair.', headingAccent: '',
        body: 'It’s free during beta, no card needed. Lock in Founder pricing, find your people, and help keep the room open.',
        ctaPrimaryLabel: 'Join the Beta', ctaPrimaryHref: '/beta', ctaSecondaryLabel: '', ctaSecondaryHref: '',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
