// NETWORK THEME KIT SPOTLIGHT CONTENT AND PER-PROFILE RULES. PURE.
// What the six Spotlight layouts (components/spotlight/network-kit-layouts.tsx) show for each of the thirteen
// profiles: the hero, the descriptor, the ways in and the featured item. Ported from the design's kits.default.json
// and fixed to the voice guide: no weekday or cadence promises, no counts, no ratings, no em dashes.
// The profile decides three things:
//   1. the scheme it wears (networkKitProfileScheme, lib/theme/network-kit.ts),
//   2. the ways in, one per tool the profile has on, in the design's ladder order (gather, belong, book, learn, sell, publish),
//   3. the layout it starts on, and which of the six it can use: Calendar first needs meetups, Shop front needs
//      one-to-ones or a shop; the other four always work.

import { NETWORK_KIT_PROFILES, networkKitProfileScheme } from '@/lib/theme/network-kit'
import type { SpotlightLayoutId } from '@/lib/spotlight/layouts'

type ProfileId = (typeof NETWORK_KIT_PROFILES)[number]
type Tool = 'publish' | 'gather' | 'belong' | 'book' | 'learn' | 'sell'
type DoorKey = 'gather' | 'belong' | 'book' | 'learn' | 'sell' | 'publish'
type LayoutKey = SpotlightLayoutId extends `network-kit:${infer L}` ? L : never

interface Door { key: DoorKey; title: string; meta: string; href: string }
interface DateRow { mon: string; day: number; title: string; time: string; where: string; seatsLeft?: number }
interface Offering { name: string; minutes: number; price: number; photo: string }
interface Pair { title: string; em: string }

export interface NetworkKitSpotlightContent {
  profile: ProfileId
  scheme: ReturnType<typeof networkKitProfileScheme>
  name: string
  descriptor: string
  hero: { eyebrow: string; title: string; em: string; body: string; photo: string; pos: string }
  cta: { label: string; href: string }
  doors: Door[]
  featured: { eyebrow: string; title: string; meta: string; cta: string; href: string }
  dates: DateRow[]
  gatherings: Pair
  offeringsLabel: string
  offerings: Offering[]
  offeringsHead: Pair
  letter: (Pair & { action: string }) | null
  quote: { text: string; who: string; role: string } | null
  defaultLayout: LayoutKey
  layouts: LayoutKey[]
}

/** Where the design's photos live once the assets round lands (public/sites/network-kit/photos). */
const NETWORK_KIT_PHOTO_BASE = '/sites/network-kit/photos/'
/** The design's focal point per photo, so a crop keeps faces in frame. */
const FOCUS: Record<string, string> = {
  'photo-01': '50% 55%', 'photo-02': '50% 72%', 'photo-03': '50% 60%', 'photo-04': '45% 28%', 'photo-05': '40% 62%', 'photo-06': '50% 40%',
  'photo-07': '50% 60%', 'photo-08': '42% 32%', 'photo-09': '35% 32%', 'photo-10': '50% 55%', 'photo-11': '50% 30%', 'photo-12': '50% 50%',
}

interface ProfileSource {
  name: string
  tools: Tool[]
  cta: string
  descriptor: string
  photo: string
  labels?: Partial<Record<'gather' | 'belong' | 'book' | 'sell' | 'publish', string>>
  hero: { eyebrow: string; title: string; em: string; body: string }
  gatherings: Pair
  offerings?: { label: string; head: Pair }
  letter: Pair
  layout: LayoutKey
}

const PROFILES: Record<ProfileId, ProfileSource> = {
  general: {
    name: 'Networking group', tools: ['publish', 'gather', 'belong'], cta: 'Come to a meetup', descriptor: 'Meetups · Members · Email', photo: 'photo-03',
    labels: { gather: 'Come to a meetup', belong: 'Join' },
    hero: { eyebrow: 'When and where you meet', title: 'Your people are', em: 'already here.', body: 'A morning meetup for business owners, professionals and creatives. Grab a coffee, meet a few people, leave with one useful introduction.' },
    gatherings: { title: 'When we', em: 'meet' }, letter: { title: 'A note before we meet.', em: 'Nothing extra.' }, layout: 'stack',
  },
  coaches: {
    name: 'Mentorship circles', tools: ['publish', 'book', 'gather'], cta: 'Book an intro call', descriptor: 'Mentors · Circles · One-to-ones', photo: 'photo-04',
    labels: { book: 'Ways to be mentored', gather: 'Circles' },
    hero: { eyebrow: 'Mentorship', title: 'Someone has done this', em: 'before you.', body: 'Small circles and one-to-one sessions with members who have built what you are building. Tell us where you are and we will make the match.' },
    gatherings: { title: 'Small circles,', em: 'one table' }, offerings: { label: 'Ways to be mentored', head: { title: 'Ways to', em: 'be mentored' } },
    letter: { title: 'Start with a free call.', em: 'Then see.' }, layout: 'story',
  },
  studios: {
    name: 'Coworking communities', tools: ['publish', 'gather', 'belong', 'book'], cta: 'Book a day pass', descriptor: 'Desks · Member events · Passes', photo: 'photo-05',
    labels: { gather: 'Events', belong: 'Membership', book: 'Passes' },
    hero: { eyebrow: 'Work alongside your people', title: 'A desk is easy to find.', em: 'Good company is not.', body: 'Desks, meeting rooms and a calendar of member events. Come for a day and see who is here.' },
    gatherings: { title: 'Member', em: 'events' }, offerings: { label: 'Passes', head: { title: 'Pick the way', em: 'that fits' } },
    letter: { title: 'What is on at the space.', em: 'In your inbox.' }, layout: 'calendar-first',
  },
  hosts: {
    name: 'Mixers and socials', tools: ['publish', 'gather'], cta: 'See the next mixer', descriptor: 'Mixers · Tickets · The list', photo: 'photo-11',
    labels: { gather: 'Mixers' },
    hero: { eyebrow: 'Evening mixers', title: 'Networking,', em: 'minus the awkward.', body: 'Good rooms, a host who makes introductions, and people you will want to see again. Come to the next one and bring a friend.' },
    gatherings: { title: 'Next', em: 'mixers' }, letter: { title: 'A note before each mixer.', em: 'No more.' }, layout: 'calendar-first',
  },
  venues: {
    name: 'Clubhouses and hubs', tools: ['publish', 'gather', 'book'], cta: 'Ask about hosting', descriptor: 'The space · Calendar · Host here', photo: 'photo-02',
    labels: { book: 'Host here', gather: 'Calendar' },
    hero: { eyebrow: 'Our clubhouse', title: 'A home base', em: 'for your people.', body: 'A courtyard, a long table and rooms for any size of gathering. Come to an event, or bring your own group.' },
    gatherings: { title: 'Coming', em: 'up' }, offerings: { label: 'Host here', head: { title: 'Rooms for', em: 'every gathering' } },
    letter: { title: 'Dates and open rooms.', em: 'When they change.' }, layout: 'card-wall',
  },
  nonprofits: {
    name: 'Community coalitions', tools: ['publish', 'gather', 'belong'], cta: 'Get involved', descriptor: 'Our work · Volunteer · Partner', photo: 'photo-07',
    labels: { gather: 'Meetings', belong: 'Partner with us', publish: 'Updates' },
    hero: { eyebrow: 'Our coalition', title: 'Many organizations.', em: 'One table.', body: 'Local nonprofits, businesses and neighbours working on the same goals. Come to a meeting, lend a hand, or bring your organization in.' },
    gatherings: { title: 'Meet', em: 'with us' }, letter: { title: 'What we did, what is next.', em: 'No spam.' }, layout: 'story',
  },
  networks: {
    name: 'Multi-chapter networks', tools: ['publish', 'gather', 'belong'], cta: 'Find a chapter', descriptor: 'Chapters · Meetups · Join', photo: 'photo-10',
    labels: { gather: 'Chapters', belong: 'Join the network' },
    hero: { eyebrow: 'Chapters near you', title: 'Find your chapter.', em: 'Meet your people.', body: 'One network, local chapters, the same warm welcome in every town. Find the one near you, or start one where you live.' },
    gatherings: { title: 'Across the', em: 'network' }, letter: { title: 'News from the chapters.', em: 'Now and then.' }, layout: 'card-wall',
  },
  creators: {
    name: 'Creative collectives', tools: ['publish', 'sell', 'gather', 'belong'], cta: 'Join the collective', descriptor: "Members' work · Studio nights · Join", photo: 'photo-08',
    labels: { sell: "Members' work", gather: 'Studio nights', belong: 'Join', publish: 'Notes' },
    hero: { eyebrow: 'A creative collective', title: 'Making things is lonely.', em: 'It does not have to be.', body: 'Artists, makers and freelancers who share studio nights, referrals and the occasional show. Come to an open night and meet the members.' },
    gatherings: { title: 'Come to an', em: 'open night' }, offerings: { label: "Members' work", head: { title: 'Made by', em: 'members' } },
    letter: { title: 'What members made.', em: 'And what is next.' }, layout: 'shop-front',
  },
  schools: {
    name: 'Cohorts and accelerators', tools: ['publish', 'learn', 'gather'], cta: 'See the programs', descriptor: 'Cohorts · Demo days · Apply', photo: 'photo-01',
    labels: { learn: 'Programs', gather: 'Info sessions' },
    hero: { eyebrow: 'Grow with a cohort', title: 'Business is better', em: 'with a cohort.', body: 'A small group of founders, a clear plan and one room to work it out in. You leave with a plan, a pitch and a group that keeps meeting after.' },
    gatherings: { title: 'Come and', em: 'ask us' }, letter: { title: 'Dates for the next cohort.', em: 'When they are set.' }, layout: 'stack',
  },
  clubs: {
    name: 'Professional associations', tools: ['publish', 'gather', 'belong'], cta: 'Become a member', descriptor: 'Meetings · Directory · Membership', photo: 'photo-12',
    labels: { gather: 'Meetings', belong: 'Join' },
    hero: { eyebrow: 'The association', title: 'Your industry,', em: 'in one room.', body: 'Meetings, a member directory and people who do what you do. Come once as a guest, then join if it fits.' },
    gatherings: { title: 'When we', em: 'meet' }, letter: { title: 'Meeting notes and dates.', em: 'Nothing else.' }, layout: 'stack',
  },
  faith: {
    name: 'Peer advisory boards', tools: ['publish', 'gather', 'belong'], cta: 'Apply for a board', descriptor: 'Boards · Confidential · Apply', photo: 'photo-09',
    labels: { gather: 'Board meetings', belong: 'Apply', publish: 'Notes' },
    hero: { eyebrow: 'Peer advisory', title: 'Hard decisions', em: 'need good company.', body: 'A small board of owners and one chair. Bring the decision you are stuck on and leave with a clearer head.' },
    gatherings: { title: 'When boards', em: 'meet' }, letter: { title: 'When a board forms.', em: 'You will hear.' }, layout: 'story',
  },
  wellness: {
    name: 'Summits and retreats', tools: ['publish', 'book', 'gather', 'sell'], cta: 'Reserve a ticket', descriptor: 'Summits · Retreats · Tickets', photo: 'photo-06',
    labels: { book: 'Agenda', gather: 'Summits', sell: 'Tickets and gifts' },
    hero: { eyebrow: 'The summit', title: 'One weekend.', em: 'Everyone you know.', body: 'Talks, small tables and long lunches with the whole network in one place. Reserve early and bring a colleague.' },
    gatherings: { title: 'Summits and', em: 'retreats' }, offerings: { label: 'Agenda', head: { title: 'How the days', em: 'run' } },
    letter: { title: 'Tickets and the agenda.', em: 'As they land.' }, layout: 'shop-front',
  },
  markets: {
    name: 'Local business alliances', tools: ['publish', 'gather', 'sell', 'belong'], cta: 'Join as a business', descriptor: 'Member businesses · Perks · Market days', photo: 'photo-12',
    labels: { gather: 'Market days', sell: 'Member perks', belong: 'Join as a business' },
    hero: { eyebrow: 'Shop local, together', title: 'Local businesses do better', em: 'together.', body: 'An alliance of independent shops, cafes and studios. Shared market days, member perks and a loyalty card that works up and down the street.' },
    gatherings: { title: 'Market', em: 'days' }, offerings: { label: 'Member perks', head: { title: 'Perks from', em: 'member shops' } },
    letter: { title: 'What is on this weekend.', em: 'In your inbox.' }, layout: 'shop-front',
  },
}

const SESSIONS: Offering[] = [
  { name: 'Welcome call', minutes: 20, price: 0, photo: 'photo-10' },
  { name: 'Mentor session', minutes: 45, price: 60, photo: 'photo-11' },
  { name: 'Business spotlight', minutes: 60, price: 120, photo: 'photo-08' },
]
const DATES: DateRow[] = [
  { mon: 'Nov', day: 14, title: 'Morning meetup', time: '9:00 AM', where: 'The courtyard', seatsLeft: 3 },
  { mon: 'Nov', day: 20, title: 'Members evening mixer', time: '6:00 PM', where: 'Harbor' },
  { mon: 'Nov', day: 21, title: 'New member welcome', time: '12:00 PM', where: 'Online' },
]

/** The ways in, one per tool the profile has on, in the design's ladder order. Labels rename; they never reorder. */
function doorsFor(p: ProfileSource): Door[] {
  const L = p.labels ?? {}
  const on = (t: Tool) => p.tools.includes(t)
  const rows: [Tool, Door][] = [
    ['gather', { key: 'gather', title: L.gather ?? 'Come to a meetup', meta: 'See the next dates', href: '/meetups' }],
    ['belong', { key: 'belong', title: L.belong ?? 'Become a member', meta: 'Keep your seat and the directory', href: '/membership' }],
    ['book', { key: 'book', title: L.book ?? 'Book a welcome call', meta: 'A short call with an organizer', href: '/book' }],
    ['learn', { key: 'learn', title: L.learn ?? 'Train as a host', meta: 'Programs and cohorts', href: '/programs' }],
    ['sell', { key: 'sell', title: L.sell ?? 'Visit the shop', meta: 'Tickets, kits and gifts', href: '/shop' }],
    ['publish', { key: 'publish', title: L.publish ?? 'The library', meta: 'Guides and recordings', href: '/library' }],
  ]
  return rows.filter(([t]) => on(t)).map(([, d]) => d)
}

/** The one featured item, picked from the profile's tools in ladder order (gather, learn, book, then membership). */
function featuredFor(p: ProfileSource, d: DateRow[]): NetworkKitSpotlightContent['featured'] {
  if (p.tools.includes('gather') && !d[0]) return { eyebrow: 'Next up', title: 'Come to a meetup', meta: 'See the next dates', cta: 'RSVP', href: '/meetups' }
  if (p.tools.includes('gather')) return { eyebrow: 'Next up', title: d[0]!.title, meta: `${d[0]!.mon} ${d[0]!.day} · ${d[0]!.time} · ${d[0]!.where}`, cta: 'RSVP', href: '/meetups' }
  if (p.tools.includes('learn')) return { eyebrow: 'Programs', title: 'Host training', meta: 'Run a meetup people come back to', cta: 'Apply', href: '/programs' }
  if (p.tools.includes('book')) return { eyebrow: 'One-to-ones', title: SESSIONS[1]!.name, meta: `${SESSIONS[1]!.minutes} min`, cta: 'Book', href: '/book' }
  return { eyebrow: 'Membership', title: 'Become a member', meta: 'Keep your seat and the directory', cta: 'Join', href: '/membership' }
}

/** Which of the six layouts a profile can use. */
function layoutsFor(p: ProfileSource): LayoutKey[] {
  const out: LayoutKey[] = ['stack', 'card-wall', 'story']
  if (p.tools.includes('gather')) out.push('calendar-first')
  if (p.tools.includes('book') || p.tools.includes('sell')) out.push('shop-front')
  out.push('profile')
  return out
}

function isNetworkKitProfile(id: unknown): id is ProfileId {
  return typeof id === 'string' && (NETWORK_KIT_PROFILES as readonly string[]).includes(id)
}

/** Everything a Network layout shows for a profile. `sample` fills the dates, sessions and the quote (the design's
 *  sample page); a live page passes false and gets none of them, so no invented date, price or testimonial ships. */
export function networkKitSpotlightContent(profile: string, opts: { name?: string; sample?: boolean; photo?: string } = {}): NetworkKitSpotlightContent {
  const id: ProfileId = isNetworkKitProfile(profile) ? profile : 'general'
  const p = PROFILES[id]
  const sample = opts.sample !== false
  const dates = sample ? DATES : []
  const layouts = layoutsFor(p)
  const photo = p.photo
  return {
    profile: id,
    scheme: networkKitProfileScheme(id),
    name: opts.name ?? 'Your Network',
    descriptor: p.descriptor,
    hero: { ...p.hero, photo: opts.photo ?? NETWORK_KIT_PHOTO_BASE + photo + '.jpg', pos: FOCUS[photo] ?? '50% 50%' },
    cta: { label: p.cta, href: '/meetups' },
    doors: doorsFor(p),
    featured: featuredFor(p, dates),
    dates,
    gatherings: p.gatherings,
    offeringsLabel: p.offerings?.label ?? 'Offerings',
    offerings: sample ? SESSIONS.map((s) => ({ ...s, photo: NETWORK_KIT_PHOTO_BASE + s.photo + '.jpg' })) : [],
    offeringsHead: p.offerings?.head ?? { title: 'Pick the way', em: 'that fits' },
    letter: sample ? { ...p.letter, action: '/join' } : null,
    quote: sample ? { text: 'I came for one coffee and stayed for the people.', who: 'A member', role: 'Local business owner' } : null,
    defaultLayout: layouts.includes(p.layout) ? p.layout : 'stack',
    layouts,
  }
}
