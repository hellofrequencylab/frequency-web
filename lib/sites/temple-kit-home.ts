// THE TEMPLE KIT HOME, AS THE DESIGN SETS IT (Temple design system, "Web Theme", ui_kits/site/TempleBlocks.jsx). PURE:
// no React, so the seed script and the editor template can import it.
//
// Every section of the design's Home is one registered Temple Kit block (components/page-editor/blocks/temple-kit.tsx),
// in the design's order: the hero, the live band, gatherings, rooms, offerings and steps (the first half), then the
// gallery, journeys, proof, membership, questions, letter and closing call. A page lists the blocks it shows; the kit
// only toggles and orders them, and copy resolves saved content > these defaults. The words are the design's sample
// house (a temple house in Ojai): a new Space replaces them in the editor. Live blocks read the Space's own rows at
// render time (events) and fall back to the cards below.
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the accent italic (the design's
// `<em>`, upright, in the clay).
//
// VOICE (docs/marketing/voice-and-language-guide.md wins over the design's words). Where the design promised or
// claimed, the line below is softened; each change is listed in the Temple Kit home ledger row (LIVE-1682):
//   - Live band, "Walk the grounds · Thu 10am · free" -> "Free, ask for a time" (a standing weekday is a weekly promise).
//   - Gatherings note, "you will sit beside someone new" -> "you may sit beside someone new" (no outcome promise).
//   - Sound bath, "You leave slower than you came." -> "Come as you are." (no outcome promise).
// The second half (LIVE-1683) softens these too:
//   - Gallery, "Photographs from the season, taken by guests." -> "Photographs from the house." (a claim nobody checked).
//   - Four weeks of breath, "By the end you have a twenty-minute breath practice you can keep without a teacher." ->
//     "Build a twenty-minute breath practice you can keep without a teacher." (no outcome promise).
//   - Seven mornings, "It leads into the Tuesday circle." -> "It leads into the circle." (a standing weekday).
//   - Circle, "A standing place at the weekly practice" and "The Tuesday morning practice, every week" -> "A place at the
//     morning practice" and "A place at the morning practice" (weekly promises); "Most chosen" -> "Our pick" (a count claim).
//   - Letter thanks, "The next letter arrives at the solstice." -> "You are on the list for the next letter." (a date promise).

interface TempleKitBlockSeed { type: string; props: Record<string, unknown> }

/** The design's image names (content.js IMG_MAP) and the photo each one is: the fourteen house photographs in
 *  public/sites/temple-kit/photos. */
export const TEMPLE_KIT_IMG_MAP = {
  'nature-palm': 'photo-04', 'nature-fern': 'photo-09', 'nature-dunes': 'photo-12', 'nature-grain': 'photo-07',
  'industrial-panel': 'photo-01', 'industrial-ribs': 'photo-06', 'industrial-blades': 'photo-03', 'pool-temple': 'photo-02',
  group: 'photo-05', planning: 'photo-08', council: 'photo-10', tent: 'photo-11', 'pool-deck': 'photo-13', 'guest-room': 'photo-14',
} as const

type TempleKitImageName = keyof typeof TEMPLE_KIT_IMG_MAP

const PHOTOS = '/sites/temple-kit/photos'

/** The served path of a design image name (or a photo-NN id). */
export function templeKitPhoto(name: TempleKitImageName | `photo-${string}`): string {
  const id = (TEMPLE_KIT_IMG_MAP as Record<string, string>)[name] ?? name
  return `${PHOTOS}/${id}.jpg`
}
const ph = templeKitPhoto

export const TEMPLE_KIT_HERO = {
  eyebrow: 'Ojai, California',
  title: 'A house for gathering.',
  lead: 'Two acres of olive and palm above the valley, with rooms for ceremony, practice and long tables. Small numbers, slow hours, nothing rushed.',
  primaryLabel: "See what's open",
  primaryHref: '~/gatherings',
  secondaryLabel: 'Hire the house',
  secondaryHref: '~/services',
  image: ph('photo-02'),
  alt: '',
  pos: 'center 55%',
  live: true,
  cardLabel: 'Next gathering',
  cardTitle: 'New moon sound bath',
  cardWhen: 'Thu 20 Nov',
  cardNote: '8 seats left',
  cardImage: ph('industrial-panel'),
  cardHref: '~/gatherings',
}

export const TEMPLE_KIT_LIVE = {
  items: [
    { source: 'nextEvent', icon: 'calendar', label: 'Next gathering', value: 'Nov 20 · Sound bath', href: '~/gatherings' },
    { source: 'custom', icon: 'circle', label: 'Walk the grounds', value: 'Free, ask for a time', href: '~/book' },
    { source: 'custom', icon: 'arc', label: 'Next program', value: 'Breath · from Jan 5', href: '~/journeys' },
    { source: 'custom', icon: 'map-pin', label: 'Find us', value: 'Ojai, California', href: '~/contact' },
  ],
}

export const TEMPLE_KIT_GATHERINGS = {
  eyebrow: "What's open",
  title: 'Gatherings *this season.*',
  lead: 'Sound, breath, suppers and the turns of the year. Twenty to thirty people, in person.',
  actionLabel: 'All gatherings',
  actionHref: '~/gatherings',
  count: 4,
  note: 'Seats are sold singly, so you may sit beside someone new.',
  empty: 'No dates are open right now. The next letter has them first.',
  rows: [
    { month: 'Nov', day: '20', when: 'Thu 20 Nov', time: '7pm–8:30pm', title: 'New moon sound bath', place: 'The great room', price: '$45', seats: '8', image: ph('industrial-panel'), href: '~/gatherings' },
    { month: 'Nov', day: '29', when: 'Sat 29 Nov', time: '6pm–9:30pm', title: 'Long table supper', place: 'The long table, under the olives', price: '$120', seats: '3', image: ph('nature-palm'), href: '~/gatherings' },
    { month: 'Dec', day: '7', when: 'Sun 7 Dec', time: '5pm–7pm', title: 'Breath at the fire circle', place: 'The fire circle', price: '$55', seats: '11', image: ph('industrial-blades'), href: '~/gatherings' },
    { month: 'Dec', day: '21', when: 'Sun 21 Dec', time: '4pm–9pm', title: 'Winter solstice ceremony', place: 'The whole house', price: '$95', seats: '40', image: ph('council'), href: '~/gatherings' },
  ],
}

export const TEMPLE_KIT_ROOMS = {
  eyebrow: 'The house',
  title: 'Every room *has a use.*',
  lead: '',
  actionLabel: 'Hire a room',
  actionHref: '~/services',
  rooms: [
    { name: 'The great room', capacity: '80 standing · 40 on mats', image: ph('industrial-panel'), href: '~/services' },
    { name: 'The garden lawn', capacity: '150 standing', image: ph('nature-fern'), href: '~/services' },
    { name: 'The long table', capacity: '24 seated', image: ph('planning'), href: '~/services' },
    { name: 'The fire circle', capacity: '30 around the fire', image: ph('industrial-blades'), href: '~/services' },
    { name: 'Healing rooms', capacity: 'Two rooms · one to one', image: ph('industrial-ribs'), href: '~/services' },
    { name: 'The pool court', capacity: 'Ceremonies · up to 60', image: ph('pool-temple'), href: '~/services' },
  ],
}

export const TEMPLE_KIT_OFFERINGS = {
  eyebrow: 'Ceremonies & hire',
  title: 'The house, *held for you.*',
  lead: 'Ceremonies, retreats and room hire. Start with a walk of the grounds; it is free.',
  buttonLabel: 'Hold a date',
  services: [
    {
      numeral: 'I', title: 'Ceremonies', length: 'Weddings, namings, memorials', price: 'From $2,400 · half day', image: ph('pool-temple'), href: '~/contact',
      summary: 'Vows under the olive trees, a naming at the fire, a memorial in the great room. We hold the space, the light and the quiet; you bring the people who matter.',
      includes: 'A planning walk of the grounds with our ceremony host\nThe great room or the garden lawn, set and cleared\nCandles, cushions and a sound system that stays out of sight',
    },
    {
      numeral: 'II', title: 'Retreats', length: 'Two to five nights', price: 'From $1,450 a guest', image: ph('tent'), href: '~/contact',
      summary: 'Bring your group for a few nights on the grounds. Six rooms and the bell tents sleep sixteen; the studio, fire circle and long table are yours for the stay.',
      includes: 'Rooms for sixteen, with linens and morning tea\nFull use of the studio, council room and fire circle\nMeals at the long table, cooked by our kitchen',
    },
    {
      numeral: 'III', title: 'Space hire', length: 'An evening to a full day', price: 'From $180 an hour', image: ph('industrial-panel'), href: '~/contact',
      summary: 'The studio for a class, the council room for a circle, the long table for a supper. Hire one room for an evening or the whole house for a day.',
      includes: 'A 48-hour hold while you decide\nSetup and reset by our house team\nStep-free access to every room on the ground floor',
    },
  ],
}

export const TEMPLE_KIT_STEPS = {
  eyebrow: 'A first visit',
  title: 'Three ways *through the door.*',
  lead: '',
  steps: [
    { title: 'Come to a gathering', body: 'A sound bath, a supper or a breath circle. Book a single seat.', image: ph('industrial-blades') },
    { title: 'Walk the grounds', body: 'A free tour with our house host, for anyone planning a ceremony or a stay.', image: ph('planning') },
    { title: 'Hold a date', body: 'Any date can be held for 48 hours while you decide.', image: ph('guest-room') },
  ],
}

export const TEMPLE_KIT_GALLERY = {
  eyebrow: 'Life at the house',
  title: 'Two acres, kept quietly. Fire in winter, the long table in summer, and the pool court at every hour between.',
  body: 'Photographs from the house.',
  photos: [{ image: ph('nature-palm'), alt: '' }, { image: ph('nature-dunes'), alt: '' }, { image: ph('nature-grain'), alt: '' }],
}

export const TEMPLE_KIT_JOURNEYS = {
  eyebrow: 'Programs',
  title: 'Practices *to take home.*',
  lead: 'Small groups over a few weeks, in the studio and online. Each one ends with a practice you keep.',
  actionLabel: 'All programs',
  actionHref: '~/journeys',
  journeys: [
    { title: 'Four weeks of breath', outcome: 'Build a twenty-minute breath practice you can keep without a teacher.', weeks: '4', pillar: 'Breath', image: ph('industrial-blades'), host: 'Ines Aldana', price: '$180', href: '~/journeys' },
    { title: 'The seasonal year', outcome: 'Mark each of the eight turns of the year with a short ritual you can do at home.', weeks: '8', pillar: 'Ritual', image: ph('nature-dunes'), host: 'Ines Aldana', price: '$240', href: '~/journeys' },
    { title: 'Holding a ceremony', outcome: 'Lead a simple naming, blessing or memorial for the people you love.', weeks: '3', pillar: 'Ceremony', image: ph('council'), host: 'A visiting celebrant', price: '$320', href: '~/journeys' },
    { title: 'Seven mornings', outcome: 'A free week of ten-minute practices. It leads into the circle.', weeks: '1', pillar: 'Practice', image: ph('nature-palm'), host: 'Ines Aldana', price: 'Free', href: '~/journeys' },
  ],
}

export const TEMPLE_KIT_PROOF = {
  image: ph('tent'),
  alt: '',
  eyebrow: 'Kind words',
  quote: 'We were married under the olive trees with forty people and no microphone. Everyone heard every word.',
  who: 'Maya and Theo',
  role: 'Married at the house',
  stars: '5',
  more: [
    { text: 'I burn the candle every morning before I sit. The whole flat smells like the great room.', who: 'Ruth K.', on: 'Olive & Ash Candle' },
    { text: 'Four weeks in I could sit for twenty minutes without checking the time. I still do it most days.', who: 'Daniel O.', on: 'Four weeks of breath' },
  ],
}

export const TEMPLE_KIT_MEMBERSHIP = {
  eyebrow: 'Membership',
  title: 'Keep a place *at the house.*',
  lead: 'Three ways to belong. Each step adds more time in the rooms.',
  tiers: [
    {
      eyebrow: 'To begin', name: 'Friend of the house', price: '$18', unit: 'a month', badge: '', featured: false, button: 'Join Friend of the house', href: '~/membership',
      summary: 'Keep a thread to the house. The library, the seasonal letter and early word on every date.',
      perks: 'The full recordings library\nThe seasonal letter, four times a year\n10% off gatherings',
    },
    {
      eyebrow: 'Our pick', name: 'Circle', price: '$54', unit: 'a month', badge: 'First month $27', featured: true, button: 'Join Circle', href: '~/membership',
      summary: 'For people who come often. A place at the morning practice and one program each season.',
      perks: 'Everything for friends of the house\nA place at the morning practice\nOne seasonal program included\n20% off gatherings and suppers',
    },
    {
      eyebrow: 'To hold', name: 'Keeper', price: '$220', unit: 'a month', badge: '', featured: false, button: 'Join Keeper', href: '~/membership',
      summary: 'Hold the house with us. Private time in the rooms, and first seats at every ceremony.',
      perks: 'Everything in Circle\nTwo private healing sessions a month\nFour hours of room hire each season\nFirst seats at the solstice and equinox',
    },
  ],
}

export const TEMPLE_KIT_FAQ = {
  eyebrow: 'Questions',
  title: 'Before *you come.*',
  image: ph('nature-grain'),
  alt: '',
  items: [
    { q: 'Where is the house, and how do I get there?', a: 'Twelve minutes from the centre of Ojai. Free parking on the lower lawn, and step-free paths to every ground-floor room.' },
    { q: 'Do I need to book a gathering?', a: 'Yes. Rooms are kept small, so every gathering is booked by the seat. A held seat is yours for 48 hours.' },
    { q: 'How many people can the house hold?', a: 'Eighty standing in the great room, a hundred and fifty on the garden lawn, twenty-four seated at the long table and thirty mats in the studio.' },
    { q: 'Can I hold a date while I decide?', a: 'Yes. Any date can be held for 48 hours at no cost. We will write before it lapses.' },
    { q: 'What happens at a first gathering?', a: 'Arrive ten minutes early, leave your shoes at the door and take any mat. Nobody is asked to share. Tea is in the kitchen after.' },
    { q: 'Can I pause a membership?', a: 'Members can pause for up to three months a year and keep their rate when they come back.' },
  ],
}

export const TEMPLE_KIT_LETTER = {
  eyebrow: 'The letter',
  title: 'A letter each season. *Four a year.*',
  body: 'New dates, a short essay and first word on the solstice and equinox seats. Nothing else.',
  image: ph('nature-palm'),
  alt: '',
  placeholder: 'you@email.com',
  buttonLabel: 'Keep me posted',
  successMessage: 'Thank you. You are on the list for the next letter.',
}

export const TEMPLE_KIT_CTA = {
  title: 'Come and see it. *The door is open.*',
  primaryLabel: 'Walk the grounds',
  primaryHref: '~/book',
  secondaryLabel: "See what's open",
  secondaryHref: '~/gatherings',
  image: ph('council'),
  alt: '',
}

/** Home: the design's own order (README, "Home (Temple profile)"). */
export function templeKitHomeBlocks(): TempleKitBlockSeed[] {
  return [
    { type: 'TempleKitHero', props: { ...TEMPLE_KIT_HERO } },
    { type: 'TempleKitLive', props: { ...TEMPLE_KIT_LIVE } },
    { type: 'TempleKitGatherings', props: { ...TEMPLE_KIT_GATHERINGS } },
    { type: 'TempleKitRooms', props: { ...TEMPLE_KIT_ROOMS } },
    { type: 'TempleKitOfferings', props: { ...TEMPLE_KIT_OFFERINGS } },
    { type: 'TempleKitSteps', props: { ...TEMPLE_KIT_STEPS } },
    { type: 'TempleKitGallery', props: { ...TEMPLE_KIT_GALLERY } },
    { type: 'TempleKitJourneys', props: { ...TEMPLE_KIT_JOURNEYS } },
    { type: 'TempleKitProof', props: { ...TEMPLE_KIT_PROOF } },
    { type: 'TempleKitMembership', props: { ...TEMPLE_KIT_MEMBERSHIP } },
    { type: 'TempleKitFaq', props: { ...TEMPLE_KIT_FAQ } },
    { type: 'TempleKitLetter', props: { ...TEMPLE_KIT_LETTER } },
    { type: 'TempleKitCta', props: { ...TEMPLE_KIT_CTA } },
  ]
}
