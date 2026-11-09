// NEW WORLD KIT SPOTLIGHT CONTENT. PURE.
// What the six Spotlight layouts (components/spotlight/new-world-kit-layouts.tsx) show for each of the seven New World
// kits (design revision 2). Ported from the design's kits.js and record.js (reference/ui_kits/site): the hero, the
// services, the open times, the groups and the doors. The doors are built exactly as record.js builds DOORS: the booking door first, one door per service,
// then one per Frequency function the kit's tools turn on, in the design's order (lib/sites/new-world-functions.ts, the
// same list the website Home is cut from). Everything a kit invents (prices,
// open times, reviews, the quote) is sample content: a live page passes `sample: false` and gets none of it, so no
// invented price, time or testimonial ships. The kit holds words and rows only; colour and type are the theme's.

import { NEW_WORLD_ACCENTS, type NewWorldAccentId } from '@/lib/theme/new-world'
import { newWorldFunctionsFor, type NewWorldHas, type NewWorldTool } from '@/lib/sites/new-world-functions'

type Tool = NewWorldTool
type Has = NewWorldHas
/** The design's icon names; the layouts map each to a lucide icon. */
type IconName = 'message' | 'sparkle' | 'calendar' | 'shield' | 'star' | 'award' | 'wrench' | 'home' | 'clock' | 'leaf' | 'heart' | 'chart' | 'briefcase' | 'tag' | 'bolt' | 'car' | 'droplet' | 'users' | 'sun' | 'user' | 'mail' | 'eye' | 'pin' | 'check'

interface NewWorldDoor { id: string; key: Tool; icon: IconName; title: string; meta: string; href: string }
interface NewWorldOffer { name: string; price: string; dur: string; icon: IconName }
interface NewWorldOpening { mon: string; day: string; title: string; time: string; where: string; left: number }
interface NewWorldReview { q: string; who: string; what: string }

export interface NewWorldSpotlightContent {
  kit: string
  accent: NewWorldAccentId
  name: string
  descriptor: string
  owner: string
  role: string
  story: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string | null }
  cta: { label: string; href: string }
  /** The kit's second button ("See the calendar"). */
  secondaryCta: string
  /** The ways in after the booking door (record.js DOORS.slice(1)). */
  doors: NewWorldDoor[]
  offers: NewWorldOffer[]
  openings: NewWorldOpening[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  review: NewWorldReview | null
  /** A closing call under the doors (the link page's "Get your free Spotlight"). */
  footerCta?: { label: string; href: string }
  secondReview: NewWorldReview | null
  quote: { text: string; who: string; role: string } | null
  proof: { icon: IconName; label: string; sub: string } | null
  /** The one count under the hero's stars (the design's TRUST[1], "3 sessions a week"). Sample only. */
  rating: string | null
  letter: { title: string; em: string; body: string; action: string } | null
  headings: { openings: { title: string; em: string }; services: { title: string; em: string } }
  /** A Space's own link page (the Profile layout): its profile photo, its header image, no sample furniture. */
  linkPage?: { portrait: string | null; cover: string | null }
  defaultLayout: NewWorldLayoutKey
  layouts: NewWorldLayoutKey[]
}

export type NewWorldLayoutKey = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'

interface KitSource {
  name: string; descriptor: string; owner: string; role: string; accent: string; cta: string; cta2: string
  tools: Tool[]; has: Has[]
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: string; quote: string; proof: [IconName, string, string]; rating: string
  offers: [string, string, string, IconName][]
  groups: [string, string][]
  reviews: [string, string, string][]
  headings: { openings: [string, string] | null; services: [string, string] | null }
}

const KITS: Record<string, KitSource> = {
  general: {
    name: 'Your Place', descriptor: 'What you do, in four words', owner: 'Your name', role: 'Owner', accent: 'purple', cta: 'Book your first visit', cta2: 'See the calendar',
    tools: ['belong', 'gather', 'publish', 'book'], has: ['events', 'plans', 'posts', 'team'],
    hero: { eyebrow: 'Your street · Your City', title: 'Say what happens here', em: 'and who it is for.', body: 'This is the template. Replace every line with your own: what you do, who shows up, how someone new gets started. Keep it to two sentences.' },
    story: 'The beginning: the thing you noticed, the room you wanted to exist, the first few people who came.', quote: 'The line you would paint on the wall by the door.', proof: ['check', 'First visit free', 'Always'], rating: '3 sessions a week',
    offers: [['First visit', 'Free', '60 min', 'users'], ['Drop in', '$18', '60 min', 'calendar'], ['Membership', '$24 / mo', 'Monthly', 'award']],
    groups: [['Weekly session', 'Tuesdays · 7pm'], ['Morning session', 'Saturdays · 8am'], ['Open workshop', 'Thursdays · 6:30pm']],
    reviews: [['Replace with a real quote from a real member. Specific beats glowing.', 'Member one', 'Weekly session'], ['A second one. What changed for them after a month here.', 'Member two', 'Membership']],
    headings: { openings: null, services: null },
  },
  coaches: {
    name: 'Morning Crew', descriptor: 'Run club & small-group strength', owner: 'Dre Walker', role: 'Head coach', accent: 'yellow', cta: 'Book a free session', cta2: 'This week’s sessions',
    tools: ['belong', 'gather', 'book', 'learn'], has: ['events', 'plans', 'posts', 'team'],
    hero: { eyebrow: 'Riverside track · Your City', title: 'Train with people', em: 'who know your name.', body: 'Saturday 5k for every pace. Strength in groups of eight midweek. Book a session in two taps, check in at the track, and your coach already knows what you did last week.' },
    story: 'Four runners kept meeting on the same loop. Now it is a Saturday club with coffee after and three strength groups during the week.', quote: 'Strong is a habit, and habits are easier with company.', proof: ['check', 'Every pace', 'A coach in every group'], rating: '6 sessions a week',
    offers: [['First session', 'Free', '60 min', 'bolt'], ['Small-group strength', '$22', '50 min', 'users'], ['8-week base', '$160', '8 weeks', 'award']],
    groups: [['Saturday 5k', 'Saturdays · 8am'], ['Strength AM', 'Tue & Thu · 6:30am'], ['Back of the Pack', 'Saturdays · 8am']],
    reviews: [['I came for the running. I stayed for the diner afterwards.', 'Tasha B.', 'Long Run'], ['Fifty-two and stronger than at thirty. Eight per group makes that possible.', 'Carla F.', 'Strength AM']],
    headings: { openings: null, services: ['Ways to', 'train.'] },
  },
  studios: {
    name: 'Still House', descriptor: 'Movement & breath studio', owner: 'Maya Chen', role: 'Founder', accent: 'red', cta: 'Book a class', cta2: 'See the schedule',
    tools: ['belong', 'gather', 'book', 'learn', 'sell'], has: ['events', 'products', 'plans', 'posts', 'team'],
    hero: { eyebrow: 'Hill Street · Your City', title: 'Small classes.', em: 'No mirrors.', body: 'Twelve mats, a wooden floor and the same faces most weeks. Book a class from the schedule, check in at the desk, and your first one is free.' },
    story: 'Still House is one room with a wooden floor and no mirrors. It opened because a few of us wanted somewhere to breathe that was not an app.', quote: 'Everyone deserves an hour where nothing is asked of them.', proof: ['check', 'First class free', 'Always'], rating: '12 classes a week',
    offers: [['First class', 'Free', '60 min', 'leaf'], ['Drop in', '$18', '60 min', 'heart'], ['Beginners series', '$60', '4 weeks', 'award']],
    groups: [['Tuesday Quiet', 'Tuesdays · 7pm'], ['Friday Loud', 'Fridays · 8pm'], ['Sunday Reset', 'Sundays · 10am']],
    reviews: [['The only hour of my week where my phone is in a basket and nobody minds.', 'Ana P.', 'Tuesday Quiet'], ['I was sure I was not a Friday Loud person. I am a Friday Loud person.', 'Chris W.', 'Friday Loud']],
    headings: { openings: null, services: ['Classes and', 'passes.'] },
  },
  hosts: {
    name: 'Thursday Supper', descriptor: 'A supper club', owner: 'Sofia Marini', role: 'Host', accent: 'blue', cta: 'Take a seat', cta2: 'See the next menus',
    tools: ['belong', 'gather', 'sell', 'publish'], has: ['events', 'products', 'posts', 'team'],
    hero: { eyebrow: 'Thursdays · a different kitchen each month', title: 'Twenty seats.', em: 'One long table.', body: 'A seasonal menu, a borrowed kitchen and strangers who become regulars. Seats go on the calendar Monday morning and usually go by lunch.' },
    story: 'Thursday Supper began as eight people in a borrowed kitchen. It is now a table of twenty that moves around the city, hosted wherever there is a room big enough.', quote: 'Cook one pot, light the candles, and let the table do the rest.', proof: ['check', 'Sit anywhere', 'No plus-one needed'], rating: '5 tables a month',
    offers: [['A seat at the table', '$45', 'Evening', 'heart'], ['Pasta Sunday', '$38', '3 hr', 'sparkle'], ['Host a table', 'Free', 'One evening', 'users']],
    groups: [['The Table', 'Thursdays · 7:30pm'], ['Sunday Pasta', 'Last Sunday · 2pm'], ['Host a Table', 'Monthly']],
    reviews: [['Came alone, sat between a nurse and a carpenter, left with both their numbers.', 'Hugo D.', 'The Table'], ['The one afternoon a month I cook with other people. It fixed something.', 'Ariana V.', 'Sunday Pasta']],
    headings: { openings: null, services: ['Seats and', 'Sundays.'] },
  },
  venues: {
    name: 'The Annex', descriptor: 'Music & listening room', owner: 'Jordan Pike', role: 'Owner', accent: 'red', cta: 'Get tickets', cta2: 'This week at the Annex',
    tools: ['gather', 'sell', 'belong', 'publish'], has: ['events', 'products', 'plans', 'posts', 'team'],
    hero: { eyebrow: 'Market Lane · doors most nights', title: 'Loud nights.', em: 'Quiet ones too.', body: 'A 200-cap room with a serious system. Live bands Fridays, one album start to finish on Mondays, open stage Wednesdays. Tickets on the calendar, cheap on purpose.' },
    story: 'The Annex is a converted print shop with a sound system that was someone’s life savings. The door is kind by policy.', quote: 'A good room is a kind door and a sound system you can feel in your chest.', proof: ['check', 'Kind door', 'Always'], rating: '5 nights a week',
    offers: [['Friday ticket', '$15', 'Night', 'bolt'], ['Listening Club', 'Free', '90 min', 'heart'], ['Annex regular', '$20 / mo', 'Monthly', 'award']],
    groups: [['Listening Club', 'Mondays · 8pm'], ['Open Stage', 'Wednesdays · 7pm'], ['Sunday Slow', 'Sundays · 11am']],
    reviews: [['I came to the listening night alone because it meant I did not have to talk. Then I did.', 'Grace Y.', 'Listening Club'], ['Open stage gave me my first ten minutes. The room was so kind it hurt.', 'Dmitri V.', 'Open Stage']],
    headings: { openings: null, services: ['Tickets and', 'regulars.'] },
  },
  nonprofits: {
    name: 'Northside Neighbours', descriptor: 'A neighbourhood association', owner: 'Amara Diallo', role: 'Coordinator', accent: 'blue', cta: 'RSVP to the next one', cta2: 'See the calendar',
    tools: ['gather', 'belong', 'publish', 'sell'], has: ['events', 'products', 'posts', 'team'],
    hero: { eyebrow: 'Northside · Your City', title: 'Fix the park.', em: 'Meet the street.', body: 'A repair café, a tool library, a park crew and a street dinner every month. No forms, no dues. RSVP to one thing and you are a neighbour.' },
    story: 'Northside Neighbours began with a street dinner that closed one road for one evening. Forty people came. Most had never spoken.', quote: 'Everyone has something to fix and something to lend.', proof: ['check', 'No dues', 'Ever'], rating: '3 crews',
    offers: [['Show up once', 'Free', 'A morning', 'users'], ['Tool library card', 'Free', 'Yearly', 'wrench'], ['Keep the kettle on', 'From $5 / mo', 'Monthly', 'heart']],
    groups: [['Repair Café', 'Second Saturday · 10am'], ['Park Crew', 'Sundays · 9am'], ['Street Dinner Crew', 'Monthly']],
    reviews: [['I fixed a lamp and met the woman three doors down I had never spoken to in six years.', 'Elena R.', 'Repair Café'], ['The park crew is the only exercise I keep up with.', 'Jamal W.', 'Park Crew']],
    headings: { openings: null, services: ['Ways to', 'help.'] },
  },
  networks: {
    name: 'Third Place', descriptor: 'Twelve small groups across the city', owner: 'Hollis Grant', role: 'Steward', accent: 'purple', cta: 'Join a group', cta2: 'See every group',
    tools: ['belong', 'gather', 'publish', 'learn'], has: ['events', 'plans', 'posts', 'team'],
    hero: { eyebrow: 'Twelve groups · six neighbourhoods', title: 'Small groups', em: 'near you.', body: 'Walkers, readers, potluck cooks, new arrivals, early dads, bad sketchers. Each group is under twenty people and meets at the same time in the same place. Join one. Then another.' },
    story: 'Third Place is not a venue. It is twelve small groups meeting in borrowed rooms across the city, held together by hosts who were once the new person.', quote: 'Open doors, small rooms, familiar faces.', proof: ['check', 'Free, always', 'Supporters keep rooms booked'], rating: '12 groups',
    offers: [['Join a group', 'Free', 'Any week', 'users'], ['Host a group', 'Free', 'Monthly check-in', 'award'], ['Six weeks in', 'Free', '6 weeks', 'heart']],
    groups: [['Westside Walkers', 'Saturdays · 9am'], ['Book & Beer', 'Second Tuesday · 7pm'], ['Sunday Potluck', 'Sundays · 1pm']],
    reviews: [['Three groups in, I have people to call on a Tuesday. Actual people.', 'Ellie K.', 'Book & Beer'], ['New in Town got me through my first winter here.', 'Marco D.', 'New in Town']],
    headings: { openings: null, services: ['Join, host,', 'or start.'] },
  },
}

const SAMPLE_OPENINGS = [{ mon: 'Nov', day: '06', time: '7:00p', left: 4 }, { mon: 'Nov', day: '08', time: '8:00a', left: 0 }, { mon: 'Nov', day: '11', time: '6:30p', left: 2 }]

/** The first word of the owner's name, with a title ("Dr.") kept to the name after it. */
function firstName(owner: string): string {
  const [a, b] = owner.split(' ')
  return a!.endsWith('.') && b ? `${a} ${b}` : a!
}

/** The kit ids, in the design's order. */
export const NEW_WORLD_KIT_IDS = Object.keys(KITS)

/** The revision 2 hue names the kits carry, mapped to the accent presets the theme has now (Tide only: Daniel's starting accent).
 *  Every other hue wears Tide until the owner rules on more presets; an owner's own choice always wins when the theme has it. */
const HUE_PRESET: Record<string, NewWorldAccentId> = { blue: 'tide' }

/** Everything a New World layout shows for a kit. `sample` fills the prices, open times, reviews and the quote (the
 *  design's sample page); a live page passes false and gets none of them. `accent` and `photo` are the owner's. */
export function newWorldKitSpotlightContent(kit: string, opts: { name?: string; sample?: boolean; accent?: string; photo?: string } = {}): NewWorldSpotlightContent {
  const id = KITS[kit] ? kit : 'general'
  const k = KITS[id]!
  const sample = opts.sample !== false
  const pick = (a: string | undefined): NewWorldAccentId | null => (a && a in NEW_WORLD_ACCENTS ? (a as NewWorldAccentId) : a ? (HUE_PRESET[a] ?? null) : null)
  const accent = pick(opts.accent) ?? pick(k.accent) ?? 'tide'
  const offers: NewWorldOffer[] = sample ? k.offers.map(([name, price, dur, icon]) => ({ name, price, dur, icon })) : []
  const groups = k.groups.length ? k.groups : []
  const has = (h: Has) => (h === 'groups' ? groups.length > 0 : k.has.includes(h))
  const fns = newWorldFunctionsFor(k.tools, has)
  const ids = fns.map((f) => f.id)
  const doors: NewWorldDoor[] = [
    ...offers.map((o, i): NewWorldDoor => ({ id: `offer-${i}`, key: 'book', icon: o.icon, title: o.name, meta: `${o.price} · ${o.dur}`, href: '/services' })),
    ...fns.filter((f) => !['booking', 'services'].includes(f.id)).map((f): NewWorldDoor => ({
      id: f.id, key: f.tool, icon: f.icon,
      title: f.id === 'team' ? `Meet ${firstName(k.owner)}` : f.door,
      meta: f.id === 'reviews' ? 'What the regulars say' : f.id === 'team' ? k.role : f.why,
      href: f.href,
    })),
  ]
  // Open times come from the groups (the design's `nx`), or from the services when a kit has no groups.
  const rows: [string, string][] = groups.length ? groups : k.offers.map(([name, , dur]) => [name, dur])
  const openings: NewWorldOpening[] = sample && rows.length > 0
    ? SAMPLE_OPENINGS.map((s, i) => { const r = rows[i % rows.length]!; return { mon: s.mon, day: s.day, title: r[0], time: s.time, where: r[1], left: s.left } })
    : []
  const first = openings[0]
  const hasCalendar = ids.includes('booking') && (!sample || openings.length > 0)
  const layouts: NewWorldLayoutKey[] = ['stack', 'card-wall', 'story']
  if (hasCalendar) layouts.push('calendar-first')
  if (ids.includes('services')) layouts.push('shop-front')
  layouts.push('profile')
  const pair = (p: [string, string] | null, d: { title: string; em: string }) => (p ? { title: p[0], em: p[1] } : d)
  return {
    kit: id,
    accent,
    name: opts.name ?? k.name,
    descriptor: k.descriptor,
    owner: k.owner,
    role: k.role,
    story: k.story,
    hero: { ...k.hero, photo: opts.photo ?? null },
    cta: { label: k.cta, href: '/book' },
    secondaryCta: k.cta2,
    doors,
    offers,
    openings,
    featured: first
      ? { eyebrow: 'Next door open', title: `${first.mon} ${Number(first.day)} · ${first.time}`, meta: `${first.title} · ${first.left} spots left`, cta: 'Save my spot', href: '/book' }
      : { eyebrow: 'Book online', title: k.cta, meta: 'See open times', cta: 'See open times', href: '/book' },
    review: sample && k.reviews[0] ? { q: k.reviews[0][0], who: k.reviews[0][1], what: k.reviews[0][2] } : null,
    secondReview: sample && k.reviews[1] ? { q: k.reviews[1][0], who: k.reviews[1][1], what: k.reviews[1][2] } : null,
    quote: sample ? { text: k.quote, who: k.owner, role: k.role } : null,
    proof: sample ? { icon: k.proof[0], label: k.proof[1], sub: k.proof[2] } : null,
    rating: sample ? k.rating : null,
    letter: ids.includes('letter') && sample ? { title: 'Stay in', em: 'the loop.', body: 'A short note when something is coming up. Nothing else.', action: '/letter' } : null,
    headings: { openings: pair(k.headings.openings, { title: 'Open', em: 'this week.' }), services: pair(k.headings.services, { title: 'Ways', em: 'in.' }) },
    defaultLayout: 'stack',
    layouts,
  }
}

/** The icon a link page door wears, by where the link goes. */
function linkIcon(host: string): IconName {
  if (host.includes('instagram')) return 'eye'
  if (host.includes('tiktok')) return 'star'
  if (host.includes('frequency')) return 'bolt'
  return 'user'
}

/** THE LINK PAGE (a Space's Spotlight on New World): the design's Stack layout fed by the owner's own links, one door
 *  each, a "message me" button in the hero and one closing call. Nothing is invented: no sample time, price or quote. */
export function newWorldLinkPageContent(opts: {
  name: string
  tagline: string | null
  photo?: string | null
  messageHref: string | null
  links: { label: string; url: string }[]
  closing: { label: string; href: string } | null
}): NewWorldSpotlightContent {
  const base = newWorldKitSpotlightContent('general', { name: opts.name, sample: false, photo: opts.photo ?? undefined })
  const doors: NewWorldDoor[] = opts.links.map((l, i) => {
    let meta = l.url
    let host = ''
    try { const u = new URL(l.url); host = u.hostname; meta = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}` } catch { /* keep the raw url */ }
    return { id: `link-${i}`, key: 'publish', icon: linkIcon(host), title: l.label, meta, href: l.url }
  })
  return {
    ...base,
    doors,
    offers: [],
    openings: [],
    letter: null,
    descriptor: opts.tagline ?? '',
    hero: { eyebrow: opts.tagline ?? '', title: 'Find me', em: 'online.', body: '', photo: opts.photo ?? null },
    cta: { label: 'Message me', href: opts.messageHref ?? '/' },
    footerCta: opts.closing ?? undefined,
    layouts: ['stack'],
  }
}

/** THE PROFILE LINK PAGE (a Space's Spotlight on New World, look `profile`): the design's Profile layout, the owner first.
 *  The Space's profile photo is the portrait, its header image washes the top, its tagline and About text sit under the
 *  name, the PRIMARY link (frequencylocal.com when the owner has it, else the first) is the big accent button and every
 *  other link is a door under it. Nothing is invented: no sample quote, price or review. */
export function newWorldProfilePageContent(opts: {
  name: string
  tagline: string | null
  about: string | null
  portrait: string | null
  cover: string | null
  accent?: string
  links: { label: string; url: string }[]
}): NewWorldSpotlightContent {
  const link = newWorldLinkPageContent({ name: opts.name, tagline: opts.tagline, photo: opts.portrait, messageHref: null, links: opts.links, closing: null })
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
  const primary = opts.links.find((l) => host(l.url) === 'frequencylocal.com') ?? opts.links[0] ?? null
  const rest = link.doors.filter((_, i) => opts.links[i] !== primary)
  const accent = opts.accent && opts.accent in NEW_WORLD_ACCENTS ? (opts.accent as NewWorldAccentId) : link.accent
  return {
    ...link,
    accent,
    owner: opts.name,
    role: opts.tagline ?? '',
    name: opts.name,
    story: opts.about ?? '',
    doors: rest,
    cta: primary ? { label: host(primary.url) || primary.label, href: primary.url } : { label: '', href: '' },
    secondReview: null,
    linkPage: { portrait: opts.portrait, cover: opts.cover },
    layouts: ['profile'],
    defaultLayout: 'profile',
  }
}
