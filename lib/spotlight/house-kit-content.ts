// THE HOUSE KIT SPOTLIGHT CONTENT (LIVE-2357). PURE.
// Bold, Wildheart and Nocturne had a Spotlight colour preset and no whole-page layouts. Rather than three more copies of a
// theme kit, they share one set of six layouts (components/spotlight/house-kit-layouts.tsx) that wears each theme's own flat
// token set (lib/theme/mega-surfaces.ts) and a small presentation (faces, case, corners, frame). This module is the words and
// rows those layouts show. Everything a kit invents (prices, open times, the quote, the sample photos) is sample content: a
// live page passes `sample: false` and gets none of it, so no invented price, time or testimonial ships.

export type HouseKitTheme = 'bold' | 'wildheart' | 'midnight'
export type HouseKitLayoutKey = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'
export const HOUSE_KIT_LAYOUT_KEYS: readonly HouseKitLayoutKey[] = ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']

/** The stored id prefix of each theme's layouts (`bold-kit:stack`). Nocturne is the Midnight theme's name (code id midnight). */
export const HOUSE_KIT_PREFIX: Record<HouseKitTheme, 'bold-kit' | 'wildheart-kit' | 'nocturne-kit'> = {
  bold: 'bold-kit',
  wildheart: 'wildheart-kit',
  midnight: 'nocturne-kit',
}

type IconName = 'calendar' | 'star' | 'users' | 'mail' | 'pin' | 'message' | 'heart' | 'tag' | 'sparkle'

interface HouseKitDoor { id: string; icon: IconName; title: string; meta: string; href: string }
interface HouseKitOffer { name: string; price: string; dur: string }
interface HouseKitOpening { mon: string; day: string; title: string; time: string; left: number }

export interface HouseKitSpotlightContent {
  theme: HouseKitTheme
  /** The owner's own accent (a hex from their Space or Spotlight); null wears the theme's. */
  accentHex: string | null
  name: string
  descriptor: string
  /** The one line a stranger should remember. */
  pain: string
  owner: string
  role: string
  story: string
  hero: { eyebrow: string; title: string; em: string; photo: string | null }
  portrait: string | null
  cta: { label: string; href: string }
  doors: HouseKitDoor[]
  offers: HouseKitOffer[]
  openings: HouseKitOpening[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  quote: { text: string; who: string } | null
  /** A closing call under the doors (the link page's "Get your free Spotlight"). */
  footerCta?: { label: string; href: string }
}

interface Words {
  name: string; descriptor: string; pain: string; owner: string; role: string; story: string
  hero: { eyebrow: string; title: string; em: string }
  cta: string
  offers: [string, string, string][]
  sessions: string[]
  quote: string
  photo: string; portrait: string
}

// The sample words COACH the owner (owner 2026-11-18: "Make every Frequency theme FULLY generic with copy that coaches them what
// to write"): every line says what belongs there, pain point first, with no names, brands, invented prices or testimonials.
// Each theme keeps its own register in the coaching (Bold direct, Wildheart seasonal, Nocturne quiet).
const COMMON = {
  name: 'Your name here', owner: 'Your name', role: 'What you do, in three words',
  offers: [['Your first offer', 'Your price', 'How long'], ['Your main offer', 'Your price', 'How long'], ['Your membership', 'Your price', 'How often']] as [string, string, string][],
  quote: 'Paste a real line from a real person here. What changed for them beats how much they liked it.',
}
const WORDS: Record<HouseKitTheme, Words> = {
  bold: {
    ...COMMON, descriptor: 'What you do, in four words',
    pain: 'Say the hard thing your people are stuck on, in one line. Then say how you fix it.',
    story: 'Who shows up, what the work feels like, and exactly how someone new gets started. Short sentences. No fluff.',
    hero: { eyebrow: 'Where you meet · Your city', title: 'Name the', em: 'tough room.' },
    cta: 'Book a first visit',
    sessions: ['Your weekly session', 'Your second session', 'Your open day'],
    photo: '/brand/frequency/photos/boc-fire-night.jpg', portrait: '/brand/frequency/photos/gathering-10.jpg',
  },
  wildheart: {
    ...COMMON, descriptor: 'Your circle, in four words',
    pain: 'Name what people are longing for this season, then the gathering that answers it.',
    story: 'What happens when someone walks in, what to bring, and how the year unfolds with you. Warm, plain and true.',
    hero: { eyebrow: 'This season · Your city', title: 'Name your', em: 'season.' },
    cta: 'Join the next circle',
    sessions: ['Your new moon gathering', 'Your full moon gathering', 'Your seasonal gathering'],
    photo: '/brand/wildheart/photos/cacao-circle.jpg', portrait: '/brand/wildheart/photos/hands-together.jpg',
  },
  midnight: {
    ...COMMON, descriptor: 'Your evenings, in four words',
    pain: 'Say what keeps your people up at night, then the hour you give them back.',
    story: 'What a session is like from the moment someone arrives: the room, the pace, who holds it and how it ends.',
    hero: { eyebrow: 'Evenings · Your city', title: 'Name your', em: 'quiet hour.' },
    cta: 'Book a session',
    sessions: ['Your evening session', 'Your monthly gathering', 'Your private session'],
    photo: '/sites/midnight/photos/nature-grain.jpg', portrait: '/sites/midnight/photos/nature-fern.jpg',
  },
}

const SAMPLE_OPENINGS = [{ mon: 'Nov', day: '06', time: '7:00 PM', left: 4 }, { mon: 'Nov', day: '13', time: '7:00 PM', left: 0 }, { mon: 'Nov', day: '20', time: '6:30 PM', left: 2 }]
const HEX6 = /^#[0-9a-f]{6}$/i

/** True for a theme that wears the house kit. */
export function isHouseKitTheme(v: unknown): v is HouseKitTheme {
  return v === 'bold' || v === 'wildheart' || v === 'midnight'
}

/** Everything a house kit layout shows. `sample` fills the prices, open times, quote and the theme's sample photos; a live
 *  page passes false and gets none of them. `accent`, `photo` (the header picture) and `portrait` (the avatar) are the owner's. */
export function houseKitSpotlightContent(theme: HouseKitTheme, opts: { name?: string; sample?: boolean; accent?: string; photo?: string; portrait?: string } = {}): HouseKitSpotlightContent {
  const w = WORDS[theme]
  const sample = opts.sample !== false
  const offers: HouseKitOffer[] = sample ? w.offers.map(([name, price, dur]) => ({ name, price, dur })) : []
  const openings: HouseKitOpening[] = sample ? SAMPLE_OPENINGS.map((o, i) => ({ ...o, title: w.sessions[i] ?? w.sessions[0]! })) : []
  const first = openings[0]
  const doors: HouseKitDoor[] = [
    ...offers.map((o, i): HouseKitDoor => ({ id: `offer-${i}`, icon: 'tag', title: o.name, meta: `${o.price} · ${o.dur}`, href: '/services' })),
    { id: 'events', icon: 'calendar', title: "What's on", meta: 'Dates, times and how to join', href: '/events' },
    { id: 'reviews', icon: 'star', title: 'Read reviews', meta: 'What the regulars say', href: '/reviews' },
    { id: 'circles', icon: 'users', title: 'Find your people', meta: 'The small rooms where the same faces meet again', href: '/groups' },
    { id: 'letter', icon: 'mail', title: 'Get the letter', meta: 'A short note when something opens up', href: '/letter' },
    { id: 'contact', icon: 'pin', title: 'Find us', meta: 'Where, when and how to get there', href: '/contact' },
  ]
  const name = opts.name ?? w.name
  // The coaching lines are for the preview only: a live page never shows "Say the hard thing..." to a stranger.
  return {
    theme,
    accentHex: opts.accent && HEX6.test(opts.accent) ? opts.accent.toLowerCase() : null,
    name,
    descriptor: sample ? w.descriptor : '',
    pain: sample ? w.pain : '',
    owner: sample ? w.owner : name,
    role: sample ? w.role : '',
    story: sample ? w.story : '',
    hero: { ...(sample ? w.hero : { eyebrow: '', title: name, em: '' }), photo: opts.photo ?? (sample ? w.photo : null) },
    portrait: opts.portrait ?? (sample ? w.portrait : null),
    cta: { label: w.cta, href: '/book' },
    doors,
    offers,
    openings,
    featured: first
      ? { eyebrow: 'Next date', title: `${first.mon} ${Number(first.day)} · ${first.time}`, meta: `${first.title} · ${first.left} spots left`, cta: 'Save my spot', href: '/book' }
      : { eyebrow: 'Book online', title: w.cta, meta: 'See open times', cta: 'See open times', href: '/book' },
    quote: sample ? { text: w.quote, who: w.owner } : null,
  }
}
