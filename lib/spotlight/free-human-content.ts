// FREE HUMAN THEME KIT SPOTLIGHT CONTENT. PURE.
// What the six Spotlight layouts (components/spotlight/free-human-layouts.tsx) show: the hero, the descriptor, the ways in
// and the featured item. The Free Human design has no Spotlight board, so the structure is the Temple kit's six layouts and
// the words are written to the voice guide: no free promise, no price, no count, no cadence, no em dash. The thirteen profiles
// share ONE type system and ONE set of words and differ by accent only, so the profile decides a single thing here: which
// accent the page wears. Every layout works for every profile.

import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import { freeHumanPhotoSrc } from '@/lib/sites/free-human-photos'

type ProfileId = keyof typeof FREE_HUMAN_PROFILES
type DoorKey = 'book' | 'learn' | 'gather' | 'belong' | 'sell' | 'publish'

interface Door { key: DoorKey; title: string; meta: string; href: string }
interface DateRow { mon: string; day: number; title: string; time: string; where: string; seatsLeft?: number }
interface Offering { name: string; minutes: number; /** Null: priced on request, shown as "Ask". */ price: number | null; photo: string }
interface Pair { title: string; em: string }

export interface FreeHumanSpotlightContent {
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

const DOORS: Door[] = [
  { key: 'belong', title: 'Join the circle', meta: 'Join in any month', href: '/membership' },
  { key: 'learn', title: 'The year-round program', meta: 'A live circle each season', href: '/programs' },
  { key: 'gather', title: 'Come to a gathering', meta: 'Circles, moons and suppers', href: '/gatherings' },
  { key: 'book', title: 'Book a workshop', meta: 'Small groups, long pauses', href: '/book' },
  { key: 'sell', title: 'Visit the shop', meta: 'Things made by hand', href: '/shop' },
  { key: 'publish', title: 'The library', meta: 'Words for the wild work', href: '/library' },
]

const SESSIONS: Offering[] = [
  { name: 'Breath for birth', minutes: 180, price: null, photo: 'light-honey-spoon' },
  { name: 'Postpartum restoration', minutes: 90, price: null, photo: 'body-morning-bed' },
  { name: 'Floor play with littles', minutes: 60, price: null, photo: 'craft-yarn-bodies' },
]

const DATES: DateRow[] = [
  { mon: 'Nov', day: 20, title: 'New moon circle', time: '7:00 PM', where: 'The long room' },
  { mon: 'Nov', day: 29, title: 'Honey and bread supper', time: '6:00 PM', where: 'The garden table', seatsLeft: 3 },
  { mon: 'Dec', day: 6, title: 'Winter solstice wheel', time: '4:30 PM', where: 'By the sea' },
]

function isFreeHumanProfile(id: unknown): id is ProfileId {
  return typeof id === 'string' && Object.hasOwn(FREE_HUMAN_PROFILES, id)
}

/** Everything a Free Human layout shows. `sample` fills the dates, sessions, quote and letter; a live page passes false and
 *  gets none of them, so no invented date, price or testimonial ships. */
export function freeHumanSpotlightContent(profile: string, opts: { name?: string; sample?: boolean; photo?: string } = {}): FreeHumanSpotlightContent {
  const id: ProfileId = isFreeHumanProfile(profile) ? profile : 'general'
  const sample = opts.sample !== false
  const first = DATES[0]!
  return {
    profile: id,
    name: opts.name ?? 'Your Circle',
    descriptor: 'Movement · Ritual · The village',
    hero: {
      eyebrow: 'A year-round practice',
      title: 'Move like the woman who',
      em: 'made a world.',
      body: 'A practice for women who are creating life, birthing it, and raising it. Old wisdom, practiced in a modern body.',
      photo: opts.photo ?? freeHumanPhotoSrc('heritage-a-virgin'),
      pos: '50% 20%',
    },
    portrait: freeHumanPhotoSrc('place-daisies'),
    cta: { label: 'Join the circle', href: '/membership' },
    doors: DOORS,
    featured: sample
      ? { eyebrow: 'Next gathering', title: first.title, meta: `${first.mon} ${first.day} · ${first.time} · ${first.where}`, cta: 'Reserve', href: '/gatherings' }
      : { eyebrow: 'Next gathering', title: 'Come to a gathering', meta: 'See the next dates', cta: 'Reserve', href: '/gatherings' },
    dates: sample ? DATES : [],
    gatherings: { title: 'What is', em: 'coming up.' },
    offeringsLabel: 'Workshops and sessions',
    offeringsHead: { title: 'Go deeper,', em: 'at your pace.' },
    offerings: sample ? SESSIONS.map((s) => ({ ...s, photo: freeHumanPhotoSrc(s.photo) })) : [],
    gift: sample ? { label: 'Gift', title: 'Give someone a season', cta: 'Choose', href: '/gift' } : null,
    letter: sample ? { title: 'A letter when there is', em: 'something to say.', action: '/join' } : null,
    quote: sample ? { text: 'I walked in carrying everything and walked out lighter.', who: 'A member', role: 'Came to the new moon circle' } : null,
  }
}
