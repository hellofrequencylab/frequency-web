// Demo Seed Studio — the generation engine.
//
// Turns an "area spec" (a place + how-alive + which channels + flavor) into a
// believable local community that reads as if it grew naturally:
//   • a Guide running a neighborhood Hub, over several Circles each led by a Host
//   • people with journeys (tenure + rank drive what they post and when)
//   • conversation INSIDE circles (posts + replies + reactions)
//   • conversation ACROSS the community (public feed posts + writing on each
//     other's walls)
//   • a friendship graph (within-circle + cross-circle ties)
//   • an event cadence (two past + one upcoming) with RSVPs
//   • Dispatches (broadcasts) from Hosts (circle) and the Guide (hub), incl. event promos
//   • a practice loop, open Journeys, and zero-reward trophy cases
//
// Everything is tagged is_demo so it recedes, toggles, and purges with the rest of
// the demo layer (docs/DEMO-SYSTEM.md). Dispatches carry no is_demo flag, but their
// author_id is ON DELETE CASCADE, so purging the demo author removes them too.
// An "area" is just a geo centre + radius (PostGIS geog) — no schema change.
//
// Three public entry points:
//   buildPlan(spec)    -> deterministic in-memory plan (no DB)
//   previewPlan(plan)  -> a small sample for the wizard's preview step
//   commitPlan(plan)   -> writes it via the service-role admin client
//
// Writes go through the admin client (auth.role() = 'service_role'), so the
// lock_economy_columns guard is satisfied; economy columns are set to our designed
// values directly so the achievement-award trigger can't drift them. Content is
// template+variable; an optional AI palette (spec.aiPolish) localizes names/activities.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Palette } from './ai-palette'

// ── Determinism ────────────────────────────────────────────────────────────
// A seeded RNG so a given spec previews and seeds identically (re-runnable).
function rng(seedStr: string) {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
type Rand = () => number
const pick = <T,>(r: Rand, a: readonly T[]): T => a[Math.floor(r() * a.length)]
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const fill = (tpl: string, vars: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)

// ── Corpus ─────────────────────────────────────────────────────────────────
const FIRST = ['Mara','Eli','Noa','Kai','Sage','Theo','Luna','Dax','Ivy','Rowan','Mira','Caleb','Zoe','Arlo','Nina','Beau','Esme','Cy','Wren','Otis','Lena','Remy','Hana','Jonah','Priya','Diego','Maya','Felix','Tess','Ravi','Sol','Imani','Bodhi','Cleo','Finn','Aria','Malik','Saoirse','Gus','Yara','Pia','Hugo','Nadia','Omar','Bea','Soren','Tara','Kofi','Selene','Arman']
const LAST = ['Hale','Reyes','Marsh','Okafor','Bly','Nair','Frost','Costa','Vance','Quinn','Mercer','Salas','Wilder','Brandt','Okada','Lindqvist','Cole','Pike','Devlin','Marin','Cruz','Banner','Holm','Reed','Voss','Ames','Bright','Calder','Dunn','Iqbal','Sato','Mwangi','Rossi','Park','Nguyen']

// Per-channel flavour: a label, default activity words, and the template pools
// keyed by journey stage / intent. {place},{activity},{time},{day} get filled.
type Channel = {
  slug: string
  label: string
  activities: string[]
  bio: string[]
  intro: string[]      // ghost / newcomer
  regular: string[]    // initiate / adept
  host: string[]       // adept / master
  reply: string[]
  event: string[]
}
const CH: Record<string, Channel> = {
  movement: {
    slug: 'movement', label: 'Movement',
    activities: ['dawn run','sunrise surf','trail loop','mobility flow','bluff walk'],
    bio: ['Out the door before the sun. {activity} is my reset.','Slow miles, good company.','Trading screen time for {activity}.'],
    intro: ['new here — first {activity} this week and already hooked. hi all 👋','total beginner, very stoked. see you at the {activity}?','lurked for a while, finally showed up. glad i did.'],
    regular: ['{activity} this morning was unreal. {time} light hit different.','logged another week. the streak is doing the pulling now.','no-drop pace, every body welcome. come find us.'],
    host: ['{day} {activity} is on — meet at {place}, all levels. bring a newbie.','six months of {activity} together and this crew just keeps growing. proud of us.','little reminder: showing up is the whole practice. the rest follows.'],
    reply: ['in. 🤙','save me a spot!','this is the nudge i needed, thank you.','first-timer here — what should i bring?'],
    event: ['{day} {activity} + coffee','Sunrise {activity} session','Community {activity}'],
  },
  'holistic-health': {
    slug: 'holistic-health', label: 'Holistic Health',
    activities: ['cold plunge','breathwork','sound bath','sauna sit'],
    bio: ['Down-regulating the week one {activity} at a time.','Came for the {activity}, stayed for the people.','Nervous-system maintenance, in good company.'],
    intro: ['first {activity} ever and i definitely cried. no regrets. hi everyone.','came for better sleep, leaving lighter. grateful.','skeptic turned regular after one session.'],
    regular: ['two minutes in the cold and i was buzzing all day.','the {activity} reset is real. same problem, calmer me.','three breaths in and i’m already settled walking in.'],
    host: ['{day} {activity} at {place}, {time}. beginners, this is a great one to start on.','holding space here for a while now — slow is fast.','reminder: you don’t have to *do* anything. just arrive and let go.'],
    reply: ['needed this today 🙏','count me in.','first time — is it beginner friendly?','the calm after is unreal.'],
    event: ['{day} {activity}','New-moon {activity}','Sunrise {activity}'],
  },
  spirituality: {
    slug: 'spirituality', label: 'Spirituality',
    activities: ['morning sit','silent sit','meditation','journaling circle'],
    bio: ['Ten quiet minutes change my whole day.','Practicing beginning again.','Here for the stillness and the company.'],
    intro: ['first meditation circle ever — less scary than i expected.','came for the quiet, found people too.','new to sitting, glad for the gentle start.'],
    regular: ['the midday {activity} is the only ten minutes i’m not spiraling.','journaling > caffeine for my anxiety, who knew.','showing up and sitting with the restlessness IS the practice.'],
    host: ['{day} {activity} at {place} — cushions provided, no experience needed.','a year of sitting together. this little circle carries me.','you don’t need to be good at it to benefit from it.'],
    reply: ['saving this. 🙏','see you on the mat.','this is so reassuring, thank you.','first-timer — how long do we sit?'],
    event: ['{day} {activity}','Silent half-day sit','Midday {activity}'],
  },
  creative: {
    slug: 'creative', label: 'Creative',
    activities: ['maker night','sketch session','portfolio night','open studio'],
    bio: ['Making something most days. Done beats perfect.','Trading mugs for honest critique.','Keeping the channel open.'],
    intro: ['new to the {activity} — mostly making sawdust so far. excited.','finally bringing work-in-progress instead of lurking.','first post! illustrator, here for the critique nights.'],
    regular: ['pulled my first set that didn’t crack 🎉 bringing them {day}.','met a collaborator on the coffee walk. this block is magic.','the {activity} unblocks me every single time.'],
    host: ['{activity} is back {day} at {place} — bring a work-in-progress, finished or not.','fifteen years in the trade, happy to save you my mistakes.','bring the thing you’re avoiding, not the thing you’re proud of.'],
    reply: ['so good 👏','can i bring a friend?','this is the push i needed.','what should a first-timer bring?'],
    event: ['{day} {activity}','First-Friday {activity}','Open studio + show-and-tell'],
  },
  'business-support': {
    slug: 'business-support', label: 'Business Support',
    activities: ['founders table','accountability circle','demo night'],
    bio: ['Building in public, kept honest by this crew.','Founder. Here for the accountability.','Warm intros over flat whites.'],
    intro: ['pre-revenue and proud. first {activity}, slightly terrified.','bootstrapping out of my garage, glad to find this.','new in town and to founding — hi all.'],
    regular: ['shipped the first prototype this week. this table talked me off the ledge twice.','two warm intros from last week’s asks. DM me.','honest accountability beats a pitch deck every time.'],
    host: ['{day} {activity}, {time} at {place} — quick wins, one blocker, one ask. no decks.','second-time founder hosting the table. ask me the hard questions.','what would you build if you stopped optimizing for the next raise?'],
    reply: ['in for {day}.','i’ve got an intro for that.','needed to hear this.','first time — what’s the format?'],
    event: ['{day} {activity}','Summer demo night','Coffee + accountability'],
  },
  'human-relating': {
    slug: 'human-relating', label: 'Human Relating',
    activities: ['welcome dinner','neighbors meetup','newcomers night'],
    bio: ['New to town, collecting people.','The front-door crew. Pull up a chair.','Here to make a big place feel small.'],
    intro: ['just moved here knowing nobody. this looked warm. hi 👋','three weeks in and i have brunch plans. wild.','newcomer, nervous, showing up anyway.'],
    regular: ['showed up to one {activity} on a whim and now i have a standing crew.','this place made a new city feel like home fast.','bring a friend energy is strong here and i love it.'],
    host: ['{day} {activity} at {place} — newcomers especially welcome. come as you are.','our whole thing is the first hello. so glad you’re here.','no agenda {day} except meeting your neighbors.'],
    reply: ['welcome!! 🎉','so glad you’re here.','i’ll be there, come say hi.','first-timer too — let’s find each other.'],
    event: ['{day} welcome dinner','Newcomers BBQ','Neighbors meetup'],
  },
  activism: {
    slug: 'activism', label: 'Activism',
    activities: ['beach cleanup','tide-pool steward','trail care day'],
    bio: ['Leaving it better than we found it.','Volunteer hours are my favorite hours.','Small acts, kept up, add up.'],
    intro: ['first {activity} this weekend — point me at a trash bag. hi all.','new volunteer, big enthusiasm.','came once, hooked on the after-glow.'],
    regular: ['hauled out a record load this morning. many hands, light work.','the {activity} crew is the best part of my month.','small acts compound. proud of us.'],
    host: ['{day} {activity} at {place}, {time} — gloves and bags provided. bring water.','a year of cleanups and the beach shows it. thank you, crew.','every bag matters. so does every person who shows up.'],
    reply: ['count me in 💪','bringing the kids!','what time do we start?','first-timer — where do we meet?'],
    event: ['{day} {activity}','Earth Day cleanup','Tide-pool steward morning'],
  },
}
const DAYS = ['Saturday','Sunday','Tuesday','Thursday','this weekend','Friday']
const TIMES = ['the golden','first','early','dusk','morning']

// Cross-community content (channel-agnostic, on-brand: presence, being missed,
// "your people"). {name},{activity},{place},{circle} get filled.
const WALL = [   // written on a friend's wall
  'so good having you at the {activity} 🙌 you’re one of us now.',
  'welcome in, {name}! the {place} crew got luckier this week.',
  'still thinking about our talk after {activity}. coffee soon?',
  'proud of you for showing up to that one — i know it wasn’t easy. 💛',
  'missed you at the standing time! all good? door’s always open.',
  'you made a newcomer feel at home {day}. that’s the whole thing. thank you.',
]
const FEED = [   // public, to the whole community feed
  'the {place} {activity} crew keeps growing — if you’ve been meaning to come, this is your sign.',
  'three months ago i knew nobody here. tonight i had dinner with people i met through {activity}. real life beats the feed, every time.',
  'small thing that made my week: someone noticed i skipped {activity} and checked in on me. that’s the entire point of this place.',
  'new to {place}? come find your people. we always save a spot for first-timers.',
  'reminder that you don’t have to be good at anything to belong here. you just have to show up. see you out there.',
]
const DISPATCH_CIRCLE: { title: string; body: string }[] = [   // Host → their circle
  { title: 'This week at {circle}', body: '{day}’s {activity} is on at {place}. Newcomers — this is a perfect one to start on, and we’ll look after you. Bring water and, if you can, bring a friend who’s been meaning to come. See you there. 💛' },
  { title: 'Proud of this crew', body: 'We crossed a little milestone — more of you showing up, more first-timers staying. That’s exactly how a circle turns into a home. Keep coming back; the rest takes care of itself.' },
  { title: 'A note before {day}', body: 'No agenda this week except being together. Whatever kind of week you’ve had, the standing time is here for you. Come as you are — that’s always enough.' },
]
const DISPATCH_EVENT: { title: string; body: string }[] = [   // Host → circle, promoting an event
  { title: '{title} — this week', body: 'We’ve got {title} coming up at {place}. All levels, good company, zero pressure. Tap RSVP so we know to look for you, and bring someone who’s been on the edges. The room is better with you in it.' },
]
const DISPATCH_HUB: { title: string; body: string }[] = [   // Guide → the hub (neighborhood-wide)
  { title: 'What’s alive in {place} this week', body: 'A few of our circles have events on, the {activity} crews are growing, and we welcomed a wave of new neighbors. If you’ve been hovering on the edges, step in — pick one standing time and just show up once. That’s the whole trick.' },
  { title: 'Welcome, new neighbors', body: 'To everyone who joined {place} this month: you’re not a number on a list, you’re part of how this place grows. Find a circle, find a standing time, and let us catch you when you show up. We’re glad you’re here.' },
]
const EVENT_DESC = [
  'All levels welcome. Come a few minutes early so we can say hi. Bring water — and a friend if you’ve got one.',
  'No experience needed; first-timers are the whole point. We’ll look after you. Stick around after for coffee.',
  'Show up — that’s the only requirement. The rest takes care of itself.',
]

// Rank bands (ghost -> master) — economy values per rank.
const BAND = {
  ghost:    { z: [5, 95],     g: [5, 60],     s: [0, 3],   a: [1, 4] },
  initiate: { z: [100, 290],  g: [50, 150],   s: [2, 8],   a: [4, 7] },
  adept:    { z: [300, 740],  g: [150, 400],  s: [5, 14],  a: [7, 11] },
  master:   { z: [750, 1450], g: [400, 800],  s: [10, 20], a: [11, 16] },
} as const
type Rank = keyof typeof BAND
// A believable roster: 1 host (adept), a couple crew (initiate), a long low tail.
function rosterRanks(r: Rand, size: number): Rank[] {
  const ranks: Rank[] = ['adept'] // host
  if (size > 8) ranks.push('initiate')
  if (size > 14) ranks.push('initiate')
  while (ranks.length < size) {
    const roll = r()
    ranks.push(roll < 0.45 ? 'ghost' : roll < 0.78 ? 'initiate' : 'adept')
  }
  return ranks
}

export type AreaSpec = {
  areaName: string
  centerLat: number
  centerLng: number
  radiusMi: number
  circles: number
  membersPerCircle: number
  /** % of people who also join a 2nd circle (cross-circle connections). */
  connectednessPct: number
  channels: string[]
  flavorWords: string[]
  aiPolish: boolean
  seed?: string
}
export type PersonPlan = {
  key: string; name: string; handle: string; rank: Rank
  role: 'guide' | 'host' | 'crew' | 'member'; bio: string
  zaps: number; gems: number; streak: number; achievements: number
  tenureWeeks: number
}
export type CirclePlan = {
  key: string; name: string; slug: string; channel: string; activity: string
  lat: number; lng: number; about: string
  people: PersonPlan[]
  posts: { authorKey: string; body: string; ageMin: number; replies: { authorKey: string; body: string }[] }[]
  events: { title: string; description: string; daysOffset: number }[]
}
/** A post written on someone's wall, or a public feed post (target === author). */
export type WallPost = { authorKey: string; targetKey: string; body: string; ageMin: number }
/** An accepted friendship between two people (canonical-ordered at commit). */
export type Friendship = { aKey: string; bKey: string }
/** A published broadcast from a Host (circle) or the Guide (hub). */
export type DispatchPlan = { authorKey: string; scope: 'circle' | 'hub'; circleKey?: string; title: string; body: string; ageMin: number }
/** An open "Journey" plan: a named bundle of practices, adopted by some. */
export type JourneyPlanSpec = {
  slug: string; title: string; summary: string; itemCount: number; authorKey: string; adopterCount: number
}
export type HubPlan = { name: string; slug: string; guideKey: string }
export type AreaPlan = {
  spec: AreaSpec
  hub: HubPlan
  guide: PersonPlan
  circles: CirclePlan[]
  crossLinks: { personKey: string; circleKey: string }[]
  friendships: Friendship[]
  wallPosts: WallPost[]
  dispatches: DispatchPlan[]
  journeys: JourneyPlanSpec[]
  totals: Record<string, number>
}

function tenureForRank(r: Rand, rank: Rank): number {
  const map: Record<Rank, [number, number]> = {
    ghost: [0, 4], initiate: [4, 16], adept: [12, 30], master: [24, 52],
  }
  return int(r, ...map[rank])
}

export function buildPlan(spec: AreaSpec, palette?: Palette | null): AreaPlan {
  const r = rng(spec.seed ?? `${spec.areaName}:${spec.circles}x${spec.membersPerCircle}:${spec.channels.join(',')}`)
  const nCircles = Math.max(1, Math.min(30, Math.round(spec.circles)))
  const channels = spec.channels.length ? spec.channels : ['movement', 'holistic-health', 'creative']
  const firstPool = palette?.firstNames?.length ? palette.firstNames : FIRST
  const lastPool = palette?.lastNames?.length ? palette.lastNames : LAST
  const usedHandles = new Set<string>()
  const flavor = [...spec.flavorWords.filter(Boolean), ...(palette?.vibe ? [palette.vibe] : [])]
  const allActivities = channels.flatMap((s) =>
    palette?.activities?.[s]?.length ? palette.activities[s] : (CH[s] ?? CH.movement).activities,
  )
  const uniqHandle = (first: string, last: string): string => {
    let h = `${first}.${last}`.toLowerCase().replace(/[^a-z0-9.]/g, '')
    while (usedHandles.has(h)) h = `${first}.${last}${int(r, 2, 99)}`.toLowerCase().replace(/[^a-z0-9.]/g, '')
    usedHandles.add(h)
    return h
  }

  const circles: CirclePlan[] = []
  const totals = { circles: 0, people: 0, posts: 0, replies: 0, events: 0, connections: 0, journeys: 0, friendships: 0, walls: 0, dispatches: 0, guides: 1, hubs: 1 }

  for (let c = 0; c < nCircles; c++) {
    const chSlug = channels[c % channels.length]
    const ch = CH[chSlug] ?? CH.movement
    const place = flavor.length ? pick(r, flavor) : spec.areaName
    const acts = palette?.activities?.[chSlug]?.length ? palette.activities[chSlug] : ch.activities
    const activity = pick(r, acts)
    const name = `${place} ${ch.label}`.slice(0, 60)
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${int(r, 100, 999)}`
    const size = Math.max(3, Math.round(spec.membersPerCircle + (r() - 0.5) * 4))
    const ranks = rosterRanks(r, size)
    const degRad = (spec.radiusMi * 0.0145)
    const lat = +(spec.centerLat + (r() - 0.5) * degRad).toFixed(6)
    const lng = +(spec.centerLng + (r() - 0.5) * degRad).toFixed(6)

    const people: PersonPlan[] = ranks.map((rank, i) => {
      const first = pick(r, firstPool), last = pick(r, lastPool)
      const handle = uniqHandle(first, last)
      const role: PersonPlan['role'] = i === 0 ? 'host' : rank === 'initiate' && i <= 2 ? 'crew' : 'member'
      const b = BAND[rank]
      return {
        key: `${slug}:${i}`, name: `${first} ${last}`, handle, rank, role,
        bio: fill(pick(r, ch.bio), { activity, place }),
        zaps: int(r, b.z[0], b.z[1]), gems: int(r, b.g[0], b.g[1]),
        streak: int(r, b.s[0], b.s[1]), achievements: int(r, b.a[0], b.a[1]),
        tenureWeeks: tenureForRank(r, rank),
      }
    })

    // posts: stage-appropriate, timestamped across tenure; ~postsPer * size
    const posts: CirclePlan['posts'] = []
    const nPosts = Math.max(3, Math.round(size * 0.9))
    for (let p = 0; p < nPosts; p++) {
      const author = people[int(r, 0, people.length - 1)]
      const poolByStage =
        author.rank === 'ghost' ? ch.intro :
        author.rank === 'adept' || author.rank === 'master' ? ch.host : ch.regular
      const body = fill(pick(r, poolByStage), { place, activity, day: pick(r, DAYS), time: pick(r, TIMES) })
      const ageMin = int(r, 30, Math.max(60, author.tenureWeeks * 7 * 24 * 60))
      const nReplies = r() < 0.5 ? int(r, 1, 4) : 0
      const replies = Array.from({ length: nReplies }, () => {
        const rep = people[int(r, 0, people.length - 1)]
        return { authorKey: rep.key, body: pick(r, ch.reply) }
      })
      posts.push({ authorKey: author.key, body, ageMin, replies })
      totals.replies += replies.length
    }

    // Event cadence: two past (so there's attended history) + one upcoming.
    const events = [
      { title: fill(pick(r, ch.event), { day: pick(r, DAYS), activity }), description: pick(r, EVENT_DESC), daysOffset: -int(r, 16, 45) },
      { title: fill(pick(r, ch.event), { day: pick(r, DAYS), activity }), description: pick(r, EVENT_DESC), daysOffset: -int(r, 2, 9) },
      { title: fill(pick(r, ch.event), { day: pick(r, DAYS), activity }), description: pick(r, EVENT_DESC), daysOffset: int(r, 3, 18) },
    ]
    circles.push({
      key: slug, name, slug, channel: chSlug, activity, lat, lng,
      about: fill('A {activity} circle in {place}. All levels, good company — and a standing time worth showing up for.', { activity, place }),
      people, posts, events,
    })
    totals.circles++; totals.people += people.length; totals.posts += posts.length; totals.events += events.length
  }

  // ── Guide + Hub: the neighborhood layer over the circles. ──────────────────
  const gFirst = pick(r, firstPool), gLast = pick(r, lastPool)
  const guide: PersonPlan = {
    key: 'guide', name: `${gFirst} ${gLast}`, handle: uniqHandle(gFirst, gLast),
    rank: 'master', role: 'guide',
    bio: fill('Guide for the {place} neighborhood. My whole job is helping you find your circle and your people. Say hi.', { place: spec.areaName }),
    zaps: int(r, BAND.master.z[0], BAND.master.z[1]), gems: int(r, BAND.master.g[0], BAND.master.g[1]),
    streak: int(r, BAND.master.s[0], BAND.master.s[1]), achievements: int(r, BAND.master.a[0], BAND.master.a[1]),
    tenureWeeks: 52,
  }
  totals.people += 1
  const hub: HubPlan = {
    name: `${spec.areaName} Neighborhood`,
    slug: `${spec.areaName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-hub-${int(r, 100, 999)}`,
    guideKey: 'guide',
  }

  // Person lookups (incl. the guide) for tenure-aware wall authorship + names.
  const personByKey = new Map<string, PersonPlan>([[guide.key, guide]])
  const firstNameByKey = new Map<string, string>([[guide.key, gFirst]])
  for (const c of circles) for (const p of c.people) {
    personByKey.set(p.key, p)
    firstNameByKey.set(p.key, p.name.split(' ')[0])
  }

  // ── Cross-circle memberships (a slice also join a 2nd circle). ─────────────
  const allPeople = circles.flatMap((c) => c.people.map((p) => ({ key: p.key, circleKey: c.key })))
  const nCross = circles.length > 1 ? Math.round((allPeople.length * spec.connectednessPct) / 100) : 0
  const crossLinks: { personKey: string; circleKey: string }[] = []
  const crossSeen = new Set<string>()
  let guard = 0
  while (crossLinks.length < nCross && guard++ < nCross * 8 + 20) {
    const person = allPeople[int(r, 0, allPeople.length - 1)]
    const circle = circles[int(r, 0, circles.length - 1)]
    if (circle.key === person.circleKey) continue
    const k = `${person.key}|${circle.key}`
    if (crossSeen.has(k)) continue
    crossSeen.add(k)
    crossLinks.push({ personKey: person.key, circleKey: circle.key })
  }
  totals.connections = crossLinks.length

  // ── Friendship graph: within-circle ties + cross-circle bridges + guide. ───
  const friendships: Friendship[] = []
  const fSeen = new Set<string>()
  const addF = (a: string, b: string) => {
    if (a === b) return
    const k = [a, b].sort().join('|')
    if (fSeen.has(k)) return
    fSeen.add(k)
    friendships.push({ aKey: a, bKey: b })
  }
  for (const c of circles) {
    const ppl = c.people
    for (let i = 0; i < ppl.length; i++) {
      for (let f = 0, n = int(r, 1, 3); f < n; f++) addF(ppl[i].key, ppl[int(r, 0, ppl.length - 1)].key)
    }
  }
  // cross-circle bridges: a person who joined a 2nd circle befriends someone there
  for (const link of crossLinks) {
    const tgt = circles.find((c) => c.key === link.circleKey)
    if (tgt) addF(link.personKey, pick(r, tgt.people).key)
  }
  // the guide knows every host (that's the job)
  for (const c of circles) {
    const host = c.people.find((p) => p.role === 'host')
    if (host) addF('guide', host.key)
  }
  totals.friendships = friendships.length

  // ── Walls + feed: writing on each other's walls, and public feed posts. ────
  const wallPosts: WallPost[] = []
  // welcomes/shout-outs: a slice of friendships get one, authored by the longer-
  // tenured friend onto the other's wall.
  for (const f of friendships) {
    if (r() > 0.26) continue
    const a = personByKey.get(f.aKey), b = personByKey.get(f.bKey)
    if (!a || !b) continue
    const authorKey = (a.tenureWeeks >= b.tenureWeeks ? f.aKey : f.bKey)
    const targetKey = authorKey === f.aKey ? f.bKey : f.aKey
    wallPosts.push({
      authorKey, targetKey,
      body: fill(pick(r, WALL), { name: firstNameByKey.get(targetKey) ?? 'friend', activity: pick(r, allActivities), place: spec.areaName, day: pick(r, DAYS) }),
      ageMin: int(r, 60, 60 * 24 * 21),
    })
  }
  // public feed posts (target === author) from hosts/regulars + the guide.
  const feedAuthors = [...circles.flatMap((c) => c.people.filter((p) => p.role !== 'member')), guide]
  const nFeed = Math.max(3, Math.round(circles.length * 1.6))
  for (let i = 0; i < nFeed; i++) {
    const a = pick(r, feedAuthors)
    wallPosts.push({
      authorKey: a.key, targetKey: a.key,
      body: fill(pick(r, FEED), { place: spec.areaName, activity: pick(r, allActivities) }),
      ageMin: int(r, 60, 60 * 24 * 20),
    })
  }
  totals.walls = wallPosts.length

  // ── Dispatches: Hosts broadcast to their circle (+ event promos); the Guide
  //    broadcasts to the hub. ────────────────────────────────────────────────
  const dispatches: DispatchPlan[] = []
  for (const c of circles) {
    const host = c.people.find((p) => p.role === 'host')
    if (!host) continue
    const dc = pick(r, DISPATCH_CIRCLE)
    dispatches.push({
      authorKey: host.key, scope: 'circle', circleKey: c.key,
      title: fill(dc.title, { circle: c.name, day: pick(r, DAYS) }),
      body: fill(dc.body, { activity: c.activity, place: spec.areaName, day: pick(r, DAYS), circle: c.name }),
      ageMin: int(r, 60, 60 * 24 * 10),
    })
    const upcoming = c.events.find((e) => e.daysOffset > 0)
    if (upcoming && r() < 0.7) {
      const de = pick(r, DISPATCH_EVENT)
      dispatches.push({
        authorKey: host.key, scope: 'circle', circleKey: c.key,
        title: fill(de.title, { title: upcoming.title }),
        body: fill(de.body, { title: upcoming.title, place: spec.areaName }),
        ageMin: int(r, 60, 60 * 24 * 5),
      })
    }
  }
  for (let i = 0; i < Math.min(2, DISPATCH_HUB.length); i++) {
    const dh = DISPATCH_HUB[i]
    dispatches.push({
      authorKey: 'guide', scope: 'hub',
      title: fill(dh.title, { place: spec.areaName }),
      body: fill(dh.body, { place: spec.areaName, activity: pick(r, allActivities) }),
      ageMin: int(r, 60, 60 * 24 * 12),
    })
  }
  totals.dispatches = dispatches.length

  // ── Journeys: a few open practice-bundle plans, authored by hosts/guide. ───
  const hosts = circles.flatMap((c) => c.people.filter((p) => p.role === 'host'))
  const totalPeople = circles.reduce((s, c) => s + c.people.length, 0)
  const jTitles = palette?.journeyTitles?.length
    ? palette.journeyTitles
    : ['Morning Reset', 'Strong Body', 'Calm Mind', 'Creative Spark', 'Steady Week', 'Fresh Start', 'Deep Focus', 'Good Sleep']
  const nJourneys = Math.min(jTitles.length, Math.max(2, Math.round(nCircles * 0.8)))
  const journeys: JourneyPlanSpec[] = []
  for (let j = 0; j < nJourneys; j++) {
    const title = jTitles[j % jTitles.length]
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    journeys.push({
      slug: `${base}-${int(r, 100, 999)}`,
      title,
      summary: fill('A simple {n}-practice plan to find your {x}.', { n: String(int(r, 3, 4)), x: title.toLowerCase() }),
      itemCount: int(r, 3, 4),
      authorKey: hosts.length ? pick(r, hosts).key : 'guide',
      adopterCount: Math.max(2, Math.round(totalPeople * 0.12)),
    })
  }
  totals.journeys = journeys.length

  return { spec, hub, guide, circles, crossLinks, friendships, wallPosts, dispatches, journeys, totals }
}

// A tiny slice for the wizard's preview step (no DB writes).
export function previewPlan(plan: AreaPlan) {
  const c = plan.circles[0]
  const sample = c?.people.slice(0, 3).map((p) => ({ name: p.name, handle: p.handle, rank: p.rank, bio: p.bio })) ?? []
  const thread = c?.posts.find((p) => p.replies.length) ?? c?.posts[0]
  const author = c?.people.find((p) => p.key === thread?.authorKey)
  const wall = plan.wallPosts.find((w) => w.targetKey !== w.authorKey)
  return {
    hub: { name: plan.hub.name, guide: plan.guide.name },
    circles: plan.circles.map((x) => ({ name: x.name, channel: x.channel, members: x.people.length })),
    samplePeople: sample,
    sampleThread: thread && author
      ? { author: author.name, body: thread.body,
          replies: thread.replies.map((rep) => ({
            author: c!.people.find((p) => p.key === rep.authorKey)?.name ?? 'A member', body: rep.body })) }
      : null,
    sampleDispatch: plan.dispatches[0] ? { title: plan.dispatches[0].title, body: plan.dispatches[0].body } : null,
    sampleWall: wall ? { body: wall.body } : null,
    totals: plan.totals,
  }
}

// ── Commit ───────────────────────────────────────────────────────────────────
function db(): SupabaseClient {
  return createAdminClient()
}
async function channelId(d: SupabaseClient, slug: string): Promise<string | null> {
  const { data } = await d.from('topical_channels').select('id').eq('slug', slug).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
async function regionId(d: SupabaseClient): Promise<string | null> {
  const { data } = await d.from('nexus_regions').select('id').order('depth').limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

const rand = () => Math.random

async function insertProfile(d: SupabaseClient, p: PersonPlan, region: string | null, rng2: () => number): Promise<string | null> {
  const { data: prof } = await d.from('profiles').insert({
    auth_user_id: null, display_name: p.name, handle: p.handle,
    // 'crew' is the paid TIER, not a role (PB.1/ADR-207) — demo crew personas
    // carry member role + the comped tier, like real members post-migration.
    community_role: p.role === 'crew' ? 'member' : p.role,
    membership_tier: p.role === 'crew' ? 'crew' : 'free',
    nexus_region_id: region, bio: p.bio,
    avatar_url: `https://i.pravatar.cc/240?u=${p.handle}`,
    current_season_rank: p.rank, current_season_zaps: p.zaps, lifetime_zaps: p.zaps,
    lifetime_gems: p.gems, current_streak: p.streak, longest_streak: p.streak,
    achievement_count: p.achievements,
    last_seen_at: new Date(Date.now() - Math.floor(rng2() * 72) * 3600_000).toISOString(),
    is_active: true, is_demo: true,
  }).select('id').single()
  return (prof as { id: string } | null)?.id ?? null
}

/** Write the plan via the service-role admin client. Returns counts. Unobtrusive:
 *  RSVP reminders are pre-stamped so the cron never emails; seeded achievements are
 *  zero-reward so the economy can't drift; nothing routes through the app's
 *  award/notify helpers, so no automations fire. */
export async function commitPlan(plan: AreaPlan): Promise<Record<string, number>> {
  const d = db()
  const rng2 = rand()
  const region = await regionId(d)
  const done = {
    guides: 0, hubs: 0, circles: 0, members: 0, posts: 0, walls: 0, events: 0, connections: 0,
    rsvps: 0, reactions: 0, practiceLogs: 0, journeys: 0, friendships: 0, dispatches: 0,
  }
  const profileIdByKey: Record<string, string> = {}
  const circleIdByKey: Record<string, string> = {}
  const membersByCircle: Record<string, string[]> = {}

  const { data: pracRows } = await d.from('practices').select('id, domain_id').eq('is_public', true).limit(50)
  const practices = (pracRows ?? []) as { id: string; domain_id: string | null }[]
  const { data: achRows } = await d.from('achievements').select('id').eq('zaps_reward', 0).order('sort_order').limit(40)
  const achIds = (achRows ?? []).map((a) => (a as { id: string }).id)

  // 1) The Guide, then the Hub they run.
  const guideId = await insertProfile(d, plan.guide, region, rng2)
  if (guideId) { profileIdByKey[plan.guide.key] = guideId; done.guides++ }
  let hubId: string | null = null
  if (guideId) {
    const { data: hubRow } = await d.from('hubs').insert({
      name: plan.hub.name, slug: plan.hub.slug, guide_id: guideId, status: 'active', nexus_id: null, is_demo: true,
    }).select('id').single()
    hubId = (hubRow as { id: string } | null)?.id ?? null
    if (hubId) done.hubs++
  }

  // 2) Circles (under the hub), their people, host_id, posts, events, practice.
  for (const c of plan.circles) {
    const chId = await channelId(d, c.channel)
    const { data: circ } = await d.from('circles').insert({
      name: c.name, slug: c.slug, hub_id: hubId, type: 'in-person', member_cap: 50,
      status: 'active', about: c.about, latitude: c.lat, longitude: c.lng,
      city: plan.spec.areaName, topical_channel_id: chId,
      image_url: `https://picsum.photos/seed/${c.slug}/400/400`, is_demo: true,
    }).select('id').single()
    if (!circ) continue
    const circleId = (circ as { id: string }).id
    done.circles++
    circleIdByKey[c.key] = circleId
    membersByCircle[circleId] = []

    let hostId: string | null = null
    for (const p of c.people) {
      const pid = await insertProfile(d, p, region, rng2)
      if (!pid) continue
      profileIdByKey[p.key] = pid
      membersByCircle[circleId].push(pid)
      if (p.role === 'host') hostId = pid
      await d.from('memberships').insert({
        profile_id: pid, circle_id: circleId, status: 'active',
        volunteer_role: p.role === 'host' || p.role === 'crew' ? p.role : null,
      })
      done.members++
    }
    // Stamp the host on the circle (drives /circles host display + claim logic).
    if (hostId) await d.from('circles').update({ host_id: hostId }).eq('id', circleId)
    const members = membersByCircle[circleId]

    // Circle's active practice.
    const circlePractice = practices.length ? practices[Math.floor(rng2() * practices.length)] : null
    if (circlePractice && hostId) {
      await d.from('circle_practices').insert({ circle_id: circleId, practice_id: circlePractice.id, set_by: hostId, active: true })
    }

    // Posts + replies, with reactions from circle-mates.
    const reactionRows: { post_id: string; profile_id: string; reaction_type: string }[] = []
    for (const post of c.posts) {
      const authorId = profileIdByKey[post.authorKey]
      if (!authorId) continue
      const reactors = members.filter((m) => m !== authorId && rng2() < 0.35)
      const { data: pp } = await d.from('posts').insert({
        author_id: authorId, scope_id: circleId, visibility: 'group', body: post.body,
        reaction_count: reactors.length, comment_count: post.replies.length, reply_count: post.replies.length,
        created_at: new Date(Date.now() - post.ageMin * 60_000).toISOString(), is_demo: true,
      }).select('id').single()
      done.posts++
      const parentId = (pp as { id: string } | null)?.id
      if (!parentId) continue
      for (const m of reactors) reactionRows.push({ post_id: parentId, profile_id: m, reaction_type: rng2() < 0.85 ? '❤️' : '🙌' })
      for (const rep of post.replies) {
        const rid = profileIdByKey[rep.authorKey]
        if (!rid) continue
        await d.from('posts').insert({ author_id: rid, parent_id: parentId, scope_id: circleId, visibility: 'group', body: rep.body, is_demo: true })
      }
    }
    if (reactionRows.length) { await d.from('post_reactions').insert(reactionRows); done.reactions += reactionRows.length }

    // Event cadence + RSVPs (attendance). Reminders pre-stamped → never emailed.
    const nowIso = new Date().toISOString()
    for (const ev of c.events) {
      const starts = new Date(Date.now() + ev.daysOffset * 86400_000); starts.setHours(8, 0, 0, 0)
      const { data: evr } = await d.from('events').insert({
        host_id: hostId, scope_id: circleId, scope_type: 'circle', title: ev.title, description: ev.description,
        slug: `${c.slug}-${ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${Math.floor(rng2() * 9000 + 1000)}`,
        starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 5_400_000).toISOString(),
        location: plan.spec.areaName, is_cancelled: false, is_demo: true,
      }).select('id').single()
      done.events++
      const evId = (evr as { id: string } | null)?.id
      if (!evId) continue
      const rsvpRows = members.filter(() => rng2() < 0.62).map((m) => ({
        event_id: evId, profile_id: m, status: 'going',
        reminder_24h_sent_at: nowIso, reminder_2h_sent_at: nowIso,
      }))
      if (rsvpRows.length) { await d.from('event_rsvps').insert(rsvpRows); done.rsvps += rsvpRows.length }
    }

    // Member adoptions of the circle practice + recent logs (back the streaks).
    if (circlePractice) {
      const mpRows = members.map((m) => ({ profile_id: m, practice_id: circlePractice.id, active: true }))
      if (mpRows.length) await d.from('member_practices').insert(mpRows)
      const logRows: { profile_id: string; practice_id: string; circle_id: string; logged_for: string }[] = []
      for (const m of members) {
        const days = Math.floor(rng2() * 8)
        for (let dn = 0; dn < days; dn++) {
          logRows.push({ profile_id: m, practice_id: circlePractice.id, circle_id: circleId, logged_for: new Date(Date.now() - dn * 86400_000).toISOString().slice(0, 10) })
        }
      }
      if (logRows.length) { await d.from('practice_logs').insert(logRows); done.practiceLogs += logRows.length }
    }
  }

  // 3) Guide joins the first circle (their home base in the neighborhood).
  const firstCircleId = circleIdByKey[plan.circles[0]?.key]
  if (guideId && firstCircleId) {
    await d.from('memberships').insert({ profile_id: guideId, circle_id: firstCircleId, status: 'active', volunteer_role: null })
  }

  // 4) Cross-circle connections: a slice of people also join a 2nd circle.
  for (const link of plan.crossLinks) {
    const pid = profileIdByKey[link.personKey]
    const cid = circleIdByKey[link.circleKey]
    if (!pid || !cid) continue
    const { error } = await d.from('memberships').insert({ profile_id: pid, circle_id: cid, status: 'active', volunteer_role: null })
    if (!error) done.connections++
  }

  // 5) Friendships (accepted), canonical-ordered user_a_id < user_b_id.
  const friendRows: { user_a_id: string; user_b_id: string; requested_by: string; status: string; requested_at: string; responded_at: string }[] = []
  for (const f of plan.friendships) {
    const ai = profileIdByKey[f.aKey], bi = profileIdByKey[f.bKey]
    if (!ai || !bi || ai === bi) continue
    const [ua, ub] = ai < bi ? [ai, bi] : [bi, ai]
    const reqAt = new Date(Date.now() - Math.floor(rng2() * 120) * 86400_000).toISOString()
    friendRows.push({ user_a_id: ua, user_b_id: ub, requested_by: ua, status: 'accepted', requested_at: reqAt, responded_at: reqAt })
  }
  if (friendRows.length) {
    const { error } = await d.from('friendships').insert(friendRows)
    if (!error) done.friendships += friendRows.length
  }

  // 6) Walls + public feed posts (scope = target profile, visibility public).
  for (const w of plan.wallPosts) {
    const authorId = profileIdByKey[w.authorKey]
    const targetId = profileIdByKey[w.targetKey]
    if (!authorId || !targetId) continue
    const { error } = await d.from('posts').insert({
      author_id: authorId, scope_id: targetId, visibility: 'public', post_type: 'feed', body: w.body,
      created_at: new Date(Date.now() - w.ageMin * 60_000).toISOString(), is_demo: true,
    })
    if (!error) done.walls++
  }

  // 7) Dispatches (published broadcasts) from Hosts (circle) + the Guide (hub).
  for (const disp of plan.dispatches) {
    const authorId = profileIdByKey[disp.authorKey]
    const audienceId = disp.scope === 'hub' ? hubId : circleIdByKey[disp.circleKey ?? '']
    if (!authorId || !audienceId) continue
    const publishedAt = new Date(Date.now() - disp.ageMin * 60_000).toISOString()
    const { error } = await d.from('dispatches').insert({
      author_id: authorId, title: disp.title, body: disp.body, excerpt: disp.body.slice(0, 200),
      audience_scope: disp.scope, audience_id: audienceId, dispatch_type: 'post',
      status: 'published', published_at: publishedAt,
    })
    if (!error) done.dispatches++
  }

  // 8) Journeys (open plans) + items + adoptions.
  const allProfileIds = Object.values(profileIdByKey)
  for (const j of plan.journeys) {
    const authorId = profileIdByKey[j.authorKey] ?? allProfileIds[0]
    if (!authorId || !practices.length) continue
    const adopters = allProfileIds.filter(() => rng2() < j.adopterCount / Math.max(1, allProfileIds.length))
    const { data: jp } = await d.from('journey_plans').insert({
      slug: j.slug, title: j.title, summary: j.summary, author_id: authorId, visibility: 'public',
      published_at: new Date(Date.now() - Math.floor(rng2() * 60) * 86400_000).toISOString(),
      cover_image: `https://picsum.photos/seed/${j.slug}/800/400`, adopt_count: adopters.length,
    }).select('id').single()
    const jid = (jp as { id: string } | null)?.id
    if (!jid) continue
    done.journeys++
    const items = practices.slice(0, j.itemCount).map((pr, i) => ({ plan_id: jid, practice_id: pr.id, domain_id: pr.domain_id, sort_order: i }))
    if (items.length) await d.from('journey_plan_items').insert(items)
    const adoptRows = adopters.map((pid) => ({ plan_id: jid, profile_id: pid, active: true }))
    if (adoptRows.length) await d.from('journey_plan_adoptions').insert(adoptRows)
  }

  // 9) Trophy cases (zero-reward achievements) + attendance streaks — batched.
  const uaRows: { profile_id: string; achievement_id: string }[] = []
  const streakRows: { profile_id: string; streak_type: string; current_count: number; longest_count: number; last_activity_at: string }[] = []
  const allPlanPeople = [plan.guide, ...plan.circles.flatMap((c) => c.people)]
  for (const p of allPlanPeople) {
    const pid = profileIdByKey[p.key]
    if (!pid) continue
    for (let i = 0; i < Math.min(p.achievements, achIds.length); i++) uaRows.push({ profile_id: pid, achievement_id: achIds[i] })
    if (p.streak > 0) streakRows.push({ profile_id: pid, streak_type: 'attendance', current_count: p.streak, longest_count: p.streak, last_activity_at: new Date().toISOString() })
  }
  if (uaRows.length) await d.from('user_achievements').insert(uaRows)
  if (streakRows.length) await d.from('streaks').insert(streakRows)

  return done
}
