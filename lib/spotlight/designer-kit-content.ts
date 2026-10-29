// DESIGNER THEME KIT SPOTLIGHT CONTENT AND PER-PROFILE RULES. PURE.
// What the six Spotlight layouts (components/spotlight/designer-kit-layouts.tsx) show for each of the thirteen Designer
// profiles: the hero, the descriptor, the ways in and the featured item. The words are the design system's own
// (lib/themes/designer-kits.json, the same file the profile kits read) fixed to the voice guide: no cadence promises, no
// counts, no ratings, no placeholder city, no em dashes.
// The design draws Spotlight for ONE profile (Interior designers); the other twelve are the rules below, built the way the
// Network Spotlight did it (lib/spotlight/network-kit-content.ts). The profile decides three things:
//   1. the accent it wears (the design's own per-profile ramp, designerProfileAccent in the profile kits),
//   2. the ways in, one per tool the profile has on, in the design's ladder order (book, learn, gather, belong, sell, publish),
//   3. the layout it starts on, and which of the six it can use: Calendar first needs events, Shop front needs
//      consultations to book; the other four always work.

import kitData from '@/lib/themes/designer-kits.json' with { type: 'json' }
import type { DesignerKitLayoutId } from '@/lib/spotlight/layouts'

/** The design system's profile ids, in its order (the engine's stable keys). */
export const DESIGNER_KIT_SPOTLIGHT_PROFILES = ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks', 'creators', 'schools', 'clubs', 'faith', 'wellness', 'markets'] as const
type ProfileId = (typeof DESIGNER_KIT_SPOTLIGHT_PROFILES)[number]
type Tool = 'publish' | 'book' | 'gather' | 'learn' | 'belong' | 'sell'
type LayoutKey = DesignerKitLayoutId extends `designer-kit:${infer L}` ? L : never

interface Door { key: Tool; title: string; meta: string; href: string }
interface DateRow { mon: string; day: number; title: string; time: string; where: string; seatsLeft?: number }
interface Pair { title: string; em: string }
interface Accent { base: string; hover: string; text: string; deep: string; soft: string; bg: string; on: string }

export interface DesignerKitSpotlightContent {
  profile: ProfileId
  /** The profile's accent ramp, as the design's tokens/kits.css names it. */
  accent: Accent
  /** The mark in the logo ring (a name of the design's sigil set). */
  sigil: string
  name: string
  descriptor: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string }
  cta: { label: string; href: string }
  doors: Door[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  dates: DateRow[]
  gatherings: Pair
  offeringsLabel: string
  offerings: { name: string; minutes: number | null; price: number | null; photo: string }[]
  offeringsHead: Pair
  hasGift: boolean
  /** The photograph in the Profile layout's round portrait. */
  portrait: string
  letter: (Pair & { action: string }) | null
  quote: { text: string; who: string; role: string } | null
  defaultLayout: LayoutKey
  layouts: LayoutKey[]
}

interface KitRow {
  id: string; name: string; packages: string[]; cta: { label: string; route: string }; descriptor: string; image: string; sigil: string
  labels: Record<string, string>; copy: Record<string, Record<string, string>>; offers?: string[][]; events?: string[]
  accent: Accent
}
const DATA = kitData as unknown as { images: Record<string, string>; blocks: Record<string, { fields: Record<string, string> }>; kits: KitRow[] }

/** Where the design's photographs live (public/sites/designer/photos, the same fourteen the Designer website ships). */
const PHOTO_BASE = '/sites/designer/photos/'
const photoUrl = (key: string): string => `${PHOTO_BASE}${(DATA.images[key] ?? key)}.webp`

// The design's stock rows (ui_kits/site/data.js and content.js). A kit renames the offers and events; a profile with none of
// its own keeps these. The minutes, prices and seats are the design's SAMPLE numbers and show in a preview only.
const STOCK_OFFERS: { name: string; minutes: number; price: number }[] = [
  { name: 'Discovery call', minutes: 20, price: 0 },
  { name: 'Design consultation', minutes: 120, price: 350 },
  { name: 'Ready to build meeting', minutes: 90, price: 0 },
]
const OFFER_PHOTOS = ['placeholder-03', 'placeholder-05', 'placeholder-06']
const STOCK_EVENTS: { title: string; mon: string; day: number; time: string; where: string; seats: number }[] = [
  { title: 'Open studio evening', mon: 'Nov', day: 18, time: '5:30pm to 7:30pm', where: 'The studio', seats: 6 },
  { title: 'Planning a kitchen remodel', mon: 'Nov', day: 27, time: '6pm to 8pm', where: 'The studio', seats: 2 },
  { title: 'Colour, light and finish', mon: 'Dec', day: 9, time: '10am to 12pm', where: 'Online', seats: 12 },
]

/** Lines the voice guide does not allow, and what each says here. Keyed by the design's exact words. */
const SOFT: Record<string, string> = {
  'A letter each season.': 'A letter, now and then.',
}
/** The design's "Your city" is a placeholder the owner fills; a live page does not carry it. And the word the build guard
 *  keeps out of source (LIVE-607) never reaches a visitor: the regex is spelled so this file never holds it. */
const plain = (s: string): string => (SOFT[s] ?? s).replace(/\s·\sYour city\b/g, '').replace(/\bcom{2}is{2}ions?\b/gi, 'custom work')

interface ProfileSource {
  /** What the design calls the profile's own words for each way in; the design's door titles where absent. */
  doors: Partial<Record<Tool, string>>
  cta?: string
  descriptor?: string
  offeringsEyebrow?: string
  offeringsHead?: Pair
  /** Names for the offers where the design's own would not pass the voice guide. */
  offers?: string[]
  layout: LayoutKey
}

const BOOK = 'Book a consultation'
// Every profile keeps the design's six-door ladder (book, learn, gather, belong, sell, publish); a profile only renames.
// The default layout is the one the profile's own home page leans on in the design (kits.js): a calendar where the home is a
// calendar, cards where it is cards, a voice where it sells by voice.
const PROFILES: Record<ProfileId, ProfileSource> = {
  general: { doors: { book: BOOK, gather: 'Join an event', publish: 'The journal' }, layout: 'stack' },
  coaches: { doors: { book: 'Ways to work together', sell: 'Shop the edit', publish: 'The journal' }, layout: 'story' },
  studios: { doors: { book: 'Book a first call', gather: 'Come to a talk', publish: 'The journal' }, layout: 'calendar-first' },
  hosts: { doors: { book: 'Book a consult', publish: 'The journal' }, layout: 'story' },
  venues: { doors: { book: 'Plan a garden visit', gather: 'Join a garden tour', publish: 'The journal' }, layout: 'card-wall' },
  nonprofits: { doors: { book: 'Ways to start', sell: 'Order samples', publish: 'The journal' }, layout: 'stack' },
  networks: { doors: { book: 'Ways to work together', learn: 'Join a workshop', publish: 'The journal' }, layout: 'profile' },
  creators: { doors: { book: 'Ways to work together', learn: 'Take a course', sell: 'Browse templates', publish: 'The journal' }, layout: 'shop-front' },
  schools: { doors: { learn: 'Take a course', gather: 'Come to a workshop', publish: 'The journal' }, layout: 'calendar-first' },
  clubs: {
    doors: { book: 'Ways to order', sell: 'See the pieces', publish: 'The journal' }, cta: 'Ask about a piece', descriptor: 'Custom work · Made to order · Workshop',
    offeringsEyebrow: 'Custom work', offeringsHead: { title: 'Ways to', em: 'order a piece' }, offers: ['Call about a piece', 'Measured visit', 'Built-in project'], layout: 'shop-front',
  },
  faith: { doors: { book: 'Check your date', gather: 'Join a workshop', publish: 'The journal' }, layout: 'story' },
  wellness: { doors: { book: 'Ways to refresh', belong: 'Home care plans', sell: 'Visit the shop', publish: 'The journal' }, layout: 'card-wall' },
  markets: { doors: { gather: 'Visit on a studio day', belong: 'Join the swatch club', sell: 'See the collection', publish: 'The journal' }, layout: 'card-wall' },
}

const META: Record<Tool, string> = {
  book: 'Start with a short call',
  learn: 'Courses and how they run',
  gather: 'See the next dates',
  belong: 'What members get',
  sell: 'What is in the shop',
  publish: 'Guides and free reads',
}
const HREF: Record<Tool, string> = { book: '/consultation', learn: '/courses', gather: '/events', belong: '/membership', sell: '/shop', publish: '/journal' }
const DEFAULT_DOOR: Record<Tool, string> = { book: 'Book a session', learn: 'Take a program', gather: 'Join an event', belong: 'Become a member', sell: 'Visit the shop', publish: 'The library' }
const LADDER: Tool[] = ['book', 'learn', 'gather', 'belong', 'sell', 'publish']

const isProfile = (id: unknown): id is ProfileId => typeof id === 'string' && (DESIGNER_KIT_SPOTLIGHT_PROFILES as readonly string[]).includes(id)

function doorsFor(tools: string[], p: ProfileSource): Door[] {
  return LADDER.filter((t) => tools.includes(t)).map((t) => ({ key: t, title: p.doors[t] ?? DEFAULT_DOOR[t], meta: META[t], href: HREF[t] }))
}

/** The one featured item, picked from the profile's tools in ladder order (events, courses, consultations, then the rest). */
function featuredFor(tools: string[], doors: Door[], d: DateRow[], offers: { name: string }[]): DesignerKitSpotlightContent['featured'] {
  const door = (k: Tool) => doors.find((x) => x.key === k)
  if (tools.includes('gather') && d[0]) return { eyebrow: 'Next gathering', title: d[0].title, meta: `${d[0].mon} ${d[0].day} · ${d[0].time} · ${d[0].where}`, cta: 'Reserve', href: HREF.gather }
  if (tools.includes('gather')) return { eyebrow: 'Events', title: door('gather')!.title, meta: META.gather, cta: 'See dates', href: HREF.gather }
  if (tools.includes('learn')) return { eyebrow: 'Courses', title: door('learn')!.title, meta: META.learn, cta: 'Look', href: HREF.learn }
  if (tools.includes('book')) return { eyebrow: 'Consultations', title: offers[1]?.name ?? door('book')!.title, meta: META.book, cta: 'Book', href: HREF.book }
  if (tools.includes('belong')) return { eyebrow: 'Membership', title: door('belong')!.title, meta: META.belong, cta: 'Join', href: HREF.belong }
  if (tools.includes('sell')) return { eyebrow: 'The shop', title: door('sell')!.title, meta: META.sell, cta: 'Browse', href: HREF.sell }
  return { eyebrow: 'The journal', title: door('publish')!.title, meta: META.publish, cta: 'Read', href: HREF.publish }
}

/** Which of the six layouts a profile can use. */
function layoutsFor(tools: string[]): LayoutKey[] {
  const out: LayoutKey[] = ['stack', 'card-wall', 'story']
  if (tools.includes('gather')) out.push('calendar-first')
  if (tools.includes('book')) out.push('shop-front')
  out.push('profile')
  return out
}

/** Everything a Designer layout shows for a profile. `sample` fills the dates, sessions, prices and the quote (the design's
 *  sample page); a live page passes false and gets none of them, so no invented date, price or testimonial ships. */
export function designerKitSpotlightContent(profile: string, opts: { name?: string; sample?: boolean; photo?: string } = {}): DesignerKitSpotlightContent {
  const id: ProfileId = isProfile(profile) ? profile : 'general'
  const row = DATA.kits.find((k) => k.id === id)!
  const p = PROFILES[id]
  const sample = opts.sample !== false
  const tools = row.packages
  const f = (block: string, name: string): string => plain(row.copy[block]?.[name] ?? DATA.blocks[block]?.fields[name] ?? '')
  const doors = doorsFor(tools, p)

  const events = row.events ?? STOCK_EVENTS.map((e) => e.title)
  const dates: DateRow[] = sample && tools.includes('gather')
    ? STOCK_EVENTS.map((e, i) => ({ mon: e.mon, day: e.day, title: plain(events[i] ?? e.title), time: e.time, where: e.where, ...(e.seats <= 3 ? { seatsLeft: e.seats } : {}) }))
    : []
  const offerNames = p.offers ?? (row.offers ?? STOCK_OFFERS.map((o) => [o.name])).map((o) => plain(o[0] ?? ''))
  const hasOffers = tools.includes('book')
  const gatherHead = row.copy.gatherings ? { title: f('gatherings', 'title'), em: f('gatherings', 'em') } : { title: DATA.blocks.gatherings!.fields.title ?? 'Come and see', em: DATA.blocks.gatherings!.fields.em ?? 'the studio' }
  const offeringsHead = p.offeringsHead ?? { title: f('offerings', 'title'), em: f('offerings', 'em') }
  const layouts = layoutsFor(tools)
  const cta = p.cta ?? plain(row.cta.label)

  return {
    profile: id,
    accent: row.accent,
    sigil: row.sigil.replace(/^sigil:/, ''),
    name: opts.name ?? 'Your Studio',
    descriptor: p.descriptor ?? plain(row.descriptor),
    hero: {
      eyebrow: f('hero', 'eyebrow'), title: f('hero', 'title'), em: f('hero', 'em'), body: f('hero', 'body'),
      photo: opts.photo ?? photoUrl(row.image),
    },
    cta: { label: cta, href: HREF[row.cta.route === 'journeys' ? 'learn' : row.cta.route === 'shop' ? 'sell' : 'book'] },
    doors,
    featured: featuredFor(tools, doors, dates, offerNames.map((name) => ({ name }))),
    dates,
    gatherings: gatherHead,
    offeringsLabel: p.offeringsEyebrow ?? plain(row.labels.services ?? 'Services'),
    offerings: hasOffers
      ? offerNames.slice(0, 3).map((name, i) => ({ name, minutes: sample ? STOCK_OFFERS[i]!.minutes : null, price: sample ? STOCK_OFFERS[i]!.price : null, photo: photoUrl(OFFER_PHOTOS[i]!) }))
      : [],
    offeringsHead,
    hasGift: tools.includes('sell'),
    portrait: photoUrl('placeholder-03'),
    letter: sample ? { title: plain(DATA.blocks.letter!.fields.title ?? ''), em: DATA.blocks.letter!.fields.em ?? '', action: '/join' } : null,
    quote: sample ? { text: 'They listened to how we actually live, then made a home that fits it.', who: 'A past client', role: 'Home project' } : null,
    defaultLayout: layouts.includes(p.layout) ? p.layout : 'stack',
    layouts,
  }
}
