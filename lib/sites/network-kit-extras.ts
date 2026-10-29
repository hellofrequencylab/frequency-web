// THE NETWORK KIT'S THIRTEEN EXTRA HOME BLOCKS, AS THE DESIGN SETS THEM (Network design system, ui_kits/site/NetworkBlocks.jsx
// and data.js). PURE: no React, so the editor, the kit loaders and the seed can import it. The base fourteen live in
// network-kit-home.ts. The design's kits.js lists these thirteen as blocks any kit may switch on: featured event, venue
// facts, events calendar, chapters, circles, stats, organizer note, what we stand for, host here, podcast, Instagram,
// shop strip and coffee-and-contact. The design gives them one view each (kits.js `layouts` names variants for the
// base fourteen only), so the only choice they carry is which side the photo sits on.
//
// THE WORDS ARE THE VOICE GUIDE'S, NOT THE DESIGN'S DEMO. Nothing here states a number about a real group (members,
// attendees, profile views, prices, minutes, seats, episodes), promises a day or a rhythm, or leaves a prompt for
// the owner in live copy. The figures the design invented (1,200+ members, $200 an hour, "Ep. 24 · 38 min", a chapter's
// member count) are blank: a block draws no line without one, and the stats block reads the Space's own counts.
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the Instrument Serif italic.

const P = '/sites/network-kit/photos'

export const NETWORK_KIT_FEATURED = {
  flip: false,
  eyebrow: 'Featured',
  title: 'Bring your idea.\n*Bring your people.*',
  lead: 'A member showcase: a few short talks, open tables and breakfast. Apply to present, or come and cheer.',
  showWhen: true,
  primaryLabel: 'Apply to present',
  primaryHref: '~/contact',
  secondaryLabel: 'See the dates',
  secondaryHref: '~/workshops',
  image: `${P}/photo-10.jpg`,
  alt: '',
  band: '',
}

export const NETWORK_KIT_VENUE = {
  flip: false,
  eyebrow: 'Where we meet',
  title: 'Start with\n*good people.*',
  lead: 'One room, small tables and a host at the door. Say you are new and someone will seat you.',
  facts: [
    { glyph: 'pin', label: 'Where', value: 'Our room', note: 'The address is on the contact page' },
    { glyph: 'clock', label: 'When', value: 'See the calendar', note: 'Every date is on the meetups page' },
    { glyph: 'coffee', label: 'First visit', value: 'Come and see', note: 'Say you are new at the door' },
    { glyph: 'users', label: 'Who', value: 'Owners, professionals, creatives', note: 'Come as you are' },
  ],
  primaryLabel: 'Find us',
  primaryHref: '~/contact',
  secondaryLabel: 'See the calendar',
  secondaryHref: '~/workshops',
  image: `${P}/photo-12.jpg`,
  alt: '',
  band: '',
}

export const NETWORK_KIT_CALENDAR = {
  eyebrow: 'Events',
  title: 'Find a table.\n*Or fill one.*',
  lead: 'Meetups, circles, workshops and socials, all in one place. RSVP and add anything to your calendar.',
  actionLabel: 'All events',
  actionHref: '~/workshops',
  count: 8,
  empty: 'No dates are up yet. Check back soon, or say hello.',
  rows: [] as Record<string, unknown>[],
  band: '',
}

export const NETWORK_KIT_CHAPTERS = {
  eyebrow: 'Chapters',
  title: 'Find your\n*chapter*',
  lead: 'Same welcome, same format, a different room. Members are welcome at every chapter.',
  actionLabel: 'Start a chapter',
  actionHref: '~/contact',
  chapters: [
    { image: `${P}/photo-03.jpg`, name: 'Downtown', when: 'Find the next date', where: 'The courtyard', members: '', href: '~/workshops' },
    { image: `${P}/photo-02.jpg`, name: 'North Park', when: 'Find the next date', where: 'The corner cafe', members: '', href: '~/workshops' },
    { image: `${P}/photo-11.jpg`, name: 'Harbor', when: 'Find the next date', where: 'The rooftop', members: '', href: '~/workshops' },
    { image: `${P}/photo-08.jpg`, name: 'Hillside', when: 'Find the next date', where: 'The garden', members: '', href: '~/workshops' },
  ],
  band: '',
}

export const NETWORK_KIT_CIRCLES = {
  eyebrow: 'Circles',
  title: 'Smaller groups,\n*closer people*',
  lead: 'Members run circles around shared work and shared interests. Join as many as you like.',
  circles: [
    { glyph: 'rocket', name: 'Founders circle', blurb: 'Owners early in the journey, swapping what worked this month.', note: '', href: '~/membership' },
    { glyph: 'palette', name: 'Creatives circle', blurb: 'Designers, makers and writers sharing referrals and studio time.', note: '', href: '~/membership' },
    { glyph: 'house', name: 'Real estate and home', blurb: 'Agents, lenders and trades who send each other work.', note: '', href: '~/membership' },
    { glyph: 'heart-pulse', name: 'Wellness pros', blurb: 'Coaches, therapists and studio owners building practices.', note: '', href: '~/membership' },
    { glyph: 'scale', name: 'Money and law', blurb: 'Bookkeepers, planners and attorneys who answer the hard questions.', note: '', href: '~/membership' },
    { glyph: 'footprints', name: 'Morning walkers', blurb: 'A walk and a coffee. No agenda, good company.', note: '', href: '~/membership' },
  ],
  band: '',
}

export const NETWORK_KIT_STATS = {
  items: [] as Record<string, unknown>[],
  band: '',
}

export const NETWORK_KIT_NOTE = {
  flip: false,
  eyebrow: 'From the organizers',
  quote: 'The goal is a room where people help first.\n*Make the group what you need it to be.*',
  lead: 'A small volunteer team runs the mornings, the chapters and the circles. Every one of them started as a first-time visitor.',
  hosts: [] as Record<string, unknown>[],
  buttonLabel: 'Coffee with an organizer',
  buttonHref: '~/contact',
  image: `${P}/photo-09.jpg`,
  alt: '',
  band: '',
}

export const NETWORK_KIT_PILLARS = {
  eyebrow: 'What we stand for',
  title: 'Learning, ideas\n*and support.*',
  lead: 'Three things every meeting is built around, in every chapter.',
  pillars: [
    { title: 'Learning', body: 'Workshops and talks from members who have done it.' },
    { title: 'Ideas', body: 'A room where it is safe to say the half-formed thing.' },
    { title: 'Support', body: 'People who send referrals, answers and encouragement.' },
  ],
  closing: 'True belonging is not passive. It is the feeling that comes with showing up.',
  image: `${P}/photo-01.jpg`,
  alt: '',
  band: '',
}

export const NETWORK_KIT_ROOMS = {
  eyebrow: 'Host here',
  title: 'Your event deserves\n*a room that takes it seriously.*',
  lead: 'Book the space for a workshop, a recording or a meetup of your own. Members get first pick of dates.',
  buttonLabel: 'Request a date',
  buttonHref: '~/contact',
  rooms: [
    { name: 'Space rental', price: '', unit: '', blurb: 'The main room for workshops and meetups.' },
    { name: 'Recording only', price: '', unit: '', blurb: 'A quiet room, two cameras and an engineer.' },
    { name: 'Recording and editing', price: '', unit: '', blurb: 'Everything in recording, plus an edited episode.' },
  ],
  band: '',
}

export const NETWORK_KIT_PODCAST = {
  eyebrow: 'Listen',
  title: 'The\n*podcast.*',
  lead: 'Members tell the story of what they are building.',
  actionLabel: 'All episodes',
  actionHref: '~/resources',
  episodes: [
    { image: `${P}/photo-09.jpg`, title: 'Starting something new', meta: 'Episode', href: '~/resources' },
    { image: `${P}/photo-02.jpg`, title: 'The first customers', meta: 'Episode', href: '~/resources' },
    { image: `${P}/photo-10.jpg`, title: 'Building a chapter', meta: 'Episode', href: '~/resources' },
  ],
  band: '',
}

export const NETWORK_KIT_SOCIAL = {
  eyebrow: 'Instagram',
  title: 'Connect with us\n*and spread the love.*',
  handle: '',
  url: '',
  photos: [
    { image: `${P}/photo-06.jpg`, alt: '' },
    { image: `${P}/photo-05.jpg`, alt: '' },
    { image: `${P}/photo-11.jpg`, alt: '' },
    { image: `${P}/photo-12.jpg`, alt: '' },
  ],
  band: '',
}

export const NETWORK_KIT_MERCH = {
  eyebrow: 'The shop',
  title: 'Made with local\n*makers.*',
  actionLabel: 'Shop all',
  actionHref: '~/shop',
  buttonLabel: 'View',
  products: [
    { image: `${P}/photo-07.jpg`, glyph: '', name: 'The host kit', variants: '', price: '', href: '~/shop' },
    { image: `${P}/photo-10.jpg`, glyph: '', name: 'Summit day pass', variants: '', price: '', href: '~/shop' },
    { image: `${P}/photo-08.jpg`, glyph: '', name: 'Conversation cards', variants: '', price: '', href: '~/shop' },
    { image: '', glyph: 'file', name: 'Chapter starter templates', variants: '', price: '', href: '~/shop' },
  ],
  band: '',
}

export const NETWORK_KIT_CONTACT = {
  coffeeImage: `${P}/photo-04.jpg`,
  coffeeAlt: '',
  coffeeHand: 'Coffee with an organizer.',
  coffeeTitle: 'Our golden\n*rule.*',
  coffeeBody: 'New members are welcome to meet an organizer. Pick a time and we will meet you for coffee or on a call.',
  coffeeLabel: 'Book a coffee',
  coffeeHref: '~/book',
  title: 'Get in touch',
  lead: 'Want to visit, host or partner? Send a note and an organizer will reply.',
  email: '',
  phone: '',
  instagram: '',
  buttonLabel: 'Send',
  successMessage: 'Thanks. We will be in touch soon.',
  band: '',
}
