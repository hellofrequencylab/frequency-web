// THE MIDNIGHT SITE, AS THE DESIGN SETS IT (Midnight design system, "Web Theme"). PURE: no React, so the seed
// script and the editor template can import it.
//
// Every section of the design's Home is one registered Midnight block (components/page-editor/blocks/midnight.tsx),
// in the design's order: the hero, the liveness strip, four doors, offerings, Journeys, gatherings, membership,
// the quote band, the shop, the library, the letter, the questions and the closing call. A page lists the blocks
// it shows; the kit only toggles and orders them, and copy resolves saved content > these defaults. The words are
// the design's demo practice (Nocturne): a new Space replaces them in the editor. Live blocks read the Space's own
// rows at render time (events, Journeys, reviews, questions) and fall back to the cards below.
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the italic.

interface MidnightBlockSeed { type: string; props: Record<string, unknown> }
interface MidnightPageSeed { slug: string; title: string; nav: boolean; blocks: MidnightBlockSeed[] }

const P = '/sites/midnight/photos'

export const MIDNIGHT_HERO = {
  layout: 'split',
  eyebrow: 'Your city · and online',
  title: 'Better decisions,\n*made in good company.*',
  lead: 'Counsel, gatherings and a working library for people who lead.',
  primaryLabel: 'Book a first call',
  primaryHref: '~/book',
  secondaryLabel: 'Ways to work with us',
  secondaryHref: '~/offerings',
  image: `${P}/industrial-ribs.jpg`,
  alt: '',
}

export const MIDNIGHT_LIVE = {
  items: [
    { source: 'custom', sigil: 'moon-new', label: 'Next opening', value: 'Say when you next have room', href: '~/book' },
    { source: 'nextEvent', sigil: 'moon-new', label: 'Next gathering', value: 'Shows your next date', href: '~/gatherings' },
    { source: 'journeys', sigil: 'moon-waxing', label: 'Next Journey run', value: 'Shows your Journeys', href: '~/journeys' },
    { source: 'members', sigil: 'moon-full', label: 'Members circle', value: 'Shows your members', href: '~/membership' },
  ],
}

export const MIDNIGHT_DOORS = {
  eyebrow: 'Ways in',
  title: 'Every door,\n*one house*',
  lead: '',
  doors: [
    { sigil: 'mercury', title: 'Book a session', body: 'A short first call to start.', href: '~/book' },
    { sigil: 'fire', title: 'Join a gathering', body: 'Small circles, online and in person.', href: '~/gatherings' },
    { sigil: 'moon-waxing', title: 'Take a Journey', body: 'Four weeks, with a small group.', href: '~/journeys' },
    { sigil: 'moon-full', title: 'Become a member', body: 'A standing circle and the library.', href: '~/membership' },
  ],
}

export const MIDNIGHT_OFFERINGS = {
  eyebrow: 'Offerings',
  title: 'Ways to *work together*',
  lead: 'Start with a short first call. Every offer below can begin there.',
  actionLabel: 'All offerings',
  actionHref: '~/offerings',
  offerings: [
    { sigil: 'moon-new', name: 'Introductory call', minutes: '20', blurb: 'A short first conversation to see whether we are the right fit. No preparation needed.', price: '', href: '~/book' },
    { sigil: 'mercury', name: 'Private counsel', minutes: '60', blurb: 'One hard question, one hour, one next step. Written notes within a day.', price: '', href: '~/book' },
    { sigil: 'saturn', name: 'Extended counsel', minutes: '90', blurb: 'For a decision with several people in it. Bring the map, we will draw on it.', price: '', href: '~/book' },
  ],
}

export const MIDNIGHT_JOURNEYS = {
  eyebrow: 'Journeys',
  title: 'Learn it *together*',
  lead: 'Each run is a small group, a kickoff and a check-in along the way.',
  actionLabel: 'All Journeys',
  actionHref: '~/journeys',
  count: 3,
  cards: [
    { image: `${P}/nature-dunes.jpg`, eyebrow: 'Mind · 4 weeks', title: 'Thirty days of clear decisions', meta: 'Say when the next run starts', body: 'By the end you can make, record and hand over a decision in one page.', price: '', note: '', href: '~/journeys' },
    { image: `${P}/nature-fern.jpg`, eyebrow: 'Spirit · 4 weeks', title: 'The quiet leader', meta: 'Self-paced · start any day', body: 'Lead a team meeting where you speak last and decide first.', price: '', note: '', href: '~/journeys' },
    { image: `${P}/nature-grain.jpg`, eyebrow: 'Expression · 3 weeks', title: 'Letters that move people', meta: 'Say when the next run starts', body: 'Write the update, the brief and the hard letter in plain words.', price: '', note: '', href: '~/journeys' },
  ],
}

export const MIDNIGHT_GATHERINGS = {
  eyebrow: 'Gatherings',
  title: 'Small circles.\n*Real work.*',
  lead: 'Small circles, held with care. New dates show here as you add them.',
  actionLabel: 'All gatherings',
  actionHref: '~/gatherings',
  count: 4,
  image: `${P}/nature-palm.jpg`,
  alt: '',
  rows: [],
  empty: 'No dates are open right now. New ones show here as soon as you add them.',
}

export const MIDNIGHT_MEMBERSHIP = {
  eyebrow: 'Membership',
  title: 'Stay *close*',
  lead: 'Three ways to belong. Say what each one includes.',
  tiers: [
    { sigil: 'moon-quarter', name: 'Reader', blurb: 'The working library and the letter.', price: '', badge: '', buttonLabel: 'Choose Reader', href: '~/membership' },
    { sigil: 'moon-full', name: 'Circle', blurb: 'The library, plus a standing seat at the members circle.', price: '', badge: 'Most chosen', buttonLabel: 'Choose Circle', href: '~/membership' },
    { sigil: 'saturn', name: 'Council', blurb: 'Monthly private counsel and everything else.', price: '', badge: '', buttonLabel: 'Choose Council', href: '~/membership' },
  ],
}

export const MIDNIGHT_PROOF = {
  quote: 'Paste a real line from someone you worked with, in their own words.',
  who: 'Their name',
  role: 'What they came for',
  rating: '',
  live: true,
}

export const MIDNIGHT_SHOP = {
  eyebrow: 'The shop',
  title: 'Things we *use ourselves*',
  lead: '',
  actionLabel: 'Open the shop',
  actionHref: '~/shop',
  products: [
    { image: `${P}/industrial-panel.jpg`, name: 'The decision journal', kind: 'Objects', price: '', rating: '', href: '~/shop' },
    { image: `${P}/industrial-ribs.jpg`, name: 'Night council candle', kind: 'Objects', price: '', rating: '', href: '~/shop' },
    { image: `${P}/industrial-blades.jpg`, name: 'Seasonal priorities workbook', kind: 'Digital', price: '', rating: '', href: '~/shop' },
  ],
}

export const MIDNIGHT_LIBRARY = {
  eyebrow: 'The library',
  title: 'Yours to *read and use*',
  lead: 'Guides, templates and recordings to take with you.',
  actionLabel: 'The whole library',
  actionHref: '~/library',
  resources: [
    { sigil: 'sparkle', type: 'Guide', title: 'The one-page decision record', meta: '12 pages · PDF', price: '', href: '~/library' },
    { sigil: 'moon-quarter', type: 'Recording', title: 'How to run a twenty-minute decision meeting', meta: '38 min · Audio', price: '', href: '~/library' },
    { sigil: 'star', type: 'Template', title: 'Seasonal priorities, three lines', meta: 'Sheets and PDF', price: '', href: '~/library' },
  ],
}

export const MIDNIGHT_LETTER = {
  title: 'One letter each new moon.',
  em: 'No more.',
  lead: 'Notes from the month, the next dates, and nothing you did not ask for.',
  placeholder: 'you@email.com',
  buttonLabel: 'Subscribe',
  successMessage: 'Thanks. You are on the list.',
}

export const MIDNIGHT_FAQ = {
  eyebrow: 'Questions',
  title: 'Before you *begin*',
  lead: '',
  items: [
    { q: 'Do you work online or in person?', a: 'Say where you meet people and whether you travel.' },
    { q: 'Can I change or cancel a booking?', a: 'Yes, from the link in your confirmation email or from your account. Say how much notice you need.' },
    { q: 'What is a Journey run?', a: 'A small group taking the same Journey together over four weeks, with a kickoff and check-ins along the way. Say what makes it worth doing together.' },
    { q: 'Can I pause a membership?', a: 'Say whether people can pause, and how.' },
  ],
}

export const MIDNIGHT_CTA = {
  title: 'Not sure which door?\n*Start with a conversation.*',
  buttonLabel: 'Book a first call',
  buttonHref: '~/book',
}

/** A page-opening banner: the design's inner pages open on a photo with a title (a short hero). */
const banner = (eyebrow: string, title: string, lead: string, image: string): MidnightBlockSeed => ({
  type: 'MidnightHero',
  props: { ...MIDNIGHT_HERO, layout: 'banner', eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: `${P}/${image}.jpg` },
})

/** Home: the design's own order (Site Strategy, §V). */
export function midnightHomeBlocks(): MidnightBlockSeed[] {
  return [
    { type: 'MidnightHero', props: { ...MIDNIGHT_HERO } },
    { type: 'MidnightLive', props: { ...MIDNIGHT_LIVE } },
    { type: 'MidnightOfferings', props: { ...MIDNIGHT_OFFERINGS } },
    { type: 'MidnightJourneys', props: { ...MIDNIGHT_JOURNEYS } },
    { type: 'MidnightGatherings', props: { ...MIDNIGHT_GATHERINGS } },
    { type: 'MidnightProof', props: { ...MIDNIGHT_PROOF } },
    { type: 'MidnightLibrary', props: { ...MIDNIGHT_LIBRARY } },
    { type: 'MidnightLetter', props: { ...MIDNIGHT_LETTER } },
    { type: 'MidnightFAQ', props: { ...MIDNIGHT_FAQ } },
    { type: 'MidnightCTA', props: { ...MIDNIGHT_CTA } },
  ]
}

/** The whole site: the design's navigation, in order. */
export function midnightSitePages(): MidnightPageSeed[] {
  return [
    { slug: 'home', title: 'Home', nav: false, blocks: midnightHomeBlocks() },
    { slug: 'offerings', title: 'Offerings', nav: true, blocks: [banner('Offerings', 'Three ways to work together', 'Private counsel, intensives for your inner circle, and a long apprenticeship.', 'industrial-ribs'), { type: 'MidnightOfferings', props: { ...MIDNIGHT_OFFERINGS, eyebrow: '', title: '', lead: '', actionLabel: '' } }, { type: 'MidnightDoors', props: { ...MIDNIGHT_DOORS } }, { type: 'MidnightCTA', props: { ...MIDNIGHT_CTA } }] },
    { slug: 'book', title: 'Book', nav: true, blocks: [{ type: 'Heading', props: { title: 'What would help most?', eyebrow: 'Book a session' } }, { type: 'SpaceBooking', props: { heading: '' } }] },
    { slug: 'gatherings', title: 'Gatherings', nav: true, blocks: [banner('Gatherings', 'Learn it in the circle', 'Small circles. Every session works on something real you bring.', 'nature-palm'), { type: 'MidnightGatherings', props: { ...MIDNIGHT_GATHERINGS, eyebrow: '', title: '', lead: '', actionLabel: '', count: 12 } }, { type: 'MidnightCTA', props: { ...MIDNIGHT_CTA } }] },
    { slug: 'journeys', title: 'Journeys', nav: true, blocks: [banner('Journeys', 'Four weeks. One change.', 'Short programs with a clear outcome. Take one with a small group, or on your own.', 'nature-fern'), { type: 'MidnightJourneys', props: { ...MIDNIGHT_JOURNEYS, eyebrow: '', title: '', lead: '', actionLabel: '', count: 12 } }, { type: 'MidnightFAQ', props: { ...MIDNIGHT_FAQ } }] },
    { slug: 'shop', title: 'Shop', nav: true, blocks: [banner('The shop', 'Tools for the work between sessions', 'Objects, downloads and gift cards.', 'industrial-panel'), { type: 'MidnightShop', props: { ...MIDNIGHT_SHOP, eyebrow: '', title: '', actionLabel: '' } }] },
    { slug: 'membership', title: 'Membership', nav: true, blocks: [banner('Membership', 'Keep good company', 'Three ways to stay close between sessions.', 'nature-grain'), { type: 'MidnightMembership', props: { ...MIDNIGHT_MEMBERSHIP, eyebrow: '', title: '', lead: '' } }, { type: 'MidnightFAQ', props: { ...MIDNIGHT_FAQ, title: 'About *membership*' } }] },
    { slug: 'library', title: 'Library', nav: true, blocks: [banner('Library', 'A working library', 'Guides, templates and recordings to take with you.', 'industrial-blades'), { type: 'MidnightLibrary', props: { ...MIDNIGHT_LIBRARY, eyebrow: '', title: '', lead: '', actionLabel: '' } }, { type: 'MidnightLetter', props: { ...MIDNIGHT_LETTER } }] },
    { slug: 'about', title: 'About', nav: false, blocks: [banner('About', 'A small house, on purpose', 'Counsel, gatherings and a library, kept deliberately small.', 'nature-fern'), { type: 'EditorialSection', props: { title: 'Fewer people, longer', body: 'Say how this started and who it is for, in a few honest lines. Then say what you do for people that they cannot easily do alone.' } }, { type: 'SpaceTeam', props: { heading: 'The people' } }, { type: 'SpaceContact', props: { heading: 'Write to us' } }] },
    { slug: 'contact', title: 'Contact', nav: false, blocks: [{ type: 'SpaceContact', props: { heading: 'Write to us' } }] },
  ]
}
