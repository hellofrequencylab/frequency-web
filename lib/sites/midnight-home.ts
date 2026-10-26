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
  eyebrow: 'Melbourne · and online',
  title: 'Better decisions,\n*made in good company.*',
  lead: 'Counsel, gatherings and a working library for people who lead.',
  primaryLabel: 'Book a free intro',
  primaryHref: '~/book',
  secondaryLabel: 'Ways to work with us',
  secondaryHref: '~/offerings',
  image: `${P}/industrial-ribs.jpg`,
  alt: '',
}

export const MIDNIGHT_LIVE = {
  items: [
    { source: 'custom', sigil: 'moon-new', label: 'Next opening', value: 'Thu 30 Oct · 10:00am', href: '~/book' },
    { source: 'nextEvent', sigil: 'moon-new', label: 'Next gathering', value: 'New moon · Tue 18 Nov', href: '~/gatherings' },
    { source: 'journeys', sigil: 'moon-waxing', label: 'Next Journey run', value: 'Mon 3 Nov · 6 places', href: '~/journeys' },
    { source: 'members', sigil: 'moon-full', label: 'Members circle', value: '212 members', href: '~/membership' },
  ],
}

export const MIDNIGHT_DOORS = {
  eyebrow: 'Ways in',
  title: 'Every door,\n*one house*',
  lead: '',
  doors: [
    { sigil: 'mercury', title: 'Book a session', body: 'A free 20-minute intro first.', href: '~/book' },
    { sigil: 'fire', title: 'Join a gathering', body: 'Small circles, online and in person.', href: '~/gatherings' },
    { sigil: 'moon-waxing', title: 'Take a Journey', body: 'Four weeks, with a small group.', href: '~/journeys' },
    { sigil: 'moon-full', title: 'Become a member', body: 'A standing circle and the library.', href: '~/membership' },
  ],
}

export const MIDNIGHT_OFFERINGS = {
  eyebrow: 'Offerings',
  title: 'Ways to *work together*',
  lead: 'Start with a free 20-minute call. Every offer below can begin there.',
  actionLabel: 'All offerings',
  actionHref: '~/offerings',
  offerings: [
    { sigil: 'moon-new', name: 'Introductory call', minutes: '20', blurb: 'A short first conversation to see whether we are the right fit. No preparation needed.', price: 'Free', href: '~/book' },
    { sigil: 'mercury', name: 'Private counsel', minutes: '60', blurb: 'One hard question, one hour, one next step. Written notes within a day.', price: '$450', href: '~/book' },
    { sigil: 'saturn', name: 'Extended counsel', minutes: '90', blurb: 'For a decision with several people in it. Bring the map, we will draw on it.', price: '$620', href: '~/book' },
  ],
}

export const MIDNIGHT_JOURNEYS = {
  eyebrow: 'Journeys',
  title: 'Learn it *together*',
  lead: 'Cohorts finish far more often than solo study. Each run is a small group, a kickoff and a weekly check-in.',
  actionLabel: 'All Journeys',
  actionHref: '~/journeys',
  count: 3,
  cards: [
    { image: `${P}/nature-dunes.jpg`, eyebrow: 'Mind · 4 weeks', title: 'Thirty days of clear decisions', meta: 'Next run starts Mon 3 Nov', body: 'By the end you can make, record and hand over a decision in one page.', price: '$180', note: '412 have taken it', href: '~/journeys' },
    { image: `${P}/nature-fern.jpg`, eyebrow: 'Spirit · 4 weeks', title: 'The quiet leader', meta: 'Self-paced · start any day', body: 'Lead a team meeting where you speak last and decide first.', price: '$180', note: '268 have taken it', href: '~/journeys' },
    { image: `${P}/nature-grain.jpg`, eyebrow: 'Expression · 3 weeks', title: 'Letters that move people', meta: 'Next run starts Mon 1 Dec', body: 'Write the update, the brief and the hard letter in plain words.', price: '$140', note: '190 have taken it', href: '~/journeys' },
  ],
}

export const MIDNIGHT_GATHERINGS = {
  eyebrow: 'Gatherings',
  title: 'Small circles.\n*Real work.*',
  lead: 'Timed to the moon. Never more than twenty.',
  actionLabel: 'All gatherings',
  actionHref: '~/gatherings',
  count: 4,
  image: `${P}/nature-palm.jpg`,
  alt: '',
  rows: [
    { month: 'Nov', day: '18', title: 'New moon: clear decisions', meta: '9:30am · Online', note: '3 seats left', href: '~/gatherings' },
    { month: 'Dec', day: '2', title: 'Quarter moon: the hard conversation', meta: '6:00pm · Studio, Fitzroy', note: '$60', href: '~/gatherings' },
    { month: 'Dec', day: '17', title: 'Full moon: the year in review', meta: '7:00pm · Online', note: '$60', href: '~/gatherings' },
  ],
}

export const MIDNIGHT_MEMBERSHIP = {
  eyebrow: 'Membership',
  title: 'Stay *close*',
  lead: 'Three ways to belong. Yearly saves two months.',
  tiers: [
    { sigil: 'moon-quarter', name: 'Reader', blurb: 'The working library and the letter.', price: '$12 / month', badge: '', buttonLabel: 'Choose Reader', href: '~/membership' },
    { sigil: 'moon-full', name: 'Circle', blurb: 'The library, plus a standing seat at the members circle.', price: '$48 / month', badge: 'Most chosen', buttonLabel: 'Choose Circle', href: '~/membership' },
    { sigil: 'saturn', name: 'Council', blurb: 'Monthly private counsel and everything else.', price: '$240 / month', badge: '', buttonLabel: 'Choose Council', href: '~/membership' },
  ],
}

export const MIDNIGHT_PROOF = {
  quote: 'We left with four decisions written down. Six months on, we are still working from them.',
  who: 'Priya N.',
  role: 'Founder, Fieldwork',
  rating: '4.9 from 318 reviews',
  live: true,
}

export const MIDNIGHT_SHOP = {
  eyebrow: 'The shop',
  title: 'Things we *use ourselves*',
  lead: '',
  actionLabel: 'Open the shop',
  actionHref: '~/shop',
  products: [
    { image: `${P}/industrial-panel.jpg`, name: 'The decision journal', kind: 'Objects', price: '$48', rating: '4.9 · 86 reviews', href: '~/shop' },
    { image: `${P}/industrial-ribs.jpg`, name: 'Night council candle', kind: 'Objects', price: '$64', rating: '4.8 · 52 reviews', href: '~/shop' },
    { image: `${P}/industrial-blades.jpg`, name: 'Seasonal priorities workbook', kind: 'Digital', price: '$40', rating: '4.7 · 140 reviews', href: '~/shop' },
  ],
}

export const MIDNIGHT_LIBRARY = {
  eyebrow: 'The library',
  title: 'Free to *read and use*',
  lead: 'Guides, templates and recordings. Most are free.',
  actionLabel: 'The whole library',
  actionHref: '~/library',
  resources: [
    { sigil: 'sparkle', type: 'Guide', title: 'The one-page decision record', meta: '12 pages · PDF', price: 'Free', href: '~/library' },
    { sigil: 'moon-quarter', type: 'Recording', title: 'How to run a twenty-minute decision meeting', meta: '38 min · Audio', price: 'Free', href: '~/library' },
    { sigil: 'star', type: 'Template', title: 'Seasonal priorities, three lines', meta: 'Sheets and PDF', price: '$12', href: '~/library' },
  ],
}

export const MIDNIGHT_LETTER = {
  title: 'One letter each new moon.',
  em: 'No more.',
  lead: 'Notes from the month, the next dates, and nothing you did not ask for.',
  placeholder: 'you@email.com',
  buttonLabel: 'Subscribe',
  successMessage: 'Thanks. The next one arrives at the new moon.',
}

export const MIDNIGHT_FAQ = {
  eyebrow: 'Questions',
  title: 'Before you *begin*',
  lead: '',
  items: [
    { q: 'Do you work with teams outside Melbourne?', a: 'Yes. Counsel and most gatherings run online. Intensives travel to you within Australia and New Zealand.' },
    { q: 'Can I change or cancel a booking?', a: 'Yes, from the link in your confirmation email or from your account. Free changes up to 24 hours before a session.' },
    { q: 'What is a Journey run?', a: 'A small group taking the same Journey together over four weeks, with a kickoff and a weekly check-in. Runs finish far more often than solo study.' },
    { q: 'Can I pause a membership?', a: 'Yes, for up to two months a year, from your account. Your rate stays the same when you come back.' },
  ],
}

export const MIDNIGHT_CTA = {
  title: 'Not sure which door?\n*Start with a conversation.*',
  buttonLabel: 'Book a free intro',
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
    { slug: 'gatherings', title: 'Gatherings', nav: true, blocks: [banner('Gatherings', 'Learn it in the circle', 'Small circles, never more than 20. Every session works on something real you bring.', 'nature-palm'), { type: 'MidnightGatherings', props: { ...MIDNIGHT_GATHERINGS, eyebrow: '', title: '', lead: '', actionLabel: '', count: 12 } }, { type: 'MidnightCTA', props: { ...MIDNIGHT_CTA } }] },
    { slug: 'journeys', title: 'Journeys', nav: true, blocks: [banner('Journeys', 'Four weeks. One change.', 'Short programs with a clear outcome. Take one with a small group, or on your own.', 'nature-fern'), { type: 'MidnightJourneys', props: { ...MIDNIGHT_JOURNEYS, eyebrow: '', title: '', lead: '', actionLabel: '', count: 12 } }, { type: 'MidnightFAQ', props: { ...MIDNIGHT_FAQ } }] },
    { slug: 'shop', title: 'Shop', nav: true, blocks: [banner('The shop', 'Tools for the work between sessions', 'Objects, downloads and gift cards.', 'industrial-panel'), { type: 'MidnightShop', props: { ...MIDNIGHT_SHOP, eyebrow: '', title: '', actionLabel: '' } }] },
    { slug: 'membership', title: 'Membership', nav: true, blocks: [banner('Membership', 'Keep good company', 'Three ways to stay close between sessions. Pause or cancel any time.', 'nature-grain'), { type: 'MidnightMembership', props: { ...MIDNIGHT_MEMBERSHIP, eyebrow: '', title: '', lead: '' } }, { type: 'MidnightFAQ', props: { ...MIDNIGHT_FAQ, title: 'About *membership*' } }] },
    { slug: 'library', title: 'Library', nav: true, blocks: [banner('Library', 'A working library', 'Guides, templates and recordings. Most of it free.', 'industrial-blades'), { type: 'MidnightLibrary', props: { ...MIDNIGHT_LIBRARY, eyebrow: '', title: '', lead: '', actionLabel: '' } }, { type: 'MidnightLetter', props: { ...MIDNIGHT_LETTER } }] },
    { slug: 'about', title: 'About', nav: false, blocks: [banner('About', 'A small house, on purpose', 'Counsel, gatherings and a library, kept deliberately small.', 'nature-fern'), { type: 'EditorialSection', props: { title: 'Fewer people, longer', body: 'Nocturne started in 2018 as one advisor and a whiteboard. It is now three of us, and we still keep no more than twelve people in counsel at a time. We work with leaders who are good at their jobs and short on time. Our part is to slow the important decisions down just enough to get them right, then get out of the way.' } }, { type: 'SpaceTeam', props: { heading: 'The people' } }, { type: 'SpaceContact', props: { heading: 'Write to us' } }] },
    { slug: 'contact', title: 'Contact', nav: false, blocks: [{ type: 'SpaceContact', props: { heading: 'Write to us' } }] },
  ]
}
