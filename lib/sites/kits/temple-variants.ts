import type { CoreKitNiche, KitPage, SiteKit } from './types'

// Temple x the six niche doors. One mega theme, six starting points, all DATA: pages of Temple blocks
// (components/page-editor/blocks/temple.tsx) plus the shared Space blocks, with generic sample copy in the house
// voice (docs/marketing/voice-and-language-guide.md): plain, warm, pain point first, no hard claims, no prices,
// no photos. Every Temple prop that would otherwise fall back to Royal Temple's own words is set here, so a new
// Space never shows another house's copy. A `{{slot|sample words}}` token shows the Space's own fact once it has one.
// Wrap words in *stars* for the accent italic. Live blocks (events, the standing week) read the Space's own rows.

type Block = KitPage['blocks'][number]

const hero = (p: { eyebrow: string; title: string; lead: string; primaryLabel: string; primaryHref: string; secondaryLabel?: string; secondaryHref?: string; ticketLabel?: string }): Block => ({
  type: 'TempleHero',
  props: { secondaryLabel: '', secondaryHref: '', facts: [], image: '', alt: '', ticketLabel: 'Coming up', ...p },
})
const events = (title: string, lead: string, eyebrow = 'Coming up', href = '~/events'): Block => ({
  type: 'TempleEvents',
  props: { eyebrow, title, lead, actionLabel: 'See everything', actionHref: href, count: 3, badge: '', fallback: '', covers: [] },
})
const week = (title: string, lead: string, notes: { weekday: string; label: string }[] = []): Block => ({
  type: 'TempleWeek',
  props: { eyebrow: 'The week', title, lead, notes },
})
const tiers = (title: string, lead: string, list: { rung: string; name: string; blurb: string; perks: string; lead?: boolean }[], href = '~/membership'): Block => ({
  type: 'TempleTiers',
  props: { eyebrow: 'Membership', title, lead, actionLabel: '', actionHref: '', tiers: list.map((t) => ({ price: '', priceNote: '', lead: false, ctaLabel: `Join as ${t.name}`, ctaHref: href, ...t })) },
})
const seasons = (title: string, lead: string, list: { turn: string; title: string }[]): Block => ({
  type: 'TempleSeasons',
  props: { eyebrow: 'The turning year', title, lead, actionLabel: '', actionHref: '', seasons: list.map((s) => ({ when: 'Add a date', image: '', href: '', ...s })) },
})
const retreat = (title: string, lead: string, list: { icon: string; label: string; unit: string }[], primaryLabel: string, primaryHref: string): Block => ({
  type: 'TempleRetreat',
  props: { eyebrow: 'The house', title, lead, image: '', alt: '', primaryLabel, primaryHref, secondaryLabel: '', secondaryHref: '', spaces: list.map((s) => ({ value: 'Add a number', ...s })) },
})
const faq = (title: string, items: { q: string; a: string }[]): Block => ({ type: 'TempleFAQ', props: { eyebrow: 'Questions', title, items } })
const follow = (title: string, lead: string): Block => ({
  type: 'TempleFollow',
  props: { eyebrow: 'Stay close', title, lead, placeholder: 'you@email.com', buttonLabel: 'Sign me up', successMessage: 'Thanks. You are on the list.' },
})

const aboutPage = (lead: string): KitPage => ({
  slug: 'about',
  label: 'About',
  seo: { title: 'About', description: 'Who we are and how we do things.' },
  blocks: [
    { type: 'EditorialSection', props: { body: 'prose', media: 'right', eyebrow: 'Our story', title: 'Hi, we are glad you are here.', lead: `{{story|${lead}}}` } },
    { type: 'SpaceContact', props: { heading: 'Say hello' } },
  ],
})
const eventsPage = (label: string, lead: string): KitPage => ({
  slug: 'events',
  label,
  seo: { title: label, description: 'Every upcoming date.' },
  blocks: [events('All the *dates*', lead, label), { type: 'SpaceEvents', props: {} }],
})
const membershipPage = (lead: string, list: Parameters<typeof tiers>[2]): KitPage => ({
  slug: 'membership',
  label: 'Membership',
  seo: { title: 'Membership', description: 'How to join.' },
  blocks: [tiers('Come *and stay*', lead, list), faq('Before you *join*', [{ q: 'Can I change my mind?', a: 'Yes. Write to us and we will sort it out.' }])],
})

const VARIANTS: Record<CoreKitNiche, Omit<SiteKit, 'theme' | 'version' | 'niche'>> = {
  coaches: {
    id: 'temple-coaches',
    label: 'Coaches and healers',
    description: 'A calm first page, your ways to work together, and an easy way to book.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Work with me', description: 'One-to-one sessions and small groups, and how to book.' },
        blocks: [
          hero({ eyebrow: 'Coaching and care', title: 'A quiet place\nto *start again.*', lead: '{{tagline|Sessions and small groups for people who are ready for the next step. Say hello and we will find a time.}}', primaryLabel: 'Book a first call', primaryHref: '~/book', secondaryLabel: 'See the ways to work', secondaryHref: '~/offerings' }),
          tiers('Ways to *work together*', 'Start with a call. Go deeper when it feels right.', [
            { rung: 'Begin', name: 'First call', blurb: 'A short chat to see if we are a good fit.', perks: 'No pressure\nNo commitment' },
            { rung: 'Deepen', name: 'One-to-one', blurb: 'Time to work on one thing, with notes after.', perks: 'Notes after each session\nChange a booking any time', lead: true },
            { rung: 'Gather', name: 'Small group', blurb: 'A few people, one theme, a steady rhythm.', perks: 'A small circle\nA steady rhythm' },
          ], '~/book'),
          faq('Before you *begin*', [
            { q: 'What happens on the first call?', a: 'We talk about what is going on and what you are hoping for. If we are a fit, we pick a rhythm that works for you.' },
            { q: 'Can I change a booking?', a: 'Yes. Use the link in your confirmation email and pick a new time.' },
          ]),
          follow('Not ready *yet?*', 'Join the list and hear about new sessions when they open.'),
        ],
      },
      {
        slug: 'offerings',
        label: 'Ways to work together',
        seo: { title: 'Ways to work together', description: 'Sessions, small groups and what each one is like.' },
        blocks: [{ type: 'SpaceOfferings', props: { eyebrow: 'Offerings', heading: 'Ways to work together' } }, { type: 'SpaceBooking', props: { heading: '' } }],
      },
      aboutPage('Write a few honest lines about who you are, who you help and what a session feels like. Plain words work best.'),
    ],
  },
  studios: {
    id: 'temple-studios',
    label: 'Studios',
    description: 'Classes, a simple schedule and memberships people can join in a minute.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Classes and membership', description: 'Find a class, see the schedule and join.' },
        blocks: [
          hero({ eyebrow: 'Classes and community', title: 'Find a class you will\n*actually go back to.*', lead: '{{tagline|Friendly classes at every level, a clear schedule and people who notice when you are missing.}}', primaryLabel: 'See the schedule', primaryHref: '~/events', secondaryLabel: 'Join', secondaryHref: '~/membership', ticketLabel: 'Next class' }),
          events('This week *at the studio*', 'Pick a class and save your spot.', 'Next classes'),
          week('The same slots, *every week*', 'Read the week once and the schedule makes sense.'),
          tiers('Pick your *rhythm*', 'Come as often as you like.', [
            { rung: 'Try', name: 'Drop in', blurb: 'Come when it suits you.', perks: 'Any class\nNo commitment' },
            { rung: 'Belong', name: 'Member', blurb: 'Come as often as you like.', perks: 'Every class\nFirst pick of new workshops', lead: true },
          ]),
          follow('Hear about *new classes*', 'Join the list and we will tell you what is coming up.'),
        ],
      },
      eventsPage('Classes', 'Every class, in one place.'),
      membershipPage('Pick the way you want to practise.', [
        { rung: 'Try', name: 'Drop in', blurb: 'Come when it suits you.', perks: 'Any class\nNo commitment' },
        { rung: 'Belong', name: 'Member', blurb: 'Come as often as you like.', perks: 'Every class\nFirst pick of new workshops', lead: true },
      ]),
    ],
  },
  hosts: {
    id: 'temple-hosts',
    label: 'Event hosts',
    description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Gatherings', description: 'What is coming up and how to join.' },
        blocks: [
          hero({ eyebrow: 'Gatherings', title: 'Come as a guest.\n*Stay as one of us.*', lead: '{{tagline|We get people together on a rhythm. Come to one and see if it feels like yours.}}', primaryLabel: 'See what is on', primaryHref: '~/events', secondaryLabel: 'Meet us', secondaryHref: '~/about' }),
          events('Coming up *next*', 'Save your spot. Come early if you can.'),
          week('The same slots, *most weeks*', 'Read the week once and the calendar makes sense.'),
          seasons('The turning *year*', 'A bigger gathering at each solstice and equinox.', [
            { turn: 'March Equinox', title: 'Spring gathering' },
            { turn: 'June Solstice', title: 'Summer gathering' },
            { turn: 'September Equinox', title: 'Autumn gathering' },
            { turn: 'December Solstice', title: 'Winter gathering' },
          ]),
          follow('Hear what is *happening, first*', 'Join the list and we will tell you what is coming up.'),
        ],
      },
      eventsPage('Events', 'Every upcoming gathering.'),
      aboutPage('Tell people why you started, who you hope will come and what a first visit feels like.'),
    ],
  },
  venues: {
    id: 'temple-venues',
    label: 'Venues',
    description: 'Show the room, what is on and how to book it.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'The space', description: 'See the room, what is on and how to book it.' },
        blocks: [
          hero({ eyebrow: 'The space', title: 'A room that makes\n*people want to stay.*', lead: '{{tagline|Add a line about the room, the light and what people use it for.}}', primaryLabel: 'Ask about a date', primaryHref: '~/contact', secondaryLabel: 'See what is on', secondaryHref: '~/events' }),
          retreat('Space for *what you have planned*', 'Describe the room in plain words: what it holds and what people love about it.', [
            { icon: 'arch-door', label: 'The main room', unit: 'people' },
            { icon: 'long-table', label: 'The long table', unit: 'seated' },
            { icon: 'palm', label: 'Outside', unit: 'people' },
          ], 'Ask about a date', '~/contact'),
          events('What is *on*', 'Come and see the room in use.'),
          faq('Before you *book*', [
            { q: 'How do I book?', a: 'Send us the date and what you have in mind. We reply within a couple of days.' },
            { q: 'Can I visit first?', a: 'Yes. Ask for a time and we will show you around.' },
          ]),
        ],
      },
      eventsPage('What is on', 'Everything happening in the room.'),
      aboutPage('Tell the story of the building, who looks after it and what you want it to be for the neighbourhood.'),
    ],
  },
  nonprofits: {
    id: 'temple-nonprofits',
    label: 'Nonprofits',
    description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Our work', description: 'What we do and how you can help.' },
        blocks: [
          hero({ eyebrow: 'Our work', title: 'Something needs doing here.\n*Want to help?*', lead: '{{tagline|Say in one or two lines what you do, who it is for and why it matters.}}', primaryLabel: 'Get involved', primaryHref: '~/involved', secondaryLabel: 'Our story', secondaryHref: '~/about' }),
          tiers('Three ways *to help*', 'Start small. Everything counts.', [
            { rung: 'Come', name: 'Come along', blurb: 'Visit an event and see the work for yourself.', perks: 'Bring a friend\nNo sign-up needed' },
            { rung: 'Give time', name: 'Volunteer', blurb: 'Give a few hours. We will find something that suits you.', perks: 'Pick your own hours\nWe will show you what to do', lead: true },
            { rung: 'Give', name: 'Give', blurb: 'Every gift goes to the work. We will show you where.', perks: 'One time or monthly\nA clear note on where it went' },
          ], '~/involved'),
          events('Coming up', 'Join us at one of these.'),
          follow('Stay *in touch*', 'Join the list and we will tell you how the work is going.'),
        ],
      },
      {
        slug: 'involved',
        label: 'Get involved',
        seo: { title: 'Get involved', description: 'Come along, volunteer or give.' },
        blocks: [
          tiers('Three ways *to help*', 'Pick the one that suits you.', [
            { rung: 'Come', name: 'Come along', blurb: 'Join an event and bring a friend.', perks: 'See the work\nMeet the people' },
            { rung: 'Give time', name: 'Volunteer', blurb: 'Tell us when you are free and what you enjoy.', perks: 'Pick your own hours', lead: true },
            { rung: 'Give', name: 'Give', blurb: 'Add a line about what a gift makes possible.', perks: 'One time or monthly' },
          ], '~/contact'),
          { type: 'SpaceContact', props: { heading: 'Tell us how you want to help' } },
        ],
      },
      eventsPage('Events', 'Every upcoming date.'),
      aboutPage('Tell the story plainly: why this work started, who it is for and who is doing it.'),
    ],
  },
  networks: {
    id: 'temple-networks',
    label: 'Networks',
    description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Find a chapter', description: 'Find a chapter near you, or start one.' },
        blocks: [
          hero({ eyebrow: 'Many places, one community', title: 'Find your people\n*close to home.*', lead: '{{tagline|Chapters in different places, one shared way of doing things. Find the one nearest you.}}', primaryLabel: 'See what is on', primaryHref: '~/events', secondaryLabel: 'Start a chapter', secondaryHref: '~/start' }),
          events('On *everywhere*', 'What is happening across every chapter.'),
          seasons('One calendar, *everywhere*', 'Every chapter marks the turning of the year together.', [
            { turn: 'March Equinox', title: 'Spring gathering' },
            { turn: 'June Solstice', title: 'Summer gathering' },
            { turn: 'September Equinox', title: 'Autumn gathering' },
            { turn: 'December Solstice', title: 'Winter gathering' },
          ]),
          follow('Hear what is *on near you*', 'Join the list and we will tell you what is coming up.'),
        ],
      },
      {
        slug: 'start',
        label: 'Start a chapter',
        seo: { title: 'Start a chapter', description: 'How to start a chapter where you live.' },
        blocks: [
          tiers('How a chapter *begins*', 'Three steps. Start small.', [
            { rung: 'One', name: 'Say hello', blurb: 'Tell us where you live and who you would like to gather.', perks: 'A short note is plenty' },
            { rung: 'Two', name: 'Plan the first one', blurb: 'We help you pick a place and a date.', perks: 'We share what works', lead: true },
            { rung: 'Three', name: 'Open the doors', blurb: 'Invite a few people. It grows from there.', perks: 'Start small' },
          ], '~/contact'),
          { type: 'SpaceContact', props: { heading: 'Ready to start?' } },
        ],
      },
      eventsPage('Events', 'What is on in every chapter.'),
      aboutPage('Tell people why the network exists, who runs it and how the chapters work together.'),
    ],
  },
}

/** The Temple kit for one niche door. */
export function templeKit(niche: CoreKitNiche): SiteKit {
  return { ...VARIANTS[niche], version: 1, theme: 'Temple', niche }
}
