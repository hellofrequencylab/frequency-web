import type { KitNiche, KitPage, SiteKit } from './types'

// Network x the six niche doors. One mega theme, six starting points, all DATA: pages of Network blocks
// (components/page-editor/blocks/network.tsx) plus the shared Space blocks, with generic sample copy in the house
// voice (docs/marketing/voice-and-language-guide.md): plain, warm, pain point first, no hard claims, no prices,
// no photos. A `{{slot|sample words}}` token shows the Space's own fact once it has one (lib/spaces/content-slots.ts).
// Wrap words in *stars* for the accent italic. Live blocks (events, circles, chapters) read the Space's own rows.

type Block = KitPage['blocks'][number]

const hero = (p: { eyebrow: string; title: string; lead: string; primaryLabel: string; primaryHref: string; secondaryLabel?: string; secondaryHref?: string }): Block => ({
  type: 'NetworkHero',
  props: { image: '', alt: '', featureMatch: '', featureNote: '', proof: '', proofNote: '', faces: [], secondaryLabel: '', secondaryHref: '', ...p },
})
const stats = (items: { icon: string; value: string; label: string }[]): Block => ({ type: 'NetworkStats', props: { items } })
const steps = (eyebrow: string, title: string, list: { title: string; body: string }[]): Block => ({
  type: 'NetworkSteps',
  props: { eyebrow, title, lead: '', steps: list.map((s) => ({ ctaLabel: '', ctaHref: '', ...s })) },
})
const split = (p: { eyebrow: string; title: string; body: string; mediaSide?: 'left' | 'right'; primaryLabel?: string; primaryHref?: string; facts?: { icon: string; label: string; value: string }[] }): Block => ({
  type: 'NetworkSplit',
  props: { lead: '', image: '', alt: '', quote: '', quoteBy: '', secondaryLabel: '', secondaryHref: '', primaryLabel: '', primaryHref: '', mediaSide: 'right', facts: [], ...p },
})
const events = (title: string, lead: string, moreHref = '~/events'): Block => ({
  type: 'NetworkEvents',
  props: { eyebrow: 'Coming up', title, lead, max: 6, moreLabel: 'See everything', moreHref, empty: 'Nothing is scheduled yet. Check back soon.' },
})
const circles = (title: string, lead: string, list: { icon: string; title: string; body: string; when: string }[]): Block => ({
  type: 'NetworkCircles',
  props: { eyebrow: 'Circles', title, lead, circles: list.map((c) => ({ where: '', circleSlug: '', match: '', ...c })) },
})
const chapters = (title: string, lead: string): Block => ({ type: 'NetworkChapters', props: { eyebrow: 'Chapters', title, lead } })
const tiers = (title: string, lead: string, list: { icon: string; name: string; tagline: string; features: string; featured?: boolean }[]): Block => ({
  type: 'NetworkTiers',
  props: { eyebrow: 'Membership', title, lead, footnote: '', tiers: list.map((t) => ({ price: '', cadence: '', badge: '', ctaLabel: `Join as ${t.name}`, ctaHref: '~/membership', featured: false, ...t })) },
})
const offerings = (title: string, lead: string, list: { title: string; body: string; ctaLabel: string; ctaHref: string; featured?: boolean }[]): Block => ({
  type: 'NetworkOfferings',
  props: { eyebrow: 'Ways to work together', title, lead, items: list.map((o) => ({ price: '', unit: '', featured: false, ...o })) },
})
const band = (title: string, body: string, primaryLabel: string, primaryHref: string): Block => ({
  type: 'NetworkBand',
  props: { eyebrow: 'Join in', title, body, countdownTo: '', countdownLabel: '', image: '', alt: '', primaryLabel, primaryHref, secondaryLabel: '', secondaryHref: '' },
})
const contact = (title: string, lead: string): Block => ({
  type: 'NetworkContact',
  props: { eyebrow: 'Contact', title, lead, email: '', phone: '', links: [], image: '', alt: '' },
})
const faq = (items: { q: string; a: string }[]): Block => ({ type: 'SpaceFAQ', props: { items } })

const aboutPage = (lead: string): KitPage => ({
  slug: 'about',
  label: 'About',
  seo: { title: 'About', description: 'Who we are and how we do things.' },
  blocks: [
    split({ eyebrow: 'Our story', title: 'Hi, we are *glad you are here.*', body: `{{story|${lead}}}` }),
    contact('Say *hello.*', 'Ask a question or tell us what you are looking for. A real person writes back.'),
  ],
})
const eventsPage = (label: string, lead: string): KitPage => ({
  slug: 'events',
  label,
  seo: { title: label, description: 'Every upcoming date.' },
  blocks: [events('All the *dates*', lead)],
})
const membershipPage = (lead: string, list: Parameters<typeof tiers>[2]): KitPage => ({
  slug: 'membership',
  label: 'Membership',
  seo: { title: 'Membership', description: 'How to join.' },
  blocks: [tiers('Come *and stay*', lead, list)],
})

const VARIANTS: Record<KitNiche, Omit<SiteKit, 'theme' | 'version' | 'niche'>> = {
  coaches: {
    id: 'network-coaches',
    label: 'Coaches and healers',
    description: 'A warm first page, your ways to work together, and an easy way to book.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Work with me', description: 'One-to-one sessions and small groups, and how to book.' },
        blocks: [
          hero({ eyebrow: 'Coaching and care', title: 'Ready for the next step\n*but not sure where to start?*', lead: '{{tagline|Sessions and small groups for people who want a steady hand. Say hello and we will find a time.}}', primaryLabel: 'Book a first call', primaryHref: '~/book', secondaryLabel: 'See the ways to work', secondaryHref: '~/offerings' }),
          steps('How it works', 'Three *simple* steps', [
            { title: 'Say hello', body: 'Tell me what is going on and what you are hoping for. No pressure.' },
            { title: 'Meet', body: 'We talk in person or online and decide together if we are a fit.' },
            { title: 'Keep going', body: 'We set a rhythm that suits your life, then check in as it changes.' },
          ]),
          { type: 'SpaceReviews', props: {} },
          faq([
            { q: 'What happens on the first call?', a: 'We talk about what is going on and what you are hoping for. If we are a fit, we pick a rhythm that works for you.' },
            { q: 'Can I change a booking?', a: 'Yes. Use the link in your confirmation email and pick a new time.' },
          ]),
          band('Not sure where to start?', 'Say hello first. A short call is a good way to find out.', 'Book a first call', '~/book'),
        ],
      },
      {
        slug: 'offerings',
        label: 'Ways to work together',
        seo: { title: 'Ways to work together', description: 'Sessions, small groups and what each one is like.' },
        blocks: [
          offerings('Sessions *and groups*', 'Every offer can start with a short call.', [
            { title: 'First call', body: 'A short chat to see if we are a good fit.', ctaLabel: 'Book it', ctaHref: '~/book' },
            { title: 'One-to-one session', body: 'Time to work on one thing, with notes after.', ctaLabel: 'Book it', ctaHref: '~/book', featured: true },
            { title: 'Small group', body: 'A few people, one theme, a steady rhythm.', ctaLabel: 'Ask about it', ctaHref: '~/contact' },
          ]),
          { type: 'SpaceBooking', props: { heading: '' } },
        ],
      },
      aboutPage('Write a few honest lines about who you are, who you help and what a session feels like. Plain words work best.'),
    ],
  },
  studios: {
    id: 'network-studios',
    label: 'Studios',
    description: 'Classes, a simple schedule and memberships people can join in a minute.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Classes and membership', description: 'Find a class, see the schedule and join.' },
        blocks: [
          hero({ eyebrow: 'Classes and community', title: 'Find a class you will\n*actually go back to.*', lead: '{{tagline|Friendly classes at every level, a clear schedule and people who notice when you are missing.}}', primaryLabel: 'See the schedule', primaryHref: '~/events', secondaryLabel: 'Join', secondaryHref: '~/membership' }),
          events('This week *at the studio*', 'Pick a class and save your spot.', '~/events'),
          steps('Your first visit', 'Come *as you are*', [
            { title: 'Pick a class', body: 'Look for the ones marked for beginners.' },
            { title: 'Arrive a few minutes early', body: 'We will show you around and set you up.' },
            { title: 'Stay if you like it', body: 'Join when you are ready. There is no rush.' },
          ]),
          { type: 'SpaceReviews', props: {} },
          band('Try a class this week', 'Your first visit is the hardest part. We will make it easy.', 'See the schedule', '~/events'),
        ],
      },
      eventsPage('Classes', 'Every class, in one place.'),
      membershipPage('Pick the way you want to practise.', [
        { icon: 'sprout', name: 'Drop in', tagline: 'Come when it suits you.', features: 'Any class\nNo commitment' },
        { icon: 'heart', name: 'Member', tagline: 'Come as often as you like.', features: 'Every class\nFirst pick of new workshops', featured: true },
      ]),
    ],
  },
  hosts: {
    id: 'network-hosts',
    label: 'Event hosts',
    description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Gatherings', description: 'What is coming up and how to join.' },
        blocks: [
          hero({ eyebrow: 'Gatherings', title: 'Good people.\n*Good company.* No pitch.', lead: '{{tagline|We get people together on a rhythm. Come to one and see if it feels like yours.}}', primaryLabel: 'See what is on', primaryHref: '~/events', secondaryLabel: 'Meet us', secondaryHref: '~/about' }),
          events('Coming up *next*', 'Save your spot. Come early if you can.'),
          circles('Find *your people*', 'Smaller groups that meet on a rhythm.', [
            { icon: 'users', title: 'Open table', body: 'Come, sit down and meet someone new.', when: 'Every week' },
            { icon: 'heart', title: 'Deeper circle', body: 'A small group that stays together.', when: 'Every month' },
          ]),
          band('Stay in the loop', 'Join the list and we will tell you what is coming up.', 'Join the list', '~/contact'),
        ],
      },
      eventsPage('Events', 'Every upcoming gathering.'),
      aboutPage('Tell people why you started, who you hope will come and what a first visit feels like.'),
    ],
  },
  venues: {
    id: 'network-venues',
    label: 'Venues',
    description: 'Show the room, what is on and how to book it.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'The space', description: 'See the room, what is on and how to book it.' },
        blocks: [
          hero({ eyebrow: 'The space', title: 'A room that makes\n*people want to stay.*', lead: '{{tagline|Add a line about the room, the light and what people use it for.}}', primaryLabel: 'Ask about a date', primaryHref: '~/contact', secondaryLabel: 'See what is on', secondaryHref: '~/events' }),
          split({ eyebrow: 'The room', title: 'Space for *what you have planned*', body: 'Describe the room in plain words: how many it holds, what it comes with and what people love about it.', facts: [{ icon: 'users', label: 'Holds', value: 'Add a number' }, { icon: 'clock', label: 'Open', value: 'Add your hours' }] }),
          events('What is *on*', 'Come and see the room in use.'),
          faq([
            { q: 'How do I book?', a: 'Send us the date and what you have in mind. We reply within a couple of days.' },
            { q: 'Can I visit first?', a: 'Yes. Ask for a time and we will show you around.' },
          ]),
          band('Have a date in mind?', 'Tell us about it and we will tell you if the room is free.', 'Ask about a date', '~/contact'),
        ],
      },
      eventsPage('What is on', 'Everything happening in the room.'),
      aboutPage('Tell the story of the building, who looks after it and what you want it to be for the neighbourhood.'),
    ],
  },
  nonprofits: {
    id: 'network-nonprofits',
    label: 'Nonprofits',
    description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Our work', description: 'What we do and how you can help.' },
        blocks: [
          hero({ eyebrow: 'Our work', title: 'Something needs doing here.\n*Want to help?*', lead: '{{tagline|Say in one or two lines what you do, who it is for and why it matters.}}', primaryLabel: 'Get involved', primaryHref: '~/involved', secondaryLabel: 'Our story', secondaryHref: '~/about' }),
          stats([{ icon: 'heart', value: 'Add a number', label: 'people helped' }, { icon: 'users', value: 'Add a number', label: 'volunteers' }]),
          steps('Three ways in', 'Pick *how you want to help*', [
            { title: 'Come along', body: 'Visit an event and see the work for yourself.' },
            { title: 'Volunteer', body: 'Give a few hours. We will find something that suits you.' },
            { title: 'Give', body: 'Every gift goes to the work. We will show you where.' },
          ]),
          events('Coming up', 'Join us at one of these.'),
          band('Ready to help?', 'Tell us what you can offer and we will take it from there.', 'Get involved', '~/involved'),
        ],
      },
      {
        slug: 'involved',
        label: 'Get involved',
        seo: { title: 'Get involved', description: 'Come along, volunteer or give.' },
        blocks: [
          offerings('Three *ways to help*', 'Start small. Everything counts.', [
            { title: 'Come along', body: 'Join an event and bring a friend.', ctaLabel: 'See events', ctaHref: '~/events' },
            { title: 'Volunteer', body: 'Tell us when you are free and what you enjoy.', ctaLabel: 'Tell us', ctaHref: '~/contact', featured: true },
            { title: 'Give', body: 'Add a line about what a gift makes possible.', ctaLabel: 'Ask how', ctaHref: '~/contact' },
          ]),
        ],
      },
      eventsPage('Events', 'Every upcoming date.'),
      aboutPage('Tell the story plainly: why this work started, who it is for and who is doing it.'),
    ],
  },
  networks: {
    id: 'network-networks',
    label: 'Networks',
    description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Find a chapter', description: 'Find a chapter near you, or start one.' },
        blocks: [
          hero({ eyebrow: 'Many places, one community', title: 'Find your people\n*close to home.*', lead: '{{tagline|Chapters in different places, one shared way of doing things. Find the one nearest you.}}', primaryLabel: 'Find a chapter', primaryHref: '~/chapters', secondaryLabel: 'Start one', secondaryHref: '~/start' }),
          chapters('Chapters *near you*', 'Each one is run by people from the place it meets.'),
          events('On *everywhere*', 'What is happening across every chapter.'),
          steps('Start a chapter', 'Three *steps*', [
            { title: 'Tell us about your place', body: 'Where you are and who you would gather.' },
            { title: 'Get set up', body: 'We share what works and what to avoid.' },
            { title: 'Host your first gathering', body: 'Start small. We will cheer you on.' },
          ]),
          band('Do not see your town?', 'Start the chapter yourself. We will help you do it.', 'Start a chapter', '~/start'),
        ],
      },
      {
        slug: 'chapters',
        label: 'Chapters',
        seo: { title: 'Chapters', description: 'Every chapter and where it meets.' },
        blocks: [chapters('All the *chapters*', 'Pick the one nearest you.')],
      },
      eventsPage('Events', 'What is on in every chapter.'),
      {
        slug: 'start',
        label: 'Start a chapter',
        seo: { title: 'Start a chapter', description: 'How to start a chapter where you live.' },
        blocks: [
          steps('Start a chapter', 'Here is how it *works*', [
            { title: 'Say hello', body: 'Tell us where you live and who you would like to gather.' },
            { title: 'Plan the first one', body: 'We help you pick a place and a date.' },
            { title: 'Open the doors', body: 'Invite a few people. It grows from there.' },
          ]),
          contact('Ready to *start?*', 'Tell us about your town and we will take it from there.'),
        ],
      },
    ],
  },
}

/** The Network kit for one niche door. */
export function networkKit(niche: KitNiche): SiteKit {
  return { ...VARIANTS[niche], version: 1, theme: 'Network', niche }
}
