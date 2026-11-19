import type { MegaNicheId } from '@/lib/theme/mega-theme'
import { MINDLESS_ACCENTS } from '@/lib/theme/mindless'
import type { KitPage, SiteKit } from './types'

// Mindless's six starter kits (design system "Mindless", frequency/kits.mindless.json): Mindless (the whole thing), Circle host, Guide,
// Program, Studio and Shop. Each seeds words, three offers, the Frequency tools it runs and a starting accent; a kit never changes colour
// or type beyond the accent. They stand on the six niche doors the kit engine knows (general, wellness, coaches, creators, studios,
// markets) so the Space picker and the starter site find them. The General kit carries the brand's own words (the website the design
// system ships); the other five are prompts in the same voice.
//
// BLOCKS. Until Mindless cuts its own, the pages are built from the Services block family (components/page-editor/blocks/services.tsx),
// which the Mindless skin re-draws (components/sites/mindless-blocks-css.ts), as New World's do.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): no em dashes; reviews are prompts to write a real one, never a made-up quote
// with a made-up name; prices are left for the owner to set. Copy is never literal about venues: small groups that gather regularly, and
// people doing the program on their own. The first three offers, people and events are `{{slot|sample words}}` tokens
// (lib/spaces/content-slots.ts), so a Space that has filled in its own shows those instead.

/** The Frequency tools a kit turns on (design kits.mindless.json tools). */
type MindlessTool = 'book' | 'sell' | 'belong' | 'publish' | 'gather' | 'learn'
type MindlessKitId = 'general' | 'circle' | 'guide' | 'program' | 'studio' | 'shop'
type MindlessAccent = keyof typeof MINDLESS_ACCENTS

export const MINDLESS_KIT_IDS: readonly MindlessKitId[] = ['general', 'circle', 'guide', 'program', 'studio', 'shop']
/** The niche door each kit stands on. */
export const MINDLESS_KIT_NICHE: Record<MindlessKitId, MegaNicheId> = { general: 'general', circle: 'wellness', guide: 'coaches', program: 'creators', studio: 'studios', shop: 'markets' }

type MindlessKit = Omit<SiteKit, 'theme' | 'niche'> & { theme: 'Mindless'; niche: MegaNicheId; kit: MindlessKitId; tools: readonly MindlessTool[] }

type Block = KitPage['blocks'][number]
type Pair = readonly [string, string]
type SectionCopy = { title: string; em: string; lede?: string }
type Section = 'circles' | 'events' | 'firstnight' | 'reviews' | 'team' | 'services' | 'plans' | 'shop' | 'cta'

interface Spec {
  label: string
  description: string
  accent: MindlessAccent
  name: string
  descriptor: string
  owner: string
  role: string
  /** Who a review prompt asks for a quote from. */
  person: string
  tools: readonly MindlessTool[]
  cta: string
  cta2: string
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: readonly string[]
  story2: Pair
  quote: string
  /** name, when, line */
  groups: readonly (readonly [string, string, string])[]
  events: readonly (readonly [string, string, string])[]
  offers: readonly { name: string; meta: string; dur: string }[]
  trust: readonly Pair[]
  reviewsAbout: readonly string[]
  team: readonly Pair[]
  posts: readonly Pair[]
  plans: readonly Pair[]
  products: readonly Pair[]
  firstVisit: readonly Pair[]
}

/** The design's section titles, in the voice every Mindless headline has: a plain claim and one lit last phrase. */
const COPY: Record<Section, SectionCopy> = {
  circles: { title: 'Ways to', em: 'sit.', lede: 'Same people, same time, every week. Pick one.' },
  events: { title: "What's", em: 'coming up.', lede: 'Circles, live sits and the odd long one. RSVP and we remind you.' },
  firstnight: { title: 'Your first', em: 'sit.', lede: 'Walking in is the hardest part. Here is what happens.' },
  reviews: { title: 'Overheard', em: 'after circle.', lede: 'People who came, in their own words.' },
  team: { title: 'Who holds', em: 'the time.', lede: 'The guides behind it.' },
  services: { title: 'Ways', em: 'in.', lede: 'Every way in, with its price in plain sight.' },
  plans: { title: 'Keep', em: 'coming back.', lede: 'Pick a rhythm. Pause or change it any time.' },
  shop: { title: 'Gear for', em: 'the practice.', lede: 'A few things that make the practice easier. Say where the money goes.' },
  cta: { title: 'Unwind', em: 'your mind.' },
}

const SPECS: Record<MindlessKitId, Spec> = {
  general: {"label": "Mindless", "description": "The whole thing: groups that meet, a program, live sessions and the people who lead them, with words that coach you what to write.", "accent": "yellow", "name": "Your Space name", "descriptor": "What you do, in a few words", "owner": "Your name", "role": "Founder", "person": "member", "tools": ["gather", "book", "learn", "belong", "publish", "sell"], "cta": "Find a circle", "cta2": "See the ways in", "hero": {"eyebrow": "What you run · Where you meet", "title": "Say what you", "em": "help people do.", "body": "Say who this is for and what changes for them. Two plain sentences, then one easy way to start."}, "story": ["Why this started: who came first and what was missing.", "What you teach, in plain words, and where people carry it after.", "How it runs: when people meet, how someone joins and who leads."], "story2": ["Why we", "do this."], "quote": "One line you say to someone on their first day.", "groups": [["Your first group", "Day · time", "What happens and how long it runs."], ["A second group", "Day · time", "Who it suits better than the first."], ["Something longer", "How often", "The one people stay for."], ["One online", "Day · time", "How someone joins from home."]], "events": [["A live session", "What it is and how long it runs.", "Sun"], ["Ask the people who lead", "What people can bring to it.", "Wed"], ["Something short", "Who it is for.", "Fri"]], "offers": [{"name": "A circle", "meta": "Say what someone gets, and what it costs.", "dur": "How often"}, {"name": "The program", "meta": "Say how long it runs and what it changes.", "dur": "How long"}, {"name": "Become a guide", "meta": "Say how someone learns to lead, and what you give them.", "dur": "How long"}], "trust": [["One fact", "about how it works"], ["How long", "a session runs"], ["How long", "the program runs"], ["One promise", "Something you always do"]], "reviewsAbout": ["A circle", "The program", "Live sessions"], "team": [["Your name", "Founder"], ["Someone who leads", "What they lead"], ["Someone who leads", "What they lead"]], "posts": [["Technique", "The one you teach first"], ["Practice", "One for real life"], ["Idea", "What you keep coming back to"], ["Note", "What happens on someone's first day"]], "plans": [["Drop in", "Come when you can."], ["Program", "What it covers."], ["Supporter", "What it keeps going."]], "products": [["A first product", "One line on it."], ["A second", "One line on it."], ["A third", "One line on it."]], "firstVisit": [["Before", "Say how someone saves a spot and what to wear."], ["During", "What the first session is actually like."], ["What to bring", "Nothing, or say what."], ["After", "What happens next, and what you will never do."]]},
  circle: {"label": "Circle host", "description": "For a local circle: when you meet, where, who holds the time and how to save a spot.", "accent": "pink", "name": "Your Circle", "descriptor": "A weekly circle · Your town", "owner": "Your name", "role": "Guide", "person": "member", "tools": ["gather", "belong", "publish"], "cta": "Save a spot", "cta2": "How it works", "hero": {"eyebrow": "Weekly circle · Your town", "title": "Same time", "em": "every week.", "body": "Say when you meet and where, in one line. Then say who it's for: people with full heads and no time."}, "story": ["How this circle started: who sat first and why.", "How a night runs here, start to finish.", "Who comes. Be specific; the right people will recognise themselves."], "story2": ["Why we", "sit here."], "quote": "One line you say to someone on their first night.", "groups": [["Your weekly circle", "Day · time", "What happens and how long it runs."], ["A second time", "Day · time", "Who it suits better than the first."], ["Something monthly", "Monthly", "The longer sit people stay for."], ["Open house", "One-off", "Bring a friend, no booking."]], "events": [["A longer sit", "What it is and why it's worth showing up.", "Sat"], ["A guest guide", "Who is coming and what they teach.", "Thu"], ["A walk", "Practice in motion, outside.", "Sun"]], "offers": [{"name": "Your weekly circle", "meta": "Say what it costs, how long it runs and what to expect.", "dur": "Weekly"}, {"name": "The program", "meta": "The eight weeks, done alongside the circle.", "dur": "8 weeks"}, {"name": "Host with us", "meta": "Hold the time some weeks. We show you how.", "dur": "Free training"}], "trust": [["000 people", "have sat here"], ["00 weeks", "in a row"], ["Free", "to show up"], ["One promise", "Something you always do"]], "reviewsAbout": ["Weekly circle", "First night", "The program"], "team": [["Your name", "Guide"], ["A co-host", "Guide"], ["A regular", "Holds the door"]], "posts": [["Note", "What this week's sit was about"], ["Technique", "The one we practised"], ["Story", "Why someone kept coming back"], ["Note", "What's new this month"]], "plans": [["Drop in", "Come when you can."], ["Regular", "Same night every week."], ["Supporter", "Keeps the circle free."]], "products": [["Sit cushion", "For the floor at home."], ["Field journal", "Prompts between circles."], ["Melt tee", "Wear it to the next one."]], "firstVisit": [["Before", "Save a spot. Say if people can just walk in."], ["During", "What the first twenty minutes are actually like."], ["What to bring", "Nothing, or say what."], ["After", "What happens next, and what you'll never do (chase, upsell, guilt)."]]},
  guide: {"label": "Guide", "description": "For a guide: the techniques you teach, one-to-one sits and the circles you hold.", "accent": "blue", "name": "Your Name", "descriptor": "Guide · Your town", "owner": "Your name", "role": "Guide", "person": "student", "tools": ["book", "learn", "publish"], "cta": "Book a sit", "cta2": "See what I teach", "hero": {"eyebrow": "Guide · In person and online", "title": "Plain words,", "em": "old techniques.", "body": "Who you sit with and what changes for them. Two sentences, no mystique."}, "story": ["Where your practice started. One honest paragraph.", "How you teach now: what you keep simple and what you refuse to do.", "Who it's for, and who it isn't for."], "story2": ["Why I", "sit."], "quote": "One line you'd say to someone on their first sit.", "groups": [["One-to-one sit", "Weekly · 45 min", "Your own pace, your own questions."], ["A small group", "Weekly · 60 min", "Three to six people, same time each week."], ["A technique session", "Monthly", "One technique, practised properly."], ["A first sit", "One-off", "Low commitment, clear start."]], "events": [["A workshop", "What it teaches and who it's for.", "Sat"], ["A live sit", "Thirty minutes, online.", "Sun"], ["A walk", "Practice in motion.", "Thu"]], "offers": [{"name": "A first sit", "meta": "What someone gets the first time. Make it easy to say yes.", "dur": "30 min"}, {"name": "One-to-one", "meta": "Your core offer, plainly.", "dur": "45 min"}, {"name": "The program with you", "meta": "The eight weeks with a guide at your side.", "dur": "8 weeks"}], "trust": [["000 sits", "held"], ["00 years", "practising"], ["0 in 10", "come back"], ["One promise", "Something you always do"]], "reviewsAbout": ["One-to-one", "Small group", "The program"], "team": [["Your name", "Guide"], ["A co-guide", "Their role"], ["Another", "Their role"]], "posts": [["Technique", "The one you teach first"], ["Note", "What a first sit is actually like"], ["Idea", "What you keep coming back to"], ["Note", "What's new this month"]], "plans": [["Monthly", "Two sits a month."], ["Weekly", "Every week."], ["Program", "The eight weeks with you."]], "products": [["A guided recording", "One line on it."], ["A gift sit", "Who it's for."], ["Field journal", "Prompts between sits."]], "firstVisit": [["Before", "What happens when someone books."], ["During", "What the first sit is actually like."], ["What to bring", "Say \"nothing\" if nothing."], ["After", "What happens next."]]},
  program: {"label": "Program", "description": "For a course: eight weeks, what each week teaches, how to start and what it costs.", "accent": "yellow", "name": "Your Program", "descriptor": "Eight weeks · Your pace", "owner": "Your name", "role": "Guide", "person": "student", "tools": ["learn", "sell", "publish"], "cta": "Start week one", "cta2": "See the weeks", "hero": {"eyebrow": "Eight weeks · Online", "title": "Short sits,", "em": "small habits.", "body": "What someone can do after the eight weeks that they couldn't before. One sentence. Then the price."}, "story": ["Why this program exists.", "How a week works: a short sit a day and one small habit.", "Who finishes it, and what helps them."], "story2": ["Why eight", "weeks."], "quote": "Missed a day? Pick up where you left off.", "groups": [["Week one", "Sit down. Breathe.", "Ten minutes a day, nothing else."], ["Week two", "The body is the anchor", "Where the noise lives."], ["Week three", "Name the noise", "Notice, label, let it pass."], ["Week four", "Practice in motion", "The dishes count."]], "events": [["A live kickoff", "Start together, online.", "Mon"], ["Midway check-in", "Questions, with a guide.", "Wed"], ["Graduation sit", "The last sit, together.", "Sun"]], "offers": [{"name": "The program", "meta": "Eight weeks, at your pace. Pay what fits.", "dur": "8 weeks"}, {"name": "With a guide", "meta": "The eight weeks plus a weekly check-in.", "dur": "8 weeks"}, {"name": "For a team", "meta": "The program for a group at work.", "dur": "8 weeks"}], "trust": [["8 weeks", "at your pace"], ["10 minutes", "a day"], ["Pay what fits", "No one turned away"], ["One promise", "Something you always do"]], "reviewsAbout": ["Week one", "The whole program", "With a guide"], "team": [["Your name", "Guide"], ["A co-guide", "Their role"], ["Another", "Their role"]], "posts": [["Technique", "Week one's sit"], ["Note", "How to come back after a missed day"], ["Idea", "Why small habits stick"], ["Note", "What's new"]], "plans": [["Solo", "The eight weeks."], ["Guided", "With a weekly check-in."], ["Team", "For a group."]], "products": [["Field journal", "For the eight weeks."], ["Sit cushion", "For the floor at home."], ["A gift program", "Who it's for."]], "firstVisit": [["Before", "What arrives when someone signs up."], ["During", "What a day of the program is actually like."], ["What you need", "Ten minutes and a chair. Say if more."], ["After", "What happens at the end of week eight."]]},
  studio: {"label": "Studio", "description": "For a meditation room or studio: the schedule, the first visit, memberships and the room itself.", "accent": "blue", "name": "Your Studio", "descriptor": "Meditation studio · Your town", "owner": "Your name", "role": "Owner", "person": "member", "tools": ["book", "belong", "gather", "sell"], "cta": "Book a class", "cta2": "See the schedule", "hero": {"eyebrow": "Studio · Your street", "title": "A quiet room", "em": "in a loud town.", "body": "Where you are, when the room is open and who it's for. Two sentences."}, "story": ["How the room started.", "What a class here is like.", "Who comes, and why they stay."], "story2": ["Why this", "room."], "quote": "One line you say at the door.", "groups": [["Morning sit", "Daily · 30 min", "Before work."], ["Evening class", "Weekly · 60 min", "A technique and a long sit."], ["Open room", "Weekly", "Come and sit on your own."], ["First class", "One-off", "Start here."]], "events": [["A long sit", "Half a day, quiet.", "Sat"], ["A guest teacher", "Who and what.", "Thu"], ["Open house", "Bring a friend.", "Sun"]], "offers": [{"name": "A first class", "meta": "Easy to say yes to.", "dur": "60 min"}, {"name": "A class pack", "meta": "Ten classes, plainly priced.", "dur": "10 classes"}, {"name": "Membership", "meta": "Unlimited, monthly.", "dur": "Monthly"}], "trust": [["000 members", "and counting"], ["00 classes", "a week"], ["0 in 10", "come back"], ["One promise", "Something you always do"]], "reviewsAbout": ["Morning sit", "Evening class", "Membership"], "team": [["Your name", "Owner"], ["A teacher", "Their classes"], ["Another", "Their classes"]], "posts": [["Note", "What a first class is like"], ["Technique", "This month's practice"], ["Story", "Someone who stayed"], ["Note", "What's new"]], "plans": [["Class pack", "Ten classes."], ["Monthly", "Unlimited classes."], ["Supporter", "Keeps a free class running."]], "products": [["Sit cushion", "The ones in the room."], ["Gift card", "Who it's for."], ["Melt tee", "From the front desk."]], "firstVisit": [["Before", "Book online. Say if people can walk in."], ["During", "What the first class is actually like."], ["What to bring", "Nothing, or say what."], ["After", "What happens next."]]},
  shop: {"label": "Shop", "description": "For gear: the drop, the story and a shop that is easy to use.", "accent": "pink", "name": "Your Shop", "descriptor": "Gear for the practice", "owner": "Your name", "role": "Maker", "person": "customer", "tools": ["sell", "publish", "belong"], "cta": "Shop the drop", "cta2": "Our story", "hero": {"eyebrow": "New drop · Ships worldwide", "title": "Gear for", "em": "the practice.", "body": "What you make and who it's for. One sentence on where the money goes."}, "story": ["Why you make this.", "How it's made.", "Where the money goes."], "story2": ["Why we", "make it."], "quote": "One line on the thing you're proudest of.", "groups": [["The cushion", "In stock", "What it's made of."], ["The tee", "New drop", "The print on it."], ["The journal", "In stock", "What's inside."], ["A gift", "Any time", "Who it's for."]], "events": [["A drop", "What and when.", "Fri"], ["A pop-up", "Where to find you.", "Sat"], ["A restock", "What's coming back.", "Mon"]], "offers": [{"name": "The cushion", "meta": "One line on it.", "dur": "In stock"}, {"name": "The tee", "meta": "One line on it.", "dur": "New drop"}, {"name": "The journal", "meta": "One line on it.", "dur": "In stock"}], "trust": [["Ships", "worldwide"], ["Where the money goes", "Say it plainly"], ["Returns", "30 days"], ["One promise", "Something you always do"]], "reviewsAbout": ["The cushion", "The tee", "The journal"], "team": [["Your name", "Maker"], ["A collaborator", "Their role"], ["Another", "Their role"]], "posts": [["Story", "How the cushion is made"], ["Note", "The next drop"], ["Idea", "Why gear matters less than you think"], ["Note", "What's new"]], "plans": [["Supporter", "Monthly, keeps circles free."], ["Early access", "First look at drops."], ["Gift", "For someone loud."]], "products": [["Sit cushion", "Buckwheat fill, washable cover."], ["Melt tee", "Heavyweight cotton."], ["Field journal", "Prompts for practice."]], "firstVisit": [["Ordering", "What happens when someone orders."], ["Shipping", "How long it takes."], ["Returns", "Plainly."], ["After", "What happens next."]]},
}

/** The six kits' words (this file's source of truth); the Spotlight layouts read the same rows (lib/spotlight/mindless-kit-content.ts). */
export const MINDLESS_KIT_SPECS = SPECS

/** The design's picture for a kit's accent: the paint hero is treated once per accent. */
/** The design's colourful blob pattern, the main graphic behind every Mindless hero (owner, 2026-11-16). Decorative, so no alt. */
export const MINDLESS_BLOB = '/sites/mindless/blob.jpg'
const slot = (key: string, sample: string) => `{{${key}|${sample}}}`
const star = (c: { title: string; em: string }) => (c.em ? `${c.title} *${c.em}*` : c.title)
const copy = (_s: Spec, k: Section): SectionCopy => COPY[k]
const head = (c: SectionCopy, eyebrow: string) => ({ eyebrow, title: star(c), lede: c.lede ?? '' })

function pages(s: Spec): KitPage[] {
  const offers = s.offers.map((o, i) => ({
    name: slot(`offer${i + 1}Title`, o.name), meta: o.dur, body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, 'Set your price'), href: '~/booking',
  }))
  const hero: Block = {
    type: 'ServicesHero',
    props: {
      look: 'photo', eyebrow: s.hero.eyebrow, title: `${s.hero.title} *${s.hero.em}*`, lead: s.hero.body,
      primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: s.cta2, secondaryHref: '~/services', proof: '', image: MINDLESS_BLOB, alt: '',
      // The design's own hero: the paint photo full bleed under an ink fade, the words on the left, nothing over the circle on the right,
      // so no booking panel.
      panelTitle: 'Book online', panelNote: 'Pick a time', offers: [], areas: [],
    },
  }
  const trust: Block = { type: 'ServicesTrust', props: { items: s.trust.map(([title, line]) => ({ title, line })) } }
  const groups: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'circles'), 'Circles'), buttonLabel: 'Save a spot', buttonHref: '~/booking', rows: s.groups.map(([name, when, line]) => ({ meta: when, name, body: line, price: '', href: '~/booking' })) },
  }
  const first: Block = { type: 'ServicesSteps', props: { ...head(copy(s, 'firstnight'), 'Your first visit'), rows: s.firstVisit.map(([title, body]) => ({ title, body })) } }
  const events: Block = {
    type: 'ServicesEvents',
    props: {
      ...head(copy(s, 'events'), 'Events'), buttonLabel: '', buttonHref: '',
      rows: s.events.map(([title, body], i) => ({ meta: '', title: slot(`event${i + 1}Title`, title), body, price: '', href: '~/booking', featured: i === 0 })),
    },
  }
  const reviews: Block = {
    type: 'ServicesReviews',
    props: {
      ...head(copy(s, 'reviews'), 'Reviews'), proof: '',
      rows: s.reviewsAbout.map((what, i) => ({ quote: `Replace with a real quote from a real ${s.person}. Specific beats glowing.`, who: `${s.person[0].toUpperCase()}${s.person.slice(1)} ${['one', 'two', 'three'][i] ?? i + 1}`, what })),
    },
  }
  const team: Block = {
    type: 'ServicesTeam',
    props: { ...head(copy(s, 'team'), 'The team'), rows: s.team.map(([name, role], i) => ({ name: slot(`person${i + 1}Name`, i === 0 ? s.owner : name), role: i === 0 ? s.role : role, image: '', alt: '' })) },
  }
  const posts: Block = {
    type: 'ServicesPosts',
    props: { eyebrow: 'Notes', title: 'Worth *a read.*', lede: '', buttonLabel: '', buttonHref: '', rows: s.posts.map(([kind, title]) => ({ meta: kind, title, body: '', price: '', href: '', image: '', alt: '' })) },
  }
  const plans: Block | null = s.plans
    ? { type: 'ServicesPlans', props: { ...head(copy(s, 'plans'), 'Plans'), rows: s.plans.map(([title, body], i) => ({ meta: '', title, body, price: 'Set your price', href: '~/booking', featured: i === 1 })) } }
    : null
  const shop: Block | null = s.products
    ? { type: 'ServicesShop', props: { ...head(copy(s, 'shop'), 'Shop'), buttonLabel: 'Open the shop', buttonHref: '~/services', rows: s.products.map(([title, body]) => ({ meta: '', title, body, price: 'Set your price', href: '', image: '', alt: '' })) } }
    : null
  const list: Block = {
    type: 'ServicesList',
    props: { ...head(copy(s, 'services'), 'Services'), buttonLabel: 'See open times', buttonHref: '~/booking', rows: offers.map((o) => ({ meta: o.meta, name: o.name, body: o.body, price: o.price, href: o.href })) },
  }
  const faq: Block = {
    type: 'ServicesFaq',
    props: {
      eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.',
      rows: [
        { question: 'Do I need to book?', answer: 'You can. Booking holds your spot and sends a reminder. Say here if people can also just walk in.' },
        { question: 'What if I cannot make it?', answer: 'Change or cancel from the confirmation email. Say how late is too late.' },
        { question: 'Is it okay to come alone?', answer: 'Say yes if it is, and say what happens when someone does.' },
      ],
      facts: [], areas: [],
    },
  }
  const band: Block = {
    type: 'ServicesBand',
    props: { eyebrow: 'Next opening', title: star(copy(s, 'cta')), primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: '', secondaryHref: '' },
  }
  const story: Block = {
    type: 'ServicesStory',
    props: { eyebrow: 'Our story', title: `${s.story2[0]} *${s.story2[1]}*`, paragraphs: s.story, buttonLabel: 'Meet the people', buttonHref: '~/about', image: '/sites/mindless/photos/firepit-mono.jpg', alt: 'Three people sitting by a fire at night' },
  }
  const booking: Block = {
    type: 'ServicesBooking',
    props: {
      eyebrow: 'Book online', title: 'Next *openings.*', lede: 'Live availability. Pick a time, see the total, get a confirmation.', buttonLabel: s.cta, buttonHref: '~/booking',
      rows: s.groups.map(([name, when, line]) => ({ day: when, title: name, meta: line, time: '', href: '~/booking' })),
    },
  }
  const contact: Block = {
    type: 'ServicesContact',
    props: { eyebrow: 'Get in touch', title: 'Ask us *anything.*', lede: 'A person answers. Usually the same day.', body: '', buttonLabel: 'Send a message', buttonHref: '~/booking', secondaryLabel: '', secondaryHref: '' },
  }
  const locations: Block = {
    type: 'ServicesLocations',
    props: {
      eyebrow: 'Locations and hours', title: 'Where to *find us.*', lede: '', address: slot('address', 'Your street, Your City'), phone: slot('phone', 'Your phone'),
      email: slot('email', 'Your email'), hours: [], areas: [], image: '', alt: '',
    },
  }
  const letter: Block = {
    type: 'ServicesLetter',
    props: { eyebrow: 'Newsletter', title: 'Stay in *the loop.*', lede: 'A short note when something is coming up. Nothing else.', buttonLabel: 'Join the list', buttonHref: '~/booking' },
  }
  const compact = (xs: (Block | null)[]) => xs.filter((b): b is Block => b !== null)
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo(s.name, s.descriptor), blocks: compact([hero, trust, groups, first, events, reviews, band]) },
    { slug: 'services', label: 'Services', seo: seo('Services', `${s.name}: what is on and what it costs.`), blocks: compact([list, plans, shop, faq, band]) },
    { slug: 'about', label: 'About', seo: seo('About', `Who is behind ${s.name}.`), blocks: compact([story, team, posts, locations, letter]) },
    { slug: 'booking', label: 'Book', seo: seo('Book', `Pick a time at ${s.name}.`), blocks: compact([booking, contact]) },
  ]
}

export function mindlessKit(kit: MindlessKitId): MindlessKit {
  const s = SPECS[kit]
  return {
    id: `mindless-${kit}`, version: 1, theme: 'Mindless', niche: MINDLESS_KIT_NICHE[kit], kit, label: s.label, description: s.description,
    tools: s.tools, accent: MINDLESS_ACCENTS[s.accent].accent,
    pages: pages(s),
  }
}
