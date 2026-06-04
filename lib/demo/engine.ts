// Demo Seed Studio — the generation engine.
//
// Turns an "area spec" (a place + how-alive + which channels + flavor) into a
// believable local community: circles, people with *journeys* (tenure + rank
// drive what they post and when), conversations between them, events, and
// gamification awards. Everything is tagged is_demo so it recedes, toggles, and
// purges with the rest of the demo layer (docs/DEMO-SYSTEM.md), and an "area" is
// just a geo centre + radius (PostGIS geog) so no schema change is needed.
//
// Three public entry points:
//   buildPlan(spec)    -> deterministic in-memory plan (no DB)
//   previewPlan(plan)  -> a small sample for the wizard's preview step
//   commitPlan(plan)   -> writes it via the service-role admin client
//
// Writes go through the admin client, whose auth.role() = 'service_role', so the
// lock_economy_columns guard is satisfied; we still set economy columns to our
// designed values LAST so the achievement-award trigger can't drift them.
//
// Content is template+variable by default; an optional AI polish pass
// (spec.aiPolish) can rewrite drafts via lib/ai (Phase 1b — stubbed here).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// Per-channel flavour: a label, default activity words, and the four template
// pools keyed by journey stage / intent. {place},{activity},{time} get filled.
type Channel = {
  slug: string
  label: string
  activities: string[]
  bio: string[]
  intro: string[]      // ghost / newcomer
  regular: string[]    // runner / operative
  host: string[]       // conduit / luminary
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

// ── Aliveness → shape ────────────────────────────────────────────────────────
const ALIVE: Record<string, { circles: [number, number]; size: [number, number]; postsPer: number }> = {
  sprouting: { circles: [2, 3], size: [6, 10], postsPer: 0.6 },
  growing:   { circles: [4, 6], size: [10, 16], postsPer: 0.8 },
  thriving:  { circles: [8, 12], size: [16, 24], postsPer: 1.0 },
}
// Rank bands (ghost -> luminary) — economy values per rank.
const BAND = {
  ghost:     { z: [5, 95],     g: [5, 60],     s: [0, 3],   a: [1, 4] },
  runner:    { z: [100, 290],  g: [50, 150],   s: [2, 8],   a: [4, 7] },
  operative: { z: [300, 740],  g: [150, 400],  s: [5, 14],  a: [7, 11] },
  agent:     { z: [750, 1450], g: [400, 800],  s: [10, 20], a: [11, 16] },
  conduit:   { z: [1500, 2100],g: [800, 1400], s: [16, 30], a: [16, 22] },
  luminary:  { z: [2200, 3200],g: [1500, 2500],s: [30, 52], a: [22, 28] },
} as const
type Rank = keyof typeof BAND
// A believable roster: 1 host (conduit), a couple crew (agent), a long low tail.
function rosterRanks(r: Rand, size: number): Rank[] {
  const ranks: Rank[] = ['conduit'] // host
  if (size > 8) ranks.push('agent')
  if (size > 14) ranks.push('agent')
  while (ranks.length < size) {
    const roll = r()
    ranks.push(roll < 0.45 ? 'ghost' : roll < 0.78 ? 'runner' : 'operative')
  }
  return ranks
}

export type AreaSpec = {
  areaName: string
  centerLat: number
  centerLng: number
  radiusMi: number
  aliveness: keyof typeof ALIVE
  channels: string[]
  flavorWords: string[]
  aiPolish: boolean
  seed?: string
}
export type PersonPlan = {
  key: string; name: string; handle: string; rank: Rank
  role: 'host' | 'crew' | 'member'; bio: string
  zaps: number; gems: number; streak: number; achievements: number
  tenureWeeks: number
}
export type CirclePlan = {
  key: string; name: string; slug: string; channel: string
  lat: number; lng: number; about: string
  people: PersonPlan[]
  posts: { authorKey: string; body: string; ageMin: number; replies: { authorKey: string; body: string }[] }[]
  event: { title: string; daysOut: number }
}
export type AreaPlan = { spec: AreaSpec; circles: CirclePlan[]; totals: Record<string, number> }

function tenureForRank(r: Rand, rank: Rank): number {
  const map: Record<Rank, [number, number]> = {
    ghost: [0, 4], runner: [4, 16], operative: [12, 30],
    agent: [24, 44], conduit: [36, 52], luminary: [44, 52],
  }
  return int(r, ...map[rank])
}

export function buildPlan(spec: AreaSpec): AreaPlan {
  const r = rng(spec.seed ?? `${spec.areaName}:${spec.aliveness}:${spec.channels.join(',')}`)
  const shape = ALIVE[spec.aliveness]
  const nCircles = int(r, ...shape.circles)
  const channels = spec.channels.length ? spec.channels : ['movement', 'holistic-health', 'creative']
  const usedHandles = new Set<string>()
  const flavor = spec.flavorWords.filter(Boolean)

  const circles: CirclePlan[] = []
  const totals = { circles: 0, people: 0, posts: 0, replies: 0, events: 0 }

  for (let c = 0; c < nCircles; c++) {
    const chSlug = channels[c % channels.length]
    const ch = CH[chSlug] ?? CH.movement
    const place = flavor.length ? pick(r, flavor) : spec.areaName
    const activity = pick(r, ch.activities)
    const name = `${place} ${ch.label}`.slice(0, 60)
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${int(r, 100, 999)}`
    const size = int(r, ...shape.size)
    const ranks = rosterRanks(r, size)
    // scatter circle within radius (~1 mi ≈ 0.0145 deg lat)
    const degRad = (spec.radiusMi * 0.0145)
    const lat = +(spec.centerLat + (r() - 0.5) * degRad).toFixed(6)
    const lng = +(spec.centerLng + (r() - 0.5) * degRad).toFixed(6)

    const people: PersonPlan[] = ranks.map((rank, i) => {
      const first = pick(r, FIRST), last = pick(r, LAST)
      let handle = `${first}.${last}`.toLowerCase()
      while (usedHandles.has(handle)) handle = `${first}.${last}${int(r, 2, 99)}`.toLowerCase()
      usedHandles.add(handle)
      const role: PersonPlan['role'] = i === 0 ? 'host' : rank === 'agent' && i <= 2 ? 'crew' : 'member'
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
    const nPosts = Math.max(3, Math.round(size * shape.postsPer))
    for (let p = 0; p < nPosts; p++) {
      const author = people[int(r, 0, people.length - 1)]
      const poolByStage =
        author.rank === 'ghost' ? ch.intro :
        author.rank === 'conduit' || author.rank === 'luminary' ? ch.host : ch.regular
      const body = fill(pick(r, poolByStage), {
        place, activity, day: pick(r, DAYS), time: pick(r, TIMES),
      })
      const ageMin = int(r, 30, Math.max(60, author.tenureWeeks * 7 * 24 * 60))
      const nReplies = r() < 0.5 ? int(r, 1, 4) : 0
      const replies = Array.from({ length: nReplies }, () => {
        const rep = people[int(r, 0, people.length - 1)]
        return { authorKey: rep.key, body: pick(r, ch.reply) }
      })
      posts.push({ authorKey: author.key, body, ageMin, replies })
      totals.replies += replies.length
    }

    circles.push({
      key: slug, name, slug, channel: chSlug, lat, lng,
      about: fill('A {activity} circle in {place}. All levels, good company.', { activity, place }),
      people, posts,
      event: { title: fill(pick(r, ch.event), { day: pick(r, DAYS), activity }), daysOut: int(r, 2, 18) },
    })
    totals.circles++; totals.people += people.length; totals.posts += posts.length; totals.events++
  }

  return { spec, circles, totals }
}

// A tiny slice for the wizard's preview step (no DB writes).
export function previewPlan(plan: AreaPlan) {
  const c = plan.circles[0]
  const sample = c?.people.slice(0, 3).map((p) => ({ name: p.name, handle: p.handle, rank: p.rank, bio: p.bio })) ?? []
  const thread = c?.posts.find((p) => p.replies.length) ?? c?.posts[0]
  const author = c?.people.find((p) => p.key === thread?.authorKey)
  return {
    circles: plan.circles.map((x) => ({ name: x.name, channel: x.channel, members: x.people.length })),
    samplePeople: sample,
    sampleThread: thread && author
      ? { author: author.name, body: thread.body,
          replies: thread.replies.map((rep) => ({
            author: c!.people.find((p) => p.key === rep.authorKey)?.name ?? 'A member', body: rep.body })) }
      : null,
    totals: plan.totals,
  }
}

// ── Commit ───────────────────────────────────────────────────────────────────
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}
async function channelId(d: SupabaseClient, slug: string): Promise<string | null> {
  const { data } = await d.from('topical_channels').select('id').eq('slug', slug).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
async function regionId(d: SupabaseClient): Promise<string | null> {
  const { data } = await d.from('nexus_regions').select('id').order('depth').limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Write the plan via the service-role admin client. Returns counts. */
export async function commitPlan(plan: AreaPlan): Promise<Record<string, number>> {
  const d = db()
  const region = await regionId(d)
  const done = { circles: 0, members: 0, posts: 0, events: 0 }

  for (const c of plan.circles) {
    const chId = await channelId(d, c.channel)
    const { data: circ } = await d.from('circles').insert({
      name: c.name, slug: c.slug, hub_id: null, type: 'in-person', member_cap: 50,
      status: 'active', about: c.about, latitude: c.lat, longitude: c.lng,
      city: plan.spec.areaName, topical_channel_id: chId,
      image_url: `https://picsum.photos/seed/${c.slug}/400/400`, is_demo: true,
    }).select('id').single()
    if (!circ) continue
    const circleId = (circ as { id: string }).id
    done.circles++

    // people + memberships, capture ids by key
    const idByKey: Record<string, string> = {}
    let hostId: string | null = null
    for (const p of c.people) {
      const { data: prof } = await d.from('profiles').insert({
        auth_user_id: null, display_name: p.name, handle: p.handle,
        community_role: p.role, nexus_region_id: region, bio: p.bio,
        avatar_url: `https://i.pravatar.cc/240?u=${p.handle}`,
        current_season_rank: p.rank, current_season_zaps: p.zaps, lifetime_zaps: p.zaps,
        lifetime_gems: p.gems, current_streak: p.streak, longest_streak: p.streak,
        achievement_count: p.achievements, season_challenges_complete: p.rank === 'luminary',
        last_seen_at: new Date(Date.now() - Math.floor(Math.random() * 72) * 3600_000).toISOString(),
        is_active: true, is_demo: true,
      }).select('id').single()
      if (!prof) continue
      const pid = (prof as { id: string }).id
      idByKey[p.key] = pid
      if (p.role === 'host') hostId = pid
      await d.from('memberships').insert({
        profile_id: pid, circle_id: circleId, status: 'active',
        volunteer_role: p.role === 'member' ? null : p.role,
      })
      done.members++
    }

    // posts + replies
    for (const post of c.posts) {
      const authorId = idByKey[post.authorKey]
      if (!authorId) continue
      const { data: pp } = await d.from('posts').insert({
        author_id: authorId, scope_id: circleId, visibility: 'group', body: post.body,
        created_at: new Date(Date.now() - post.ageMin * 60_000).toISOString(), is_demo: true,
      }).select('id').single()
      done.posts++
      const parentId = (pp as { id: string } | null)?.id
      for (const rep of post.replies) {
        const rid = idByKey[rep.authorKey]
        if (!rid || !parentId) continue
        await d.from('posts').insert({
          author_id: rid, parent_id: parentId, scope_id: circleId, visibility: 'group',
          body: rep.body, is_demo: true,
        })
      }
    }

    // an upcoming event hosted by the host
    if (hostId) {
      const starts = new Date(Date.now() + c.event.daysOut * 86400_000); starts.setHours(8, 0, 0, 0)
      await d.from('events').insert({
        host_id: hostId, scope_id: circleId, scope_type: 'circle', title: c.event.title,
        slug: `${c.slug}-${c.event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
        starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 5_400_000).toISOString(),
        location: plan.spec.areaName, is_cancelled: false, is_demo: true,
      })
      done.events++
    }
  }
  return done
}
