// THE NETWORK KIT HOME, AS THE DESIGN SETS IT (Network design system, "Web Theme", ui_kits/site/HomePage.jsx).
// PURE: no React, so the editor template and the seed can import it.
//
// The design's fourteen base blocks (hero, liveness strip, steps, ways in, offerings, programs, meetups, membership,
// proof, shop, library, letter, questions, closing call) are one registered block each
// (components/page-editor/blocks/network-kit.tsx). Each carries the layout variants the design's kits pick between;
// a kit only names the variant. Copy resolves saved content > these defaults. Live blocks read the Space's own rows
// (events, programs, reviews, questions, member count) and fall back to the cards below.
//
// THE WORDS ARE THE VOICE GUIDE'S, NOT THE DESIGN'S DEMO. Nothing here states a number about a real group (no member
// count, rating, seats, readers), promises a weekday or a rhythm, or leaves a prompt for the owner in live copy.
// Prices stay empty until the owner writes them; a block draws no price line without one. Where the design's own
// line made a promise, the line below says what is done instead (the ledger row names each change).
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the Instrument Serif italic.

interface NetworkKitBlockSeed { type: string; props: Record<string, unknown> }

const P = '/sites/network-kit/photos'

export const NETWORK_KIT_HERO = {
  variant: 'split',
  flip: false,
  eyebrow: 'Meet in person',
  title: 'Your people are\n*already here.*',
  lead: 'A place to meet, a reason to come back and a friendly face at the door.',
  primaryLabel: 'See what is on',
  primaryHref: '~/workshops',
  secondaryLabel: 'How it works',
  secondaryHref: '~/about',
  note: '',
  image: `${P}/photo-01.jpg`,
  alt: '',
  pos: '',
  showEvent: true,
  band: '',
}

export const NETWORK_KIT_LIVE = {
  items: [
    { source: 'nextEvent', glyph: 'calendar', label: 'Next meetup', value: '', href: '~/workshops' },
    { source: 'journeys', glyph: 'arc', label: 'Programs', value: '', href: '~/journeys' },
    { source: 'members', glyph: 'users', label: 'Members', value: '', href: '~/membership' },
    { source: 'custom', glyph: 'calendar-clock', label: 'Welcome calls', value: 'Book a time that suits you', href: '~/book' },
    { source: 'custom', glyph: 'spark', label: 'The library', value: 'Guides and stories, many of them free', href: '~/resources' },
  ],
  band: '',
}

export const NETWORK_KIT_STEPS = {
  variant: 'grid',
  eyebrow: 'How it works',
  title: 'Three easy\n*ways in*',
  steps: [
    { glyph: 'circle', title: 'Come once', body: 'Pick a meetup and say you are new at the door.' },
    { glyph: 'half', title: 'Meet a few people', body: 'A host helps with the first introductions.' },
    { glyph: 'ring', title: 'Keep showing up', body: 'Join when it feels like your group.' },
  ],
  band: '',
}

export const NETWORK_KIT_DOORS = {
  variant: 'grid',
  eyebrow: 'Ways in',
  title: 'Find your\n*people*',
  lead: '',
  doors: [
    { glyph: 'triangle', title: 'Come to a meetup', body: 'A first visit is a good place to start. Say you are new at the door.', href: '~/workshops' },
    { glyph: 'ring', title: 'Become a member', body: 'A seat at the table, the directory and introductions.', href: '~/membership' },
    { glyph: 'target', title: 'Book a welcome call', body: 'Twenty minutes with an organizer.', href: '~/book' },
    { glyph: 'arc', title: 'Train as a host', body: 'Learn to run a meetup of your own, with a group beside you.', href: '~/journeys' },
  ],
  band: '',
}

export const NETWORK_KIT_OFFERINGS = {
  variant: 'list',
  eyebrow: 'Ways to take part',
  title: 'Pick the way\n*that fits*',
  lead: 'Start small. A welcome call or a first visit is enough.',
  actionLabel: 'All offerings',
  actionHref: '~/services',
  offerings: [
    { glyph: 'circle', name: 'Welcome call', minutes: '20', blurb: 'A short call with an organizer. Tell us what you do and who you would like to meet.', price: '', href: '~/book' },
    { glyph: 'target', name: 'Mentor session', minutes: '45', blurb: 'Time with a member who has done what you are doing. Bring one question.', price: '', href: '~/book' },
    { glyph: 'spark', name: 'Business spotlight', minutes: '60', blurb: 'Present your business at a meetup, with a short slot and a feature for members.', price: '', href: '~/book' },
  ],
  band: '',
}

export const NETWORK_KIT_JOURNEYS = {
  variant: 'cards',
  eyebrow: 'Programs',
  title: 'Grow with\n*a group*',
  lead: '',
  actionLabel: 'All programs',
  actionHref: '~/journeys',
  count: 3,
  cards: [
    { image: `${P}/photo-01.jpg`, eyebrow: 'Hosting', weeks: '4', title: 'Host training: run a meetup people come back to', meta: '', body: 'Welcome a room, seat small tables and make introductions that lead somewhere.', price: '', note: '', href: '~/journeys' },
    { image: `${P}/photo-05.jpg`, eyebrow: 'Onboarding', weeks: '12', title: 'Your first 90 days as a member', meta: '', body: 'Learn who is in the room and find a few people to call.', price: '', note: '', href: '~/journeys' },
    { image: `${P}/photo-02.jpg`, eyebrow: 'Chapters', weeks: '6', title: 'Grow a chapter from 10 to 40', meta: '', body: 'A plan for the venue, the rhythm, the volunteers and the first invitations.', price: '', note: '', href: '~/journeys' },
  ],
  band: '',
}

export const NETWORK_KIT_GATHERINGS = {
  variant: 'split',
  eyebrow: 'Coming up',
  title: 'When we\n*meet*',
  lead: '',
  actionLabel: 'All events',
  actionHref: '~/workshops',
  count: 4,
  image: `${P}/photo-07.jpg`,
  alt: '',
  empty: 'No dates are up yet. Check back soon, or say hello.',
  rows: [] as Record<string, unknown>[],
  band: '',
}

export const NETWORK_KIT_MEMBERSHIP = {
  variant: 'tiers',
  eyebrow: 'Membership',
  title: 'Show up,\n*together*',
  lead: '',
  buttonLabel: 'Join',
  tiers: [
    { glyph: 'circle', name: 'Community', blurb: 'For people who come now and then. Meetups when you can and the member stories.', price: '', badge: '', href: '~/membership' },
    { glyph: 'ring', name: 'Member', blurb: 'A seat at the table, the member directory and introductions on request.', price: '', badge: 'Most members', href: '~/membership' },
    { glyph: 'square', name: 'Business partner', blurb: 'For businesses that want to support the group and be seen by it.', price: '', badge: '', href: '~/membership' },
  ],
  band: '',
}

export const NETWORK_KIT_PROOF = {
  variant: 'quote',
  live: true,
  quote: '',
  who: '',
  role: '',
  stats: [] as Record<string, unknown>[],
  eyebrow: 'What people say',
  band: '',
}

export const NETWORK_KIT_SHOP = {
  variant: 'grid',
  eyebrow: 'The shop',
  title: 'Tickets, kits\n*and gifts*',
  actionLabel: 'Open the shop',
  actionHref: '~/shop',
  products: [
    { image: `${P}/photo-07.jpg`, name: 'The host kit', kind: 'Object', price: '', rating: '', href: '~/shop' },
    { image: `${P}/photo-10.jpg`, name: 'Summit day pass', kind: 'Ticket', price: '', rating: '', href: '~/shop' },
    { image: `${P}/photo-08.jpg`, name: 'Conversation cards', kind: 'Object', price: '', rating: '', href: '~/shop' },
    { image: '', glyph: 'file', name: 'Chapter starter templates', kind: 'Download', price: '', rating: '', href: '~/shop' },
  ],
  band: '',
}

export const NETWORK_KIT_LIBRARY = {
  variant: 'grid',
  eyebrow: 'The library',
  title: 'Share what\n*works*',
  lead: '',
  actionLabel: 'The whole library',
  actionHref: '~/resources',
  resources: [
    { glyph: 'half', type: 'Guide', title: 'A host guide for the first ten minutes', meta: 'PDF', price: 'Free', href: '~/resources' },
    { glyph: 'audio', type: 'Recording', title: 'How a good introduction sounds', meta: 'Audio', price: 'Free', href: '~/resources' },
    { glyph: 'file', type: 'Template', title: 'A welcome email for new members', meta: 'Docs', price: '', href: '~/resources' },
    { glyph: 'star', type: 'Story', title: 'Member stories from around the tables', meta: 'Read', price: 'Free', href: '~/resources' },
  ],
  band: '',
}

export const NETWORK_KIT_LETTER = {
  variant: 'band',
  title: 'News from the group,',
  em: 'when there is some.',
  lead: 'Who is speaking, where we meet and one member worth knowing.',
  placeholder: 'you@email.com',
  buttonLabel: 'Subscribe',
  successMessage: 'Thanks. You are on the list.',
  band: '',
}

export const NETWORK_KIT_FAQ = {
  variant: 'split',
  eyebrow: 'Questions',
  title: 'Good to\n*know*',
  side: 'Still wondering? Write to us and an organizer will reply.',
  items: [
    { q: 'Who is this for?', a: 'Business owners, professionals, creatives and anyone building something locally. If you like meeting people and helping them, you will fit.' },
    { q: 'Do I have to pitch or bring business cards?', a: 'No. There is no pitch round and no quota. People help when they can.' },
    { q: 'What happens at a first meetup?', a: 'Arrive a few minutes early and say you are new. A host will seat you and introduce you to the table.' },
    { q: 'Can I pause my membership?', a: 'Yes. You can pause and pick it up again from your account.' },
  ],
  band: '',
}

export const NETWORK_KIT_CTA = {
  variant: 'center',
  title: 'Come once.\n*Bring a friend.*',
  buttonLabel: 'See what is on',
  buttonHref: '~/workshops',
  secondaryLabel: 'Say hello',
  secondaryHref: '~/contact',
  image: `${P}/photo-01.jpg`,
  alt: '',
  band: '',
}

/** The design's bands: the hero and the liveness strip are plain, every other block alternates paper and sand. */
const PLAIN = new Set(['NetworkKitHero', 'NetworkKitLive'])
function withBands(blocks: NetworkKitBlockSeed[]): NetworkKitBlockSeed[] {
  let i = 0
  return blocks.map((b) => (PLAIN.has(b.type) ? b : { ...b, props: { ...b.props, band: i++ % 2 ? 'sand' : '' } }))
}

/** Home: the design's own order (HomePage.jsx BLOCK_VIEWS). */
export function networkKitHomeBlocks(): NetworkKitBlockSeed[] {
  return withBands([
    { type: 'NetworkKitHero', props: { ...NETWORK_KIT_HERO } },
    { type: 'NetworkKitLive', props: { ...NETWORK_KIT_LIVE } },
    { type: 'NetworkKitSteps', props: { ...NETWORK_KIT_STEPS } },
    { type: 'NetworkKitDoors', props: { ...NETWORK_KIT_DOORS } },
    { type: 'NetworkKitOfferings', props: { ...NETWORK_KIT_OFFERINGS } },
    { type: 'NetworkKitJourneys', props: { ...NETWORK_KIT_JOURNEYS } },
    { type: 'NetworkKitGatherings', props: { ...NETWORK_KIT_GATHERINGS } },
    { type: 'NetworkKitMembership', props: { ...NETWORK_KIT_MEMBERSHIP } },
    { type: 'NetworkKitProof', props: { ...NETWORK_KIT_PROOF } },
    { type: 'NetworkKitShop', props: { ...NETWORK_KIT_SHOP } },
    { type: 'NetworkKitLibrary', props: { ...NETWORK_KIT_LIBRARY } },
    { type: 'NetworkKitLetter', props: { ...NETWORK_KIT_LETTER } },
    { type: 'NetworkKitFAQ', props: { ...NETWORK_KIT_FAQ } },
    { type: 'NetworkKitCTA', props: { ...NETWORK_KIT_CTA } },
  ])
}
