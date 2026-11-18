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
  eyebrow: 'Your town · Your region',
  title: 'A house for gathering.',
  lead: 'Rooms for ceremony, practice and long tables. Small numbers, slow hours, nothing rushed.',
  primaryLabel: "See what's open",
  primaryHref: '~/gatherings',
  secondaryLabel: 'Hire the house',
  secondaryHref: '~/ceremonies-hire',
  image: ph('photo-02'),
  alt: '',
  pos: 'center 55%',
  live: true,
  cardLabel: 'Next gathering',
  cardTitle: 'Your next gathering',
  cardWhen: '',
  cardNote: '',
  cardImage: ph('industrial-panel'),
  cardHref: '~/gatherings',
}

export const TEMPLE_KIT_LIVE = {
  items: [
    { source: 'nextEvent', icon: 'calendar', label: 'Next gathering', value: 'Shows your next date', href: '~/gatherings' },
    { source: 'custom', icon: 'circle', label: 'Walk the grounds', value: 'Ask for a time', href: '~/book' },
    { source: 'custom', icon: 'arc', label: 'Next program', value: 'Say when the next one starts', href: '~/programs' },
    { source: 'custom', icon: 'map-pin', label: 'Find us', value: 'Your town', href: '~/contact' },
  ],
}

export const TEMPLE_KIT_GATHERINGS = {
  eyebrow: "What's open",
  title: 'Gatherings *this season.*',
  lead: 'Sound, breath, suppers and the turns of the year. Small groups, in person.',
  actionLabel: 'All gatherings',
  actionHref: '~/gatherings',
  count: 4,
  note: 'Seats are sold singly, so you may sit beside someone new.',
  empty: 'No dates are open right now. The next letter has them first.',
  rows: [
    { month: '', day: '', when: '', time: '', title: '', place: '', price: '', seats: '', image: ph('industrial-panel'), href: '~/gatherings' },
    { month: '', day: '', when: '', time: '', title: '', place: '', price: '', seats: '', image: ph('nature-palm'), href: '~/gatherings' },
    { month: '', day: '', when: '', time: '', title: '', place: '', price: '', seats: '', image: ph('industrial-blades'), href: '~/gatherings' },
    { month: '', day: '', when: '', time: '', title: '', place: '', price: '', seats: '', image: ph('council'), href: '~/gatherings' },
  ],
}

export const TEMPLE_KIT_ROOMS = {
  eyebrow: 'The house',
  title: 'Every room *has a use.*',
  lead: '',
  actionLabel: 'Hire a room',
  actionHref: '~/ceremonies-hire',
  rooms: [
    { name: 'The great room', capacity: '', image: ph('industrial-panel'), href: '~/ceremonies-hire' },
    { name: 'The garden lawn', capacity: '', image: ph('nature-fern'), href: '~/ceremonies-hire' },
    { name: 'The long table', capacity: '', image: ph('planning'), href: '~/ceremonies-hire' },
    { name: 'The fire circle', capacity: '', image: ph('industrial-blades'), href: '~/ceremonies-hire' },
    { name: 'Healing rooms', capacity: '', image: ph('industrial-ribs'), href: '~/ceremonies-hire' },
    { name: 'The pool court', capacity: '', image: ph('pool-temple'), href: '~/ceremonies-hire' },
  ],
}

export const TEMPLE_KIT_OFFERINGS = {
  eyebrow: 'Ceremonies & hire',
  title: 'The house, *held for you.*',
  lead: 'Ceremonies, retreats and room hire. Start with a walk of the grounds.',
  buttonLabel: 'Hold a date',
  services: [
    {
      numeral: 'I', title: 'Ceremonies', length: 'Weddings, namings, memorials', price: '', image: ph('pool-temple'), href: '~/contact',
      summary: 'Vows under the olive trees, a naming at the fire, a memorial in the great room. We hold the space, the light and the quiet; you bring the people who matter.',
      includes: 'A planning walk of the grounds with our ceremony host\nThe great room or the garden lawn, set and cleared\nCandles, cushions and a sound system that stays out of sight',
    },
    {
      numeral: 'II', title: 'Retreats', length: 'Two to five nights', price: '', image: ph('tent'), href: '~/contact',
      summary: 'Bring your group for a few nights on the grounds. The rooms and tents sleep your group; the studio, fire circle and long table are yours for the stay.',
      includes: 'Rooms for your group, with linens and morning tea\nFull use of the studio, council room and fire circle\nMeals at the long table, cooked by our kitchen',
    },
    {
      numeral: 'III', title: 'Space hire', length: 'An evening to a full day', price: '', image: ph('industrial-panel'), href: '~/contact',
      summary: 'The studio for a class, the council room for a circle, the long table for a supper. Hire one room for an evening or the whole house for a day.',
      includes: 'A hold on the date while you decide\nSetup and reset by our house team\nStep-free access to every room on the ground floor',
    },
  ],
}

export const TEMPLE_KIT_STEPS = {
  eyebrow: 'A first visit',
  title: 'Three ways *through the door.*',
  lead: '',
  steps: [
    { title: 'Come to a gathering', body: 'A sound bath, a supper or a breath circle. Book a single seat.', image: ph('industrial-blades') },
    { title: 'Walk the grounds', body: 'A tour with our house host, for anyone planning a ceremony or a stay.', image: ph('planning') },
    { title: 'Hold a date', body: 'Any date can be held while you decide.', image: ph('guest-room') },
  ],
}

export const TEMPLE_KIT_GALLERY = {
  eyebrow: 'Life at the house',
  title: 'The grounds, kept quietly. Fire in winter, the long table in summer, and the pool court at every hour between.',
  body: 'Photographs from the house.',
  photos: [{ image: ph('nature-palm'), alt: '' }, { image: ph('nature-dunes'), alt: '' }, { image: ph('nature-grain'), alt: '' }],
}

export const TEMPLE_KIT_JOURNEYS = {
  eyebrow: 'Programs',
  title: 'Practices *to take home.*',
  lead: 'Small groups over a few weeks, in the studio and online. Each one ends with a practice you keep.',
  actionLabel: 'All programs',
  actionHref: '~/programs',
  journeys: [
    { title: 'Four weeks of breath', outcome: 'Build a twenty-minute breath practice you can keep without a teacher.', weeks: '4', pillar: 'Breath', image: ph('industrial-blades'), host: '', price: '', href: '~/programs' },
    { title: 'The seasonal year', outcome: 'Mark the turns of the year with a short ritual you can do at home.', weeks: '8', pillar: 'Ritual', image: ph('nature-dunes'), host: '', price: '', href: '~/programs' },
    { title: 'Holding a ceremony', outcome: 'Lead a simple naming, blessing or memorial for the people you love.', weeks: '3', pillar: 'Ceremony', image: ph('council'), host: '', price: '', href: '~/programs' },
    { title: 'Seven mornings', outcome: 'A week of ten-minute practices. It leads into the circle.', weeks: '1', pillar: 'Practice', image: ph('nature-palm'), host: '', price: '', href: '~/programs' },
  ],
}

export const TEMPLE_KIT_PROOF = {
  image: ph('tent'),
  alt: '',
  eyebrow: 'Kind words',
  quote: 'Ask someone who came what changed for them, and paste their words here. A real line beats a polished one.',
  who: 'Their name',
  role: 'What they came for',
  stars: '0',
  more: [],
}

export const TEMPLE_KIT_MEMBERSHIP = {
  eyebrow: 'Membership',
  title: 'Keep a place *at the house.*',
  lead: 'Three ways to belong. Each step adds more time in the rooms.',
  tiers: [
    {
      eyebrow: 'To begin', name: 'Friend of the house', price: '', unit: '', badge: '', featured: false, button: 'Join Friend of the house', href: '~/membership',
      summary: 'Keep a thread to the house. The library, the seasonal letter and early word on dates.',
      perks: 'The full recordings library\nThe seasonal letter\nMember rates on gatherings',
    },
    {
      eyebrow: 'Our pick', name: 'Circle', price: '', unit: '', badge: '', featured: true, button: 'Join Circle', href: '~/membership',
      summary: 'For people who come often. A place at the morning practice and a program to start.',
      perks: 'Everything for friends of the house\nA place at the morning practice\nA program to start\nMember rates on gatherings and suppers',
    },
    {
      eyebrow: 'To hold', name: 'Keeper', price: '', unit: '', badge: '', featured: false, button: 'Join Keeper', href: '~/membership',
      summary: 'Hold the house with us. Private time in the rooms, and first seats at every ceremony.',
      perks: 'Everything in Circle\nPrivate healing sessions\nRoom hire in the house\nFirst seats at the solstice and equinox',
    },
  ],
}

export const TEMPLE_KIT_FAQ = {
  eyebrow: 'Questions',
  title: 'Before *you come.*',
  image: ph('nature-grain'),
  alt: '',
  items: [
    { q: 'Where is the house, and how do I get there?', a: 'Say where you are, how people get there and where they park. Mention step-free paths if you have them.' },
    { q: 'Do I need to book a gathering?', a: 'Yes. Rooms are kept small, so every gathering is booked by the seat. A held seat is yours while we wait to hear from you.' },
    { q: 'How many people can the house hold?', a: 'Say how many each room holds, standing and seated, so a planner can tell at a glance.' },
    { q: 'Can I hold a date while I decide?', a: 'Yes. Ask us to hold a date while you decide. We will write before the hold lapses.' },
    { q: 'What happens at a first gathering?', a: 'Arrive a little early, leave your shoes at the door and take any mat. Nobody is asked to share. Tea is in the kitchen after.' },
    { q: 'Can I pause a membership?', a: 'Members can pause and keep their rate when they come back.' },
  ],
}

export const TEMPLE_KIT_LETTER = {
  eyebrow: 'The letter',
  title: 'A letter from the house. *Now and then.*',
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
