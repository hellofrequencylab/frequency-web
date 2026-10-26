import type { KitNiche, KitPage, SiteKit } from './types'

// Midnight x the six niche doors. One mega theme, six starting points, all DATA: pages of Midnight blocks
// (components/page-editor/blocks/midnight.tsx) with generic sample copy in the house voice
// (docs/marketing/voice-and-language-guide.md): plain, warm, pain point first, no hard claims, no prices, no photos.
// Copy resolves saved content, then kit copy, then the block default (lib/spaces/content-slots.ts), so a
// `{{slot|sample words}}` token shows the Space's own fact once it has one. Wrap words in *stars* for the italic.
// Live blocks (events, Journeys, reviews, questions) read the Space's own rows and use the cards below until then.

type Block = KitPage['blocks'][number]

const hero = (p: { eyebrow: string; title: string; lead: string; primaryLabel: string; primaryHref: string; secondaryLabel?: string; secondaryHref?: string }): Block => ({
  type: 'MidnightHero',
  props: { layout: 'center', image: '', alt: '', secondaryLabel: '', secondaryHref: '', ...p },
})
const banner = (eyebrow: string, title: string, lead: string): Block => ({
  type: 'MidnightHero',
  props: { layout: 'banner', eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: '', alt: '' },
})
const doors = (title: string, doorList: { sigil: string; title: string; body: string; href: string }[]): Block => ({
  type: 'MidnightDoors',
  props: { eyebrow: 'Ways in', title, lead: '', doors: doorList },
})
const offerings = (title: string, lead: string, list: { sigil: string; name: string; minutes: string; blurb: string; href: string }[]): Block => ({
  type: 'MidnightOfferings',
  props: { eyebrow: 'Offerings', title, lead, actionLabel: '', actionHref: '', offerings: list.map((o) => ({ ...o, price: '' })) },
})
const gatherings = (href: string, title: string, lead: string, rows: { month: string; day: string; title: string; meta: string }[]): Block => ({
  type: 'MidnightGatherings',
  props: { eyebrow: 'Coming up', title, lead, actionLabel: 'See everything', actionHref: href, count: 4, image: '', alt: '', rows: rows.map((r) => ({ ...r, note: '', href })) },
})
const membership = (title: string, lead: string, tiers: { sigil: string; name: string; blurb: string; badge?: string }[]): Block => ({
  type: 'MidnightMembership',
  props: { eyebrow: 'Membership', title, lead, tiers: tiers.map((t) => ({ badge: '', ...t, price: '', buttonLabel: `Join as ${t.name}`, href: '~/membership' })) },
})
const proof: Block = { type: 'MidnightProof', props: { quote: 'Add a few kind words from someone you have worked with. Their own words land better than ours.', who: 'A happy regular', role: '', rating: '', live: true } }
const letter = (title: string, em: string, lead: string): Block => ({
  type: 'MidnightLetter',
  props: { title, em, lead, placeholder: 'you@email.com', buttonLabel: 'Sign me up', successMessage: 'Thanks. You are on the list.' },
})
const faq = (title: string, items: { q: string; a: string }[]): Block => ({ type: 'MidnightFAQ', props: { eyebrow: 'Questions', title, lead: '', items } })
const cta = (title: string, buttonLabel: string, buttonHref: string): Block => ({ type: 'MidnightCTA', props: { title, buttonLabel, buttonHref } })
const aboutPage = (lead: string): KitPage => ({
  slug: 'about',
  label: 'About',
  seo: { title: 'About', description: 'Who we are and how we do things.' },
  blocks: [
    banner('About', '{{name|A small team, on purpose}}', 'Why we do this, and who we do it for.'),
    { type: 'EditorialSection', props: { body: 'prose', media: 'right', eyebrow: 'Our story', title: 'Hi, we are glad you are here.', lead: `{{story|${lead}}}` } },
    { type: 'SpaceContact', props: { heading: 'Say hello' } },
  ],
})

const eventsPage = (label: string, line: string): KitPage => ({
  slug: 'events',
  label,
  seo: { title: label, description: 'Every upcoming date.' },
  blocks: [banner(label, 'All the *dates*', line), { type: 'SpaceEvents', props: {} }],
})
const membershipPage = (lead: string, tiers: { sigil: string; name: string; blurb: string; badge?: string }[]): KitPage => ({
  slug: 'membership',
  label: 'Membership',
  seo: { title: 'Membership', description: 'How to join.' },
  blocks: [banner('Membership', 'Come *and stay*', lead), membership('Pick your *rhythm*', lead, tiers)],
})

const VARIANTS: Record<KitNiche, Omit<SiteKit, 'theme' | 'version' | 'niche'>> = {
  coaches: {
    id: 'midnight-coaches',
    label: 'Coaches and healers',
    description: 'A calm first page, your ways to work together, and an easy way to book.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Work with me', description: 'One-to-one sessions and small groups, and how to book.' },
        blocks: [
          hero({ eyebrow: 'Coaching and care', title: 'Stuck on the same thing\n*for too long?*', lead: '{{tagline|Sessions and small groups for people who are ready for the next step. Say hello and we will find a time.}}', primaryLabel: 'Book a first call', primaryHref: '~/book', secondaryLabel: 'See the ways to work', secondaryHref: '~/offerings' }),
          doors('Start *where it suits*', [
            { sigil: 'mercury', title: 'Book a session', body: 'A short first call, no pressure.', href: '~/book' },
            { sigil: 'fire', title: 'Join a small group', body: 'A few people who meet on a rhythm.', href: '~/offerings' },
            { sigil: 'moon-full', title: 'Say hello first', body: 'Ask a question, no pressure.', href: '~/contact' },
          ]),
          proof,
          faq('Before you *begin*', [
            { q: 'What happens on the first call?', a: 'We talk about what is going on and what you are hoping for. If we are a fit, we pick a rhythm that works for you.' },
            { q: 'Can I change a booking?', a: 'Yes. Use the link in your confirmation email and pick a new time.' },
          ]),
          cta('Not sure where to start?\n*Say hello first.*', 'Book a first call', '~/book'),
        ],
      },
      {
        slug: 'offerings',
        label: 'Ways to work together',
        seo: { title: 'Ways to work together', description: 'Sessions, small groups and what each one is like.' },
        blocks: [
          banner('Offerings', 'Ways to *work together*', 'Pick the one that fits your season. You can always change.'),
          offerings('Sessions and groups', 'Every offer can start with a short call.', [
            { sigil: 'moon-new', name: 'First call', minutes: '20', blurb: 'A short chat to see if we are a good fit.', href: '~/book' },
            { sigil: 'mercury', name: 'One-to-one session', minutes: '60', blurb: 'Time to work on one thing, with notes after.', href: '~/book' },
            { sigil: 'saturn', name: 'Small group', minutes: '90', blurb: 'A few people, one theme, a steady rhythm.', href: '~/contact' },
          ]),
          { type: 'SpaceBooking', props: { heading: '' } },
        ],
      },
      aboutPage('Write a few honest lines about who you are, who you help and what a session feels like. Plain words work best.'),
    ],
  },
  studios: {
    id: 'midnight-studios',
    label: 'Studios',
    description: 'Classes, a simple schedule and memberships people can join in a minute.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Classes and membership', description: 'Find a class, see the schedule and join.' },
        blocks: [
          hero({ eyebrow: 'Classes and community', title: 'Find a class you will\n*actually go back to.*', lead: '{{tagline|Friendly classes at every level, a clear schedule and people who notice when you are missing.}}', primaryLabel: 'See the schedule', primaryHref: '~/classes', secondaryLabel: 'Join', secondaryHref: '~/membership' }),
          { type: 'MidnightLive', props: { items: [{ source: 'nextEvent', sigil: 'moon-new', label: 'Next class', value: 'See the schedule', href: '~/classes' }, { source: 'members', sigil: 'moon-full', label: 'Members', value: 'Join us', href: '~/membership' }] } },
          gatherings('~/classes', 'This *week*', 'Classes show up here as you add them.', [
            { month: 'Mon', day: '1', title: 'Morning class', meta: 'Add your time and room' },
            { month: 'Wed', day: '3', title: 'Evening class', meta: 'Add your time and room' },
            { month: 'Sat', day: '6', title: 'Weekend workshop', meta: 'Add your time and room' },
          ]),
          membership('Come *as often as you like*', 'Pick the one that matches your rhythm. Pause any time.', [
            { sigil: 'moon-quarter', name: 'Drop in', blurb: 'Pay as you go, no strings.' },
            { sigil: 'moon-full', name: 'Regular', blurb: 'A set number of classes each month.', badge: 'Most chosen' },
            { sigil: 'saturn', name: 'Unlimited', blurb: 'Come whenever you like.' },
          ]),
          faq('First time? *Read this.*', [
            { q: 'What should I bring?', a: 'Comfortable clothes and a water bottle. Tell the teacher it is your first class and they will look after you.' },
            { q: 'Can I try a class first?', a: 'Yes. Book a single class and see how it feels.' },
          ]),
          cta('Ready when you are.', 'See the schedule', '~/classes'),
        ],
      },
      {
        slug: 'classes',
        label: 'Classes',
        seo: { title: 'Classes', description: 'The full class schedule.' },
        blocks: [banner('Classes', 'The *schedule*', 'Everything on, in one place.'), { type: 'SpaceEvents', props: {} }],
      },
      membershipPage('Pick the one that matches your rhythm. Pause any time.', [
        { sigil: 'moon-quarter', name: 'Drop in', blurb: 'Pay as you go, no strings.' },
        { sigil: 'moon-full', name: 'Regular', blurb: 'A set number of classes each month.', badge: 'Most chosen' },
        { sigil: 'saturn', name: 'Unlimited', blurb: 'Come whenever you like.' },
      ]),
      aboutPage('Tell people why you opened the studio, who your teachers are and what a class feels like.'),
    ],
  },
  hosts: {
    id: 'midnight-hosts',
    label: 'Event hosts',
    description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Gatherings', description: 'What is coming up and how to join.' },
        blocks: [
          hero({ eyebrow: 'Gatherings', title: 'Good nights need\n*a good home.*', lead: '{{tagline|Come to the next one, bring a friend, and tell us what you would like more of.}}', primaryLabel: 'See what is coming up', primaryHref: '~/events', secondaryLabel: 'Our story', secondaryHref: '~/about' }),
          gatherings('~/events', 'Coming *up*', 'New dates show up here as you add them.', [
            { month: 'Soon', day: '1', title: 'Your next gathering', meta: 'Add a time and place' },
            { month: 'Soon', day: '2', title: 'The one after', meta: 'Add a time and place' },
          ]),
          doors('Join *in*', [
            { sigil: 'fire', title: 'Come along', body: 'Find the next date and save a spot.', href: '~/events' },
            { sigil: 'mercury', title: 'Bring a friend', body: 'The more the merrier.', href: '~/events' },
            { sigil: 'moon-full', title: 'Say hello', body: 'Ask us anything first.', href: '~/contact' },
          ]),
          proof,
          letter('One note before each one.', 'No more.', 'Dates, details and nothing you did not ask for.'),
          cta('Get people together.\n*Do things on purpose.*', 'See what is coming up', '~/events'),
        ],
      },
      {
        slug: 'events',
        label: 'Events',
        seo: { title: 'Events', description: 'Every upcoming gathering.' },
        blocks: [banner('Events', 'All the *dates*', 'Pick one and save a spot.'), { type: 'SpaceEvents', props: {} }],
      },
      aboutPage('Say why you started gathering people, what a night is like and who it is for.'),
    ],
  },
  venues: {
    id: 'midnight-venues',
    label: 'Venues',
    description: 'Show the room, what is on and how to book it.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Visit and hire', description: 'What is on, and how to hire the space.' },
        blocks: [
          hero({ eyebrow: 'Our space', title: 'Give people a reason\n*to walk in.*', lead: '{{tagline|A warm room for gatherings, classes and celebrations. Come and see what is on, or ask about hiring it.}}', primaryLabel: 'Ask about hiring', primaryHref: '~/hire', secondaryLabel: 'What is on', secondaryHref: '~/events' }),
          { type: 'MidnightLive', props: { items: [{ source: 'nextEvent', sigil: 'moon-new', label: 'Next up', value: 'See what is on', href: '~/events' }, { source: 'custom', sigil: 'moon-full', label: 'Open', value: '{{hours|Add your opening hours}}', href: '~/visit' }] } },
          offerings('Ways to *use the space*', 'Tell us what you have in mind and we will help.', [
            { sigil: 'moon-new', name: 'Come and visit', minutes: '', blurb: 'Drop in, look around and meet the team.', href: '~/visit' },
            { sigil: 'fire', name: 'Host your event', minutes: '', blurb: 'Workshops, parties and small gatherings.', href: '~/hire' },
            { sigil: 'saturn', name: 'Regular bookings', minutes: '', blurb: 'A steady slot for your class or group.', href: '~/hire' },
          ]),
          gatherings('~/events', 'What is *on*', 'Events show up here as you add them.', [
            { month: 'Soon', day: '1', title: 'First event', meta: 'Add a time' },
            { month: 'Soon', day: '2', title: 'Second event', meta: 'Add a time' },
          ]),
          faq('Before you *visit*', [
            { q: 'How do I find you?', a: 'Add your address and a line about getting here, parking and step-free access.' },
            { q: 'Can I hire the space?', a: 'Yes. Send us a note with the date, how many people and what you are planning.' },
          ]),
          cta('Come and see it.', 'Plan a visit', '~/visit'),
        ],
      },
      {
        slug: 'visit',
        label: 'Visit',
        seo: { title: 'Visit', description: 'Where we are and when we are open.' },
        blocks: [banner('Visit', 'Come *and see us*', 'Where we are and when to come.'), { type: 'SpaceContact', props: { heading: 'Find us' } }],
      },
      eventsPage('What is on', 'Everything happening in the space.'),
      {
        slug: 'hire',
        label: 'Hire the space',
        seo: { title: 'Hire the space', description: 'Tell us about your event.' },
        blocks: [banner('Hire', 'Tell us *what you are planning*', 'Date, numbers and the feel you want.'), { type: 'SpaceContact', props: { heading: 'Write to us' } }],
      },
    ],
  },
  nonprofits: {
    id: 'midnight-nonprofits',
    label: 'Nonprofits',
    description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Get involved', description: 'What we do and how you can help.' },
        blocks: [
          hero({ eyebrow: 'Our work', title: 'People want to help.\n*Make it easy to say yes.*', lead: '{{tagline|Say in one plain sentence what you do and who it is for.}}', primaryLabel: 'Get involved', primaryHref: '~/get-involved', secondaryLabel: 'See what is on', secondaryHref: '~/events' }),
          doors('Ways to *help*', [
            { sigil: 'fire', title: 'Come along', body: 'Meet us at the next gathering.', href: '~/events' },
            { sigil: 'mercury', title: 'Volunteer', body: 'Give a little time, a few times a year.', href: '~/get-involved' },
            { sigil: 'moon-full', title: 'Give', body: 'Every bit goes to the work.', href: '~/get-involved' },
            { sigil: 'saturn', title: 'Partner with us', body: 'Local groups and businesses welcome.', href: '~/contact' },
          ]),
          gatherings('~/events', 'Coming *up*', 'Events show up here as you add them.', [
            { month: 'Soon', day: '1', title: 'Community gathering', meta: 'Add a time and place' },
            { month: 'Soon', day: '2', title: 'Volunteer day', meta: 'Add a time and place' },
          ]),
          proof,
          letter('Updates, now and then.', 'No spam.', 'What we did, what is next, and how you can help.'),
          cta('Start with one small step.', 'Get involved', '~/get-involved'),
        ],
      },
      {
        slug: 'get-involved',
        label: 'Get involved',
        seo: { title: 'Get involved', description: 'Volunteer, give or partner with us.' },
        blocks: [
          banner('Get involved', 'Pick *your way in*', 'Small or big, it all counts.'),
          doors('Ways to *help*', [
            { sigil: 'mercury', title: 'Volunteer', body: 'Tell us when you are free and what you enjoy.', href: '~/contact' },
            { sigil: 'moon-full', title: 'Give', body: 'Say how people can give.', href: '~/contact' },
            { sigil: 'saturn', title: 'Partner with us', body: 'Say what a partnership looks like.', href: '~/contact' },
          ]),
          { type: 'SpaceContact', props: { heading: 'Talk to us' } },
        ],
      },
      eventsPage('Events', 'Come along to the next one.'),
      aboutPage('Tell the story of why the group started, who it serves and what has changed because of it.'),
    ],
  },
  networks: {
    id: 'midnight-networks',
    label: 'Networks',
    description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Find a chapter', description: 'Chapters, gatherings and how to start one.' },
        blocks: [
          hero({ eyebrow: 'Our network', title: 'Many chapters.\n*One place to find them.*', lead: '{{tagline|Find your local chapter, come to a gathering, or start one in your town.}}', primaryLabel: 'Find a chapter', primaryHref: '~/chapters', secondaryLabel: 'Start one', secondaryHref: '~/contact' }),
          doors('Find your *people*', [
            { sigil: 'fire', title: 'Find a chapter', body: 'See who is near you.', href: '~/chapters' },
            { sigil: 'mercury', title: 'Come to a gathering', body: 'Meet people in person.', href: '~/events' },
            { sigil: 'moon-full', title: 'Join the network', body: 'Be part of the whole thing.', href: '~/membership' },
            { sigil: 'saturn', title: 'Start a chapter', body: 'We will help you begin.', href: '~/contact' },
          ]),
          gatherings('~/events', 'Across the *network*', 'Gatherings from every chapter show up here.', [
            { month: 'Soon', day: '1', title: 'A gathering near you', meta: 'Add a chapter and time' },
            { month: 'Soon', day: '2', title: 'A network-wide night', meta: 'Add a time' },
          ]),
          membership('Be part of *it*', 'Join for free, or help keep it going.', [
            { sigil: 'moon-quarter', name: 'Member', blurb: 'Come to gatherings and stay in the loop.' },
            { sigil: 'moon-full', name: 'Supporter', blurb: 'Help keep the network going.', badge: 'Most chosen' },
          ]),
          faq('Good *to know*', [
            { q: 'How do I start a chapter?', a: 'Write to us. We will talk about your town, your people and what you would like to run.' },
            { q: 'Do chapters run themselves?', a: 'Each chapter hosts its own gatherings. The network gives you a home, tools and other hosts to learn from.' },
          ]),
          cta('Get people together.\n*Do things on purpose.*', 'Find a chapter', '~/chapters'),
        ],
      },
      {
        slug: 'chapters',
        label: 'Chapters',
        seo: { title: 'Chapters', description: 'Every chapter in the network.' },
        blocks: [banner('Chapters', 'Find *your chapter*', 'Pick the one nearest you.'), { type: 'SpaceCommunity', props: {} }],
      },
      eventsPage('Events', 'Gatherings from every chapter.'),
      membershipPage('Join for free, or help keep it going.', [
        { sigil: 'moon-quarter', name: 'Member', blurb: 'Come to gatherings and stay in the loop.' },
        { sigil: 'moon-full', name: 'Supporter', blurb: 'Help keep the network going.', badge: 'Most chosen' },
      ]),
      aboutPage('Say how the network began, what chapters share, and what each one is free to do its own way.'),
    ],
  },
}

export function midnightKit(niche: KitNiche): SiteKit {
  return { ...VARIANTS[niche], theme: 'Midnight', version: 1, niche }
}
