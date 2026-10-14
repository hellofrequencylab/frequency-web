// Seed THE GROUP as a Collective Space with its chapters, built from The Group's design handoff (owner ask
// 2026-10-13). Idempotent + service-role only. Scoped to the rows it names: the Collective Space (slug
// `the-group`), its five chapter Spaces (`the-group-<chapter>`), and new child rows that reference them.
//
//   node --experimental-strip-types scripts/seed-the-group.mts --sql > scripts/seed-the-group.sql
//       prints the seed as ONE SQL transaction (every statement an upsert on a natural key or a
//       deterministic id), which the owner applies by hand or through the Supabase SQL editor.
//       scripts/seed-the-group.sql in the tree is that output; regenerate it after editing the content.
//
// Shapes are copied from the product's own writers, the way scripts/seed-wildheart.mts copies them:
// lib/spaces/provision.ts createSpace (the Space row, the owner's admin membership), the
// spaces_ensure_space_circle trigger (each new Space's primary circle), set_collective_member_space
// (a chapter is a member Space: parent_id, same owner, active, network-visible), lib/event-recurrence.ts
// (an anchor with its RRULE plus the first HORIZON_DAYS of occurrences), lib/commerce/products.ts
// createProduct (the merch), lib/spaces/memberships.ts setMembershipTiers (the tiers), and
// lib/spaces/profile-data.ts (the studio offerings).
//
// The content is the handoff's: `content/site-content.md` and `THE-GROUP-PROFILE.md` verbatim where they
// have words, the voice section where new words were needed, and `data/events.js` (The Group Portal export)
// for the calendar (scripts/seed-the-group-events.json). Anything the handoff marks [confirm] or
// [placeholder] carries a TODO here and ships no invented value.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { expandRepeat, parseRepeat } from '../lib/events/repeat-rule.ts'

// ── Fixed ids ─────────────────────────────────────────────────────────────────────────────────
// The owner until June An claims the Space: the profile that owns the in-house Spaces (Wildheart, Hearts on
// Fire). Chapters must share the Collective's owner (set_collective_member_space), so all six use it.
export const OWNER_ID = 'c1d40f58-318b-4c7b-a331-21788d632fc9'
export const SLUG = 'the-group'
export const TZ = 'America/Los_Angeles'
/** The day the seed's occurrence window starts from (the handoff's own "today"). */
export const SEED_DAY = '2026-10-13'
const HORIZON_DAYS = 60
/** The commerce entity every Space product is booked to (lib/finance/record.ts ENTITY_ID.labs). */
const LABS_ENTITY = '1ab50000-0000-4000-a000-000000000002'

/** A deterministic uuid from a key, so re-running the seed hits the same rows. */
export function uuidFrom(key: string): string {
  const h = createHash('md5').update(`the-group:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export const SPACE_ID = uuidFrom('space')

const PAGE = (slug: string) => `/spaces/${SLUG}/${slug}`
const PHOTO = (name: string) => `/brand/the-group/photos/${name}.jpg`
export const LOGO = '/brand/the-group/the-group-sd-logo.png'
const CALENDLY = 'https://calendly.com/june-thegroupcoastal/30min'
const INSTAGRAM = 'https://www.instagram.com/thegroupsd/'
const EMAIL = 'June@thegroupcoastal.com'
const PHONE = '858-997-5951'
const DIRECTIONS = 'https://share.google/Pwn7yM4FAS1VedbL7'
const PITCH_SIGNUP = 'https://www.thegroupcoastal.com/pitchfest2026'
const PITCH_PARTY = 'https://partiful.com/e/9B3VudHuElBPDiShN2Tj'
const SPEAKER_FORM = 'https://www.thegroupcoastal.com/featuredspeaker-1'
const EVENT_SUBMIT = 'https://www.thegroupcoastal.com/events-and-workshop-submission'
const PODCAST = 'https://www.youtube.com/@heartofthematterpod'
// TODO [confirm]: the podcast channel URL is not in the handoff (it names YouTube and Spotify only). The
// episode cards link each video by id, which the handoff does carry; this channel link is the one guess
// and is used ONLY for "View all episodes". Replace it with The Group's channel once June confirms it.

// ── The Collective ────────────────────────────────────────────────────────────────────────────
export const NAME = 'The Group'
export const BRAND = 'The Group SD'
export const TAGLINE = 'The Best Non-Networking Networking Group.'
export const ABOUT =
  'The Group SD is a San Diego community for entrepreneurs, professionals, creatives, and business owners seeking authentic connections, collaboration, growth, and meaningful relationships. Discover community events, Heart of the Matter, and our Incubator Studios in Encinitas.'

/** Six pages (Home plus five), none reserved (lib/spaces/profile-pages.ts). */
export const PAGES = [
  { slug: 'home', label: 'Home' },
  { slug: 'fridays', label: 'Fridays' },
  { slug: 'chapters', label: 'Chapters' },
  { slug: 'membership', label: 'Membership' },
  { slug: 'studio', label: 'Studio' },
  { slug: 'about', label: 'About' },
]

// ── Chapters: member Spaces of the Collective (spaces.parent_id) ──────────────────────────────
// Encinitas is the Collective itself (Feel Good Fridays). Five chapters fill the Collective plan's five
// included member Spaces. South OC has no confirmed day, time or place yet, so it is a forming circle on
// the Collective rather than a Space (TODO [confirm] with June, then promote it to a member Space; a sixth
// member Space is a purchased seat).
export interface Chapter {
  key: 'la-jolla' | 'north-park' | 'oceanside' | 'north-county' | 'veterans'
  code: 'lj' | 'np' | 'oc' | 'nc' | 'vet'
  short: string
  meeting: string
  when: string
  where: string
  icon: string
  city: string
  tagline: string
  about: string
  image: string
}

export const CHAPTERS: Chapter[] = [
  {
    key: 'la-jolla', code: 'lj', short: 'La Jolla', meeting: 'Motivation Mondays', when: 'Mondays, 9:00–10:10 AM', where: 'Parakeet Cafe, Nautilus, 3535 General Atomics Ct, San Diego, CA 92121', icon: 'waves', city: 'San Diego',
    tagline: 'The Group is Growing · Motivation Mondays in La Jolla',
    about: 'The Group is growing and we are excited to announce the launch of Motivation Monday at Parakeet Cafe at 9:00 am. This new chapter is more than just a gathering. It is a chance to expand our movement of empowerment, inspiration, and support into the heart of San Diego.',
    image: PHOTO('june-harvest'),
  },
  {
    // TODO [confirm]: North Park's day, time and place (the portal lists Team Up Tuesday at Maya Moon).
    key: 'north-park', code: 'np', short: 'North Park', meeting: 'Team Up Tuesday', when: 'Tuesdays, 9:00–10:10 AM', where: 'Maya Moon, 3349 Adams Ave, San Diego, CA 92116', icon: 'building', city: 'San Diego',
    tagline: 'Team Up Tuesday at Maya Moon',
    about: 'Come join the Tuesday Normal Heights chapter at Maya Moon. A weekday morning with your people, close to home.',
    image: PHOTO('patio-coffee'),
  },
  {
    // TODO [confirm]: Oceanside's day, time and place (the portal lists Thrive on Thursday on S Coast Hwy).
    key: 'oceanside', code: 'oc', short: 'Oceanside', meeting: 'Thrive on Thursday', when: 'Thursdays, 9:00–10:10 AM', where: '1722 S Coast Hwy Ste 2, Oceanside, CA 92054', icon: 'sun', city: 'Oceanside',
    tagline: 'Thrive on Thursday in Oceanside',
    about: 'Thursday mornings by the coast in Oceanside: good energy, real conversation and the people who get it.',
    image: PHOTO('rooftop-gathering'),
  },
  {
    key: 'north-county', code: 'nc', short: 'North County', meeting: 'Coaches Club · House Party', when: 'Monthly', where: 'North County San Diego', icon: 'mountain', city: 'Escondido',
    tagline: 'The Coaches Club and The House Party',
    about: 'Monthly gatherings across North County: The Coaches Club for coaches and practitioners building their businesses, and The House Party for the people who build them.',
    image: PHOTO('hall-selfie'),
  },
  {
    key: 'veterans', code: 'vet', short: 'Veterans', meeting: 'Veteran Community Conversation', when: 'Wednesdays, 11:30 AM–1:00 PM', where: 'Municipal, 1722 S Coast Hwy, Oceanside, CA 92054', icon: 'flag', city: 'Oceanside',
    tagline: 'Veteran Community Conversation',
    about: 'Veteran Community is a collaborative community within The Group SD where veterans and those who support them come together to listen, learn, and take action. Through honest conversations, shared experiences, resources, mentorship, and meaningful connections, we are creating opportunities that help veterans thrive in every area of life. Together, we’re building stronger individuals, stronger families, and stronger communities, one conversation at a time.',
    image: PHOTO('courtyard-group'),
  },
]
export const chapterSlug = (c: Chapter) => `${SLUG}-${c.key}`
export const chapterId = (c: Chapter) => uuidFrom(`chapter:${c.key}`)

// ── Membership tiers (space_membership_tiers) ─────────────────────────────────────────────────────
// Built on what a Frequency membership actually is, never The Group's other portal or its sales platform
// (owner ruling 2026-10-14). Free is joining the Space. Any PAID tier grants the member Frequency Crew
// (lib/billing/crew-grants.ts), and a Collective's paid membership counts in every chapter
// (lib/collective/shared-membership.ts). The members-only levers are Frequency's own: a tier-linked circle
// (space_membership_tiers.circle_id), members-only ticket tiers (lib/events/membership-included.ts) and
// tier-gated Journeys (lib/journeys/tier-gate.ts).
// TODO [confirm]: the members-only event, the Premium circle and the Premium Journeys are set up by the
// owner in Frequency; the copy names the levers, not specific programs.
export const TIERS = [
  {
    id: uuidFrom('tier:free'), name: 'Free', priceCents: 0, sort: 0,
    description: 'Join The Group on Frequency and start meeting the community.',
    benefits: ['Join The Group on Frequency', 'RSVP to Feel Good Fridays and every open event', "Every chapter's calendar in one place", 'Join open circles between Fridays', 'Member updates by email'],
  },
  {
    id: uuidFrom('tier:basic'), name: 'Basic', priceCents: 1999, sort: 1,
    description: 'One membership in every chapter, with Frequency Crew included.',
    benefits: ['Everything in Free', 'One membership that counts in all five chapters', 'Frequency Crew included: host your own circles, events and journeys', 'A monthly Boost for a circle or Space you love', 'Member tickets to members-only events'],
  },
  {
    id: uuidFrom('tier:premium'), name: 'Premium', priceCents: 2999, sort: 2,
    description: 'Everything in Basic, plus the Premium circle and Premium journeys.',
    benefits: ['Everything in Basic', 'The Premium members circle', 'Premium journeys from The Group', 'First access to signature events'],
  },
]

// ── Incubator Studios (profileData.offerings, dollars) ──────────────────────────────────────────
export const STUDIO = [
  { title: 'Space Rental', price: 200, unit: '/ hour', durationMinutes: 60, short: 'Just the space: your show, your team. Seating, wifi, conference table, flatscreen, basic lighting and on-site support.', blurb: 'Just the space: your show, your team. Comfortable seating, high-speed wifi, conference table and flatscreen TV, basic lighting, ample power outlets and charging station, plus on-site support.' },
  { title: 'Recording Only', price: 350, unit: '/ hour', durationMinutes: 60, short: 'We handle the tech, you bring the story. Pro audio, multi-camera setup, studio lighting and audio mixing.', blurb: 'We handle the tech, you bring the story. Everything in Space Rental plus professional audio recording, multi-camera setup with basic studio lighting, audio mixing, plus on-site support.' },
  { title: 'Recording + Basic', price: 500, unit: '/ episode', durationMinutes: undefined, short: 'Polished and ready. Everything in Recording plus editing, branded intro and outro, and post-ready exports for social.', blurb: 'The complete production, polished and ready. Everything in Recording plus basic video editing with branded intro and outros + logo, post-production audio mixing, post-ready exports for social and more, plus on-site support.' },
]

// ── Merch (commerce_products), the store's own photos ───────────────────────────────────────────
const SQ = 'https://images.squarespace-cdn.com/content/v1/6665ed004c2943374705d724'
export const MERCH = [
  { key: 'tee', title: 'Meet Me for Coffee T-shirt', short: 'Meet Me for Coffee tee', note: 'Soft silkscreen, S to XL', priceCents: 3000, category: 'Apparel', sizes: ['S', 'M', 'L', 'XL'], image: `${SQ}/aa83b912-6267-42dd-8efe-0fd914d93fa6/coffee-man-white.jpg?format=750w`, href: 'https://www.thegroupcoastal.com/store/p/meet-me-for-coffee-tshirt', description: "The Group SD has a rule for all members new and old: \"Meet June for Coffee.\" Soft silkscreen tee, made with local San Diego printers. Sizes S to XL." },
  { key: 'tank', title: 'Meet Me for Coffee Tank Top', short: 'Meet Me for Coffee tank', note: 'Soft silkscreen, S to XL', priceCents: 3000, category: 'Apparel', sizes: ['S', 'M', 'L', 'XL'], image: `${SQ}/b654c1e7-5cf9-476e-b918-d8c3819e17a2/coffee-white-tank.jpg?format=750w`, href: 'https://www.thegroupcoastal.com/store/p/meet-me-for-coffee-tshirt-dh549', description: 'The golden rule, on a tank: "Meet June for Coffee." Soft silkscreen, made with local San Diego printers. Sizes S to XL.' },
  { key: 'travel-mug', title: 'The Group Coastal x Kenton Hoppas Travel Mug: Move With Intention', short: 'Move With Intention travel mug', note: 'x Kenton Hoppas · 10% to the artist', priceCents: 4000, category: 'Drinkware', sizes: [], image: `${SQ}/851d15a2-691b-4ea6-8c8e-4cc222deed2c/travel-mug-with-a-handle-white-25-oz-front-69d02e4be8059.jpg?format=750w`, href: 'https://www.thegroupcoastal.com/store/p/pre-order-the-group-coastal-x-kenton-hoppas-travel-mug-move-with-intention', description: 'A 25 oz stainless travel mug from our collaboration with local artist Kenton Hoppas. 10% of every mug goes to the artist.' },
  { key: 'ceramic-mug', title: 'The Group Coastal x Kenton Hoppas Ceramic Mug: Everyday Ritual', short: 'Everyday Ritual ceramic mug', note: 'x Kenton Hoppas · 20 oz', priceCents: 2600, category: 'Drinkware', sizes: [], image: `${SQ}/5df7b531-7c0b-4a9f-99f5-b8e6604a10b5/white-glossy-mug-white-20-oz-front-view-69d040732bf2f.jpg?format=750w`, href: 'https://www.thegroupcoastal.com/store/p/pre-order-the-group-coastal-x-kenton-hoppas-ceramic-mug-everyday-ritual', description: 'A 20 oz ceramic mug from our collaboration with local artist Kenton Hoppas. 10% of every mug goes to the artist.' },
]
export const merchId = (key: string) => uuidFrom(`product:${key}`)

// ── Circles (member-led groups that meet between Fridays), the handoff's twelve ─────────────────
export const CIRCLES = [
  { key: 'womens-coffee', name: "Women's Group Coffee Meetup ☕️", match: "Women's Group Coffee", icon: 'coffee', body: "Heart-led women's group for meaningful conversation and aligned support.", when: 'Wednesdays · 12:45 PM', where: 'Pannikin Coffee & Tea · Free', area: 'Leucadia', chapter: null },
  { key: 'woman-within', name: 'Woman Within Circle', match: 'Woman Within Circle', icon: 'heart', body: 'A gentle drop-in circle of connection, healing and sisterhood.', when: 'Every other Saturday · 9 AM', where: 'Encinitas · Free', area: 'Encinitas', chapter: null },
  { key: 'coffee-connection', name: 'Networking and Connection over Coffee', match: 'Connection over Coffee', icon: 'coffee', body: 'Coffee and connections, with 10% off at Lofty Coffee.', when: 'Thursdays · 12 PM', where: '97 N Coast Highway Encinitas · Free', area: 'Encinitas', chapter: null },
  { key: 'coaches-club', name: 'The Coaches Club', match: 'Coaches Club', icon: 'mic', body: 'Coaches and practitioners building, growing and scaling their businesses.', when: 'Monthly · 9:30 AM', where: 'Via Zoom · Free', area: 'North County', chapter: 'north-county' },
  { key: 'new-moms', name: 'New Moms Meetup', match: 'New Moms', icon: 'heart', body: 'Meet other new moms and learn from pregnancy, birth and postpartum experts.', when: 'Monthly, the 28th · 12 PM', where: 'Solana Beach · Free', area: 'Solana Beach', chapter: null },
  { key: 'breathwork-park', name: 'Breathwork in the Park', match: 'Breathwork in the Park', icon: 'wind', body: 'Breathwork, community and nature time at Presidio Park.', when: 'Every other Sunday · 4 PM', where: 'Presidio Park · Free', area: 'San Diego', chapter: null },
  { key: 'swamis', name: 'Swami’s Beach Gathering in the Grass', match: 'Swami', icon: 'sun', body: "A revived Sunday community gathering on the grass at Swami's.", when: 'Sundays · 2 PM', where: '1298 S Coast Hwy 101 Encinitas · Free', area: 'Encinitas', chapter: null },
  { key: 'dance-jam', name: 'Encinitas Sunday Dance Jam', match: 'Dance Jam', icon: 'music', body: 'Journey through the Five Elements on the dance floor. Donation based.', when: 'Every other Sunday · 11 AM', where: '535 Encinitas Blvd Suite 100 · Paid', area: 'Encinitas', chapter: null },
  { key: 'oceanside-women', name: 'Oceanside Womens Group', match: 'Oceanside Womens', icon: 'heart', body: "Biweekly women's circle in Oceanside. Bring a pillow to sit on.", when: 'Every other Thursday · 3 PM', where: '411 Garfield St · Free', area: 'Oceanside', chapter: 'oceanside' },
  { key: 'vibe-check', name: 'Vibe Check 🌀', match: 'Vibe Check', icon: 'spark', body: 'A monthly gathering for conscious leaders to connect and collaborate.', when: 'Monthly, the 18th · 3 PM', where: 'Encinitas private residence · Paid', area: 'Encinitas', chapter: null },
  { key: 'breath-sound', name: 'Breath & Sound by the Sea', match: 'Breath & Sound', icon: 'waves', body: 'A weekly heart-expanding gathering on the beach in Oceanside.', when: 'Fridays · 6:30 PM', where: '2300 Ocean St · Paid', area: 'Oceanside', chapter: 'oceanside' },
  { key: 'videography', name: 'Videography Meet-Up @ ICON Industries', match: 'Videography', icon: 'video', body: 'Videographers, editors and motion creatives connect and collaborate.', when: 'Wednesday · 6 PM', where: '925 S. Orange St. Escondido · Free', area: 'Escondido', chapter: null },
] as const
export const circleId = (key: string) => uuidFrom(`circle:${key}`)
/** South OC: forming, on the Collective until its details are confirmed (TODO [confirm] with June). */
export const SOUTH_OC = { key: 'south-oc', name: 'South OC Chapter', about: 'A South OC chapter of The Group, forming now. Come help fill it.', area: 'South Orange County' }

// ── Events (The Group Portal export) ────────────────────────────────────────────────────────────
interface PortalEvent { id: string; t: string; d: string; s: number; e: number; where: string; ch: string; type: string; free: boolean; org: string; rec: string | null; series: string | null; desc: string }
const PORTAL = (JSON.parse(readFileSync(new URL('./seed-the-group-events.json', import.meta.url), 'utf8')) as { events: PortalEvent[] }).events

/** Portal rows the seed leaves out. Empty: the owner ruled (2026-10-13) that every portal event is seeded,
 *  the overnight "12/12 Divine Mother Journey" included. */
const EXCLUDED = new Set<string>()

/** The recurring series, as RRULEs (lib/events/repeat-rule.ts). Keyed by the portal's series id, or by
 *  `one:<title>|<chapter>` for a series the portal exported as single rows. A series not listed here is
 *  irregular in the export (shifting days and gaps), so each of its dated rows is seeded as it is. */
interface Series { keys: string[]; rule: string; start?: string; end?: string; anchor?: string; title?: string; description?: string; where?: string }
const SERIES: Series[] = [
  {
    // The brief's Fridays: 9:00–10:10 AM (the portal opens check-in at 8:45).
    keys: ['rg_1773888535062'], rule: 'FREQ=WEEKLY;BYDAY=FR', start: '09:00', end: '10:10', title: 'Feel Good Friday',
    where: 'Fox Point Farms, 1200 Fox Point Farms Ln, Encinitas, CA 92024',
    description: 'Start your Friday with The Group SD at Fox Point Farms, where community comes first. Every Friday at 9 AM, we gather to slow down, connect, and build genuine, heart-centered friendships with good people who believe in supporting one another.\nNo pressure. No pitch. Just good energy, meaningful conversations, and a community where you can show up as yourself. Come find your people.',
  },
  { keys: ['rg_1783913746837'], rule: 'FREQ=WEEKLY;BYDAY=MO', start: '09:00', end: '10:10', where: 'Parakeet Cafe, Nautilus, 3535 General Atomics Ct, San Diego, CA 92121' },
  { keys: ['rg_1780618304011'], rule: 'FREQ=WEEKLY;BYDAY=TU' },
  { keys: ['rg_1773888372951', 'one:Thrive on Thursday|oc'], rule: 'FREQ=WEEKLY;BYDAY=TH' },
  { keys: ['rg_1785792867223'], rule: 'FREQ=WEEKLY;BYDAY=WE' },
  { keys: ['rg_1773890121065'], rule: 'FREQ=WEEKLY;BYDAY=WE' },
  { keys: ['one:Networking and Connection over Coffee|enc'], rule: 'FREQ=WEEKLY;BYDAY=TH' },
  { keys: ['one:Woman Within Circle|enc'], rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA' },
  { keys: ['one:Oceanside Womens Group|oc'], rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TH' },
  { keys: ['rg_1776975260671'], rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU' },
  { keys: ['rg_1788564529023', 'one:Encinitas Sunday Dance Jam|enc'], rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU' },
  { keys: ['rg_1780694053036'], rule: 'FREQ=MONTHLY;BYMONTHDAY=18' },
  { keys: ['rg_1783113609685'], rule: 'FREQ=MONTHLY;BYMONTHDAY=28' },
]

const keyOf = (e: PortalEvent) => e.series ?? `one:${e.t}|${e.ch}`
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const slugPart = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** A member's words, kept, with the brand mechanics applied: no em dashes, and a description the export
 *  cut mid-sentence ends at its last full sentence. */
export function cleanText(s: string): string {
  let out = s.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*(?=\D)/g, ', ').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (out.length >= 590 && !/[.!?)"”’]$/.test(out)) {
    const cut = Math.max(out.lastIndexOf('. '), out.lastIndexOf('! '), out.lastIndexOf('? '), out.lastIndexOf('.\n'))
    if (cut > 120) out = out.slice(0, cut + 1)
  }
  return out
}

const CATEGORY: Record<string, string> = { networking: 'gathering', social: 'social', educational: 'learning', personal: 'gathering' }
const ENERGY: Record<string, string | null> = { networking: 'social', social: 'social', educational: null, personal: 'grounding' }

export interface SeedEvent {
  slug: string
  title: string
  description: string
  date: string
  start: string
  end: string
  location: string
  /** The chapter Space that hosts it, or null for the Collective itself. */
  chapter: Chapter['key'] | null
  category: string
  energy: string | null
  rule: string | null
  /** For an anchor: its first HORIZON_DAYS of occurrences, as the daily job mints them. */
  occurrences: string[]
}

const chapterFor = (code: string): Chapter['key'] | null => CHAPTERS.find((c) => c.code === code)?.key ?? null

/** The instant a stored wall clock names, for the expander (stored as UTC parts, lib/time/zone.ts). */
export function ptIso(date: string, time: string): string {
  return `${date}T${time}:00.000Z`
}

export function buildEvents(): SeedEvent[] {
  const out: SeedEvent[] = []
  const used = new Set<string>()
  const seriesOf = new Map<string, Series>()
  for (const s of SERIES) for (const k of s.keys) seriesOf.set(k, s)
  const groups = new Map<Series, PortalEvent[]>()
  const floor = new Date(`${SEED_DAY}T00:00:00.000Z`)
  const through = new Date(floor.getTime() + HORIZON_DAYS * 864e5)
  for (const e of [...PORTAL].sort((a, b) => a.d.localeCompare(b.d) || a.s - b.s)) {
    if (EXCLUDED.has(e.t)) continue
    const s = seriesOf.get(keyOf(e))
    if (s) {
      groups.set(s, [...(groups.get(s) ?? []), e])
      continue
    }
    const slug = `tg-${slugPart(e.t)}-${e.d}`
    if (used.has(slug)) continue
    used.add(slug)
    out.push({ slug, title: e.t, description: cleanText(e.desc), date: e.d, start: hhmm(e.s), end: hhmm(e.e), location: e.where, chapter: chapterFor(e.ch), category: CATEGORY[e.type] ?? 'gathering', energy: ENERGY[e.type] ?? null, rule: null, occurrences: [] })
  }
  for (const [s, rows] of groups) {
    const first = rows[0]
    const start = s.start ?? hhmm(first.s)
    const slug = `tg-${slugPart(s.title ?? first.t)}-${first.d}`
    used.add(slug)
    const occurrences = expandRepeat(ptIso(first.d, start), parseRepeat(s.rule), { through, from: floor, includeAnchor: false }).map((d) => d.toISOString().slice(0, 10))
    out.push({
      slug, title: s.title ?? first.t, description: s.description ?? cleanText(first.desc), date: first.d, start, end: s.end ?? hhmm(first.e), location: s.where ?? first.where,
      chapter: chapterFor(first.ch), category: CATEGORY[first.type] ?? 'gathering', energy: ENERGY[first.type] ?? null, rule: s.rule, occurrences,
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}

// ── Page docs ───────────────────────────────────────────────────────────────────────────────────
type Block = { type: string; props: Record<string, unknown> }
const doc = (blocks: Block[]) => ({ root: { props: {} }, content: blocks })
const desktop = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' }

const FACES = [{ image: PHOTO('team-june') }, { image: PHOTO('team-carol') }, { image: PHOTO('team-lisel') }]
const HOSTS = [
  { image: PHOTO('team-june'), name: 'June An', role: 'Founder' },
  { image: PHOTO('team-carol'), name: 'Carol Yeh-Garner', role: 'Core team · Fridays co-host' },
  // TODO [confirm]: the spelling, Lisel or Lissel.
  { image: PHOTO('team-lisel'), name: 'Dr. Lisel', role: 'Core team · Heart of the Matter' },
]
const PILLARS = [
  { title: 'Learning', body: 'Workshops, seminars and peer-to-peer mentoring, so the community is always growing and evolving.' },
  { title: 'Ideas', body: 'A platform to share insights, brainstorm solutions and inspire each other. Every idea, big or small, can spark change.' },
  { title: 'Support', body: 'Encouragement, advice and resources, so no member has to face their challenges alone.' },
]
const BRENE = { quote: '“True belonging is not passive. It’s not the belonging that comes with just joining a group.”', by: 'Dr. Brené Brown' }
const CHAPTER_TAGS = [
  { label: 'Encinitas', match: 'encinitas|leucadia|fox point|solana beach|cardiff|la costa|escondido|swami' },
  { label: 'La Jolla', match: 'parakeet|general atomics|la jolla|motivation monday' },
  { label: 'North Park', match: 'maya moon|adams ave|north park|team up tuesday' },
  { label: 'Oceanside', match: 'oceanside|ocean st|garfield' },
  { label: 'Veterans', match: 'veteran' },
  { label: 'North County', match: 'coaches club|house party|break free' },
]
const CHAPTER_CHIPS = [
  { icon: 'sun', name: 'Encinitas', line: 'Feel Good Friday · Fox Point Farms', when: 'Fri · 9 AM', href: PAGE('fridays'), on: true },
  ...CHAPTERS.map((c) => ({ icon: c.icon, name: c.short, line: c.meeting === 'Coaches Club · House Party' ? 'Coaches Club · House Party' : `${c.meeting}${c.key === 'la-jolla' ? ' · Parakeet Cafe' : c.key === 'north-park' ? ' · Maya Moon' : ''}`, when: c.key === 'la-jolla' ? 'Mon · 9 AM' : c.key === 'north-park' ? 'Tue · 9 AM' : c.key === 'oceanside' ? 'Thu · 9 AM' : c.key === 'veterans' ? 'Wed · 11:30 AM' : 'Monthly', href: `/spaces/${chapterSlug(c)}`, on: false })),
]
const NOTES = [
  { icon: 'users', title: 'Join the Fun!', body: 'Come to Feel Good Fridays and meet with other great individuals looking to make meaningful connections.' },
  { icon: 'sprout', title: 'Discover Growth', body: 'Cultivate your success garden with like-minded individuals, where dreams thrive and ambitions soar.' },
  { icon: 'compass', title: 'Expand Possibilities', body: 'Nurture your network tree with the magic of organic connections, where roots run deep and branches reach high.' },
]
const TIER_CARDS = [
  { icon: 'sprout', name: 'Free', price: '$0', cadence: '', tagline: 'Start meeting the community.', features: 'Feel Good Fridays and open events\nEvery chapter\'s calendar\nOpen circles\nMember updates', ctaLabel: 'Join free', ctaHref: `/spaces/${SLUG}/memberships`, badge: '', featured: false },
  // TODO [confirm]: the "Most members" badge on Basic.
  { icon: 'users', name: 'Basic', price: '$19.99', cadence: '/ mo', tagline: 'Every chapter, and Crew included.', features: 'All five chapters\nFrequency Crew included\nHost circles, events and journeys\nMembers-only events', ctaLabel: 'Join Basic', ctaHref: `/spaces/${SLUG}/memberships`, badge: 'Most members', featured: true },
  { icon: 'rocket', name: 'Premium', price: '$29.99', cadence: '/ mo', tagline: 'The deepest way in.', features: 'Everything in Basic\nThe Premium members circle\nPremium journeys\nFirst access to signature events', ctaLabel: 'Join Premium', ctaHref: `/spaces/${SLUG}/memberships`, badge: '', featured: false },
]
const STUDIO_CARDS = STUDIO.map((s, i) => ({ title: s.title, price: `$${s.price}`, unit: s.unit, body: s.short, ctaLabel: 'Reserve', ctaHref: PAGE('contact'), featured: i === 1 }))
const EPISODES = ['mGOSomOf9E4', 'DmyPqNhNf_E', 'Bwmo5Iu5Vk8'].map((videoId) => ({ title: '', videoId, href: '', image: '' }))
const POSTS = [
  { image: '', caption: 'Big things are happening with The Group!' },
  { image: '', caption: "We'll continue to support each other rain or shine." },
  { image: '', caption: 'For Nick Esayian, football gave him confidence and a sense of belonging.' },
  { image: '', caption: 'The right people show up at the right time.' },
]
const PRODUCTS = MERCH.map((m) => ({ image: m.image, title: m.short, note: m.note, price: `$${m.priceCents / 100}`, href: PAGE('shop') }))
const CIRCLE_CARDS = CIRCLES.map((c) => ({ icon: c.icon, title: c.name, body: c.body, when: c.when, where: c.where, match: c.match }))

const coffee = (anchor = 'contact'): Block => ({
  type: 'NetworkCoffee',
  props: {
    id: `tg-coffee-${anchor}`, anchor, image: PHOTO('june-hug'), alt: 'June An hugging a member at a Friday gathering', signature: 'Meet June for coffee.',
    title: "The Group's *golden rule.*", body: "Every member, new and old, gets thirty minutes with June. Pick a time that works and he'll meet you for coffee in Encinitas or on a call.",
    ctaLabel: 'Get coffee with June', ctaHref: CALENDLY,
    reachTitle: 'Get in touch!', reachBody: "Excited about connecting with us? Drop us a message and we'll reach out in a jiffy.",
    email: EMAIL, phone: PHONE, links: [{ icon: 'camera', label: 'Instagram @thegroupsd', href: INSTAGRAM }], messageLabel: 'Send a message', messageHref: PAGE('contact'), layout: desktop,
  },
})

const eventsBlock = (id: string, extra: Record<string, unknown> = {}): Block => ({
  type: 'NetworkEvents',
  props: {
    id, anchor: 'events', eyebrow: 'Events', title: 'Find a group. *Or fill one.*',
    lead: 'Chapter mornings, circles, workshops and parties across San Diego. RSVP to anything and add it to your calendar.',
    actionLabel: 'Submit an event', actionHref: EVENT_SUBMIT, max: 6, chapters: CHAPTER_TAGS, moreLabel: 'See more events', moreHref: `/spaces/${SLUG}/calendar`, empty: 'No groups meet this day. Try another chapter.', layout: desktop, ...extra,
  },
})

export function buildPageDocs(): Record<string, unknown> {
  const home = doc([
    { type: 'NetworkHero', props: { id: 'tg-home-hero', eyebrow: 'Every Friday · 9 AM · Fox Point Farms, Encinitas', title: 'The non‑networking *networking* group.', lead: 'No pressure. No pitch. Just good energy, meaningful conversations, and a community where you can show up as yourself.', primaryLabel: 'Come this Friday', primaryHref: PAGE('fridays'), secondaryLabel: 'Get coffee with June', secondaryHref: CALENDLY, image: PHOTO('hero-market'), alt: 'The Group in a circle at a Friday gathering', focus: '50% 52%', crop: 'leaf', featureMatch: 'Feel Good Friday', featureNote: 'June An & Carol Yeh-Garner', featureCta: 'RSVP', proof: '8,500+ members · 300+ every week', proofNote: 'Chapters from Oceanside to North Park', faces: FACES, layout: desktop } },
    { type: 'NetworkStats', props: { id: 'tg-home-stats', items: [{ icon: 'users', value: '8,500+', label: 'active members' }, { icon: 'calendar', value: '300+', label: 'weekly attendees' }, { icon: 'eye', value: '100,000+', label: 'monthly profile views' }], layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-home-fridays', anchor: 'fridays', eyebrow: 'Feel Good Fridays', title: 'Start your Friday *with good people.*', body: "After a full week of building, creating, and showing up for your goals, Friday morning is your chance to exhale. A weekly ritual where conversations flow easily, new friendships form naturally, and familiar faces remind you that you're part of something bigger.", image: PHOTO('courtyard-group'), alt: 'A Friday morning circle at Fox Point Farms', mediaSide: 'left', band: 'sand', facts: [{ icon: 'pin', label: 'Where', value: 'Fox Point Farms', note: '1200 Fox Point Farms Ln, Encinitas' }, { icon: 'clock', label: 'When', value: 'Every Friday', note: '9:00–10:10 AM' }], quote: '', quoteBy: '', primaryLabel: 'Get directions', primaryHref: DIRECTIONS, secondaryLabel: 'See the calendar', secondaryHref: '#events', layout: desktop } },
    { type: 'NetworkBand', props: { id: 'tg-home-pitchfest', anchor: 'pitchfest', eyebrow: 'PitchFest 2026', title: 'Bring your idea. *Bring your people.*', body: 'Sign up to pitch in front of the community, then celebrate together at the 2nd annual Presentations & Party, Wednesday, October 21, 5:30–8 PM at C3 Bank Encinitas.', countdownTo: '2026-10-21T17:30', timeZone: TZ, countdownLabel: 'Time until the PitchFest Party', image: PHOTO('hall-selfie'), alt: 'Members celebrating together', primaryLabel: 'Sign up to pitch', primaryHref: PITCH_SIGNUP, secondaryLabel: 'RSVP to the party', secondaryHref: PITCH_PARTY, layout: desktop } },
    eventsBlock('tg-home-events'),
    { type: 'NetworkSteps', props: { id: 'tg-home-first', anchor: 'first-friday', eyebrow: 'Your first Friday', title: 'No agenda. No pressure. *No pitch.*', lead: '', steps: [
      { title: 'Show up at 9', body: "Fox Point Farms, Encinitas. Park, grab a coffee, and say hi to whoever's closest.", ctaLabel: '', ctaHref: '' },
      { title: 'Check in', body: 'Scan the guest check-in at the gate so we can say hello by name next week.', ctaLabel: '', ctaHref: '' },
      { title: 'Join the circle', body: 'Shared stories, a featured speaker, and time to just listen. Done by 10:10.', ctaLabel: '', ctaHref: '' },
      { title: 'Meet June for coffee', body: 'The one rule for every member, new and old. Book thirty minutes with June.', ctaLabel: 'Book coffee', ctaHref: CALENDLY },
    ], layout: desktop } },
    { type: 'NetworkChapters', props: { id: 'tg-home-chapters', anchor: 'chapters', eyebrow: 'Chapters', title: 'Pockets of community *across San Diego.*', lead: '', chips: CHAPTER_CHIPS, cards: [
      { image: PHOTO('june-harvest'), alt: 'June An at a La Jolla gathering', icon: 'waves', kicker: 'La Jolla · Mondays 9 AM', title: 'Motivation Monday', body: 'At Parakeet Cafe, hosted by trauma-informed coach Amie Barsky.', href: `/spaces/${SLUG}-la-jolla` },
      { image: PHOTO('patio-coffee'), alt: 'Members talking over coffee on a patio', icon: 'mic', kicker: 'Group Services', title: 'Incubator Studios', body: 'A full-service podcast and content studio in Encinitas, from $200/hour.', href: PAGE('studio') },
      { image: PHOTO('rooftop-gathering'), alt: 'A large group of members on a rooftop', icon: 'star', kicker: 'Events', title: 'PitchFest 2026', body: 'Sign up to pitch, then celebrate at the PitchFest Party on Oct 21.', href: PITCH_SIGNUP },
    ], notes: NOTES, layout: desktop } },
    { type: 'NetworkCircles', props: { id: 'tg-home-circles', anchor: 'circles', eyebrow: 'Circles', title: 'Find the people *who get it.*', lead: "Member-led circles meet between Fridays: women's groups, coaches, new moms, breathwork on the beach and dance. Tap any circle to see its next dates.", actionLabel: 'Start a circle', actionHref: EVENT_SUBMIT, circles: CIRCLE_CARDS, layout: desktop } },
    { type: 'NetworkFounder', props: { id: 'tg-home-june', anchor: 'june', eyebrow: 'Meet June An, founder', quote: '"The goal is to build up the community with inspiration and a sense of support. *Make the group what you want for you.*"', body: 'June founded The Group from the triumphs and trials of his own entrepreneurial journey, with one mission: to empower people to overcome obstacles and pursue their dreams with renewed hope and determination.', image: PHOTO('founder-june-an'), alt: 'June An, founder of The Group', hosts: HOSTS, ctaLabel: 'Get coffee with June', ctaHref: CALENDLY, layout: desktop } },
    { type: 'NetworkTeam', props: { id: 'tg-home-team', eyebrow: 'The core team', title: 'June, Carol *and Dr. Lisel.*', lead: 'The three people who hold it together every week. June founded The Group, Carol brings her grounding presence as a wellness leader and clinical hypnotherapist, and Dr. Lisel co-hosts Heart of the Matter with June.', note: 'Amie Barsky hosts Motivation Mondays in La Jolla.', image: PHOTO('core-team'), alt: 'June, Carol and Dr. Lisel together', pillars: PILLARS, quote: BRENE.quote, quoteBy: BRENE.by, layout: desktop } },
    { type: 'NetworkTiers', props: { id: 'tg-home-membership', anchor: 'membership', eyebrow: 'Membership', title: 'Your journey *starts here.*', lead: 'A heart-centered network of entrepreneurs, professionals, and changemakers who genuinely support each other in business and in life.', tiers: TIER_CARDS, footnote: '', layout: desktop } },
    { type: 'NetworkOfferings', props: { id: 'tg-home-studio', anchor: 'studio', eyebrow: 'Incubator Studios', title: 'Your story deserves a studio *that takes it seriously.*', lead: 'A full-service, concierge-style podcast and content studio in Encinitas. Heart of the Matter is shot here.', items: STUDIO_CARDS, layout: desktop } },
    { type: 'NetworkMedia', props: { id: 'tg-home-podcast', anchor: 'podcast', eyebrow: 'Heart of the Matter', title: 'The podcast.', lead: '', actionLabel: 'View all episodes', actionHref: PODCAST, items: EPISODES, layout: desktop } },
    { type: 'NetworkSocial', props: { id: 'tg-home-instagram', anchor: 'instagram', eyebrow: '@thegroupsd', title: 'Connect with us *and spread the love.*', lead: '', actionLabel: 'Follow on Instagram', actionHref: INSTAGRAM, posts: POSTS, layout: desktop } },
    { type: 'NetworkMerch', props: { id: 'tg-home-merch', anchor: 'merch', eyebrow: 'Feel Good Merch', title: 'Made with local *San Diego makers.*', lead: '', actionLabel: 'Shop all', actionHref: PAGE('shop'), buyLabel: 'Add to cart', products: PRODUCTS, layout: desktop } },
    coffee(),
  ])

  const fridays = doc([
    { type: 'NetworkHero', props: { id: 'tg-fridays-hero', eyebrow: 'Feel Good Fridays', title: 'Start your Friday *with good people.*', lead: 'Feel Good Friday at Fox Point Farms in Encinitas, every Friday at 9:00 AM, is designed to be the reset button that brings you back to center: a space to slow down, reconnect, and end the week with the right people around you.', primaryLabel: 'RSVP for Friday', primaryHref: '#events', secondaryLabel: 'Get directions', secondaryHref: DIRECTIONS, image: PHOTO('courtyard-group'), alt: 'A Friday morning circle at Fox Point Farms', focus: '50% 50%', crop: 'arch', featureMatch: 'Feel Good Friday', featureNote: 'Fox Point Farms', featureCta: 'RSVP', proof: '300+ every week', proofNote: 'Every Friday, 9am to 10:10am', faces: FACES, layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-fridays-more', eyebrow: 'More than a meetup', title: 'A weekly *ritual.*', body: 'After a full week of building, creating, and showing up for your goals, Friday morning is your chance to exhale.\nFeel Good Friday is more than a meetup. It’s a weekly ritual where conversations flow easily, new friendships form naturally, and familiar faces remind you that you’re part of something bigger. It’s a place where community isn’t forced; it grows organically through shared stories, encouragement, and the simple act of showing up.\nThis isn’t a formal networking event. There’s no agenda, no pressure, no pitch.\nOur vision is to create pockets of community across San Diego where people feel supported, welcomed, and energized. Feel Good Friday is one of those spaces, and we’d love for you to be part of it.', image: PHOTO('hero-group'), alt: 'Members together at Fox Point Farms', mediaSide: 'right', facts: [{ icon: 'pin', label: 'Where', value: 'Fox Point Farms, Encinitas', note: '1200 Fox Point Farms Lane, Encinitas, CA 92024' }, { icon: 'clock', label: 'When', value: 'Every Friday', note: '9am to 10:10am' }], quote: BRENE.quote, quoteBy: BRENE.by, primaryLabel: 'Get directions', primaryHref: DIRECTIONS, secondaryLabel: '', secondaryHref: '', layout: desktop } },
    { type: 'NetworkSteps', props: { id: 'tg-fridays-first', eyebrow: 'Your first Friday', title: 'No agenda. No pressure. *No pitch.*', lead: '', steps: [
      { title: 'Show up at 9', body: "Fox Point Farms, Encinitas. Park, grab a coffee, and say hi to whoever's closest.", ctaLabel: '', ctaHref: '' },
      { title: 'Check in', body: 'Scan the guest check-in at the gate so we can say hello by name next week.', ctaLabel: '', ctaHref: '' },
      { title: 'Join the circle', body: 'Shared stories, a featured speaker, and time to just listen. Done by 10:10.', ctaLabel: 'Speak on a Friday', ctaHref: SPEAKER_FORM },
      { title: 'Meet June for coffee', body: 'The one rule for every member, new and old. Book thirty minutes with June.', ctaLabel: 'Book coffee', ctaHref: CALENDLY },
    ], layout: desktop } },
    { type: 'NetworkFounder', props: { id: 'tg-fridays-hosts', eyebrow: 'Feel Good Fridays with June An & Carol Yeh-Garner', quote: 'Together, June and Carol create a welcoming, inspiring environment where people can connect, grow, and *rise.*', body: 'June An is the founder of The Group, a fast-growing San Diego community built around connection, emotional intelligence, and authentic leadership. Carol Yeh-Garner is a wellness leader, clinical hypnotherapist, and top-ranked entrepreneur known for helping people transform their lives from the inside out.', image: PHOTO('core-team'), alt: 'June An and Carol Yeh-Garner', hosts: HOSTS.slice(0, 2), ctaLabel: 'Get coffee with June', ctaHref: CALENDLY, layout: desktop } },
    eventsBlock('tg-fridays-events', { title: 'This week *and next.*', max: 8 }),
    coffee(),
  ])

  const lj = CHAPTERS[0]
  const chapters = doc([
    { type: 'NetworkChapters', props: { id: 'tg-chapters-band', anchor: 'chapters', eyebrow: 'Chapters', title: 'Pockets of community *across San Diego.*', lead: 'Our vision is to create spaces throughout San Diego where everyone feels they belong, where ideas become reality, and where community becomes the foundation for growth.', chips: CHAPTER_CHIPS, cards: [], notes: [], layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-chapters-lj', eyebrow: 'La Jolla Chapter', title: 'The Group is growing: *Motivation Mondays.*', body: `${lj.about}\nWhether you cannot always make it to Feel Good Fridays in Encinitas or you are ready to double down on connection by joining both, Motivation Monday was created for you. It is a place where authentic conversations spark new opportunities, where encouragement turns into action, and where people come together to lift each other higher both personally and professionally.`, image: PHOTO('june-harvest'), alt: 'June An with members in La Jolla', mediaSide: 'left', facts: [{ icon: 'pin', label: 'Where', value: 'Parakeet Cafe, Nautilus', note: '3535 General Atomics Ct, SD, CA 92121' }, { icon: 'clock', label: 'When', value: 'Every Monday', note: '9am to 10:10am' }], quote: '“The goal is to build up the community with inspiration and a sense of support. Make the group what you want for you.”', quoteBy: 'June An', primaryLabel: 'Visit the La Jolla chapter', primaryHref: `/spaces/${chapterSlug(lj)}`, secondaryLabel: '', secondaryHref: '', layout: desktop } },
    { type: 'NetworkFounder', props: { id: 'tg-chapters-amie', eyebrow: 'Motivation Monday host', quote: 'Empowering high-achievers to break free from burnout and *reconnect with their authentic selves.*', body: 'Amie Barsky is a trauma-informed coach specializing in Nervous System Regulation and Somatic Processing, helping professionals transform overwhelm into sustainable success. Her approach integrates neuroscience with holistic healing methods, drawing from her personal journey of overcoming people pleasing, perfectionism and trauma.', image: '', alt: '', hosts: [{ image: '', name: 'Amie Barsky', role: 'Host · Motivation Mondays' }], ctaLabel: '', ctaHref: '', layout: desktop } },
    eventsBlock('tg-chapters-events', { title: 'Every chapter, *every week.*', max: 10 }),
    { type: 'NetworkCircles', props: { id: 'tg-chapters-circles', eyebrow: 'Circles', title: 'Find the people *who get it.*', lead: "Member-led circles meet between Fridays: women's groups, coaches, new moms, breathwork on the beach and dance.", actionLabel: 'Start a circle', actionHref: EVENT_SUBMIT, circles: CIRCLE_CARDS, layout: desktop } },
  ])

  const membership = doc([
    { type: 'NetworkHero', props: { id: 'tg-membership-hero', eyebrow: 'Membership', title: 'Your journey *starts here.*', lead: 'Share your journey, your passions, and your dreams. Let your soul shine through and connect with those around you. Embrace the power of community and support on this amazing adventure.', primaryLabel: 'Become a member today', primaryHref: `/spaces/${SLUG}/memberships`, secondaryLabel: 'Get coffee with June', secondaryHref: CALENDLY, image: PHOTO('rooftop-gathering'), alt: 'Members of The Group together on a rooftop', focus: '50% 50%', crop: 'leaf', featureMatch: '', featureNote: '', featureCta: '', proof: '8,500+ members', proofNote: 'Free to start, upgrade any time', faces: FACES, layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-membership-cares', eyebrow: 'Join The Group', title: 'A community *that cares.*', body: "Welcome to The Group Coastal, where connection, collaboration, and community come first. We believe that success isn't just about what you do, but who you do it with. By signing up for our Membership, you're joining a heart-centered network of entrepreneurs, professionals, and changemakers who genuinely support each other in business and in life.\nAs a member, you'll gain access to our events, including our uplifting Feel Good Fridays, where we come together to share ideas, find inspiration, and build meaningful relationships. This isn't just another networking group, it's a movement of people who believe in growing together and making a real impact.\nWe're excited to welcome you in.", image: PHOTO('hall-selfie'), alt: 'Members celebrating together', mediaSide: 'right', facts: [], quote: '', quoteBy: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', layout: desktop } },
    { type: 'NetworkTiers', props: { id: 'tg-membership-tiers', eyebrow: 'Choose your membership', title: 'Get more involved *in every chapter.*', lead: 'Start free. Basic opens every chapter and includes Frequency Crew; Premium adds the members circle and Premium journeys.', tiers: TIERS.map((t, i) => ({ ...TIER_CARDS[i], features: t.benefits.join('\n') })), footnote: 'Any paid membership includes Frequency Crew. Change or cancel any time.', layout: desktop } },
    { type: 'CardGrid', props: { id: 'tg-membership-frequency', role: 'list', eyebrow: 'On Frequency', title: 'What membership *opens up.*', subtitle: 'The Group runs on Frequency, so your membership travels with you: every chapter, every circle and every event in one place.', columns: 2, cards: [
      { icon: '', title: 'Every chapter', body: 'One membership counts in La Jolla, North Park, Oceanside, North County and Veterans.\nEvery chapter\'s mornings on one calendar.' },
      { icon: '', title: 'Circles and events', body: 'Join open circles between Fridays.\nRSVP to every gathering, and get member tickets to members-only events.' },
      { icon: '', title: 'Frequency Crew', body: 'Any paid membership includes Crew.\nHost your own circles, events and journeys, with a monthly Boost for a circle or Space you love.' },
      { icon: '', title: 'Journeys', body: 'Guided journeys from The Group, with Premium journeys for Premium members.' },
    ], layout: desktop } },
    coffee(),
  ])

  const studio = doc([
    { type: 'NetworkHero', props: { id: 'tg-studio-hero', eyebrow: 'Incubator Studios', title: 'Your story deserves a studio *that takes it seriously.*', lead: "The Group SD Incubator Studios is San Diego's podcast and content production space, built for creators, brands, and business owners who are ready to show up professionally.", primaryLabel: 'Reserve your session', primaryHref: PAGE('contact'), secondaryLabel: 'See the packages', secondaryHref: '#packages', image: PHOTO('patio-coffee'), alt: 'Members talking over coffee', focus: '50% 50%', crop: 'soft', featureMatch: '', featureNote: '', featureCta: '', proof: 'Heart of the Matter is shot here', proofNote: 'Encinitas', faces: [], layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-studio-about', eyebrow: 'Studio offerings', title: 'Everything you need, *under one roof.*', body: 'Whether you bring your own team or want us to handle the tech, we have a setup that fits your show and your budget. Space rental, full recording, or complete production with editing and delivery, all under one roof in San Diego.\nThe Group Incubator Studios is proud to offer a full-service concierge style studio, complete with everything you need for podcasts, content creation, photoshoots, interviews, and more. Heart of the Matter™ Podcast is shot inside The Group Incubator Studio.', image: PHOTO('hero-group'), alt: 'Members of The Group together', mediaSide: 'left', facts: [{ icon: 'mic', label: 'For', value: 'Podcasts and content', note: 'Photoshoots, interviews and more' }, { icon: 'pin', label: 'Where', value: 'Encinitas', note: 'On-site support every session' }], quote: '', quoteBy: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', layout: desktop } },
    { type: 'NetworkOfferings', props: { id: 'tg-studio-packages', anchor: 'packages', eyebrow: 'Packages', title: 'Pick the setup *that fits your show.*', lead: "Reserve your session: tell us what you're making and we'll reply to confirm availability and answer any questions.", items: STUDIO.map((s, i) => ({ title: s.title, price: `$${s.price}`, unit: s.unit, body: s.blurb, ctaLabel: 'Reserve', ctaHref: PAGE('contact'), featured: i === 1 })), layout: desktop } },
    { type: 'NetworkMedia', props: { id: 'tg-studio-podcast', eyebrow: 'Heart of the Matter', title: 'Made in *this studio.*', lead: '', actionLabel: 'View all episodes', actionHref: PODCAST, items: ['mGOSomOf9E4', 'DmyPqNhNf_E', 'Bwmo5Iu5Vk8', 'KM42-GV9jYo', 'lIAKWYsLrjk', 'AsqNe6yEFA0'].map((videoId) => ({ title: '', videoId, href: '', image: '' })), layout: desktop } },
    coffee(),
  ])

  const about = doc([
    { type: 'NetworkHero', props: { id: 'tg-about-hero', eyebrow: 'About The Group', title: 'Heart-Centered. Community. *Tribe.*', lead: 'The Group was founded by June An, with a bold vision: to create a "non-networking" networking community, a space where personal connections come first.', primaryLabel: 'Become a member', primaryHref: PAGE('membership'), secondaryLabel: 'Get coffee with June', secondaryHref: CALENDLY, image: PHOTO('founder-june-an'), alt: 'June An, founder of The Group', focus: '50% 30%', crop: 'arch', featureMatch: '', featureNote: '', featureCta: '', proof: '', proofNote: '', faces: [], layout: desktop } },
    { type: 'NetworkFounder', props: { id: 'tg-about-june', eyebrow: 'Meet June An', quote: 'Let The Group inspire you to live your dreams *with purpose and confidence.*', body: 'June An is the visionary founder of The Group, a community born from the triumphs and trials of his own entrepreneurial journey. As a seasoned entrepreneur, June understands the personal and professional challenges that can often feel overwhelming. His journey has taken him through moments of helplessness and hopelessness, which fueled his passion to create a space where others don’t have to navigate these challenges alone. Inspired by his experiences, June founded The Group with a clear mission: to empower individuals to overcome obstacles and pursue their dreams with renewed hope and determination.', image: PHOTO('june-harvest'), alt: 'June An', hosts: HOSTS, ctaLabel: 'Get coffee with June', ctaHref: CALENDLY, layout: desktop } },
    { type: 'NetworkSplit', props: { id: 'tg-about-story', eyebrow: 'The commitment', title: 'Building a stronger community through *connection and collaboration.*', body: 'From its inception, The Group aimed to transcend traditional networking, focusing instead on fostering genuine relationships that would lead to collective growth and success. We believed that in prioritizing real, meaningful connections, we could build a community where professionals and business owners could truly flourish together.\nThe Group envisions a thriving ecosystem where businesses flourish not just through competition but through collaboration. We aim to be the cornerstone of a vibrant professional community, fostering an environment where each member’s growth and success contribute to the prosperity of all.', image: PHOTO('rooftop-gathering'), alt: 'Members of The Group on a rooftop', mediaSide: 'right', facts: [], quote: '', quoteBy: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', layout: desktop } },
    { type: 'NetworkTeam', props: { id: 'tg-about-team', eyebrow: 'Building real connections', title: 'Together, *we are stronger.*', lead: 'Our primary focus is on building authentic, lasting connections. Through regular events, collaborative projects, and community-building activities, we create opportunities for our members to forge strong relationships. These connections are the foundation upon which every member’s business can thrive, providing a robust support system and a source of inspiration.', note: 'If you are a professional or business owner passionate about growth and collaboration, The Group is your ideal community.', image: PHOTO('core-team'), alt: 'June, Carol and Dr. Lisel together', pillars: PILLARS, quote: 'Together, we are stronger. Together, we are The Group.', quoteBy: '', layout: desktop } },
    coffee(),
  ])

  return { home, fridays, chapters, membership, studio, about }
}

/** A chapter Space's Home: its hero and its meeting, with the way to its calendar and back to the Collective.
 *  Its events are tenanted to the Collective and HOSTED by the chapter (host_space_id), so the chapter's own
 *  Calendar page lists them; the page blocks read tenancy only, so the Home links there instead of listing. */
export function buildChapterDoc(c: Chapter): Record<string, unknown> {
  return doc([
    { type: 'NetworkHero', props: { id: `tg-${c.key}-hero`, eyebrow: `${c.short} chapter · The Group`, title: c.key === 'veterans' ? 'Veteran Community *Conversation.*' : `${c.meeting === 'Coaches Club · House Party' ? 'Monthly in' : c.meeting + ' in'} *${c.short}.*`, lead: c.about, primaryLabel: 'See the calendar', primaryHref: `/spaces/${chapterSlug(c)}/calendar`, secondaryLabel: 'Get coffee with June', secondaryHref: CALENDLY, image: c.image, alt: `The Group ${c.short}`, focus: '50% 50%', crop: 'leaf', featureMatch: '', featureNote: '', featureCta: '', proof: 'Part of The Group', proofNote: '8,500+ members across San Diego', faces: FACES, layout: desktop } },
    { type: 'NetworkSplit', props: { id: `tg-${c.key}-meeting`, eyebrow: c.meeting, title: 'Come find *your people.*', body: 'No pressure. No pitch. Just good energy, meaningful conversations, and a community where you can show up as yourself.', image: '', alt: '', mediaSide: 'left', facts: [{ icon: 'pin', label: 'Where', value: c.where.split(',')[0], note: c.where.split(',').slice(1).join(',').trim() }, { icon: 'clock', label: 'When', value: c.when.split(',')[0], note: c.when.split(',').slice(1).join(',').trim() }], quote: '', quoteBy: '', primaryLabel: 'All chapters', primaryHref: PAGE('chapters'), secondaryLabel: 'Membership', secondaryHref: PAGE('membership'), layout: desktop } },
  ])
}

// ── Preferences ───────────────────────────────────────────────────────────────────────────────
export const SITE_HERO = {
  eyebrow: 'Every Friday · 9 AM · Fox Point Farms, Encinitas',
  heading: 'The non‑networking *networking* group.',
  tagline: 'No pressure. No pitch. Just good energy, meaningful conversations, and a community where you can show up as yourself.',
  action: { label: 'Come this Friday', href: PAGE('fridays') },
  secondary: { label: 'Get coffee with June', href: CALENDLY },
}

export const SITE_FOOTER = {
  columns: [
    { title: 'Locations', links: [{ label: 'Encinitas', href: PAGE('fridays') }, ...CHAPTERS.map((c) => ({ label: c.short, href: `/spaces/${chapterSlug(c)}` }))] },
    { title: 'Explore', links: [{ label: 'Feel Good Fridays', href: PAGE('fridays') }, { label: 'Events calendar', href: `/spaces/${SLUG}/calendar` }, { label: 'Incubator Studios', href: PAGE('studio') }, { label: 'Creative Collective', href: 'https://www.thegroupcoastal.com/creative-collective' }, { label: 'Merch', href: PAGE('shop') }, { label: 'Members portal', href: 'https://thegroupportal.com' }] },
    { title: 'Contact', links: [{ label: EMAIL, href: PAGE('contact') }, { label: PHONE, href: PAGE('contact') }, { label: 'Instagram', href: INSTAGRAM }, { label: 'Get coffee with June', href: CALENDLY }] },
  ],
  blurb: 'Together, we are stronger.',
  line: null,
  note: null,
  suffix: 'Powered by Frequency',
}

const PROFILE_DATA = {
  kind: 'Community',
  about: ABOUT,
  email: EMAIL,
  phone: PHONE,
  website: 'https://www.thegroupcoastal.com',
  address: '1200 Fox Point Farms Ln, Encinitas, CA 92024',
  hours: 'Feel Good Fridays · every Friday, 9:00–10:10 AM',
  socials: [
    { platform: 'instagram', url: INSTAGRAM },
    // TODO [confirm]: the LinkedIn, YouTube and Spotify URLs (the handoff names them without links).
  ],
  offerings: STUDIO.map((s) => ({ title: `Incubator Studios: ${s.title}`, blurb: s.blurb, price: s.price, currency: 'usd', priceModel: 'fixed', ...(s.durationMinutes ? { durationMinutes: s.durationMinutes } : {}), recurring: 'once', visibility: 'listed' })),
}

/** The Network site style (lib/theme/site-style.ts): the website and a synced Space page on Network. */
const SITE_STYLE = { theme: 'network', synced: true, spaceFonts: 'modern' }

/** The preferences keys this seed writes, merged over what the Space has. `websitePublished` is NOT set:
 *  the owner publishes by hand once June confirms the open items. */
export function buildPreferences(): Record<string, unknown> {
  return {
    theme: 'modern',
    siteStyle: SITE_STYLE,
    pages: PAGES,
    pageDocs: buildPageDocs(),
    siteHero: SITE_HERO,
    siteFooter: SITE_FOOTER,
    profileData: PROFILE_DATA,
    storefront: { tabLabel: 'Merch', published: true },
    coverScrim: 'none',
    logoBackdrop: 'none',
    profilePublished: true,
  }
}

export function buildChapterPreferences(c: Chapter): Record<string, unknown> {
  return {
    theme: 'modern',
    siteStyle: SITE_STYLE,
    pages: [{ slug: 'home', label: 'Home' }],
    pageDocs: { home: buildChapterDoc(c) },
    siteHero: { eyebrow: `${c.short} chapter · The Group`, heading: `${c.short}.`, tagline: c.about, action: { label: 'See the calendar', href: `/spaces/${chapterSlug(c)}/calendar` } },
    siteFooter: SITE_FOOTER,
    profileData: { kind: 'Community', about: c.about, email: EMAIL, phone: PHONE, address: c.where, hours: `${c.meeting} · ${c.when}`, socials: [{ platform: 'instagram', url: INSTAGRAM }] },
    profilePublished: true,
  }
}

// ── SQL ───────────────────────────────────────────────────────────────────────────────────────
const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`)
const qj = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`
const qarr = (v: string[]): string => `array[${v.map(q).join(', ')}]::text[]`
const pt = (date: string, time: string) => `timestamptz '${date} ${time}+00'`

function spaceUpsert(id: string, slug: string, name: string, brand: string, tagline: string, about: string, plan: string, parent: string | null, prefs: Record<string, unknown>, logo: string | null, cover: string | null, city = 'Encinitas'): string {
  return `insert into spaces (id, slug, name, type, status, entity_id, skin, network_connected, visibility, plan, limits_waived, entitlements, owner_profile_id, brand_name, tagline, about, time_zone, brand_logo_url, cover_image_url, parent_id, city, region, country, preferences)
values (${q(id)}, ${q(slug)}, ${q(name)}, 'business', 'active', (select entity_id from _tg), 'dawn', true, 'network', ${q(plan)}, ${plan === 'collective'}, '{}'::jsonb, ${q(OWNER_ID)}, ${q(brand)}, ${q(tagline)}, ${q(about)}, ${q(TZ)}, ${q(logo)}, ${q(cover)}, ${parent ? q(parent) : 'null'}, ${q(city)}, 'CA', 'US', ${qj(prefs)})
on conflict (slug) do update set name = excluded.name, status = 'active', network_connected = true, visibility = 'network', plan = excluded.plan, limits_waived = excluded.limits_waived, brand_name = excluded.brand_name, tagline = excluded.tagline, about = excluded.about, time_zone = excluded.time_zone, brand_logo_url = excluded.brand_logo_url, cover_image_url = excluded.cover_image_url, parent_id = excluded.parent_id, city = excluded.city, preferences = coalesce(spaces.preferences, '{}'::jsonb) || excluded.preferences, updated_at = now()
where spaces.owner_profile_id = ${q(OWNER_ID)};`
}

function eventInsert(e: SeedEvent, hostSpace: string): string {
  return `insert into events (slug, title, description, host_id, scope_id, scope_type, starts_at, ends_at, time_zone, location, visibility, status, published_at, join_mode, category, energy_tag, attendance_mode, source, space_id, host_space_id, recurrence_type, recurrence_rule, is_cancelled)
values (${q(e.slug)}, ${q(e.title)}, ${q(e.description)}, ${q(OWNER_ID)}, (select region_id from _tg), 'public', ${pt(e.date, e.start)}, ${pt(e.date, e.end)}, ${q(TZ)}, ${q(e.location)}, 'public', 'published', now(), 'rsvp', ${q(e.category)}, ${q(e.energy)}, 'in_person', 'manual', ${q(SPACE_ID)}, ${hostSpace}, ${q(e.rule ? (e.rule.startsWith('FREQ=MONTHLY') ? 'monthly' : 'weekly') : 'none')}, ${q(e.rule)}, false)
on conflict (slug) do update set title = excluded.title, description = excluded.description, host_id = excluded.host_id, scope_id = excluded.scope_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at, time_zone = excluded.time_zone, location = excluded.location, visibility = excluded.visibility, status = excluded.status, published_at = coalesce(events.published_at, excluded.published_at), join_mode = excluded.join_mode, category = excluded.category, energy_tag = excluded.energy_tag, space_id = excluded.space_id, host_space_id = excluded.host_space_id, recurrence_type = excluded.recurrence_type, recurrence_rule = excluded.recurrence_rule;`
}

function occurrencesInsert(e: SeedEvent): string {
  if (!e.occurrences.length) return ''
  return [
    'insert into events (slug, parent_event_id, starts_at, ends_at, recurrence_type, recurrence_until, recurrence_rule, is_cancelled,',
    '  title, description, host_id, scope_id, scope_type, location, visibility, status, published_at, price_cents, currency, capacity, venmo_handle, join_mode,',
    '  category, energy_tag, time_zone, cover_image_path, gallery_image_paths, poster_path, theme, details, space_id, host_space_id, domain_id,',
    '  attendance_mode, online_url, venue_name, street, city, region, country, postal_code, geog, hide_address, journey_id, source, is_demo,',
    '  posted_by_profile_id, organizer_name, organizer_contact)',
    `select a.slug || '-' || d.day, a.id, (d.day || ' ${e.start}+00')::timestamptz, (d.day || ' ${e.end}+00')::timestamptz, 'none', null, null, false,`,
    '  a.title, a.description, a.host_id, a.scope_id, a.scope_type, a.location, a.visibility, a.status, a.published_at, a.price_cents, a.currency, a.capacity, a.venmo_handle, a.join_mode,',
    '  a.category, a.energy_tag, a.time_zone, a.cover_image_path, a.gallery_image_paths, a.poster_path, a.theme, a.details, a.space_id, a.host_space_id, a.domain_id,',
    '  a.attendance_mode, a.online_url, a.venue_name, a.street, a.city, a.region, a.country, a.postal_code, a.geog, a.hide_address, a.journey_id, a.source, a.is_demo,',
    '  a.posted_by_profile_id, a.organizer_name, a.organizer_contact',
    `from events a cross join (values ${e.occurrences.map((d) => `(${q(d)})`).join(', ')}) as d(day)`,
    `where a.slug = ${q(e.slug)}`,
    'on conflict (slug) do nothing;',
  ].join('\n')
}

export function renderSql(): string {
  const events = buildEvents()
  const L: string[] = []
  const p = (...lines: string[]) => L.push(...lines)
  const chapterRef = (key: Chapter['key'] | null) => (key ? q(chapterId(CHAPTERS.find((c) => c.key === key)!)) : q(SPACE_ID))
  p(
    '-- scripts/seed-the-group.sql',
    '-- GENERATED by `node --experimental-strip-types scripts/seed-the-group.mts --sql` from scripts/seed-the-group.mts. Edit the .mts, then regenerate.',
    '--',
    '-- Seeds THE GROUP as a Collective Space (slug the-group) with five chapter member Spaces, its circles,',
    '-- its membership tiers, its merch, its studio offerings, its calendar and its website pages on the',
    '-- Network theme. ONE transaction. Idempotent: every statement is an upsert on a natural key (slug) or a',
    '-- deterministic id. A Space row is only updated while it is still owner-held (owner_profile_id below).',
    '-- websitePublished is NOT written: the owner publishes the website by hand.',
    '',
    'begin;',
    '',
    '-- The root entity a new Space is filed under (lib/spaces/provision.ts rootEntityId) and the region a Space',
    '-- event is scoped to (lib/events/event-drafts.ts resolveRegionScopeId: the host profile\'s, else the top).',
    'create temp table _tg on commit drop as',
    "select (select entity_id from spaces where type = 'root' order by created_at limit 1) as entity_id,",
    `       coalesce((select nexus_region_id from profiles where id = ${q(OWNER_ID)}),`,
    '                (select id from nexus_regions where parent_id is null order by depth asc, id asc limit 1)) as region_id;',
    '',
    'do $guard$ begin',
    `  if exists (select 1 from spaces where slug = ${q(SLUG)} and owner_profile_id is distinct from ${q(OWNER_ID)}) then`,
    `    raise exception 'seed-the-group: the slug ${SLUG} belongs to someone else; nothing written';`,
    '  end if;',
    'end $guard$;',
    '',
    '-- 1. The Collective. Inserting it fires spaces_ensure_space_circle: its primary circle is minted here.',
    spaceUpsert(SPACE_ID, SLUG, NAME, BRAND, TAGLINE, ABOUT, 'collective', null, buildPreferences(), LOGO, PHOTO('hero-market')),
    '',
    '-- 2. The five chapters, member Spaces of the Collective (set_collective_member_space\'s rules: same owner,',
    '--    active, network-visible, not a Collective themselves, no children; five is the plan\'s included count).',
    ...CHAPTERS.map((c) => spaceUpsert(chapterId(c), chapterSlug(c), `The Group ${c.short}`, `The Group ${c.short}`, c.tagline, c.about, 'free', SPACE_ID, buildChapterPreferences(c), LOGO, c.image, c.city)),
    '',
    '-- 3. The owner is an admin of every Space (createSpace\'s addSpaceMember). June An, Carol Yeh-Garner, Dr. Lisel',
    '--    and Amie Barsky are not on Frequency yet: they appear by name on the website and are invited from the',
    '--    console (Manage > People) once they have accounts. TODO [confirm] their emails with June.',
    `insert into space_members (space_id, profile_id, role, status)`,
    `select s.id, ${q(OWNER_ID)}, 'admin', 'active' from spaces s where s.slug in (${[SLUG, ...CHAPTERS.map(chapterSlug)].map(q).join(', ')})`,
    'on conflict (space_id, profile_id) do nothing;',
    '',
    '-- 4. Circles. Each Space\'s primary circle was minted by the trigger; here it gets its words. The member-led',
    '--    circles (the handoff\'s twelve) live on the Collective, or on the chapter they meet in.',
    `update circles set about = ${q('Feel Good Fridays at Fox Point Farms, Encinitas: every Friday, 9:00–10:10 AM. No pressure. No pitch. Come find your people.')}, neighborhood = 'Encinitas', timezone = ${q(TZ)}, primary_pillar = 'mind' where space_id = ${q(SPACE_ID)} and is_space_primary;`,
    ...CHAPTERS.map((c) => `update circles set about = ${q(`${c.meeting} · ${c.when}. ${c.where}.`)}, neighborhood = ${q(c.short)}, timezone = ${q(TZ)}, primary_pillar = 'mind' where space_id = ${q(chapterId(c))} and is_space_primary;`),
    ...CIRCLES.flatMap((c) => [
      `insert into circles (id, name, slug, about, type, member_cap, member_count, status, host_id, space_id, neighborhood, city, primary_pillar, timezone, access)`,
      `values (${q(circleId(c.key))}, ${q(c.name)}, ${q(`tg-${c.key}`)}, ${q(c.body)}, 'in-person', 50, 0, 'active', ${q(OWNER_ID)}, ${chapterRef(c.chapter)}, ${q(c.area)}, ${q(c.area)}, 'mind', ${q(TZ)}, 'open')`,
      `on conflict (id) do update set name = excluded.name, about = excluded.about, status = excluded.status, space_id = excluded.space_id, neighborhood = excluded.neighborhood, city = excluded.city, timezone = excluded.timezone;`,
      `insert into circle_profiles (circle_id, meetup) values (${q(circleId(c.key))}, ${qj({ text: `${c.when} · ${c.where}`, length: '' })}) on conflict (circle_id) do update set meetup = excluded.meetup, updated_at = now();`,
    ]),
    `insert into circles (id, name, slug, about, type, member_cap, member_count, status, host_id, space_id, neighborhood, city, primary_pillar, timezone, access)`,
    `values (${q(circleId(SOUTH_OC.key))}, ${q(SOUTH_OC.name)}, 'tg-south-oc', ${q(SOUTH_OC.about)}, 'in-person', 50, 0, 'forming', ${q(OWNER_ID)}, ${q(SPACE_ID)}, ${q(SOUTH_OC.area)}, ${q(SOUTH_OC.area)}, 'mind', ${q(TZ)}, 'open')`,
    'on conflict (id) do update set name = excluded.name, about = excluded.about, status = excluded.status;',
    '',
    '-- 5. Membership tiers (setMembershipTiers\' shape: monthly cents, benefits as a JSON array of strings).',
    ...TIERS.map((t) => `insert into space_membership_tiers (id, space_id, name, price_cents, interval, description, benefits, sort, is_active)
values (${q(t.id)}, ${q(SPACE_ID)}, ${q(t.name)}, ${t.priceCents}, 'month', ${q(t.description)}, ${qj(t.benefits)}, ${t.sort}, true)
on conflict (id) do update set name = excluded.name, price_cents = excluded.price_cents, interval = excluded.interval, description = excluded.description, benefits = excluded.benefits, sort = excluded.sort, is_active = true;`),
    '',
    '-- 6. Merch (createProduct\'s shape, published like setProductStatus(active)): physical shop products owned by',
    '--    the Collective, the store\'s own photos, sizes as variants.',
    ...MERCH.flatMap((m) => [
      `insert into commerce_products (id, owner_kind, owner_space_id, entity_id, product_kind, vertical, title, description, images, price_cents, currency, stock, category, status, metadata, tags, condition)
values (${q(merchId(m.key))}, 'space', ${q(SPACE_ID)}, ${q(LABS_ENTITY)}, 'physical', 'shop', ${q(m.title)}, ${q(m.description)}, ${qarr([m.image])}, ${m.priceCents}, 'usd', null, ${q(m.category)}, 'active', ${qj({ source: m.href })}, ${qarr(['merch', m.category.toLowerCase()])}, 'new')
on conflict (id) do update set title = excluded.title, description = excluded.description, images = excluded.images, price_cents = excluded.price_cents, category = excluded.category, status = excluded.status, metadata = excluded.metadata, tags = excluded.tags, updated_at = now();`,
      ...m.sizes.map((size, i) => `insert into commerce_variants (id, product_id, name, options, sort_order, active) values (${q(uuidFrom(`variant:${m.key}:${size}`))}, ${q(merchId(m.key))}, ${q(size)}, ${qj({ Size: size })}, ${i}, true) on conflict (id) do update set name = excluded.name, options = excluded.options, sort_order = excluded.sort_order, active = true;`),
    ]),
    '',
    `-- 7. Events: ${events.length} rows from The Group Portal export. Tenancy is the Collective (space_id) so its`,
    '--    calendar holds every chapter; a chapter\'s own meetings are hosted by its Space (host_space_id), so each',
    '--    chapter\'s calendar shows its own. Recurring series are anchors with an RRULE plus the first 60 days of',
    '--    occurrences (lib/event-recurrence.ts); the daily job rolls the window forward from here.',
    ...events.flatMap((e) => [eventInsert(e, chapterRef(e.chapter)), occurrencesInsert(e)].filter(Boolean)),
    '',
    `-- VERIFY: select slug, plan, parent_id is not null as chapter, preferences->'siteStyle'->>'theme' as theme from spaces where slug like 'the-group%' order by slug;`,
    `-- EXPECT: 6 rows: the-group (collective, theme network) and five chapters with parent_id set.`,
    `-- VERIFY: select count(*) from events where space_id = '${SPACE_ID}';`,
    `-- EXPECT: ${events.length + events.reduce((n, e) => n + e.occurrences.length, 0)}`,
    '',
    'commit;',
  )
  return L.join('\n') + '\n'
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false
if (isMain) {
  if (process.argv.includes('--sql')) process.stdout.write(renderSql())
  else {
    console.error('Usage: node --experimental-strip-types scripts/seed-the-group.mts --sql > scripts/seed-the-group.sql')
    process.exit(2)
  }
}
