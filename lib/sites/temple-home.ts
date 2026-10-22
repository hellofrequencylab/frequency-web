// THE TEMPLE'S HOME, AS THE DESIGN SETS IT (Royal Temple design system, "The House": seven sections then the
// follow band). One list of blocks in the design's order, each with the design's own words, so the editor's
// Temple template, the block defaults and the Royal Temple seed all start from the same page. PURE: no React,
// so the seed script can import it.

interface TempleBlockSeed {
  type: string
  props: Record<string, unknown>
}

const P = '/sites/temple/photos'

export const TEMPLE_HERO = {
  eyebrow: 'Vista, California · A community house',
  title: 'A house for gathering.',
  lead: 'Dinners, circles, music and shared work, in the same slots most weeks of the year. Come as a guest, or become part of the house.',
  primaryLabel: "See what's happening",
  primaryHref: '~/calendar',
  secondaryLabel: 'Membership',
  secondaryHref: '~/memberships',
  facts: [
    { value: '6–7', label: 'Gatherings a month' },
    { value: '4', label: 'Seasonal events' },
    { value: '$44', label: 'Membership, monthly' },
  ],
  image: `${P}/fire-circle.webp`,
  alt: 'Fire bowl with cushions and rugs on the lawn at sunset',
  ticketLabel: 'Next at the house',
}

/** A series' cover when the event has none of its own: the first card whose words appear in the title. */
const TEMPLE_COVERS = [
  { match: 'dinner', image: `${P}/group-portrait.webp` },
  { match: 'concert', image: `${P}/great-room-night.webp` },
  { match: 'circles', image: `${P}/fire-council.webp` },
  { match: 'moon', image: `${P}/fire-circle.webp` },
  { match: 'craft', image: `${P}/fireplace-window.webp` },
  { match: 'meld', image: `${P}/planning-circle.webp` },
  { match: 'dance', image: `${P}/pool-deck.webp` },
  { match: 'returning home', image: `${P}/treatment-room.webp` },
]

export const TEMPLE_EVENTS = {
  eyebrow: 'Next at the house',
  title: "What's coming up.",
  lead: 'Members come to every house gathering. Guests pay at the door, and the address comes with your RSVP.',
  actionLabel: 'Full calendar',
  actionHref: '~/calendar',
  count: 3,
  badge: 'Members included',
  fallback: `${P}/sunset-ridge.webp`,
  covers: TEMPLE_COVERS,
}

export const TEMPLE_WEEK = {
  eyebrow: 'The standing week',
  title: 'Same slots, all year.',
  lead: 'Read the week once and the calendar makes sense. Tuesdays and Wednesdays alternate; Sundays carry the most.',
  notes: [
    { weekday: 'Monday', label: 'Quiet hours' },
    { weekday: 'Thursday', label: 'Flex day' },
    { weekday: 'Friday', label: 'Retreat & rental' },
    { weekday: 'Saturday', label: 'Retreat & rental' },
  ],
}

export const TEMPLE_TIERS = {
  eyebrow: 'Membership',
  title: 'Follow, belong, hold.',
  lead: 'Three rungs. Each one opens what the one below it could not.',
  actionLabel: 'Compare the rungs',
  actionHref: '~/memberships',
  tiers: [
    {
      rung: 'Follow', name: 'Temple Guest', price: 'Free', priceNote: 'One person', lead: false,
      blurb: 'Follow the house. Come to anything, pay at the door.',
      perks: 'Event announcements\nDoor price on public gatherings\nAddress sent on RSVP',
      ctaLabel: 'Follow for free', ctaHref: '~/memberships',
    },
    {
      rung: 'Belong', name: 'Temple Member', price: '$44', priceNote: 'a month · $440 a year', lead: true,
      blurb: 'Every gathering the house holds is yours.',
      perks: 'Every house gathering included, all year\nFirst RSVP priority\nMember rate on the four seasonal events\n15% off guest-hosted events and weeknight stays',
      ctaLabel: 'Join as Member', ctaHref: '~/memberships',
    },
    {
      rung: 'Hold', name: 'Temple Guardian', price: '$88', priceNote: 'a month · $880 a year · household', lead: false,
      blurb: 'Everything above, for your whole household.',
      perks: 'Everything in Member, for partner and kids\nAll four seasonal events included\nOne guest pass a month\n20% off guest-hosted events and weeknight stays\nHearth Table dinner on the eve of each seasonal event',
      ctaLabel: 'Join as Guardian', ctaHref: '~/memberships',
    },
  ],
}

export const TEMPLE_SEASONS = {
  eyebrow: 'The turning year',
  title: 'Four seasonal events.',
  lead: 'One at each solstice and equinox. Members get the member rate; Guardians come free.',
  actionLabel: 'The whole year',
  actionHref: '~/calendar',
  seasons: [
    { turn: 'December Solstice', title: 'Winter Bazaar', when: 'Sat Dec 19, 2026', image: `${P}/sunset-grove.webp`, href: '' },
    { turn: 'March Equinox', title: 'Spring Feast', when: 'Sat Mar 20, 2027', image: `${P}/pool-temple.webp`, href: '' },
    { turn: 'June Solstice', title: 'Summer Festival', when: 'Fri–Sun Jun 18–20, 2027', image: `${P}/sunset-ridge.webp`, href: '' },
    { turn: 'September Equinox', title: 'Fall Campout', when: 'Fri–Sun Sep 24–26, 2027', image: `${P}/bell-tent.webp`, href: '' },
  ],
}

export const TEMPLE_RETREAT = {
  eyebrow: 'Retreat & rental',
  title: 'Fridays and Saturdays are held.',
  lead: 'The weekend is kept for retreat stays and private rentals. Thursdays are flexible, for guest-hosted events or retreat check-in.',
  image: `${P}/pool-temple.webp`,
  alt: 'The pool and the carved deck',
  spaces: [
    { icon: 'palm', label: 'The lawn', value: '120', unit: 'standing' },
    { icon: 'long-table', label: 'The Open Table', value: '24', unit: 'seated' },
    { icon: 'stone-stack', label: 'Open-air studio', value: '30', unit: 'mats' },
    { icon: 'arch-door', label: 'Rooms to stay in', value: '6', unit: 'private' },
  ],
  primaryLabel: 'Ask about a date',
  primaryHref: '~/contact',
}

export const TEMPLE_FAQ = {
  eyebrow: 'Questions',
  title: 'Before you come.',
  items: [
    { q: 'Where is the house?', a: 'In Vista, California. The address is sent with every RSVP confirmation.' },
    { q: 'Is dinner potluck?', a: 'Yes. Community Dinner is potluck, so bring a dish to share.' },
    { q: 'What does membership include?', a: 'Temple Member includes every house gathering, all year, with first RSVP priority. Guests pay at the door.' },
    { q: 'What if the price is a stretch?', a: 'A supported rate at $22 a month is available quietly by request. No one is kept out over money.' },
    { q: 'Can I rent the house?', a: 'Fridays and Saturdays are held for retreat stays and private rentals. Write to the house with your dates.' },
  ],
}

export const TEMPLE_FOLLOW = {
  eyebrow: 'Follow the house',
  title: "Hear what's happening, first.",
  lead: 'Event announcements from Royal Temple. Free, and the first ring of membership.',
  placeholder: 'you@email.com',
  buttonLabel: 'Follow',
  successMessage: 'You follow the house. Announcements will come to your inbox.',
}

/** The Home page: the design's seven sections in order, then the follow band. */
export function templeHomeBlocks(): TempleBlockSeed[] {
  return [
    { type: 'TempleHero', props: { ...TEMPLE_HERO } },
    { type: 'TempleEvents', props: { ...TEMPLE_EVENTS } },
    { type: 'TempleWeek', props: { ...TEMPLE_WEEK } },
    { type: 'TempleTiers', props: { ...TEMPLE_TIERS } },
    { type: 'TempleSeasons', props: { ...TEMPLE_SEASONS } },
    { type: 'TempleRetreat', props: { ...TEMPLE_RETREAT } },
    { type: 'TempleFAQ', props: { ...TEMPLE_FAQ } },
    { type: 'TempleFollow', props: { ...TEMPLE_FOLLOW } },
  ]
}
