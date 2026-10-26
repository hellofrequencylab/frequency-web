import type { KitNiche } from './types'

// The words of the six niche starting points for the Default and Bold themes, written once. Each theme's builder
// (default-variants.ts, bold-variants.ts) lays the same words out in its own blocks. House voice
// (docs/marketing/voice-and-language-guide.md): plain, warm, pain point first, no hard claims, no prices, no photos.
// A `{{slot|sample words}}` token shows the Space's own fact once it has one (lib/spaces/content-slots.ts).

export type LiveBlock = 'offerings' | 'events' | 'community' | 'booking'

interface NicheLink { label: string; href: string }
interface NicheStep { title: string; body: string }
interface NicheFaq { q: string; a: string }

export interface NicheSpec {
  id: string
  label: string
  description: string
  home: {
    seoTitle: string
    seoDescription: string
    eyebrow: string
    title: string
    accent: string
    lead: string
    primary: NicheLink
    secondary: NicheLink
    stepsEyebrow: string
    stepsTitle: string
    steps: [NicheStep, NicheStep, NicheStep]
    live: LiveBlock
    faqTitle: string
    faqs: NicheFaq[]
    cta: { heading: string; accent: string; label: string; href: string }
  }
  /** The second page, built around one live block that reads the Space's own rows. */
  main: { slug: string; label: string; seoDescription: string; eyebrow: string; title: string; accent: string; lead: string; live: LiveBlock }
  aboutLead: string
}

export const NICHE_SPECS: Record<KitNiche, NicheSpec> = {
  coaches: {
    id: 'coaches',
    label: 'Coaches and healers',
    description: 'A calm first page, your ways to work together, and an easy way to book.',
    home: {
      seoTitle: 'Work with me', seoDescription: 'One-to-one sessions and small groups, and how to book.',
      eyebrow: 'Coaching and care', title: 'Stuck on the same thing for too long?', accent: 'too long',
      lead: '{{tagline|Sessions and small groups for people who are ready for the next step. Say hello and we will find a time.}}',
      primary: { label: 'Book a first call', href: '~/book' }, secondary: { label: 'See the ways to work', href: '~/offerings' },
      stepsEyebrow: 'How it works', stepsTitle: 'Three simple steps',
      steps: [
        { title: 'Say hello', body: 'Tell me what is going on and what you are hoping for. No pressure.' },
        { title: 'Meet', body: 'We talk in person or online and decide together if we are a fit.' },
        { title: 'Keep going', body: 'We set a rhythm that suits your life, then check in as it changes.' },
      ],
      live: 'offerings', faqTitle: 'Before you begin',
      faqs: [
        { q: 'What happens on the first call?', a: 'We talk about what is going on and what you are hoping for. If we are a fit, we pick a rhythm that works for you.' },
        { q: 'Can I change a booking?', a: 'Yes. Use the link in your confirmation email and pick a new time.' },
      ],
      cta: { heading: 'Not sure where to start? Say hello first.', accent: 'Say hello first.', label: 'Book a first call', href: '~/book' },
    },
    main: { slug: 'offerings', label: 'Ways to work together', seoDescription: 'Sessions, small groups and what each one is like.', eyebrow: 'Offerings', title: 'Ways to work together', accent: 'work together', lead: 'Pick the one that fits your season. You can always change.', live: 'booking' },
    aboutLead: 'Write a few honest lines about who you are, who you help and what a session feels like. Plain words work best.',
  },
  studios: {
    id: 'studios',
    label: 'Studios',
    description: 'Classes, a simple schedule and memberships people can join in a minute.',
    home: {
      seoTitle: 'Classes and membership', seoDescription: 'Find a class, see the schedule and join.',
      eyebrow: 'Classes and community', title: 'Find a class you will actually go back to.', accent: 'actually go back to',
      lead: '{{tagline|Friendly classes at every level, a clear schedule and people who notice when you are missing.}}',
      primary: { label: 'See the schedule', href: '~/classes' }, secondary: { label: 'Join', href: '~/contact' },
      stepsEyebrow: 'Your first class', stepsTitle: 'Easy to start',
      steps: [
        { title: 'Pick a class', body: 'Browse the schedule and choose a time that fits your week.' },
        { title: 'Show up', body: 'Come a few minutes early. The teacher will look after you.' },
        { title: 'Make it a habit', body: 'Join when you are ready. Pause any time.' },
      ],
      live: 'events', faqTitle: 'First time? Read this.',
      faqs: [
        { q: 'What should I bring?', a: 'Comfortable clothes and a water bottle. Tell the teacher it is your first class and they will look after you.' },
        { q: 'Can I try a class first?', a: 'Yes. Book a single class and see how it feels.' },
      ],
      cta: { heading: 'Ready when you are.', accent: 'Ready', label: 'See the schedule', href: '~/classes' },
    },
    main: { slug: 'classes', label: 'Classes', seoDescription: 'The full class schedule.', eyebrow: 'Classes', title: 'The schedule', accent: 'schedule', lead: 'Everything on, in one place.', live: 'events' },
    aboutLead: 'Tell people why you opened the studio, who your teachers are and what a class feels like.',
  },
  hosts: {
    id: 'hosts',
    label: 'Event hosts',
    description: 'A home for your gatherings: what is coming up, how to join and a list to stay in touch.',
    home: {
      seoTitle: 'Gatherings', seoDescription: 'What is coming up and how to join.',
      eyebrow: 'Gatherings', title: 'Good nights need a good home.', accent: 'good home',
      lead: '{{tagline|Come to the next one, bring a friend, and tell us what you would like more of.}}',
      primary: { label: 'See what is coming up', href: '~/events' }, secondary: { label: 'Our story', href: '~/about' },
      stepsEyebrow: 'Join in', stepsTitle: 'Come along',
      steps: [
        { title: 'Find a date', body: 'See what is coming up and save a spot.' },
        { title: 'Bring a friend', body: 'The more the merrier.' },
        { title: 'Say hello', body: 'Ask us anything first.' },
      ],
      live: 'events', faqTitle: 'Good to know',
      faqs: [
        { q: 'Do I need to book?', a: 'Say how people save a spot, and whether you can just turn up.' },
        { q: 'Can I bring someone?', a: 'Yes. Tell people if there is a limit on guests.' },
      ],
      cta: { heading: 'Get people together. Do things on purpose.', accent: 'on purpose', label: 'See what is coming up', href: '~/events' },
    },
    main: { slug: 'events', label: 'Events', seoDescription: 'Every upcoming gathering.', eyebrow: 'Events', title: 'All the dates', accent: 'dates', lead: 'Pick one and save a spot.', live: 'events' },
    aboutLead: 'Say why you started gathering people, what a night is like and who it is for.',
  },
  venues: {
    id: 'venues',
    label: 'Venues',
    description: 'Show the room, what is on and how to book it.',
    home: {
      seoTitle: 'Visit and hire', seoDescription: 'What is on, and how to hire the space.',
      eyebrow: 'Our space', title: 'Give people a reason to walk in.', accent: 'walk in',
      lead: '{{tagline|A warm room for gatherings, classes and celebrations. Come and see what is on, or ask about hiring it.}}',
      primary: { label: 'Ask about hiring', href: '~/contact' }, secondary: { label: 'Visit', href: '~/visit' },
      stepsEyebrow: 'Ways to use the space', stepsTitle: 'Tell us what you have in mind',
      steps: [
        { title: 'Come and visit', body: 'Drop in, look around and meet the team.' },
        { title: 'Host your event', body: 'Workshops, parties and small gatherings.' },
        { title: 'Regular bookings', body: 'A steady slot for your class or group.' },
      ],
      live: 'events', faqTitle: 'Before you visit',
      faqs: [
        { q: 'How do I find you?', a: 'Add your address and a line about getting here, parking and step-free access.' },
        { q: 'Can I hire the space?', a: 'Yes. Send us a note with the date, how many people and what you are planning.' },
      ],
      cta: { heading: 'Come and see it.', accent: 'see it', label: 'Plan a visit', href: '~/visit' },
    },
    main: { slug: 'visit', label: 'Visit', seoDescription: 'Where we are and when we are open.', eyebrow: 'Visit', title: 'Come and see us', accent: 'see us', lead: 'Where we are and when to come.', live: 'community' },
    aboutLead: 'Tell people about the room, who it is for and what it has seen.',
  },
  nonprofits: {
    id: 'nonprofits',
    label: 'Nonprofits',
    description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.',
    home: {
      seoTitle: 'Get involved', seoDescription: 'What we do and how you can help.',
      eyebrow: 'Our work', title: 'People want to help. Make it easy to say yes.', accent: 'easy to say yes',
      lead: '{{tagline|Say in one plain sentence what you do and who it is for.}}',
      primary: { label: 'Get involved', href: '~/contact' }, secondary: { label: 'See what is on', href: '~/events' },
      stepsEyebrow: 'Ways to help', stepsTitle: 'Pick your way in',
      steps: [
        { title: 'Come along', body: 'Meet us at the next gathering.' },
        { title: 'Volunteer', body: 'Give a little time, a few times a year.' },
        { title: 'Give', body: 'Say how people can give and where it goes.' },
      ],
      live: 'events', faqTitle: 'Questions people ask',
      faqs: [
        { q: 'How does my help get used?', a: 'Say plainly where time and gifts go. Short and honest beats polished.' },
        { q: 'Can my group get involved?', a: 'Yes. Tell groups and local businesses how to reach you.' },
      ],
      cta: { heading: 'Start with one small step.', accent: 'one small step', label: 'Get involved', href: '~/contact' },
    },
    main: { slug: 'events', label: 'Events', seoDescription: 'Come along to the next one.', eyebrow: 'Events', title: 'Come along', accent: 'along', lead: 'Small or big, it all counts.', live: 'events' },
    aboutLead: 'Tell the story of why the group started, who it serves and what has changed because of it.',
  },
  networks: {
    id: 'networks',
    label: 'Networks',
    description: 'One home for many chapters: find a chapter, start one, and see what is on everywhere.',
    home: {
      seoTitle: 'Find a chapter', seoDescription: 'Chapters, gatherings and how to start one.',
      eyebrow: 'Our network', title: 'Many chapters. One place to find them.', accent: 'One place',
      lead: '{{tagline|Find your local chapter, come to a gathering, or start one in your town.}}',
      primary: { label: 'Find a chapter', href: '~/chapters' }, secondary: { label: 'Start one', href: '~/contact' },
      stepsEyebrow: 'Find your people', stepsTitle: 'Three ways in',
      steps: [
        { title: 'Find a chapter', body: 'See who is near you.' },
        { title: 'Come to a gathering', body: 'Meet people in person.' },
        { title: 'Start a chapter', body: 'We will help you begin.' },
      ],
      live: 'community', faqTitle: 'Good to know',
      faqs: [
        { q: 'How do I start a chapter?', a: 'Write to us. We will talk about your town, your people and what you would like to run.' },
        { q: 'Do chapters run themselves?', a: 'Each chapter hosts its own gatherings. The network gives you a home, tools and other hosts to learn from.' },
      ],
      cta: { heading: 'Get people together. Do things on purpose.', accent: 'on purpose', label: 'Find a chapter', href: '~/chapters' },
    },
    main: { slug: 'chapters', label: 'Chapters', seoDescription: 'Every chapter in the network.', eyebrow: 'Chapters', title: 'Find your chapter', accent: 'your chapter', lead: 'Pick the one nearest you.', live: 'community' },
    aboutLead: 'Say how the network began, what chapters share, and what each one is free to do its own way.',
  },
}
