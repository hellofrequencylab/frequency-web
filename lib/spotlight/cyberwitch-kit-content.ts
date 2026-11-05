// CYBERWITCH KIT SPOTLIGHT CONTENT. PURE.
// What the six Spotlight layouts (components/spotlight/cyberwitch-kit-layouts.tsx) show for each of the six CyberWitch
// kits (kits.cyberwitch.json, the words in lib/sites/kits/cyberwitch-variants.ts). Ported from the design's record.js: the hero, the
// services, the open times, the groups and the doors. The doors are built exactly as record.js builds DOORS: the booking door first, one door per service,
// then one per Frequency function the kit's tools turn on, in the design's order. Everything a kit invents (prices,
// open times, reviews, the quote) is sample content: a live page passes `sample: false` and gets none of it, so no
// invented price, time or testimonial ships. The kit holds words and rows only; colour and type are the theme's.

import { CYBERWITCH_ACCENTS, type CyberWitchAccentId } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_KIT_SPECS } from '@/lib/sites/kits/cyberwitch-variants'

type Tool = 'publish' | 'gather' | 'belong' | 'book' | 'learn' | 'sell'
type Has = 'events' | 'products' | 'plans' | 'posts' | 'team' | 'groups'
/** The design's icon names; the layouts map each to a lucide icon. */
type IconName = 'message' | 'sparkle' | 'calendar' | 'shield' | 'star' | 'award' | 'wrench' | 'home' | 'clock' | 'leaf' | 'heart' | 'chart' | 'briefcase' | 'tag' | 'bolt' | 'car' | 'droplet' | 'users' | 'sun' | 'user' | 'mail' | 'eye' | 'pin' | 'check'

interface CyberWitchDoor { id: string; key: Tool; icon: IconName; title: string; meta: string; href: string }
interface CyberWitchOffer { name: string; price: string; dur: string; icon: IconName }
interface CyberWitchOpening { mon: string; day: string; title: string; time: string; where: string; left: number }
interface CyberWitchReview { q: string; who: string; what: string }

export interface CyberWitchSpotlightContent {
  kit: string
  accent: CyberWitchAccentId
  /** The owner's own neon when it is none of the five (a hex from their Space or Spotlight); null wears `accent`. */
  accentHex: string | null
  name: string
  descriptor: string
  owner: string
  role: string
  story: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string | null }
  /** The arched portrait at the top of a page: the owner's photo, or on the sample page the theme's own founder picture. */
  portrait: string | null
  /** The kit's sprayed marker tag ("no fear ✕") and the one line a stranger should remember (kits.cyberwitch.json tag, pain). */
  tag: string
  pain: string
  cta: { label: string; href: string }
  /** The kit's second button ("See the calendar"). */
  secondaryCta: string
  /** The ways in after the booking door (record.js DOORS.slice(1)). */
  doors: CyberWitchDoor[]
  offers: CyberWitchOffer[]
  openings: CyberWitchOpening[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  review: CyberWitchReview | null
  /** A closing call under the doors (the link page's "Get your free Spotlight"). */
  footerCta?: { label: string; href: string }
  secondReview: CyberWitchReview | null
  quote: { text: string; who: string; role: string } | null
  proof: { icon: IconName; label: string; sub: string } | null
  letter: { title: string; em: string; body: string; action: string } | null
  headings: { openings: { title: string; em: string }; services: { title: string; em: string } }
  defaultLayout: CyberWitchLayoutKey
  layouts: CyberWitchLayoutKey[]
}

export type CyberWitchLayoutKey = 'stack' | 'card-wall' | 'story' | 'calendar-first' | 'shop-front' | 'profile'

interface KitSource {
  name: string; descriptor: string; owner: string; role: string; accent: string; cta: string; cta2: string
  tools: Tool[]; has: Has[]
  hero: { eyebrow: string; title: string; em: string; body: string }
  story: string; quote: string; proof: [IconName, string, string]
  offers: [string, string, string, IconName][]
  groups: [string, string][]
  reviews: [string, string, string][]
  headings: { openings: [string, string] | null; services: [string, string] | null }
}

const ICON_FOR: IconName[] = ['sparkle', 'calendar', 'star']
/** The design's sprayed tag per kit (kits.cyberwitch.json `tag`). */
const TAGS: Record<string, string> = { general: 'your tag line', practitioner: 'no fixing', reader: 'no fear', band: 'play it loud', brand: 'made to last', studio: 'by appointment' }
const PAIN = 'The one sentence a stranger should remember about you.'
/** The theme's own pictures (public/sites/cyberwitch/photos), one per accent; the sample page wears them, a live page never does. */
const themePhoto = (kind: 'hero' | 'founder', accent: CyberWitchAccentId) => `/sites/cyberwitch/photos/${kind}-${accent}.jpg`
const KITS: Record<string, KitSource> = Object.fromEntries(
  Object.entries(CYBERWITCH_KIT_SPECS).map(([id, s]): [string, KitSource] => [
    id,
    {
      name: s.name, descriptor: s.descriptor, owner: s.owner, role: s.role, accent: s.accent, cta: s.cta, cta2: s.cta2,
      tools: s.tools as Tool[],
      has: ['events', 'plans', 'posts', 'team', ...(s.tools.includes('sell') ? (['products'] as Has[]) : [])],
      hero: s.hero,
      story: s.story[0] ?? '',
      quote: s.quote,
      proof: ['check', s.trust[0]?.[0] ?? 'One promise', s.trust[0]?.[1] ?? ''],
      offers: s.offers.slice(0, 3).map((o, i): [string, string, string, IconName] => [o.name, 'Set your price', o.dur, ICON_FOR[i] ?? 'star']),
      groups: s.groups.map((g): [string, string] => [g[0], g[1]]),
      reviews: [[`Replace with a real quote from a ${s.person}. Specific beats glowing.`, `A ${s.person}`, s.reviewsAbout[0] ?? 'Your offer'], [`A second one. What changed for them after working with you.`, `Another ${s.person}`, s.reviewsAbout[1] ?? 'Your offer']],
      headings: { openings: null, services: null },
    },
  ]),
)

/** The twelve Frequency functions (record.js FUNCTIONS): the tool each belongs to, the door it makes and what it says. */
const FUNCTIONS: { id: string; tool: Tool; icon: IconName; door: string; why: string; href: string }[] = [
  { id: 'booking', tool: 'book', icon: 'calendar', door: 'Book online', why: 'Live open times, an upfront total and instant confirmation', href: '/book' },
  { id: 'services', tool: 'book', icon: 'tag', door: 'Services & prices', why: 'Every service shows a price and a length before anyone commits', href: '/services' },
  { id: 'reviews', tool: 'publish', icon: 'star', door: 'Read reviews', why: 'Proof near the main button, and an automatic request after each visit', href: '/reviews' },
  { id: 'posts', tool: 'publish', icon: 'briefcase', door: 'Guides & posts', why: 'Guides and stories that answer the questions people search for', href: '/library' },
  { id: 'events', tool: 'gather', icon: 'calendar', door: "What's happening", why: 'Open nights, workshops and one-offs with RSVP and a reminder', href: '/events' },
  { id: 'shop', tool: 'sell', icon: 'tag', door: 'Shop', why: 'Gift cards, kits and add-ons that sell between visits', href: '/shop' },
  { id: 'circles', tool: 'belong', icon: 'users', door: 'Find your people', why: 'The small rooms where the same faces meet again', href: '/groups' },
  { id: 'firstnight', tool: 'belong', icon: 'heart', door: 'What a first visit is like', why: 'Who is there, how long, what to bring, who meets you at the door', href: '/about' },
  { id: 'plans', tool: 'belong', icon: 'award', door: 'Plans', why: 'Recurring care on a schedule, with member pricing', href: '/plans' },
  { id: 'letter', tool: 'publish', icon: 'mail', door: 'Get the letter', why: 'A short note when something opens up or is due', href: '/letter' },
  { id: 'gallery', tool: 'publish', icon: 'eye', door: 'See the work', why: 'Real photos of real jobs, before and after', href: '/gallery' },
  { id: 'team', tool: 'publish', icon: 'users', door: 'Meet the team', why: 'Faces and names before anyone opens the door', href: '/team' },
  { id: 'locations', tool: 'publish', icon: 'pin', door: 'Find us', why: 'Where, when and how to get there, on every surface', href: '/contact' },
  { id: 'forms', tool: 'book', icon: 'message', door: 'Ask a question', why: 'A short form that reaches a person, with a reply time stated', href: '/contact' },
]
/** Functions every kit gets whatever its tools (record.js build). */
const ALWAYS = ['reviews', 'team', 'locations', 'forms', 'letter', 'gallery', 'posts', 'circles', 'firstnight']
/** A function that needs the kit to carry its rows (record.js drops it when the kit has none). */
const NEEDS: Record<string, Has> = { posts: 'posts', team: 'team', events: 'events', shop: 'products', plans: 'plans', circles: 'groups', firstnight: 'groups' }

const SAMPLE_OPENINGS = [{ mon: 'Nov', day: '06', time: '7:00p', left: 4 }, { mon: 'Nov', day: '08', time: '8:00a', left: 0 }, { mon: 'Nov', day: '11', time: '6:30p', left: 2 }]

/** The first word of the owner's name, with a title ("Dr.") kept to the name after it. */
function firstName(owner: string): string {
  const [a, b] = owner.split(' ')
  return a!.endsWith('.') && b ? `${a} ${b}` : a!
}

const HEX6 = /^#[0-9a-f]{6}$/i

/** The kit ids, in the design's order. */
export const CYBERWITCH_SPOTLIGHT_KIT_IDS = Object.keys(KITS)

/** Everything a CyberWitch layout shows for a kit. `sample` fills the prices, open times, reviews and the quote (the
 *  design's sample page); a live page passes false and gets none of them. `accent`, `photo` (the header picture) and `portrait` (the avatar) are the owner's. */
export function cyberwitchKitSpotlightContent(kit: string, opts: { name?: string; sample?: boolean; accent?: string; photo?: string; portrait?: string } = {}): CyberWitchSpotlightContent {
  const id = KITS[kit] ? kit : 'general'
  const k = KITS[id]!
  const sample = opts.sample !== false
  const pick = (a: string | undefined): CyberWitchAccentId | null => (a && a in CYBERWITCH_ACCENTS ? (a as CyberWitchAccentId) : null)
  // The owner's accent arrives as a preset id or as a colour (their Space's brand accent, ONE ACCENT): a colour that is
  // one of the five wears that preset, any other colour is worn as itself over Hex's ramps.
  const hex = opts.accent && HEX6.test(opts.accent) ? opts.accent.toLowerCase() : null
  const byHex = hex ? (Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[]).find((id) => CYBERWITCH_ACCENTS[id].accent.toLowerCase() === hex) ?? null : null
  const accent = pick(opts.accent) ?? byHex ?? pick(k.accent) ?? 'hex'
  const accentHex = hex && !byHex ? hex : null
  const offers: CyberWitchOffer[] = sample ? k.offers.map(([name, price, dur, icon]) => ({ name, price, dur, icon })) : []
  const groups = k.groups.length ? k.groups : []
  const has = (h: Has) => (h === 'groups' ? groups.length > 0 : k.has.includes(h))
  const fns = FUNCTIONS.filter((f) => (k.tools.includes(f.tool) || ALWAYS.includes(f.id)) && (!NEEDS[f.id] || has(NEEDS[f.id]!)))
  const ids = fns.map((f) => f.id)
  const doors: CyberWitchDoor[] = [
    ...offers.map((o, i): CyberWitchDoor => ({ id: `offer-${i}`, key: 'book', icon: o.icon, title: o.name, meta: `${o.price} · ${o.dur}`, href: '/services' })),
    ...fns.filter((f) => !['booking', 'services'].includes(f.id)).map((f): CyberWitchDoor => ({
      id: f.id, key: f.tool, icon: f.icon,
      title: f.id === 'team' ? `Meet ${firstName(k.owner)}` : f.door,
      meta: f.id === 'reviews' ? 'What the regulars say' : f.id === 'team' ? k.role : f.why,
      href: f.href,
    })),
  ]
  // Open times come from the groups (the design's `nx`), or from the services when a kit has no groups.
  const rows: [string, string][] = groups.length ? groups : k.offers.map(([name, , dur]) => [name, dur])
  const openings: CyberWitchOpening[] = sample && rows.length > 0
    ? SAMPLE_OPENINGS.map((s, i) => { const r = rows[i % rows.length]!; return { mon: s.mon, day: s.day, title: r[0], time: s.time, where: r[1], left: s.left } })
    : []
  const first = openings[0]
  const hasCalendar = ids.includes('booking') && (!sample || openings.length > 0)
  const layouts: CyberWitchLayoutKey[] = ['stack', 'card-wall', 'story']
  if (hasCalendar) layouts.push('calendar-first')
  if (ids.includes('services')) layouts.push('shop-front')
  layouts.push('profile')
  const pair = (p: [string, string] | null, d: { title: string; em: string }) => (p ? { title: p[0], em: p[1] } : d)
  return {
    kit: id,
    accent,
    accentHex,
    name: opts.name ?? k.name,
    descriptor: k.descriptor,
    owner: k.owner,
    role: k.role,
    story: k.story,
    hero: { ...k.hero, photo: opts.photo ?? (sample ? themePhoto('hero', accent) : null) },
    portrait: opts.portrait ?? (sample ? themePhoto('founder', accent) : null),
    tag: TAGS[id] ?? TAGS.general!,
    pain: PAIN,
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
    letter: ids.includes('letter') && sample ? { title: 'Stay in', em: 'the loop.', body: 'A short note when something is coming up. Nothing else.', action: '/letter' } : null,
    headings: { openings: pair(k.headings.openings, { title: 'Open', em: 'this week.' }), services: pair(k.headings.services, { title: 'Ways', em: 'in.' }) },
    defaultLayout: 'stack',
    layouts,
  }
}
