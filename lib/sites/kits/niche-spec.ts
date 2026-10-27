import type { KitNiche } from './types'

// The words of the niche starting points (six core doors plus the profiles) for the Default, Bold and Designer themes, written once. Each theme's builder
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
  general: {
    id: 'general',
    label: 'Business',
    description: 'A plain, friendly home for any business that brings people together: what you do, what is on and how to reach you.',
    home: {
      seoTitle: "What's happening and how to find us", seoDescription: 'What we do, what is coming up and how to get in touch.',
      eyebrow: 'Welcome', title: 'Good things happen when people show up.', accent: 'show up',
      lead: '{{tagline|A local place with its own rhythm. Come by, see what is on this week, and say hello.}}',
      primary: { label: "See what's happening", href: '~/whats-happening' }, secondary: { label: 'Get in touch', href: '~/contact' },
      stepsEyebrow: 'How it works', stepsTitle: 'Three easy ways in',
      steps: [
        { title: 'Have a look', body: 'See what we do and what is happening this week.' },
        { title: 'Come by', body: 'Drop in, book a spot or save a seat for something on the calendar.' },
        { title: 'Stay in the loop', body: 'Join the list and we will tell you when something new is on.' },
      ],
      live: 'events', faqTitle: 'Good to know',
      faqs: [
        { q: 'Where are you and when are you open?', a: '{{address|Our address and hours are on the contact page.}} Say hello if you are not sure.' },
        { q: 'Do I need to book?', a: 'For most things, no. Where a seat is limited, the page says so and you can save one in a minute.' },
      ],
      cta: { heading: 'Come see us this week.', accent: 'this week', label: "See what's happening", href: '~/whats-happening' },
    },
    main: { slug: 'whats-happening', label: "What's happening", seoDescription: 'Everything coming up, in one place.', eyebrow: 'Coming up', title: "What's happening", accent: 'happening', lead: 'Workshops, nights, specials and the regular things. All in one place.', live: 'events' },
    aboutLead: 'Say who you are, why you started, and what someone should expect the first time they walk in.',
  },
  creators: {
    id: 'creators',
    label: 'Creators',
    description: 'For artists, musicians, makers and podcasters: your work, your shows and a list of people who want to hear from you.',
    home: {
      seoTitle: 'New work, shows and the list', seoDescription: 'See the latest work, find the next show and join the list.',
      eyebrow: 'The work', title: 'Making things is lonely. Sharing them does not have to be.', accent: 'does not have to be',
      lead: '{{tagline|New work, show dates and the occasional note from the studio. Join the list and you will hear first.}}',
      primary: { label: 'Join the list', href: '~/contact' }, secondary: { label: 'See the work', href: '~/work' },
      stepsEyebrow: 'How to follow along', stepsTitle: 'Three ways to stay close',
      steps: [
        { title: 'See the work', body: 'The latest pieces, releases and projects, with the story behind each.' },
        { title: 'Come to a show', body: 'Dates, places and tickets, all on one page.' },
        { title: 'Join the list', body: 'A note now and then, when there is something real to say.' },
      ],
      live: 'offerings', faqTitle: 'Questions people ask',
      faqs: [
        { q: 'Can I buy your work?', a: 'Yes. What is available is on the work page. Ask about anything you do not see.' },
        { q: 'Do you make things to order?', a: '{{toOrder|Sometimes. Send a message with what you have in mind and we will talk.}}' },
      ],
      cta: { heading: 'Hear about it first.', accent: 'first', label: 'Join the list', href: '~/contact' },
    },
    main: { slug: 'work', label: 'The work', seoDescription: 'Pieces, releases and projects.', eyebrow: 'Work', title: 'The work', accent: 'work', lead: 'What is new, what is available and what is coming.', live: 'offerings' },
    aboutLead: 'Tell people what you make, how you got here and what you are working on now. Plain words land better than a bio.',
  },
  schools: {
    id: 'schools',
    label: 'Schools and programs',
    description: 'For workshops, cohorts, camps and training: what you teach, when the next one starts and how to enroll.',
    home: {
      seoTitle: 'Programs and how to enroll', seoDescription: 'What we teach, when the next cohort starts and how to join.',
      eyebrow: 'Learn with us', title: 'Learning sticks when you do it with other people.', accent: 'with other people',
      lead: '{{tagline|Small groups, a clear path and a teacher who knows your name. See what starts next and save your place.}}',
      primary: { label: 'See the programs', href: '~/programs' }, secondary: { label: 'Ask a question', href: '~/contact' },
      stepsEyebrow: 'How it works', stepsTitle: 'From curious to enrolled',
      steps: [
        { title: 'Pick a program', body: 'See what is taught, how long it runs and who it is for.' },
        { title: 'Save your place', body: 'Enroll in a minute, or join the waitlist for a full one.' },
        { title: 'Start together', body: 'Everyone begins on the same day and goes through it as a group.' },
      ],
      live: 'offerings', faqTitle: 'Before you enroll',
      faqs: [
        { q: 'Do I need experience?', a: 'Each program says who it is for. Most start at the beginning. Ask if you are not sure.' },
        { q: 'What if the dates do not work?', a: 'Join the waitlist and you will hear when the next one is set.' },
      ],
      cta: { heading: 'The next one starts soon.', accent: 'starts soon', label: 'See the programs', href: '~/programs' },
    },
    main: { slug: 'programs', label: 'Programs', seoDescription: 'Every program, with dates and how to enroll.', eyebrow: 'Programs', title: 'What we teach', accent: 'teach', lead: 'Pick the one that fits where you are. Each page says what you will do and when it starts.', live: 'offerings' },
    aboutLead: 'Say why you teach this, who the teachers are and what a week in the program feels like.',
  },
  clubs: {
    id: 'clubs',
    label: 'Clubs and groups',
    description: 'For hobby clubs, leagues, run and book clubs and co-ops: regular meetups, members and a way to join.',
    home: {
      seoTitle: 'Join the club', seoDescription: 'When we meet, what we do and how to become a member.',
      eyebrow: 'The club', title: 'A hundred contacts and no one to do the thing with?', accent: 'do the thing with',
      lead: '{{tagline|We meet every week, rain or shine. Come once as a guest, then join if it feels like your people.}}',
      primary: { label: 'Become a member', href: '~/contact' }, secondary: { label: 'See when we meet', href: '~/meetups' },
      stepsEyebrow: 'How to join', stepsTitle: 'Guest first, member when ready',
      steps: [
        { title: 'Come as a guest', body: 'Your first meetup is open. Just turn up and say you are new.' },
        { title: 'Meet the regulars', body: 'Someone will show you the ropes and introduce you around.' },
        { title: 'Join', body: 'Become a member and get the full calendar, the group and the member list.' },
      ],
      live: 'community', faqTitle: 'Good to know',
      faqs: [
        { q: 'Do I have to be good at it?', a: 'No. Most of us started as beginners. Showing up is the whole requirement.' },
        { q: 'What do dues cover?', a: '{{dues|Dues keep the lights on: the space, the gear and the odd shared meal.}} The membership page has the detail.' },
      ],
      cta: { heading: 'Come once. See if it fits.', accent: 'See if it fits.', label: 'See when we meet', href: '~/meetups' },
    },
    main: { slug: 'meetups', label: 'Meetups', seoDescription: 'Every meetup on the calendar.', eyebrow: 'Calendar', title: 'When we meet', accent: 'meet', lead: 'The regular nights and the special ones.', live: 'events' },
    aboutLead: 'Say how the club started, who comes, and what a first night feels like for someone new.',
  },
  faith: {
    id: 'faith',
    label: 'Faith and spiritual communities',
    description: 'For churches, sanghas, temples and centers: when you gather, the small groups, and a way to give.',
    home: {
      seoTitle: 'Gather with us', seoDescription: 'Service times, small groups and how to get involved.',
      eyebrow: 'You are welcome here', title: 'Come as you are. Stay as long as you like.', accent: 'as you are',
      lead: '{{tagline|We gather every week, and there is a smaller group for every season of life. Come once and see.}}',
      primary: { label: 'See when we gather', href: '~/gatherings' }, secondary: { label: 'Find a small group', href: '~/contact' },
      stepsEyebrow: 'A first visit', stepsTitle: 'What to expect',
      steps: [
        { title: 'Come to a gathering', body: 'Sit anywhere. Nobody will single you out. Stay for tea after if you like.' },
        { title: 'Find a smaller circle', body: 'Small groups meet through the week, by neighborhood and by season of life.' },
        { title: 'Take part', body: 'Give, serve or just keep coming. Each is welcome in its own time.' },
      ],
      live: 'events', faqTitle: 'Questions visitors ask',
      faqs: [
        { q: 'What should I wear, and what about kids?', a: 'Wear what you have. {{kids|Children are welcome in the room, and there is a quieter space if they need it.}}' },
        { q: 'Do I need to believe anything to come?', a: 'No. Come with your questions. People here hold them differently and that is fine.' },
      ],
      cta: { heading: 'There is a seat for you.', accent: 'for you', label: 'See when we gather', href: '~/gatherings' },
    },
    main: { slug: 'gatherings', label: 'Gatherings', seoDescription: 'Weekly services, seasonal gatherings and small groups.', eyebrow: 'Gather', title: 'When we gather', accent: 'gather', lead: 'The weekly rhythm, the seasons and the smaller circles.', live: 'events' },
    aboutLead: 'Say who you are as a community, what you hold at the center and how someone new can belong.',
  },
  wellness: {
    id: 'wellness',
    label: 'Wellness and retreats',
    description: 'For spas, retreat centers and wellness studios: treatments, packages, retreats and a simple way to book.',
    home: {
      seoTitle: 'Treatments, retreats and booking', seoDescription: 'What we offer, upcoming retreats and how to book.',
      eyebrow: 'Rest and care', title: 'Always wired? Give yourself an hour.', accent: 'an hour',
      lead: '{{tagline|Treatments, classes and retreats that help you settle. Book a single visit or make it a rhythm.}}',
      primary: { label: 'Book a visit', href: '~/book' }, secondary: { label: 'See the retreats', href: '~/offerings' },
      stepsEyebrow: 'Your first visit', stepsTitle: 'Simple to start',
      steps: [
        { title: 'Choose', body: 'Pick a treatment, a class or a retreat. Each page says what to expect.' },
        { title: 'Book', body: 'Pick a time that fits your week. Change it if your week changes.' },
        { title: 'Settle in', body: 'Arrive a few minutes early. The rest is ours to look after.' },
      ],
      live: 'offerings', faqTitle: 'Before you come',
      faqs: [
        { q: 'Is this for me if I have never done it?', a: 'Yes. Say it is your first time and we will walk you through it.' },
        { q: 'What is a retreat like?', a: '{{retreat|A few days away with a small group, good food and a slower pace. The retreat page has the schedule.}}' },
      ],
      cta: { heading: 'An hour is a good place to start.', accent: 'start', label: 'Book a visit', href: '~/book' },
    },
    main: { slug: 'offerings', label: 'Treatments and retreats', seoDescription: 'Treatments, packages and upcoming retreats.', eyebrow: 'Offerings', title: 'Ways to rest', accent: 'rest', lead: 'Single visits, packages and the retreats coming up.', live: 'booking' },
    aboutLead: 'Say why you opened this place, who works here and what the first hour feels like.',
  },
  markets: {
    id: 'markets',
    label: 'Markets and festivals',
    description: 'For farmers markets, makers markets and festivals: the next dates, who is there, and how to apply as a vendor.',
    home: {
      seoTitle: 'Market days and vendors', seoDescription: 'When the market is on, who is there and how to take part.',
      eyebrow: 'Market days', title: 'The same faces every week, and a few new ones.', accent: 'a few new ones',
      lead: '{{tagline|Local makers, growers and cooks, in one place, on a regular day. Come early for the good stuff.}}',
      primary: { label: 'See the next dates', href: '~/dates' }, secondary: { label: 'Apply as a vendor', href: '~/contact' },
      stepsEyebrow: 'How it works', stepsTitle: 'For visitors and vendors',
      steps: [
        { title: 'Check the dates', body: 'The regular day, the seasonal specials and what is on each time.' },
        { title: 'Come by', body: 'Bring a bag. Most stalls take cards. Dogs on a lead are fine.' },
        { title: 'Have a stall', body: 'Makers and growers can apply for a spot. We will tell you what is open.' },
      ],
      live: 'events', faqTitle: 'Good to know',
      faqs: [
        { q: 'What if it rains?', a: '{{rain|We run in most weather. If a day is called off it goes on the dates page and the list by the night before.}}' },
        { q: 'How do I become a vendor?', a: 'Send a message with what you make or grow. We reply to everyone, even when a season is full.' },
      ],
      cta: { heading: 'See you on market day.', accent: 'market day', label: 'See the next dates', href: '~/dates' },
    },
    main: { slug: 'dates', label: 'Dates', seoDescription: 'Every market day on the calendar.', eyebrow: 'Calendar', title: 'Market days', accent: 'days', lead: 'The regular day and the specials.', live: 'events' },
    aboutLead: 'Say how the market started, who runs it and what makes a good market day here.',
  },
}
