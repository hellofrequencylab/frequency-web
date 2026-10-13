// Seed the Wildheart Space as an in-house program, the way Hearts on Fire was seeded (owner ruling,
// 2026-10-12). Idempotent + service-role only. Scoped ONLY to the Wildheart Space row
// (spaces.id 5c7c46d1-a2ba-4e58-a942-c1fe6a68e74b) and new child rows that reference it.
//
// Two modes, one source of truth for the content:
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... pnpm seed:wildheart
//       applies every section through PostgREST upserts (on a natural key, never a duplicate).
//
//   pnpm seed:wildheart --sql > scripts/seed-wildheart.sql
//       prints the same seed as ONE SQL transaction (every statement an upsert on a natural key or
//       guarded by `where not exists`), which the owner applies by hand. scripts/seed-wildheart.sql
//       in the tree is that output; regenerate it after editing the content below.
//
// Shapes are copied from the product's own writers (not invented): lib/event-recurrence.ts
// INHERITED_COLUMNS + occurrenceRow (a materialised occurrence), app/(main)/events/actions.ts
// createEvent (a Space event is scope_type 'public' + the host's nexus region + space_id),
// lib/journey-plans.ts createPlan + app/(main)/journeys/create-actions.ts (journey_plans and the
// phase/module/lesson tree), lib/channels/programs.ts createSpaceProgram (blueprint + channel +
// circle_channels), app/(main)/spaces/[slug]/manage/layout/actions.ts (preferences keys), and the
// live Hearts on Fire rows as the reference shape.
//
// NOT done here, on purpose: preferences.theme (the Space launches on the stock theme) and
// websitePublished (the owner publishes by hand). Nothing is tagged is_demo. lib/demo/engine is
// not used. Copy obeys docs/CONTENT-VOICE.md: no em dashes, no emoji, invitation never a fix.

import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// ── Fixed ids (read from production on 2026-10-12) ─────────────────────────────────────────────
const SPACE_ID = '5c7c46d1-a2ba-4e58-a942-c1fe6a68e74b'
const OWNER_ID = 'c1d40f58-318b-4c7b-a331-21788d632fc9' // spaces.owner_profile_id, also the circle host
const CIRCLE_ID = '242927ed-1ebf-4f7b-91e4-0d6a373d0b10' // the Space's primary circle (is_space_primary)
const OLD_SLUG = 'wilheart' // the typo the Space was created with
export const SLUG = 'wildheart'
const TZ = 'America/Los_Angeles'

/** A deterministic uuid from a key, so re-running the seed hits the same rows (natural key = id). */
function uuidFrom(key: string): string {
  const h = createHash('md5').update(`wildheart:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── The Space ──────────────────────────────────────────────────────────────────────────────────
export const TAGLINE = 'Come home to your body. Take up space.'
export const ABOUT =
  'Wildheart is a year-round circle for women: 6 to 12 women and a trained host, meeting every other week, in person, through the seasons. Women come back into their bodies and let what is inside move out, through movement, voice, pleasure, play and presence. A place to take up space without apology.'

// Mirrors Hearts on Fire's entitlements keys exactly.
const ENTITLEMENTS = { crm: false, shop: false, reviews: false, availability: false }

export const SITE_HERO = {
  eyebrow: "Women's circles · Year-round · A Space on Frequency",
  heading: 'For every woman who wants to be *free*.',
  tagline:
    'Wildheart is a year-round circle for women who are ready to stop holding it all together. Every other week you gather with the same women to move, breathe, make noise, laugh and feel at home in your body. Come once and see what wakes up.',
  action: { label: 'Come to one Circle Night', href: `/spaces/${SLUG}/circles` },
  secondary: { label: 'How it works', href: `/spaces/${SLUG}/program` },
}

const PROFILE_DATA = {
  about: ABOUT,
  offerings: [
    {
      title: 'Circle Night',
      blurb:
        'Every other week, in person, 90 minutes. Five beats: Presence, Unite, Lead, Settle, Exhale. Join in, go gently, witness or pass.',
      durationMinutes: 90,
    },
    {
      title: 'Year-round membership',
      blurb:
        'A full year: Circle Nights every other week, a daily practice you can keep, the eight-week Foundation, the eight festivals and every moon, the Samhain retreat, and a path to host your own circle.',
    },
    {
      title: 'Wildheart Retreat',
      blurb: 'Three nights in the wild dark on Samhain weekend. Every circle together, held apart from the Hearts on Fire Desert Retreat.',
    },
  ],
}

// Six pages (MAX_PROFILE_PAGES: Home plus five), the design handoff's six screens, none on the reserved
// list (lib/spaces/profile-pages.ts). Safety lives on The program and hosting on Circles (LIVE-903).
export const PAGES = [
  { slug: 'home', label: 'Home' },
  { slug: 'program', label: 'The program' },
  { slug: 'the-year', label: 'The year' },
  { slug: 'circles', label: 'Circles' },
  { slug: 'retreat', label: 'Retreat' },
  { slug: 'about', label: 'About' },
]

/** The handoff's five photos (rights confirmed, design_handoff_wildheart/assets/photos), served from the
 *  app's own public folder so every site host reaches them. forest-witch.jpg keeps its photographer credit. */
export const PHOTOS = {
  hands: '/brand/wildheart/photos/hands-together.jpg',
  cacao: '/brand/wildheart/photos/cacao-circle.jpg',
  forest: '/brand/wildheart/photos/forest-witch.jpg',
  shore: '/brand/wildheart/photos/sisters-shore.jpg',
  huddle: '/brand/wildheart/photos/huddle.jpg',
}

export const PULSE = [
  { icon: 'P', title: 'Presence', body: 'Arrive in the body: breath, shaking, landing.' },
  { icon: 'U', title: 'Unite', body: 'A check-in round, each woman speaking and being witnessed.' },
  { icon: 'L', title: 'Lead', body: 'The module’s practice: movement, voice, ritual or teaching.' },
  { icon: 'S', title: 'Settle', body: 'Rest and integration, lying down, on the floor, quiet.' },
  { icon: 'E', title: 'Exhale', body: 'Close with sound, a commitment, and celebration.' },
]

// The four pillars, each with its seal (an alchemical glyph) and its examples line, the handoff's words.
export const PILLARS = [
  { glyph: 'earth', title: 'Embodiment', body: 'Feeling the body from inside, not watching it from outside.', note: 'Breath · shaking · grounding' },
  { glyph: 'venus', title: 'Sensuality', body: 'Pleasure through the senses, at her own pace.', note: 'Slow movement · texture · scent' },
  { glyph: 'fire', title: 'Voice and expression', body: 'Taking up space with sound, words and anger.', note: 'Sighing to roaring · saying no' },
  { glyph: 'sun', title: 'Joy', body: 'Play without purpose.', note: 'Dance · laughter · games' },
]

// The member path: six steps as a moon waxing from new to full, each linking where it leads.
export const PATH = [
  { title: 'Visit', body: 'Come to one Circle Night. Join in or simply witness.', href: `/spaces/${SLUG}/circles` },
  { title: 'Join', body: 'Become a member of the Space and one circle.', href: `/spaces/${SLUG}/circles` },
  { title: 'Foundation', body: 'Eight weeks, with check-ins from your host.', href: `/spaces/${SLUG}/program` },
  { title: 'Practise', body: 'A short daily practice and Circle Night.', href: `/spaces/${SLUG}/program` },
  { title: 'Gather', body: 'Hearth Gatherings and the Samhain retreat.', href: `/spaces/${SLUG}/retreat` },
  { title: 'Host', body: 'Train to co-lead or start a circle.', href: `/spaces/${SLUG}/circles` },
]

export const SAFETY = [
  'Women-only, led by women.',
  'Every practice can be joined, modified, watched or skipped.',
  'No touch between members unless a practice invites it and each woman opts in.',
  'Nothing sexual happens in the circle.',
  'No photos or recording of any practice.',
  'What is shared stays in the circle.',
]

// The four parts of the program (the handoff's Home cards), each with its line icon and where it leads.
export const PARTS = [
  { icon: 'hand', title: 'The circles', body: '6 to 12 women and a trained host, every other week, in person.' },
  { icon: 'moon-star', title: 'The rhythm', body: 'One five-beat Circle Night any new host can learn.' },
  { icon: 'sparkles', title: 'The year', body: 'Twelve modules across four seasons and twelve signs.' },
  { icon: 'feather', title: 'The foundation', body: 'Eight self-guided weeks every member completes.' },
]

// Your first night (the handoff's phone Home): how would you like to arrive.
export const ARRIVE = [
  { label: 'Join in', sub: 'All of it', note: 'Lovely. Your host will save you a place in the circle.' },
  { label: 'Go gently', sub: 'At my pace', note: 'Every practice can be softened. Your host will know.' },
  { label: 'Witness', sub: 'Just watch', note: 'You are welcome to sit and watch the whole night.' },
  { label: 'Not sure', sub: 'Ask me first', note: 'Your host will message you before Tuesday to talk it through.' },
]

// Foundation: eight self-guided weeks, Jan 5 to Feb 23 2027.
export const WEEKS = [
  { n: 1, date: '2027-01-05', theme: 'Arriving', focus: 'Breath and noticing what the body feels, not how it looks', practice: 'Lie down or sit. Ten slow breaths. Notice what the body feels, not how it looks. Name three sensations out loud.' },
  { n: 2, date: '2027-01-12', theme: 'Moving', focus: 'Free movement and shaking; letting the body lead', practice: 'Put on one song. Shake for the whole song, then let the body lead for one more. No steps, no mirror.' },
  { n: 3, date: '2027-01-19', theme: 'Sounding', focus: 'Breath into sound, sighing, humming, the first loud note', practice: 'Breath into sound. Sigh, hum, then the first loud note. Let it be as loud and as ugly as it wants.' },
  { n: 4, date: '2027-01-26', theme: 'Wanting', focus: 'Naming desire and appetite without apology', practice: 'Finish the sentence "I want" ten times, out loud, without apology. Write down the one that surprised you.' },
  { n: 5, date: '2027-02-02', theme: 'No and yes', focus: 'Boundaries in the body; a clear no makes a full yes possible', practice: 'Stand. Say no with the whole body, then yes. Feel where each one lives. A clear no makes a full yes possible.' },
  { n: 6, date: '2027-02-09', theme: 'Pleasure', focus: 'Sensual awareness through the senses', practice: 'A sensory pause: one taste, one texture, one scent, slowly. Savour each for a full minute.' },
  { n: 7, date: '2027-02-16', theme: 'Fire', focus: 'Anger and power as life force; moving it through', practice: 'Stamp, push against a wall, growl. Let anger move through as life force, then lie down and rest.' },
  { n: 8, date: '2027-02-23', theme: 'Wild', focus: 'Joy and play; choosing a practice to keep', practice: 'Dance for play, for the whole song. Then choose the one practice from these eight weeks you will keep.' },
]

const DAILY_PRACTICE =
  'Daily practice, 20 to 30 minutes: breath, free movement to one song, a sensory pause, and three questions. Where do I feel alive right now? What do I want? What am I holding back?'

// Twelve modules, zodiac order from Capricorn, four seasons.
export const MODULES = [
  { season: 'Winter', sign: 'Capricorn', from: 'Dec 21', title: 'Sovereignty', theme: 'Your own authority, your own rules' },
  { season: 'Winter', sign: 'Aquarius', from: 'Jan 19', title: 'Sisterhood', theme: 'Being met without competing' },
  { season: 'Winter', sign: 'Pisces', from: 'Feb 18', title: 'Flow', theme: 'Tears, softness, letting it move' },
  { season: 'Spring', sign: 'Aries', from: 'Mar 20', title: 'Rage', theme: 'Anger as life force' },
  { season: 'Spring', sign: 'Taurus', from: 'Apr 20', title: 'Pleasure', theme: 'The senses, appetite, enough' },
  { season: 'Spring', sign: 'Gemini', from: 'May 20', title: 'Voice', theme: 'Sound, saying it out loud' },
  { season: 'Summer', sign: 'Cancer', from: 'Jun 21', title: 'Mothers and daughters', theme: 'Lineage, nurture, and what you will not pass on' },
  { season: 'Summer', sign: 'Leo', from: 'Jul 22', title: 'Radiance', theme: 'Being seen and taking up space' },
  { season: 'Summer', sign: 'Virgo', from: 'Aug 23', title: 'Devotion', theme: 'Caring for yourself as you care for others' },
  { season: 'Fall', sign: 'Libra', from: 'Sep 22', title: 'Desire and boundaries', theme: 'Yes, no, and asking' },
  { season: 'Fall', sign: 'Scorpio', from: 'Oct 23', title: 'The Wild', theme: 'The parts you were told to tame' },
  { season: 'Fall', sign: 'Sagittarius', from: 'Nov 22', title: 'Freedom', theme: 'The life you want, out loud' },
]

// ── The ritual calendar (design_handoff_wildheart/components/calendar/calendarData.js, owner approved) ──
export const FESTIVALS = [
  { date: '2026-10-31', title: 'Samhain', note: 'Honour the dead · the veil is thin' },
  { date: '2026-12-21', title: 'Yule', note: 'Winter solstice · return of the light' },
  { date: '2027-02-01', title: 'Imbolc', note: 'First stirrings · Brigid, hearth and flame' },
  { date: '2027-03-20', title: 'Ostara', note: 'Spring equinox · balance, seeds' },
  { date: '2027-05-01', title: 'Beltane', note: 'Fire festival · pleasure, fertility, dance' },
  { date: '2027-06-21', title: 'Litha', note: 'Summer solstice · full sun, radiance' },
  { date: '2027-08-01', title: 'Lughnasadh', note: 'First harvest · gratitude, bread' },
  { date: '2027-09-22', title: 'Mabon', note: 'Fall equinox · balance, letting go' },
  { date: '2027-10-31', title: 'Samhain', note: 'Ancestors · the wild dark' },
  { date: '2027-12-21', title: 'Yule', note: 'Winter solstice · return of the light' },
]

export const ENROLLMENT = [
  { date: '2026-12-08', title: 'Enrollment opens' },
  { date: '2026-12-31', title: 'Enrollment closes' },
]

export const MOONS: { date: string; kind: 'new' | 'full'; name?: string }[] = [
  { date: '2026-10-26', kind: 'full', name: "Hunter's Moon" },
  { date: '2026-11-10', kind: 'new' },
  { date: '2026-11-25', kind: 'full', name: 'Beaver Moon' },
  { date: '2026-12-09', kind: 'new' },
  { date: '2026-12-24', kind: 'full', name: 'Cold Moon' },
  { date: '2027-01-08', kind: 'new' },
  { date: '2027-01-23', kind: 'full', name: 'Wolf Moon' },
  { date: '2027-02-07', kind: 'new' },
  { date: '2027-02-21', kind: 'full', name: 'Snow Moon' },
  { date: '2027-03-08', kind: 'new' },
  { date: '2027-03-23', kind: 'full', name: 'Worm Moon' },
  { date: '2027-04-07', kind: 'new' },
  { date: '2027-04-21', kind: 'full', name: 'Pink Moon' },
  { date: '2027-05-06', kind: 'new' },
  { date: '2027-05-21', kind: 'full', name: 'Flower Moon' },
  { date: '2027-06-05', kind: 'new' },
  { date: '2027-06-19', kind: 'full', name: 'Strawberry Moon' },
  { date: '2027-07-04', kind: 'new' },
  { date: '2027-07-19', kind: 'full', name: 'Buck Moon' },
  { date: '2027-08-03', kind: 'new' },
  { date: '2027-08-17', kind: 'full', name: 'Sturgeon Moon' },
  { date: '2027-09-01', kind: 'new' },
  { date: '2027-09-16', kind: 'full', name: 'Harvest Moon' },
  { date: '2027-10-01', kind: 'new' },
  { date: '2027-10-16', kind: 'full', name: "Hunter's Moon" },
  { date: '2027-10-30', kind: 'new' },
  { date: '2027-11-14', kind: 'full', name: 'Beaver Moon' },
  { date: '2027-11-29', kind: 'new' },
  { date: '2027-12-14', kind: 'full', name: 'Cold Moon' },
  { date: '2027-12-28', kind: 'new' },
]

export const HEARTH = [
  { date: '2027-02-06', note: 'Imbolc · with Hearts on Fire' },
  { date: '2027-05-01', note: 'Beltane · with Hearts on Fire' },
  { date: '2027-08-07', note: 'Lammas · with Hearts on Fire' },
]

// Circle Night: every other Tuesday, 6:00 to 7:30 PM PT, in person. The owner's calendar runs the
// cadence through Tue 2026-10-20 and lands on 2027-03-09 twenty weeks later; 2026-11-03 is the first
// Tuesday after 2026-10-20 ON that cadence, so the anchor keeps every date the owner approved.
const CIRCLE_NIGHT_ANCHOR = '2026-11-03'
const CIRCLE_NIGHT_RULE = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU'
// The first 60 days of occurrences, as lib/event-recurrence.ts generateOccurrencesForAnchor mints
// them (HORIZON_DAYS = 60, the anchor itself excluded, one row per landing day).
const CIRCLE_NIGHT_OCCURRENCES = ['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']

export const RETREAT = { start: '2027-10-29', end: '2027-10-31' }

// ── Event rows ────────────────────────────────────────────────────────────────────────────────
export interface SeedEvent {
  slug: string
  title: string
  description: string
  date: string
  start: string
  endDate?: string
  end: string
  energy: 'high_activation' | 'grounding' | 'social' | 'ceremonial' | null
  journey: 'foundation' | null
  recurrence?: { type: 'weekly'; rule: string }
}

export function buildEvents(): SeedEvent[] {
  const out: SeedEvent[] = []
  out.push({
    slug: `wildheart-circle-night-${CIRCLE_NIGHT_ANCHOR}`,
    title: 'Circle Night',
    description:
      'In person · every other Tuesday · 90 minutes\nFive beats: Presence, Unite, Lead, Settle, Exhale. Your first night, your way: join in, go gently, witness or pass.',
    date: CIRCLE_NIGHT_ANCHOR,
    start: '18:00',
    end: '19:30',
    energy: null,
    journey: null,
    recurrence: { type: 'weekly', rule: CIRCLE_NIGHT_RULE },
  })
  for (const e of ENROLLMENT) {
    out.push({
      slug: `wildheart-${e.title.toLowerCase().replace(/ /g, '-')}-${e.date}`,
      title: e.title,
      description: 'Dec 8 – 31 · once a year\nEnrollment for the 2027 year. Join the Space and one circle, then begin the Foundation in January.',
      date: e.date,
      start: '00:00',
      end: '23:59',
      energy: null,
      journey: null,
    })
  }
  for (const w of WEEKS) {
    out.push({
      slug: `wildheart-foundation-week-${w.n}`,
      title: `Week ${w.n} · ${w.theme}`,
      description: `The Foundation, week ${w.n} of 8\n${w.focus}. New members start here before their first Circle Night.`,
      date: w.date,
      start: '18:00',
      end: '19:30',
      energy: null,
      journey: 'foundation',
    })
  }
  for (const f of FESTIVALS) {
    out.push({
      slug: `wildheart-${f.title.toLowerCase()}-${f.date}`,
      title: f.title,
      description: `${f.note}\nOne of the eight festivals of the Wheel of the Year. Every circle gathers.`,
      date: f.date,
      start: '18:00',
      end: '20:00',
      energy: 'ceremonial',
      journey: null,
    })
  }
  for (const m of MOONS) {
    const full = m.kind === 'full'
    out.push({
      slug: `wildheart-${full ? 'full-moon' : 'new-moon'}-${m.date}`,
      title: full ? m.name! : 'New moon',
      description: full
        ? 'Full moon esbat · release\nA full moon esbat: release what is finished and let it go.'
        : 'Intention circle · plant\nA new moon intention circle: plant what you want next.',
      date: m.date,
      start: '18:00',
      end: '19:30',
      energy: full ? 'ceremonial' : 'grounding',
      journey: null,
    })
  }
  for (const h of HEARTH) {
    out.push({
      slug: `wildheart-hearth-gathering-${h.date}`,
      title: 'Hearth Gathering',
      description: `${h.note}\nEvery Wildheart and Hearts on Fire circle, together for a morning.`,
      date: h.date,
      start: '10:00',
      end: '14:00',
      energy: 'social',
      journey: null,
    })
  }
  out.push({
    slug: `wildheart-retreat-${RETREAT.start}`,
    title: 'Wildheart Retreat',
    description:
      'Samhain weekend · same weekend as the HoF Desert Retreat\nThree nights in the wild dark on Samhain weekend. Friday: arrive, the threshold, fire lit, circle cast, the first sound. Saturday: the ancestors, movement, rage, release, and a night vigil. Sunday: the new year, rest, intentions, and joy before home. The same weekend as the Hearts on Fire Desert Retreat, held separately. Location, cost and what to bring post here first.',
    date: RETREAT.start,
    start: '18:00',
    endDate: RETREAT.end,
    end: '12:00',
    energy: 'ceremonial',
    journey: null,
  })
  return out
}

// ── Journeys ──────────────────────────────────────────────────────────────────────────────────
export const FOUNDATION = {
  id: uuidFrom('journey:foundation'),
  slug: 'wildheart-foundation',
  title: 'Wildheart Foundation',
  summary: 'Where every woman starts. Eight self-guided weeks to come back into your body, find your sound, name what you want, and choose a practice to keep.',
  intro:
    'Most women were taught to hold it all together: to be capable, contained and quietly tired. The Foundation is eight weeks of letting what is inside move out. One theme a week, from arriving in the body to going wild, with a short daily practice and a check-in from your host along the way. It is practice and community, not therapy. Every practice is an invitation: join in, go gently, witness or pass.',
  category: 'Inner Work',
  difficulty: 'standard',
  tags: ['women', 'embodiment', 'movement', 'voice', 'daily practice', 'breathwork'],
  dailyMinutes: 25,
  enrollCap: 12,
  meeting: {
    format: 'in_person',
    schedule: 'Tuesdays at 6:00 PM, Jan 5 to Feb 23',
    timezone: TZ,
    location: null,
    link: null,
    notes: 'Eight sessions, 90 minutes each, one a week. Self-guided between sessions, with host check-ins.',
    eventId: null,
    gathering: null,
  },
}

export const YEAR = {
  id: uuidFrom('journey:year'),
  slug: 'the-wildheart-year',
  title: 'The Wildheart Year',
  summary: 'Twelve modules, one per sign, across four seasons: from Sovereignty in Capricorn to Freedom in Sagittarius. A circle can join in any month and pick up the current module.',
  intro:
    'The year follows the seasons and the twelve signs, on the same calendar as Hearts on Fire so both circles are in the same sign at the same time. Each module gets about two Circle Nights, a daily practice focus for the weeks between, and an optional ritual on the new or full moon in that sign. Winter is for rest and root. Spring rises. Summer blooms. Fall goes wild.',
  category: 'Inner Work',
  difficulty: 'standard',
  tags: ['women', 'embodiment', 'seasons', 'astrology', 'circle'],
  dailyMinutes: 20,
  enrollCap: null as number | null,
  meeting: {
    format: 'in_person',
    schedule: 'Every other Tuesday at 6:00 PM',
    timezone: TZ,
    location: null,
    link: null,
    notes: 'Circle Night every other week, 90 minutes, in person.',
    eventId: null,
    gathering: null,
  },
}

export interface SeedItem {
  id: string
  plan: 'foundation' | 'year'
  block_type: 'phase' | 'module' | 'lesson'
  parent_id: string | null
  title: string
  body: string | null
  sort_order: number
  required: boolean
  est_minutes: number | null
  cadence: string | null
}

export function buildItems(): SeedItem[] {
  const items: SeedItem[] = []
  for (const w of WEEKS) {
    const phase = uuidFrom(`foundation:phase:${w.n}`)
    const mod = uuidFrom(`foundation:module:${w.n}`)
    const lesson = uuidFrom(`foundation:lesson:${w.n}`)
    items.push({ id: phase, plan: 'foundation', block_type: 'phase', parent_id: null, title: `Week ${w.n} · ${w.theme}`, body: w.focus, sort_order: w.n - 1, required: true, est_minutes: null, cadence: null })
    items.push({ id: mod, plan: 'foundation', block_type: 'module', parent_id: phase, title: w.theme, body: `Week ${w.n} of 8. One session on Tuesday ${w.date} at 6:00 PM, then the daily practice at home.`, sort_order: 0, required: true, est_minutes: null, cadence: null })
    items.push({ id: lesson, plan: 'foundation', block_type: 'lesson', parent_id: mod, title: `${w.theme}: this week's practice`, body: `This week: ${w.practice}\n\n${DAILY_PRACTICE}`, sort_order: 0, required: true, est_minutes: 25, cadence: 'Daily' })
  }
  MODULES.forEach((m, i) => {
    const phase = uuidFrom(`year:phase:${m.sign}`)
    const mod = uuidFrom(`year:module:${m.sign}`)
    items.push({ id: phase, plan: 'year', block_type: 'phase', parent_id: null, title: `${m.sign}: ${m.title}`, body: `${m.season}, from ${m.from}. ${m.theme}.`, sort_order: i, required: true, est_minutes: null, cadence: null })
    items.push({ id: mod, plan: 'year', block_type: 'module', parent_id: phase, title: m.title, body: `Two Circle Night plans, each with a practice, a teaching and a round question. A daily practice focus for the weeks between. An optional ritual on the new or full moon in ${m.sign}. A host note: what tends to come up, and what to watch for.`, sort_order: 0, required: true, est_minutes: null, cadence: null })
  })
  return items
}

// ── Program (lib/channels/programs.ts createSpaceProgram shape) ────────────────────────────────
const PROGRAM = {
  templateId: uuidFrom('program:template'),
  channelId: uuidFrom('program:channel'),
  slug: 'wildheart',
  name: 'Wildheart',
  oneLiner: 'A year-round circle for women: come home to your body and take up space.',
  // One of the categories topical_channels already uses in production; the code's default is
  // 'business-support', which does not fit a women's embodiment circle.
  category: 'movement',
}

export const CIRCLE = {
  name: 'Primary Circle',
  slug: 'wildheart-primary-circle',
  about: 'The founding circle. Host training runs from here.',
  neighborhood: 'Central',
  memberCap: 12,
  primaryPillar: 'body',
  meetup: { text: 'Tuesdays · 6 PM', length: '90 minutes' },
}

/** The three local circles beside the primary one (the handoff's Circles page), seeded as real rows the
 *  Circles block draws: a name, an area, a night, a note and a cap of twelve. Hosts are the owner until a
 *  trained host takes each one (the handoff's host names are placeholders). Seat counts are the rows'. */
export const CIRCLES_MORE = [
  { id: uuidFrom('circle:eastside'), name: 'Eastside', slug: 'wildheart-eastside', neighborhood: 'East', about: 'One seat from seeding a second circle.', status: 'active', meetup: { text: 'Tuesdays · 6 PM', length: '90 minutes' } },
  { id: uuidFrom('circle:foothills'), name: 'Foothills', slug: 'wildheart-foothills', neighborhood: 'North', about: 'Full at twelve. Seeding a new circle in Spring.', status: 'active', meetup: { text: 'Thursdays · 6:30 PM', length: '90 minutes' } },
  { id: uuidFrom('circle:riverside'), name: 'Riverside', slug: 'wildheart-riverside', neighborhood: 'West', about: 'Opens when six women commit.', status: 'forming', meetup: { text: 'Forming', length: '90 minutes' } },
]

/** The website footer's own words (lib/sites/site-footer.ts), the handoff's columns and lines. */
export const SITE_FOOTER = {
  columns: [
    { title: 'The program', links: [{ label: 'How it works', href: `/spaces/${SLUG}/program` }, { label: 'The sky map', href: `/spaces/${SLUG}/the-year` }, { label: 'Samhain retreat', href: `/spaces/${SLUG}/retreat` }] },
    { title: 'Circles', links: [{ label: 'Find a circle', href: `/spaces/${SLUG}/circles` }, { label: 'Become a host', href: `/spaces/${SLUG}/circles` }, { label: 'About', href: `/spaces/${SLUG}/about` }] },
    { title: 'On Frequency', links: [{ label: 'The Wildheart Space', href: `/spaces/${SLUG}` }, { label: 'Hearth Gatherings', href: `/spaces/${SLUG}/calendar` }] },
  ],
  blurb: 'A year-round circle for women, run as one Space on Frequency with local circles that share a curriculum, a rhythm and a year.',
  line: 'Women-only · Invitation, never instruction · No photos · What is shared stays here',
  note: 'Practice and community, not therapy or crisis care.',
  suffix: 'A program on Frequency',
}

// ── Page docs (the shape lib/sites/editor/seed.ts and Hearts on Fire's pageDocs use) ──────────
type Block = { type: string; props: Record<string, unknown> }
const doc = (blocks: Block[]) => ({ root: { props: {} }, content: blocks })
const cards = (rows: { icon?: string; title: string; body: string }[]) => rows.map((r) => ({ icon: r.icon ?? '', title: r.title, body: r.body }))

/** The twelve modules as the season band and sky blocks read them, in the order the year walks them. */
const MODULE_ROWS = MODULES.map((m) => ({ sign: m.sign.toLowerCase(), title: m.title, theme: m.theme }))
const BEATS = PULSE.map((b) => ({ letter: b.icon, word: b.title }))
const RETREAT_DAYS = [
  { label: 'Fri · Arrive', title: 'The threshold', body: 'Fire lit, circle cast, the first sound.' },
  { label: 'Sat · Samhain', title: 'The ancestors', body: 'Movement, rage, release, and a night vigil.', accent: true },
  { label: 'Sun · Return', title: 'The new year', body: 'Rest, intentions, and joy before home.' },
]
const PAGE = (slug: string) => `/spaces/${SLUG}/${slug}`
const CONTACT = PAGE('contact')
const desktop = { spaceTop: 'default', spaceBottom: 'default', visibility: 'desktop' }
const mobile = { spaceTop: 'default', spaceBottom: 'default', visibility: 'mobile' }

/** The year journey's program stops: matched in the Space's own event titles, worded as the handoff words them. */
const PROGRAM_STOPS = [
  { match: 'Enrollment opens', after: '', title: 'Enrollment opens', note: 'Dec 8 – 31 · once a year', teach: 'The program year starts with winter: enroll in December, begin the foundation in January.' },
  { match: 'Week 1', after: '', title: 'Foundation begins', note: 'Week 1 · Arriving · Tuesdays 6 PM', teach: 'Eight weeks through Capricorn and Aquarius, the rest-and-root season.' },
  { match: 'Circle Night', after: 'Week 8', title: 'Circle Nights begin', note: 'Every other Tuesday · 6 PM', teach: 'After the foundation, circles meet every other week all year, moving through one module per sign.' },
  { match: 'Retreat', after: '', title: 'Wildheart Retreat', note: 'Oct 29 – 31 · Samhain weekend', teach: 'The year turns on the thinnest night. Every circle gathers together for three days.' },
]

const RETREAT_BAND = {
  image: PHOTOS.forest,
  seal: 'scorpio',
  label: 'Samhain weekend · Oct 29 – 31, 2027',
  heading: 'Three nights in the *wild dark.*',
  lead: 'The year turns on the thinnest night. Every Wildheart circle gathers to honour what has ended, move what is held, and walk back into the light together.',
  days: RETREAT_DAYS,
  ctaLabel: 'Hold my place',
  ctaHref: PAGE('retreat'),
  secondaryLabel: 'See the weekend',
  secondaryHref: PAGE('retreat'),
  note: 'Same weekend as the Hearts on Fire Desert Retreat · held separately',
}

// The six screens of the design handoff (Website.html, 2026-10-13), top to bottom, every section a
// registered block carrying the handoff's own words: the theme's sections dress the generic blocks, the
// Wildheart blocks carry the pieces no generic block can (components/page-editor/blocks/wildheart.tsx).
// The Space's own rows draw the dates, the circles and the journeys (SpaceEvents, SpaceCommunity,
// SpacePractices, the season band, the year journey and the sky map read them at render time); the
// words here are the narrative. A phone (under the editor's mobile line) gets the handoff's mobile Home:
// the short hero, Tonight's sky, Your first night and the retreat, through the blocks' visibility field.
export function buildPageDocs(): Record<string, unknown> {
  const home = doc([
    { type: 'PhotoHero', props: { id: 'wh-home-hero', variant: 'image', display: 'beside', image: PHOTOS.hands, alt: "Women's hands joined at the centre of a circle", eyebrow: SITE_HERO.eyebrow, title: 'For every woman who wants to be *free.*', subtitle: SITE_HERO.tagline, actionPrimaryLabel: 'Come to one Circle Night', actionPrimaryHref: PAGE('circles'), actionSecondaryLabel: 'How it works', actionSecondaryHref: PAGE('program'), note: 'Join in, go gently, or simply witness.', layout: desktop } },
    { type: 'PhotoHero', props: { id: 'wh-home-hero-m', variant: 'image', display: 'beside', image: PHOTOS.hands, alt: "Women's hands joined in a circle", eyebrow: '', title: 'For every woman who wants to be *free.*', subtitle: 'A year-round circle for women. Every other week: move, breathe, make noise, laugh. Come once and see what wakes up.', actionPrimaryLabel: 'Come to one Circle Night', actionPrimaryHref: PAGE('circles'), layout: mobile } },
    { type: 'WildheartOrnament', props: { id: 'wh-home-bridge', variant: 'bridge', label: 'Enter the year', layout: desktop } },
    { type: 'WildheartYearJourney', props: { id: 'wh-home-journey', label: 'The year · how the sky and the calendar overlay', heading: 'Twelve signs, eight festivals, *every moon.*', lead: "Scroll, or spin the wheel and let it coast. The needle at the top reads all four rings at once: the date, the sun's sign, the season and the moon.", year: 2027, modules: MODULE_ROWS, programStops: PROGRAM_STOPS, enrollHref: PAGE('circles'), yearHref: PAGE('the-year'), layout: desktop } },
    { type: 'WildheartSkyMap', props: { id: 'wh-home-sky-m', label: "Tonight's sky", heading: 'Where we are in the year', lead: '', year: 2027, wheel: 'compact', modules: MODULE_ROWS, layout: mobile } },
    { type: 'WildheartFirstNight', props: { id: 'wh-home-first-m', label: 'Your first night', gatheringLabel: 'Circle Night', heading: 'Come as you are.', question: 'How would you like to arrive?', options: ARRIVE, chosenLabel: 'Chosen', ctaLabel: 'Save my place', ctaHref: CONTACT, layout: mobile } },
    { type: 'CardGrid', props: { id: 'wh-home-parts', role: 'feature', eyebrow: '', title: '', columns: 4, cards: cards(PARTS), layout: desktop } },
    { type: 'WildheartMoonPath', props: { id: 'wh-home-path', label: 'The member path', heading: 'Wax at your own pace.', note: 'New moon to full · lowest exposure first', steps: PATH, layout: desktop } },
    { type: 'WildheartOrnament', props: { id: 'wh-home-ornament', variant: 'phases', layout: desktop } },
    { type: 'WildheartSeasonBand', props: { id: 'wh-home-season', heading: 'This season, we go *wild.*', image: PHOTOS.cacao, alt: 'Hands raising cacao cups together', modules: MODULE_ROWS, nowNote: 'Two Circle Nights, a daily practice focus and an optional full moon ritual.', gatheringLabel: 'Circle Night', gatheringNote: 'every circle on the same module.', beats: BEATS, ritualsLabel: 'Next rituals', ctaLabel: 'Visit this night', ctaHref: PAGE('circles'), yearLabel: 'See the year →', yearHref: PAGE('the-year'), layout: desktop } },
    { type: 'Zigzag', props: { id: 'wh-home-circle-night', image: PHOTOS.shore, alt: 'Women embracing on a grey shore', eyebrow: 'Circle Night', title: 'Every circle moves through the same *five beats.*', body: 'list', lead: 'Ninety minutes, every other week, in person. A woman can walk into any circle and know where she is.', items: PULSE.map((b) => ({ text: `${b.icon} · ${b.title} · ${b.body}` })), mediaSide: 'left', layout: desktop } },
    { type: 'WildheartSealCards', props: { id: 'wh-home-pillars', label: 'The four pillars', heading: 'Feel it, enjoy it, sound it, *play.*', columns: 4, cards: PILLARS, layout: desktop } },
    { type: 'WildheartRetreatBand', props: { id: 'wh-home-retreat', alt: 'Tattooed hands and a fern pressed to a tree', ...RETREAT_BAND, layout: desktop } },
    { type: 'WildheartRetreatBand', props: { id: 'wh-home-retreat-m', image: PHOTOS.forest, alt: 'Tattooed hands and fern on a tree', seal: '', label: 'Samhain weekend · Oct 29 – 31, 2027', heading: 'Three nights in the *wild dark.*', days: [], ctaLabel: 'Hold my place', ctaHref: PAGE('retreat'), layout: mobile } },
    { type: 'AccentBeat', props: { id: 'wh-home-join', mode: 'cta', background: 'plain', eyebrow: 'Enrollment for 2027 opens Dec 8', title: 'Come once and see what *wakes up.*', body: '', ctaLabel: 'Find a circle', ctaHref: PAGE('circles'), ctaSecondaryLabel: 'About Wildheart', ctaSecondaryHref: PAGE('about'), layout: desktop } },
  ])

  const program = doc([
    { type: 'PhotoHero', props: { id: 'wh-program-hero', variant: 'image', display: 'beside', image: PHOTOS.cacao, alt: 'Cacao ceremony', eyebrow: 'The program', title: 'Come home to your body. *Take up space.*', subtitle: 'Circles of 6 to 12 women and a trained host. One rhythm for every gathering, four pillars all year, and an eight-week foundation every member completes when she joins.' } },
    { type: 'WildheartMoonStrip', props: { id: 'wh-program-moons', heading: 'The foundation · eight Tuesdays', label: 'Jan 5 – Feb 23, 2027', total: 8, done: 0 } },
    { type: 'SpacePractices', props: { id: 'wh-program-journeys', eyebrow: '', heading: '', journeysHeading: '', practicesHeading: '', only: 'foundation' } },
    { type: 'CardGrid', props: { id: 'wh-program-daily', role: 'list', columns: 2, cards: [
      { icon: '', title: 'Daily practice · 20 to 30 minutes', body: 'Breath, one song of free movement, a sensory pause, and three questions.\nWhere do I feel alive right now?\nWhat do I want?\nWhat am I holding back?' },
      { icon: '', title: 'Consent, safety and care', body: SAFETY.join('\n') },
    ] } },
  ])

  const theYear = doc([
    { type: 'PhotoHero', props: { id: 'wh-year-hero', variant: 'text-only', eyebrow: 'The year', title: 'The turning year', subtitle: 'Tap a sign, spin the year or step through it sign by sign. Each sign is a module; filter the festivals, moons, Circle Nights and gatherings that fall inside it.' } },
    { type: 'WildheartSkyMap', props: { id: 'wh-year-skymap', label: '', heading: '', lead: '', year: 2027, wheel: 'centered', modules: MODULE_ROWS } },
    { type: 'WildheartModules', props: { id: 'wh-year-modules', heading: 'Twelve modules', modules: MODULE_ROWS } },
  ])

  const circles = doc([
    { type: 'PhotoHero', props: { id: 'wh-circles-hero', variant: 'image', display: 'beside', image: PHOTOS.huddle, alt: 'Women in a group hug outdoors', eyebrow: 'Circles', title: 'Find your *sisters.*', subtitle: 'Women-only, led by women. Circles meet every other Tuesday, on the same nights as Hearts on Fire. At twelve, a circle seeds a new one.' } },
    { type: 'SpaceCommunity', props: { id: 'wh-circles-community', eyebrow: '', heading: '', layout: 'grid', seatNoun: 'women' } },
    { type: 'AccentBeat', props: { id: 'wh-circles-first', mode: 'cta', background: 'accent-wash', eyebrow: 'Your first night, your way', title: 'Every practice is an invitation.', body: 'Join in, go gently, witness or pass. No explanation needed. Eyes open is always fine.', ctaLabel: 'Save my place', ctaHref: CONTACT, ctaSecondaryLabel: 'Just witness', ctaSecondaryHref: CONTACT } },
  ])

  const retreat = doc([
    { type: 'PhotoHero', props: { id: 'wh-retreat-hero', variant: 'image', display: 'beside', image: PHOTOS.forest, alt: 'Tattooed hands and a fern pressed to a tree', eyebrow: 'Samhain weekend · Oct 29 – 31, 2027', title: 'The Wildheart *Retreat*', subtitle: 'Three days on the thinnest night of the year, the same weekend as the Hearts on Fire Desert Retreat and held separately. Every circle together, in the wild dark.', actionPrimaryLabel: 'Hold my place', actionPrimaryHref: CONTACT } },
  ])

  const about = doc([
    { type: 'WildheartMarkSplit', props: { id: 'wh-about-mark', label: 'About', heading: 'A call to every woman who wants to be *free.*', lead: "Wildheart is the women's branch of Hearth, a year-round circle and the sister to Hearts on Fire. It teaches women to come back into their bodies and let what is inside move out: in movement, voice, pleasure, play and presence. It is a place to take up space without apology.", body: 'Wildheart is for women 25 to 55 who look capable from the outside and feel contained, tired or quietly disconnected from their own bodies and desires.', note: 'Wildheart is practice and community, not therapy or crisis care. Every host has a written referral route for a woman who needs more than the circle can give.' } },
  ])

  return { home, program, 'the-year': theYear, circles, retreat, about }
}

// ── Profile layout (the Space profile rail, HoF's shape) ─────────────────────────────────────
const PROFILE_LAYOUT = {
  rows: [
    { id: 'r0', columns: 1, cells: [['editorial', 'zigzag', 'cardGrid']] },
    { id: 'r1', columns: 1, cells: [['offerings']], title: 'Join', headerOn: true },
    { id: 'r2', columns: 1, cells: [['faq']] },
    { id: 'r3', columns: 1, cells: [['accentBeat']] },
    { id: 'r4', columns: 2, cells: [['contact'], ['business']], title: 'Contact and details', headerOn: true },
  ],
  content: {
    about: { eyebrow: 'About', title: 'About this space', body: ABOUT },
    story: { eyebrow: 'About', title: 'Our story', body: ABOUT },
    editorial: {
      eyebrow: 'a year-round circle for women',
      title: 'Wildheart',
      body: 'Most women were taught to hold it all together: to look capable, stay contained, and keep everyone else going. Far fewer were taught to come back into their bodies and let what is inside move out.<br><br>Wildheart is a year of doing that together. You join a circle of 6 to 12 women and meet every other week. You move, breathe, make noise, laugh and feel at home in your body. It is not therapy. It is practice and community alongside other women.',
    },
    zigzag: {
      title: 'How it works',
      body: 'Each Circle Night has five beats: Presence, Unite, Lead, Settle, Exhale. Every practice is an invitation. Join in, go gently, witness or pass.<br><br>The year follows the seasons and the twelve signs, from Sovereignty in Capricorn to Freedom in Sagittarius. The eight festivals and every moon fall inside it, and on Samhain weekend every circle gathers for the retreat.<br><br>Every woman starts with the same Foundation: eight self-guided weeks in breath, movement, sound, wanting and play, with your host checking in along the way.',
      mediaSide: 'right',
      aspect: 'vertical',
    },
    cardGrid: {
      eyebrow: '90 minutes, every other week',
      title: 'A year of Circle Nights, festivals and moons, all in person.',
      subtitle: 'Meet the same women, every season. Every circle is in the same sign at the same time.',
      columns: '2',
      shadow: false,
      cards: [
        { icon: '1', title: 'Sisters', text: 'Who know your name' },
        { icon: '2', title: 'Circle Night', text: 'Every other Tuesday, 90 minutes, in person' },
        { icon: '3', title: 'A daily practice', text: 'Breath, one song, a pause, three questions' },
        { title: 'The eight festivals and every moon', text: 'Including the Samhain retreat' },
        { title: 'A path forward', text: 'To host your own circle' },
      ],
    },
    offerings: { items: ['Circle Night', 'Year-round membership'] },
    accentBeat: { title: 'Come to one Circle Night', body: 'Join in, go gently, witness or pass.', buttonLabel: 'Save my place', buttonUrl: `/spaces/${SLUG}` },
  },
}

// ── Program overview (markdown, HoF's shape: the Vision document) ────────────────────────────
function buildProgramOverview(): string {
  const table = (head: string[], rows: string[][]) =>
    [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
  return [
    '_Master overview, Oct 12, 2026. Daniel Tyack._',
    '',
    '## What Wildheart is',
    '',
    "Wildheart is the women's branch of Hearth, a year-round circle and the sister to Hearts on Fire: a call to every woman who wants to be free.",
    '',
    'Where Hearts on Fire teaches men to turn inward and feel, Wildheart teaches women to come back into their bodies and let what is inside move out: in movement, voice, pleasure, play and presence. It is a place to take up space without apology. It runs on the same chassis as Hearts on Fire.',
    '',
    '- **The circles.** Small groups of 6 to 12 women who meet every other week, in person, all year.',
    '- **The meeting framework.** One repeatable rhythm for every gathering, simple enough for a new host to learn.',
    '- **The master curriculum.** Twelve modules that follow the four seasons and the twelve signs.',
    '- **The foundation course.** Eight self-guided weeks every member completes when she joins.',
    '',
    '> The program is built to grow by adding circles, not by making any one circle bigger. At 12 women, a circle seeds a new one.',
    '',
    '## The mirror',
    '',
    'The two programs share one structure and point in opposite directions: Hearts on Fire moves men inward, Wildheart moves women outward.',
    '',
    table(['', 'Hearts on Fire', 'Wildheart'], [
      ['The call', 'Light up. Find the fire and carry it together.', 'Be free. Come home to your body and take up space.'],
      ['Direction', 'Inward: from doing and fixing to feeling', 'Outward: from holding and containing to expressing'],
      ['What they reclaim', 'Sensation, emotion, the right to slow down', 'Voice, appetite, pleasure, anger, the right to be seen'],
      ['Core practices', 'Stillness, breath, meditation, honest check-ins', 'Movement, breath, sound and voice, sensual awareness, play'],
      ['Energy of the room', 'Steady, contained, grounded', 'Alive, loud when it wants to be, warm'],
      ['Fire image', 'A flame that is tended and held', 'A wildfire that is allowed to burn'],
    ]),
    '',
    "## Who it's for",
    '',
    'Women 25 to 55 who look capable from the outside and feel contained, tired or quietly disconnected from their own bodies and desires. What they want: to feel alive again, to be met by other women, to stop shrinking, and to enjoy their bodies and their lives. The gap is not having someone to talk to. It is having somewhere to stop holding everyone else and be fully themselves.',
    '',
    table(['Need', 'Design response'], [
      ['A women-only space where they feel safe', 'Circles are women-only; safety and trust are stated, not assumed'],
      ['Choice and control', 'Every practice is an invitation; any woman can watch, modify or pass'],
      ['Somewhere to be the one who receives', 'Circle Night is the one place she is not hosting, managing or fixing'],
      ['Back into the body, out of the mirror', 'Practices focus on how the body feels, never how it looks'],
      ['Permission to move, sound and play', 'Movement is the core daily and in-room practice, not an add-on'],
    ]),
    '',
    '## Structure on Frequency',
    '',
    'One Space on Frequency, a primary circle, local circles, and shared events. Circles of 6 to 12 women and a trained host; at 12 a circle seeds a second one.',
    '',
    '## The member path',
    '',
    ...PATH.map((p, i) => `${i + 1}. **${p.title}.** ${p.body}`),
    '',
    '## The foundation course',
    '',
    'Eight self-guided weeks, Tuesdays at 6:00 PM from Jan 5 to Feb 23, 2027, with host check-ins. It mirrors the men\'s intro, reversed in direction.',
    '',
    table(['Week', 'Theme', 'Focus'], WEEKS.map((w) => [String(w.n), w.theme, w.focus])),
    '',
    `_${DAILY_PRACTICE}_`,
    '',
    '## Circle Night, on the PULSE rhythm',
    '',
    'Every Circle Night follows the same five beats, 90 minutes, every other week, in person. A woman can walk into any circle and know where she is.',
    '',
    table(['Beat', 'In a Wildheart circle'], PULSE.map((b) => [b.title, b.body])),
    '',
    '## The four practice pillars',
    '',
    'Every module draws on four pillars, so a woman builds the same capacities all year in different forms.',
    '',
    ...PILLARS.map((p) => `- **${p.title}.** ${p.body}`),
    '',
    'Sensuality, defined for this program: aliveness through the senses. Never sexual activity in the circle, never touch without explicit opt-in consent, never performance.',
    '',
    '## Master curriculum',
    '',
    'Twelve modules, one per sign, in four seasons, on the same calendar as Hearts on Fire so both circles are in the same sign at the same time. With Circle Night every other week, each module gets about two meetings.',
    '',
    table(['Season', 'Sign', 'Starts', 'Wildheart module'], MODULES.map((m) => [m.season, m.sign, m.from, `${m.title}: ${m.theme}`])),
    '',
    '_Sign dates are approximate and should be computed for each year._',
    '',
    '## The year',
    '',
    'The eight festivals of the Wheel of the Year (Imbolc, Ostara, Beltane, Litha, Lammas, Mabon, Samhain, Yule), a full moon circle to release and a new moon circle to plant every month, three Hearth Gatherings with Hearts on Fire, and the Wildheart Retreat on Samhain weekend, Oct 29 to 31, 2027: the same weekend as the Hearts on Fire Desert Retreat, held separately.',
    '',
    '## Consent, safety and care',
    '',
    'Sensual and embodied work only feels free when it is safe, so safety is designed in, not left to the host\'s instinct.',
    '',
    ...SAFETY.map((s) => `- ${s}`),
    '',
    'Wildheart is practice and community, not therapy or crisis care. Hosts train in trauma-informed facilitation and hold a written referral route.',
    '',
    '## Voice and messaging',
    '',
    'Warm and bold, as an invitation: never a fix, never a sales pitch about what is wrong with her.',
    '',
    table(['Use', 'Avoid'], [
      ['Free, alive, wild, whole, take up space, move, sound, joy, pleasure, sisters, circle', 'Fix, heal yourself, glow up, goddess cliches, "too much", body-shape language'],
      ['Invitation: come as you are, join in or witness', 'Pressure: "break through", "transform in 8 weeks"'],
      ['The body as felt from inside', 'Images that show bodies to be looked at'],
    ]),
    '',
    '## Open decisions',
    '',
    table(['Decision', 'Status'], [
      ['Who leads', 'Open. A woman as founding lead and primary circle host.'],
      ['Age range', 'Open. Keep 25 to 55, or open wider.'],
      ['Money', 'Open. Membership price, what hosts receive, how shared events are funded.'],
      ['Circle Night timing', 'Settled. Same Tuesdays as Hearts on Fire, 6 PM, every other week.'],
      ['Shared gatherings', 'Settled. Hearth Gatherings and a same-weekend retreat.'],
    ]),
  ].join('\n')
}

// The preferences keys this seed writes. NOT here: theme (stock theme at launch) and websitePublished
// (the owner publishes by hand). Merged over the existing preferences, so any other key survives.
export function buildPreferences(): Record<string, unknown> {
  return {
    pages: PAGES,
    pageDocs: buildPageDocs(),
    siteHero: SITE_HERO,
    coverScrim: 'none',
    logoBackdrop: 'none',
    profileData: PROFILE_DATA,
    profileLayout: PROFILE_LAYOUT,
    programOverview: buildProgramOverview(),
    siteFooter: SITE_FOOTER,
    profilePublished: true,
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────────────────────
/** The UTC offset of `tz` at instant `ms`, in milliseconds (DST-aware, no library). */
function tzOffsetMs(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms))
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value)
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms
}
/** A Pacific wall-clock date + time as a UTC ISO instant. */
function ptIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - tzOffsetMs(guess)
  const again = tzOffsetMs(t)
  if (again !== tzOffsetMs(guess)) t = guess - again
  return new Date(t).toISOString()
}

// ── SQL mode ──────────────────────────────────────────────────────────────────────────────────
const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`)
const qj = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`
const qarr = (v: string[]): string => `array[${v.map(q).join(', ')}]::text[]`
const pt = (date: string, time: string) => `(timestamp '${date} ${time}' at time zone '${TZ}')`

function sqlEventInsert(e: SeedEvent): string {
  const journey = e.journey === 'foundation' ? `(select id from journey_plans where slug = ${q(FOUNDATION.slug)})` : 'null'
  return `insert into events (slug, title, description, host_id, scope_id, scope_type, starts_at, ends_at, time_zone, visibility, status, published_at, join_mode, category, energy_tag, attendance_mode, source, space_id, host_space_id, journey_id, recurrence_type, recurrence_rule, is_cancelled)
values (${q(e.slug)}, ${q(e.title)}, ${q(e.description)}, ${q(OWNER_ID)}, (select region_id from _wh), 'public', ${pt(e.date, e.start)}, ${pt(e.endDate ?? e.date, e.end)}, ${q(TZ)}, 'public', 'published', now(), 'rsvp', 'gathering', ${q(e.energy)}, 'in_person', 'manual', ${q(SPACE_ID)}, ${q(SPACE_ID)}, ${journey}, ${q(e.recurrence?.type ?? 'none')}, ${q(e.recurrence?.rule ?? null)}, false)
on conflict (slug) do update set title = excluded.title, description = excluded.description, host_id = excluded.host_id, scope_id = excluded.scope_id, scope_type = excluded.scope_type, starts_at = excluded.starts_at, ends_at = excluded.ends_at, time_zone = excluded.time_zone, visibility = excluded.visibility, status = excluded.status, published_at = coalesce(events.published_at, excluded.published_at), join_mode = excluded.join_mode, category = excluded.category, energy_tag = excluded.energy_tag, attendance_mode = excluded.attendance_mode, space_id = excluded.space_id, host_space_id = excluded.host_space_id, journey_id = excluded.journey_id, recurrence_type = excluded.recurrence_type, recurrence_rule = excluded.recurrence_rule;`
}

function sqlItemInsert(it: SeedItem): string {
  const plan = it.plan === 'foundation' ? FOUNDATION.slug : YEAR.slug
  return `insert into journey_plan_items (id, plan_id, block_type, parent_id, title, body, sort_order, required, est_minutes, cadence)
values (${q(it.id)}, (select id from journey_plans where slug = ${q(plan)}), ${q(it.block_type)}, ${q(it.parent_id)}, ${q(it.title)}, ${q(it.body)}, ${it.sort_order}, ${it.required}, ${it.est_minutes ?? 'null'}, ${q(it.cadence)})
on conflict (id) do update set plan_id = excluded.plan_id, block_type = excluded.block_type, parent_id = excluded.parent_id, title = excluded.title, body = excluded.body, sort_order = excluded.sort_order, required = excluded.required, est_minutes = excluded.est_minutes, cadence = excluded.cadence;`
}

function sqlJourneyInsert(j: typeof FOUNDATION | typeof YEAR, ongoing: boolean, drip: number): string {
  return `insert into journey_plans (id, slug, title, summary, intro, author_id, space_id, visibility, status, published_at, category, difficulty, tags, daily_minutes, enroll_cap, meeting, ongoing, drip_interval_days, sequential)
values (${q(j.id)}, ${q(j.slug)}, ${q(j.title)}, ${q(j.summary)}, ${q(j.intro)}, ${q(OWNER_ID)}, ${q(SPACE_ID)}, 'public', 'approved', now(), ${q(j.category)}, ${q(j.difficulty)}, ${qarr(j.tags)}, ${j.dailyMinutes}, ${j.enrollCap ?? 'null'}, ${qj(j.meeting)}, ${ongoing}, ${drip}, false)
on conflict (slug) do update set title = excluded.title, summary = excluded.summary, intro = excluded.intro, author_id = excluded.author_id, space_id = excluded.space_id, visibility = excluded.visibility, status = excluded.status, published_at = coalesce(journey_plans.published_at, excluded.published_at), category = excluded.category, difficulty = excluded.difficulty, tags = excluded.tags, daily_minutes = excluded.daily_minutes, enroll_cap = excluded.enroll_cap, meeting = excluded.meeting, ongoing = excluded.ongoing, drip_interval_days = excluded.drip_interval_days, sequential = excluded.sequential, updated_at = now();`
}

function renderSql(): string {
  const events = buildEvents()
  const anchor = events[0]
  const items = buildItems()
  const L: string[] = []
  const p = (...lines: string[]) => L.push(...lines)

  p(
    '-- scripts/seed-wildheart.sql',
    '-- GENERATED by `pnpm seed:wildheart --sql` from scripts/seed-wildheart.mts. Edit the .mts, then regenerate.',
    '--',
    '-- Seeds the Wildheart Space (spaces.id 5c7c46d1-a2ba-4e58-a942-c1fe6a68e74b) as an in-house program',
    '-- Space, the way Hearts on Fire (d9aa1c7b-7323-4774-99e7-dd9986e64a7b) was seeded. ONE transaction.',
    '-- Idempotent: every statement is an upsert on a natural key (slug / id) or guarded by `where not',
    '-- exists`. Scoped ONLY to the Wildheart Space row and new child rows that reference it. Nothing is',
    '-- tagged is_demo. preferences.theme and websitePublished are deliberately NOT written: the Space',
    '-- launches on the stock theme and the owner publishes the website by hand (owner ruling 2026-10-12).',
    '--',
    '-- Row shapes copied from the product\'s own writers: lib/event-recurrence.ts (INHERITED_COLUMNS and',
    '-- occurrenceRow), app/(main)/events/actions.ts createEvent, lib/journey-plans.ts createPlan,',
    '-- app/(main)/journeys/create-actions.ts, lib/channels/programs.ts createSpaceProgram,',
    '-- app/(main)/spaces/[slug]/manage/layout/actions.ts, plus the live Hearts on Fire rows.',
    '',
    'begin;',
    '',
    '-- The ids this seed pins, and the region a Space event is scoped to. `resolveRegionScopeId`',
    '-- (lib/events/event-drafts.ts) uses the host profile\'s nexus region, else the topmost region.',
    'create temp table _wh on commit drop as',
    `select ${q(SPACE_ID)}::uuid as space_id, ${q(OWNER_ID)}::uuid as owner_id, ${q(CIRCLE_ID)}::uuid as circle_id,`,
    `       coalesce((select nexus_region_id from profiles where id = ${q(OWNER_ID)}),`,
    '                (select id from nexus_regions where parent_id is null order by depth asc, id asc limit 1)) as region_id;',
    '',
    '-- Guard: the Space must be the one this seed was written for (owner-held, currently the typo slug or',
    '-- already renamed). A different row aborts the transaction instead of being overwritten.',
    'do $guard$ begin',
    `  if not exists (select 1 from spaces where id = ${q(SPACE_ID)} and slug in (${q(OLD_SLUG)}, ${q(SLUG)})) then`,
    `    raise exception 'seed-wildheart: spaces.id ${SPACE_ID} is not the Wildheart Space (slug wilheart / wildheart)';`,
    '  end if;',
    'end $guard$;',
    '',
    '-- ============================================================================================',
    '-- 1. The Space row. Slug typo fixed (wilheart -> wildheart); no other table stores the old slug',
    '--    (checked every public table with a space_id on 2026-10-12: only space_members, crm_stages and',
    '--    circles reference it, all by id). Entitlements mirror Hearts on Fire\'s keys. Preferences are',
    '--    MERGED over the existing jsonb: this seed\'s keys win, every other key survives.',
    '-- ============================================================================================',
    'update spaces set',
    `  slug = ${q(SLUG)},`,
    `  name = 'Wildheart',`,
    `  brand_name = 'Wildheart',`,
    `  tagline = ${q(TAGLINE)},`,
    `  about = ${q(ABOUT)},`,
    `  plan = 'collective',`,
    `  limits_waived = true,`,
    `  skin = 'dawn',`,
    `  visibility = 'network',`,
    `  time_zone = ${q(TZ)},`,
    `  entitlements = ${qj(ENTITLEMENTS)},`,
    `  preferences = coalesce(preferences, '{}'::jsonb) || ${qj(buildPreferences())},`,
    '  updated_at = now()',
    `where id = ${q(SPACE_ID)};`,
    '',
    '-- Logo and cover: NOT set here (no URL is invented). The product stores both as public URLs in',
    '-- the `library-media` storage bucket, under the Space id, as `<spaceId>/<unix ms>-<4 chars>.<ext>`',
    '-- (Hearts on Fire: library-media/d9aa1c7b-.../1791407399184-kiuw.png, with a library_assets row and',
    '-- spaces.brand_logo_asset_id pointing at it). The clean path is the product itself: upload',
    '-- design_handoff_wildheart/assets/wildheart-logo.svg as the logo and one of assets/photos/*.jpg as the',
    '-- cover through Manage > Branding (updateSpaceBranding writes brand_logo_url; the Loom uploader files',
    '-- the library_assets row and brand_logo_asset_id). If you upload by hand instead, put the files at',
    `--   library-media/${SPACE_ID}/<unix ms>-<4 chars>.svg   (logo)`,
    `--   library-media/${SPACE_ID}/<unix ms>-<4 chars>.jpg   (cover)`,
    '-- then run, with the real public URLs:',
    `--   update spaces set brand_logo_url = '<LOGO_PUBLIC_URL>', cover_image_url = '<COVER_PUBLIC_URL>', updated_at = now() where id = '${SPACE_ID}';`,
    '-- PLACEHOLDER: brand_logo_url, cover_image_url, brand_logo_asset_id stay as they are until then.',
    '',
    `-- VERIFY: select slug, name, brand_name, plan, limits_waived, skin, visibility, time_zone, entitlements, preferences ? 'theme' as has_theme, preferences ? 'websitePublished' as has_web, preferences->'profilePublished', jsonb_array_length(preferences->'pages') as pages, (select count(*) from jsonb_object_keys(preferences->'pageDocs')) as page_docs from spaces where id = '${SPACE_ID}';`,
    '-- EXPECT: wildheart | Wildheart | Wildheart | collective | t | dawn | network | America/Los_Angeles | {crm,shop,reviews,availability} | f | f | true | 6 | 6 (pageDocs is replaced whole: home, program, the-year, circles, retreat, about)',
    '',
    '-- ============================================================================================',
    '-- 2. The primary circle: renamed, capacity 12, host = owner, body pillar. The circle_profiles meetup',
    '--    carries the Circle Night rhythm (HoF\'s circle has the same key).',
    '-- ============================================================================================',
    'update circles set',
    `  name = ${q(CIRCLE.name)},`,
    `  slug = ${q(CIRCLE.slug)},`,
    `  about = ${q(CIRCLE.about)},`,
    `  neighborhood = ${q(CIRCLE.neighborhood)},`,
    `  member_cap = ${CIRCLE.memberCap},`,
    `  host_id = ${q(OWNER_ID)},`,
    `  primary_pillar = ${q(CIRCLE.primaryPillar)},`,
    `  timezone = ${q(TZ)},`,
    `  status = 'active'`,
    `where id = ${q(CIRCLE_ID)} and space_id = ${q(SPACE_ID)};`,
    '',
    `insert into circle_profiles (circle_id, meetup) values (${q(CIRCLE_ID)}, ${qj(CIRCLE.meetup)})`,
    'on conflict (circle_id) do update set meetup = excluded.meetup, updated_at = now();',
    '',
    '',
    '-- 2b. The three local circles beside it (the handoff\'s Circles page), real rows the Circles block draws:',
    '--     a Space circle each (type space, cap 12, the owner as host until a trained host takes it), with',
    '--     the meeting line on its profile. Deterministic ids, so a re-run updates the same rows.',
    ...CIRCLES_MORE.flatMap((c) => [
      `insert into circles (id, name, slug, about, type, member_cap, member_count, status, host_id, space_id, neighborhood, primary_pillar, timezone)`,
      `select ${q(c.id)}, ${q(c.name)}, ${q(c.slug)}, ${q(c.about)}, (select type from circles where id = ${q(CIRCLE_ID)}), ${CIRCLE.memberCap}, 0, ${q(c.status)}, ${q(OWNER_ID)}, ${q(SPACE_ID)}, ${q(c.neighborhood)}, ${q(CIRCLE.primaryPillar)}, ${q(TZ)}`,
      `on conflict (id) do update set name = excluded.name, slug = excluded.slug, about = excluded.about, member_cap = excluded.member_cap, status = excluded.status, host_id = excluded.host_id, space_id = excluded.space_id, neighborhood = excluded.neighborhood, primary_pillar = excluded.primary_pillar, timezone = excluded.timezone;`,
      `insert into circle_profiles (circle_id, meetup) values (${q(c.id)}, ${qj(c.meetup)}) on conflict (circle_id) do update set meetup = excluded.meetup, updated_at = now();`,
      '',
    ]),
    `-- VERIFY: select name, slug, neighborhood, member_cap, status, is_space_primary from circles where space_id = '${SPACE_ID}' order by is_space_primary desc, name;`,
    '-- EXPECT: 4 rows: Primary Circle (Central, t), Eastside (East), Foothills (North), Riverside (West, forming)',
    '',
    '-- ============================================================================================',
    '-- 4. Journeys (before events, so the Foundation sessions can carry journey_id). Columns are the',
    '--    ones createPlan + the spark create write: slug, title, summary, intro, author, space, visibility,',
    '--    category, difficulty, tags, daily_minutes, enroll_cap, meeting, ongoing, drip_interval_days.',
    '--    Items are the phase > module > lesson tree; ids are deterministic (md5 of a key) so a re-run',
    '--    updates the same rows. Parents are written before children.',
    '-- ============================================================================================',
    sqlJourneyInsert(FOUNDATION, false, 7),
    '',
    sqlJourneyInsert(YEAR, true, 30),
    '',
    ...items.filter((i) => i.block_type === 'phase').map(sqlItemInsert),
    '',
    ...items.filter((i) => i.block_type === 'module').map(sqlItemInsert),
    '',
    ...items.filter((i) => i.block_type === 'lesson').map(sqlItemInsert),
    '',
    `-- VERIFY: select j.slug, j.ongoing, j.drip_interval_days, count(*) filter (where i.block_type = 'phase') phases, count(*) filter (where i.block_type = 'module') modules, count(*) filter (where i.block_type = 'lesson') lessons from journey_plans j left join journey_plan_items i on i.plan_id = j.id where j.space_id = '${SPACE_ID}' group by 1, 2, 3 order by 1;`,
    '-- EXPECT: the-wildheart-year | t | 30 | 12 | 12 | 0   and   wildheart-foundation | f | 7 | 8 | 8 | 8',
    '',
    '-- ============================================================================================',
    '-- 3. Events. A Space event is scope_type public + the host\'s nexus region + space_id/host_space_id',
    '--    (createEvent). Times are Pacific wall clock converted by Postgres (DST-safe). Dates come from',
    '--    the owner-approved 2027 ritual calendar (design_handoff_wildheart/components/calendar/calendarData.js).',
    '-- ============================================================================================',
    '',
    `-- 3a. Circle Night: the recurring anchor (every other Tuesday, 6:00 to 7:30 PM PT, ${CIRCLE_NIGHT_RULE}).`,
    sqlEventInsert(anchor),
    '',
    '-- 3b. The first 60 days of occurrences, exactly as the daily cron (generateOccurrencesForAnchor)',
    '--     would mint them: slug = anchor slug + landing day, parent_event_id = anchor, recurrence none,',
    '--     every INHERITED_COLUMNS value copied from the anchor, duplicates ignored on slug.',
    `insert into events (slug, parent_event_id, starts_at, ends_at, recurrence_type, recurrence_until, recurrence_rule, is_cancelled,`,
    '  title, description, host_id, scope_id, scope_type, location, visibility, status, published_at, price_cents, currency, capacity, venmo_handle, join_mode,',
    '  category, energy_tag, time_zone, cover_image_path, gallery_image_paths, poster_path, theme, details, space_id, host_space_id, domain_id,',
    '  attendance_mode, online_url, venue_name, street, city, region, country, postal_code, geog, hide_address, journey_id, source, is_demo,',
    '  posted_by_profile_id, organizer_name, organizer_contact)',
    `select a.slug || '-' || d.day, a.id, ${`(d.day || ' ${anchor.start}')::timestamp at time zone '${TZ}'`}, ${`(d.day || ' ${anchor.end}')::timestamp at time zone '${TZ}'`}, 'none', null, null, false,`,
    '  a.title, a.description, a.host_id, a.scope_id, a.scope_type, a.location, a.visibility, a.status, a.published_at, a.price_cents, a.currency, a.capacity, a.venmo_handle, a.join_mode,',
    '  a.category, a.energy_tag, a.time_zone, a.cover_image_path, a.gallery_image_paths, a.poster_path, a.theme, a.details, a.space_id, a.host_space_id, a.domain_id,',
    '  a.attendance_mode, a.online_url, a.venue_name, a.street, a.city, a.region, a.country, a.postal_code, a.geog, a.hide_address, a.journey_id, a.source, a.is_demo,',
    '  a.posted_by_profile_id, a.organizer_name, a.organizer_contact',
    `from events a cross join (values ${CIRCLE_NIGHT_OCCURRENCES.map((d) => `(${q(d)})`).join(', ')}) as d(day)`,
    `where a.slug = ${q(anchor.slug)}`,
    'on conflict (slug) do nothing;',
    '',
    '-- 3c. The Foundation sessions (eight Tuesdays, journey_id = the Foundation), the eight festivals,',
    '--     the full and new moon circles, the three Hearth Gatherings and the Samhain retreat (one',
    '--     multi-day event, Fri 6:00 PM to Sun noon PT).',
    ...events.slice(1).map(sqlEventInsert),
    '',
    `-- VERIFY: select count(*) total, count(*) filter (where recurrence_type <> 'none') anchors, count(*) filter (where parent_event_id is not null) occurrences, count(*) filter (where journey_id is not null) foundation, count(*) filter (where slug like 'wildheart-full-moon-%' or slug like 'wildheart-new-moon-%') moons, count(*) filter (where ends_at::date > starts_at::date) multi_day from events where space_id = '${SPACE_ID}';`,
    `-- EXPECT: ${events.length + CIRCLE_NIGHT_OCCURRENCES.length} | 1 | ${CIRCLE_NIGHT_OCCURRENCES.length} | ${WEEKS.length} | ${MOONS.length} | 1`,
    `-- VERIFY: select slug, recurrence_rule, to_char(starts_at at time zone '${TZ}', 'Dy YYYY-MM-DD HH24:MI') from events where slug = '${anchor.slug}';`,
    `-- EXPECT: ${anchor.slug} | ${CIRCLE_NIGHT_RULE} | Tue ${CIRCLE_NIGHT_ANCHOR} 18:00`,
    '',
    '-- ============================================================================================',
    '-- 5. The Program, as createSpaceProgram writes it: a Space-owned circle_templates blueprint',
    '--    snapshotted from the flagship circle (about, primary_pillar, circle_profiles content; display',
    '--    copy rides the one-liner), the topical_channels row carrying owner_space_id + template_id, and',
    '--    the flagship stamped in as Chapter one (circle_channels position 1 + circles.topical_channel_id).',
    '--    Guarded by the one-program-per-Space rule (unique partial index on owner_space_id).',
    '-- ============================================================================================',
    `insert into circle_templates (id, slug, name, one_liner, identity, audience, card, about, primary_pillar, pillars_inside, meetup, gathering, thread, format, size_label, agreements, remix_options, callouts, owner_space_id, is_active, program_only, display_order)`,
    `select ${q(PROGRAM.templateId)}, ${q(PROGRAM.slug)}, ${q(PROGRAM.name)}, ${q(PROGRAM.oneLiner)}, ${q(PROGRAM.oneLiner)}, '', ${q(PROGRAM.oneLiner)},`,
    `       c.about, coalesce(c.primary_pillar, 'mind'), coalesce(p.pillars_inside, '{}'::jsonb), coalesce(p.meetup, '{}'::jsonb), coalesce(p.gathering, '{}'::jsonb), p.thread, p.format, p.size_label, coalesce(p.agreements, '[]'::jsonb), coalesce(p.remix_options, '[]'::jsonb), '[]'::jsonb,`,
    `       ${q(SPACE_ID)}, true, true, 1000`,
    `from circles c left join circle_profiles p on p.circle_id = c.id`,
    `where c.id = ${q(CIRCLE_ID)}`,
    `  and not exists (select 1 from topical_channels where owner_space_id = ${q(SPACE_ID)} and slug <> ${q(PROGRAM.slug)})`,
    'on conflict (slug) do update set name = excluded.name, one_liner = excluded.one_liner, identity = excluded.identity, card = excluded.card, about = excluded.about, primary_pillar = excluded.primary_pillar, meetup = excluded.meetup, owner_space_id = excluded.owner_space_id, is_active = excluded.is_active, program_only = excluded.program_only, updated_at = now();',
    '',
    `insert into topical_channels (id, name, slug, description, category, owner_space_id, template_id, is_active, display_order)`,
    `select ${q(PROGRAM.channelId)}, ${q(PROGRAM.name)}, ${q(PROGRAM.slug)}, ${q(PROGRAM.oneLiner)}, ${q(PROGRAM.category)}, ${q(SPACE_ID)}, (select id from circle_templates where slug = ${q(PROGRAM.slug)}), true, 1000`,
    `where not exists (select 1 from topical_channels where owner_space_id = ${q(SPACE_ID)} and slug <> ${q(PROGRAM.slug)})`,
    'on conflict (slug) do update set name = excluded.name, description = excluded.description, category = excluded.category, owner_space_id = excluded.owner_space_id, template_id = excluded.template_id, is_active = excluded.is_active;',
    '',
    `insert into circle_channels (circle_id, topical_channel_id, position)`,
    `select ${q(CIRCLE_ID)}, id, 1 from topical_channels where slug = ${q(PROGRAM.slug)} and owner_space_id = ${q(SPACE_ID)}`,
    'on conflict do nothing;',
    '',
    `update circles set topical_channel_id = (select id from topical_channels where slug = ${q(PROGRAM.slug)} and owner_space_id = ${q(SPACE_ID)})`,
    `where id = ${q(CIRCLE_ID)} and exists (select 1 from topical_channels where slug = ${q(PROGRAM.slug)} and owner_space_id = ${q(SPACE_ID)});`,
    '',
    `-- VERIFY: select t.slug, t.category, t.template_id = ct.id as blueprint_linked, ct.program_only, (select topical_channel_id from circles where id = '${CIRCLE_ID}') = t.id as flagship_is_chapter_one from topical_channels t join circle_templates ct on ct.id = t.template_id where t.owner_space_id = '${SPACE_ID}';`,
    '-- EXPECT: wildheart | movement | t | t | t',
    '',
    'commit;',
  )
  return L.join('\n') + '\n'
}

// ── REST mode (service role, PostgREST upserts; the same rows as the SQL) ────────────────────
async function applyViaRest(): Promise<void> {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const REST = `${URL}/rest/v1`
  const auth = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
    const headers: Record<string, string> = { ...auth }
    if (init.prefer) headers.Prefer = init.prefer
    const res = await fetch(`${REST}/${path}`, { ...init, headers })
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  const upsert = (table: string, key: string, body: unknown, prefer = 'resolution=merge-duplicates,return=representation') =>
    rest(`${table}?on_conflict=${key}`, { method: 'POST', body: JSON.stringify(body), prefer })

  // 0) Guard: the right Space.
  const spaces = (await rest(`spaces?id=eq.${SPACE_ID}&select=id,slug,preferences`)) as { id: string; slug: string; preferences: Record<string, unknown> | null }[]
  const space = spaces[0]
  if (!space || ![OLD_SLUG, SLUG].includes(space.slug)) {
    console.error(`spaces.id ${SPACE_ID} is not the Wildheart Space (slug wilheart / wildheart). Nothing written.`)
    process.exit(1)
  }
  // The region a Space event is scoped to (lib/events/event-drafts.ts resolveRegionScopeId).
  const me = (await rest(`profiles?id=eq.${OWNER_ID}&select=nexus_region_id`)) as { nexus_region_id: string | null }[]
  let regionId = me[0]?.nexus_region_id ?? null
  if (!regionId) {
    const top = (await rest(`nexus_regions?parent_id=is.null&select=id&order=depth.asc,id.asc&limit=1`)) as { id: string }[]
    regionId = top[0]?.id ?? null
  }
  if (!regionId) throw new Error('No nexus region to scope events to.')

  // 1) The Space row.
  await rest(`spaces?id=eq.${SPACE_ID}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({
      slug: SLUG, name: 'Wildheart', brand_name: 'Wildheart', tagline: TAGLINE, about: ABOUT, plan: 'collective', limits_waived: true,
      skin: 'dawn', visibility: 'network', time_zone: TZ, entitlements: ENTITLEMENTS,
      preferences: { ...(space.preferences ?? {}), ...buildPreferences() },
      updated_at: new Date().toISOString(),
    }),
  })
  console.log(`Space updated: /spaces/${SLUG}`)

  // 2) The circle.
  await rest(`circles?id=eq.${CIRCLE_ID}&space_id=eq.${SPACE_ID}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: JSON.stringify({ name: CIRCLE.name, slug: CIRCLE.slug, about: CIRCLE.about, neighborhood: CIRCLE.neighborhood, member_cap: CIRCLE.memberCap, host_id: OWNER_ID, primary_pillar: CIRCLE.primaryPillar, timezone: TZ, status: 'active' }),
  })
  await upsert('circle_profiles', 'circle_id', { circle_id: CIRCLE_ID, meetup: CIRCLE.meetup }, 'resolution=merge-duplicates,return=minimal')
  console.log(`Circle renamed: ${CIRCLE.name}`)
  const primary = (await rest(`circles?id=eq.${CIRCLE_ID}&select=type`)) as { type: string }[]
  for (const c of CIRCLES_MORE) {
    await upsert('circles', 'id', { id: c.id, name: c.name, slug: c.slug, about: c.about, type: primary[0]?.type ?? 'space', member_cap: CIRCLE.memberCap, status: c.status, host_id: OWNER_ID, space_id: SPACE_ID, neighborhood: c.neighborhood, primary_pillar: CIRCLE.primaryPillar, timezone: TZ }, 'resolution=merge-duplicates,return=minimal')
    await upsert('circle_profiles', 'circle_id', { circle_id: c.id, meetup: c.meetup }, 'resolution=merge-duplicates,return=minimal')
  }
  console.log(`Local circles: ${CIRCLES_MORE.map((c) => c.name).join(', ')}`)

  // 4) Journeys first (the Foundation sessions carry journey_id).
  const plans: Record<'foundation' | 'year', string> = { foundation: '', year: '' }
  for (const [key, j, ongoing, drip] of [['foundation', FOUNDATION, false, 7], ['year', YEAR, true, 30]] as const) {
    const rows = (await upsert('journey_plans', 'slug', {
      id: j.id, slug: j.slug, title: j.title, summary: j.summary, intro: j.intro, author_id: OWNER_ID, space_id: SPACE_ID, visibility: 'public', status: 'approved',
      published_at: new Date().toISOString(), category: j.category, difficulty: j.difficulty, tags: j.tags, daily_minutes: j.dailyMinutes, enroll_cap: j.enrollCap,
      meeting: j.meeting, ongoing, drip_interval_days: drip, sequential: false, updated_at: new Date().toISOString(),
    })) as { id: string }[]
    plans[key] = rows[0].id
    console.log(`Journey upserted: ${j.slug}`)
  }
  const items = buildItems()
  for (const level of ['phase', 'module', 'lesson'] as const) {
    const rows = items.filter((i) => i.block_type === level).map(({ plan, ...it }) => ({ ...it, plan_id: plans[plan] }))
    if (rows.length) await upsert('journey_plan_items', 'id', rows, 'resolution=merge-duplicates,return=minimal')
  }
  console.log(`Journey items upserted: ${items.length}`)

  // 3) Events.
  const events = buildEvents()
  const row = (e: SeedEvent) => ({
    slug: e.slug, title: e.title, description: e.description, host_id: OWNER_ID, scope_id: regionId, scope_type: 'public',
    starts_at: ptIso(e.date, e.start), ends_at: ptIso(e.endDate ?? e.date, e.end), time_zone: TZ, visibility: 'public', status: 'published',
    join_mode: 'rsvp', category: 'gathering', energy_tag: e.energy, attendance_mode: 'in_person', source: 'manual', space_id: SPACE_ID, host_space_id: SPACE_ID,
    journey_id: e.journey === 'foundation' ? plans.foundation : null, recurrence_type: e.recurrence?.type ?? 'none', recurrence_rule: e.recurrence?.rule ?? null, is_cancelled: false,
  })
  const anchorRows = (await upsert('events', 'slug', { ...row(events[0]), published_at: new Date().toISOString() })) as { id: string }[]
  const anchorId = anchorRows[0].id
  // The occurrences the cron would mint: anchor slug + day, parent_event_id, inherited columns, duplicates ignored.
  const inherited = row(events[0])
  await upsert('events', 'slug', CIRCLE_NIGHT_OCCURRENCES.map((day) => ({
    ...inherited, slug: `${events[0].slug}-${day}`, parent_event_id: anchorId, starts_at: ptIso(day, events[0].start), ends_at: ptIso(day, events[0].end),
    recurrence_type: 'none', recurrence_rule: null, published_at: new Date().toISOString(),
  })), 'resolution=ignore-duplicates,return=minimal')
  await upsert('events', 'slug', events.slice(1).map((e) => ({ ...row(e), published_at: new Date().toISOString() })), 'resolution=merge-duplicates,return=minimal')
  console.log(`Events upserted: ${events.length + CIRCLE_NIGHT_OCCURRENCES.length}`)

  // 5) The Program (one per Space).
  const other = (await rest(`topical_channels?owner_space_id=eq.${SPACE_ID}&slug=neq.${PROGRAM.slug}&select=id,slug`)) as { slug: string }[]
  if (other.length) {
    console.warn(`Program skipped: this Space already runs a Program (${other[0].slug}).`)
  } else {
    const circ = (await rest(`circles?id=eq.${CIRCLE_ID}&select=about,primary_pillar`)) as { about: string | null; primary_pillar: string | null }[]
    const prof = (await rest(`circle_profiles?circle_id=eq.${CIRCLE_ID}&select=pillars_inside,meetup,gathering,thread,format,size_label,agreements,remix_options`)) as Record<string, unknown>[]
    const p = prof[0] ?? {}
    const tpl = (await upsert('circle_templates', 'slug', {
      id: PROGRAM.templateId, slug: PROGRAM.slug, name: PROGRAM.name, one_liner: PROGRAM.oneLiner, identity: PROGRAM.oneLiner, audience: '', card: PROGRAM.oneLiner,
      about: circ[0]?.about ?? null, primary_pillar: circ[0]?.primary_pillar ?? 'mind', pillars_inside: p.pillars_inside ?? {}, meetup: p.meetup ?? {}, gathering: p.gathering ?? {},
      thread: p.thread ?? null, format: p.format ?? null, size_label: p.size_label ?? null, agreements: p.agreements ?? [], remix_options: p.remix_options ?? [], callouts: [],
      owner_space_id: SPACE_ID, is_active: true, program_only: true, display_order: 1000,
    })) as { id: string }[]
    const ch = (await upsert('topical_channels', 'slug', {
      id: PROGRAM.channelId, name: PROGRAM.name, slug: PROGRAM.slug, description: PROGRAM.oneLiner, category: PROGRAM.category, owner_space_id: SPACE_ID, template_id: tpl[0].id, is_active: true, display_order: 1000,
    })) as { id: string }[]
    await upsert('circle_channels', 'circle_id,topical_channel_id', { circle_id: CIRCLE_ID, topical_channel_id: ch[0].id, position: 1 }, 'resolution=ignore-duplicates,return=minimal')
    await rest(`circles?id=eq.${CIRCLE_ID}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ topical_channel_id: ch[0].id }) })
    console.log(`Program upserted: ${PROGRAM.slug}`)
  }
  console.log(`\nDone. /spaces/${SLUG}`)
}

// Runs only as a script: the render test and the fidelity probe import the content above.
const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false
if (!isMain) {
  // imported
} else if (process.argv.includes('--sql')) {
  process.stdout.write(renderSql())
} else {
  applyViaRest().catch((err) => {
    console.error('Seed failed:', err.message)
    process.exit(1)
  })
}
