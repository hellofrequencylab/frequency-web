// TEMPLE THEME KIT SPOTLIGHT CONTENT. PURE.
// What the six Spotlight layouts (components/spotlight/temple-kit-layouts.tsx) show: the hero, the descriptor, the ways in
// and the featured item, ported from the design's Spotlight page and Spotlight Layouts board (docs/design-systems/temple,
// ui_kits/products/shared.jsx) and fixed to the voice guide: no free promise, no price, no count, no cadence, no em dash.
// The thirteen profiles share ONE type system and ONE set of words and differ by accent only (the design's kits.css), so
// the profile decides a single thing here: which accent the page wears. Every layout works for every profile.

import { TEMPLE_KIT_PROFILES } from '@/lib/theme/temple-kit'
import { TEMPLE_KIT_HERO, templeKitPhoto } from '@/lib/sites/temple-kit-home'

type ProfileId = keyof typeof TEMPLE_KIT_PROFILES
type DoorKey = 'book' | 'learn' | 'gather' | 'belong' | 'sell' | 'publish'

interface Door { key: DoorKey; title: string; meta: string; href: string }
interface DateRow { mon: string; day: number; title: string; time: string; where: string; seatsLeft?: number }
interface Offering { name: string; minutes: number; /** Null: priced on request, shown as "Ask". */ price: number | null; photo: string }
interface Pair { title: string; em: string }

export interface TempleKitSpotlightContent {
  profile: ProfileId
  name: string
  descriptor: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string; pos: string }
  /** The Profile layout's round portrait. */
  portrait: string
  cta: { label: string; href: string }
  doors: Door[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  dates: DateRow[]
  gatherings: Pair
  offeringsLabel: string
  offeringsHead: Pair
  offerings: Offering[]
  gift: { label: string; title: string; cta: string; href: string } | null
  letter: (Pair & { action: string }) | null
  quote: { text: string; who: string; role: string } | null
}

/** The design's doors, in its ladder order (shared.jsx surfaceDoors). A starter promises no price and no free visit. */
const DOORS: Door[] = [
  { key: 'book', title: 'Walk the grounds', meta: 'A walk with our house host', href: '/book' },
  { key: 'learn', title: 'Take a program', meta: 'Small groups, at your own pace', href: '/programs' },
  { key: 'gather', title: 'Come to a gathering', meta: 'Sound, breath and suppers', href: '/gatherings' },
  { key: 'belong', title: 'Keep a place', meta: 'Membership with the house', href: '/membership' },
  { key: 'sell', title: 'Visit the shop', meta: 'Candles, incense and recordings', href: '/shop' },
  { key: 'publish', title: 'The library', meta: 'Notes and recordings from the house', href: '/library' },
]

const SESSIONS: Offering[] = [
  { name: 'Ceremony planning', minutes: 60, price: 150, photo: 'photo-01' },
  { name: 'Private healing session', minutes: 90, price: 220, photo: 'photo-06' },
  { name: 'Walk the grounds', minutes: 45, price: null, photo: 'photo-12' },
]

const DATES: DateRow[] = [
  { mon: 'Nov', day: 20, title: 'New moon sound bath', time: '7:00 PM', where: 'The great room' },
  { mon: 'Nov', day: 29, title: 'Long table supper', time: '6:00 PM', where: 'The long table, under the olives', seatsLeft: 3 },
  { mon: 'Dec', day: 7, title: 'Breath at the fire circle', time: '5:00 PM', where: 'The fire circle' },
]

function isTempleKitProfile(id: unknown): id is ProfileId {
  return typeof id === 'string' && Object.hasOwn(TEMPLE_KIT_PROFILES, id)
}

/** Everything a Temple layout shows. `sample` fills the dates, sessions, quote and letter (the design's sample page); a live
 *  page passes false and gets none of them, so no invented date, price or testimonial ships. */
export function templeKitSpotlightContent(profile: string, opts: { name?: string; sample?: boolean; photo?: string } = {}): TempleKitSpotlightContent {
  const id: ProfileId = isTempleKitProfile(profile) ? profile : 'general'
  const sample = opts.sample !== false
  const first = DATES[0]!
  return {
    profile: id,
    name: opts.name ?? 'Your House',
    descriptor: 'Gatherings · Ceremonies · The house',
    hero: { eyebrow: TEMPLE_KIT_HERO.eyebrow, title: TEMPLE_KIT_HERO.title, em: '', body: TEMPLE_KIT_HERO.lead, photo: opts.photo ?? TEMPLE_KIT_HERO.image, pos: '50% 100%' },
    portrait: templeKitPhoto('photo-12'),
    cta: { label: TEMPLE_KIT_HERO.primaryLabel, href: '/gatherings' },
    doors: DOORS,
    featured: sample
      ? { eyebrow: 'Next gathering', title: first.title, meta: `${first.mon} ${first.day} · ${first.time} · ${first.where}`, cta: 'Reserve', href: '/gatherings' }
      : { eyebrow: 'Next gathering', title: 'Come to a gathering', meta: 'See the next dates', cta: 'Reserve', href: '/gatherings' },
    dates: sample ? DATES : [],
    gatherings: { title: 'What is', em: 'coming up.' },
    offeringsLabel: 'Ceremonies and hire',
    offeringsHead: { title: 'The house,', em: 'held for you.' },
    offerings: sample ? SESSIONS.map((s) => ({ ...s, photo: templeKitPhoto(s.photo as `photo-${string}`) })) : [],
    gift: sample ? { label: 'Gift card', title: 'Give someone a visit', cta: 'Choose', href: '/gift' } : null,
    letter: sample ? { title: 'A letter from the house.', em: 'Now and then.', action: '/join' } : null,
    quote: sample ? { text: 'We were married under the olive trees. Everyone heard every word.', who: 'Maya and Theo', role: 'Married at the house' } : null,
  }
}
