// Demo network generator — the runtime engine behind the admin "grow the network"
// controls. Adding a member or a circle here auto-populates the *relative* content
// that makes them read as real: memberships, a post or two, reactions on existing
// circle posts, an attendance streak, a few achievements, a practice adoption, and
// (for a new circle) a host, a roster, an active practice, and an upcoming event
// with RSVPs. Everything is tagged is_demo so it recedes, toggles, and purges with
// the rest of the demo layer (docs/DEMO-SYSTEM.md). Server-only (admin client).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

const FIRST = [
  'Marina', 'Eli', 'Noa', 'Kai', 'Sage', 'Theo', 'Luna', 'Dax', 'Ivy', 'Rowan',
  'Mira', 'Caleb', 'Zoe', 'Arlo', 'Nina', 'Beau', 'Esme', 'Cy', 'Wren', 'Otis',
  'Lena', 'Remy', 'Hana', 'Jonah', 'Priya', 'Diego', 'Maya', 'Felix', 'Tess', 'Ravi',
  'Sol', 'Imani', 'Bodhi', 'Cleo', 'Finn', 'Aria', 'Malik', 'Saoirse', 'Gus', 'Yara',
]
const LAST = [
  'Hale', 'Reyes', 'Marsh', 'Okafor', 'Bly', 'Nair', 'Frost', 'Costa', 'Vance', 'Quinn',
  'Mercer', 'Salas', 'Wilder', 'Brandt', 'Okada', 'Lindqvist', 'Cole', 'Pike', 'Devlin', 'Marín',
  'Cruz', 'Banner', 'Holm', 'Reed', 'Castellano', 'Voss', 'Ames', 'Bright', 'Calder', 'Dunn',
]

// Rank bands (ghost -> luminary economy values). Added members skew new (mostly
// ghost/runner) — they are joining a year-old community, not founding it.
const BANDS: Record<string, { z: [number, number]; lz: [number, number]; g: [number, number]; s: [number, number]; a: [number, number] }> = {
  ghost:     { z: [5, 95],     lz: [20, 300],    g: [5, 60],     s: [0, 3],   a: [1, 4] },
  runner:    { z: [100, 290],  lz: [300, 800],   g: [50, 150],   s: [2, 8],   a: [4, 7] },
  operative: { z: [300, 740],  lz: [800, 2000],  g: [150, 400],  s: [5, 14],  a: [7, 11] },
  conduit:   { z: [1500, 2100],lz: [4000, 7000], g: [800, 1400], s: [16, 30], a: [16, 22] },
}
const NEW_MEMBER_RANKS = ['ghost', 'ghost', 'ghost', 'runner', 'runner', 'operative'] as const

const BIOS = [
  'New to the circle and already hooked.', 'Here for the people as much as the practice.',
  'Showed up once on a whim, never left.', 'Found my crew in North County at last.',
  'Quietly consistent. See you out there.', 'Trading screen time for this.',
  'Late bloomer, full send.', 'Came for one thing, stayed for all of it.',
]
const POSTS = [
  'First time joining today — everyone was so welcoming. Already looking forward to the next one.',
  'Cannot believe I waited this long to come out. This is exactly what I needed.',
  'Signed up nervous, leaving grinning. Thanks for making space for a newcomer.',
  'Three weeks in and this is the best decision I have made all year.',
  'Brought a friend this time. We are both converts now.',
  'Still figuring out the rhythm but loving every minute of it.',
]

const rand = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: readonly T[]): T => a[rand(a.length)]
const between = ([lo, hi]: [number, number]) => lo + rand(hi - lo + 1)

function person(rank: keyof typeof BANDS) {
  const b = BANDS[rank]
  const z = between(b.z)
  const s = between(b.s)
  const first = pick(FIRST)
  const last = pick(LAST)
  const handle = `${first}.${last}${rand(9000) + 1000}`.toLowerCase()
  return {
    display_name: `${first} ${last}`,
    handle,
    rank,
    current_season_zaps: z,
    lifetime_zaps: Math.max(z, between(b.lz)),
    lifetime_gems: between(b.g),
    current_streak: s,
    longest_streak: s + rand(6),
    achievement_count: between(b.a),
  }
}

/** Insert one demo profile + its relative content into a circle. Returns the id. */
async function seedMember(
  d: SupabaseClient,
  circleId: string,
  rank: keyof typeof BANDS,
  role: 'host' | 'crew' | 'member',
  activePracticeId: string | null,
  circlePostIds: string[],
): Promise<string> {
  const p = person(rank)
  const { data: prof } = await d
    .from('profiles')
    .insert({
      auth_user_id: null,
      display_name: p.display_name,
      handle: p.handle,
      community_role: role,
      bio: pick(BIOS),
      avatar_url: `https://i.pravatar.cc/240?u=${p.handle}`,
      current_season_rank: p.rank,
      current_season_zaps: p.current_season_zaps,
      lifetime_zaps: p.lifetime_zaps,
      lifetime_gems: p.lifetime_gems,
      current_streak: p.current_streak,
      longest_streak: p.longest_streak,
      achievement_count: p.achievement_count,
      last_seen_at: new Date(Date.now() - rand(72) * 3600_000).toISOString(),
      is_active: true,
      is_demo: true,
    })
    .select('id')
    .single()
  const profileId = (prof as { id: string }).id

  await d.from('memberships').insert({
    profile_id: profileId,
    circle_id: circleId,
    status: 'active',
    volunteer_role: role === 'member' ? null : role,
  })

  // One welcome/intro post scoped to the circle.
  await d
    .from('posts')
    .insert({ author_id: profileId, scope_id: circleId, visibility: 'group', body: pick(POSTS), is_demo: true })

  // Reactions on a few existing circle posts (the relative engagement).
  if (circlePostIds.length) {
    const targets = circlePostIds.slice(0, 5 + rand(5))
    const rows = targets.map((pid) => ({ post_id: pid, profile_id: profileId, reaction_type: 'heart' }))
    if (rows.length) await d.from('post_reactions').insert(rows)
  }

  // Attendance streak backing the profile number.
  if (p.current_streak > 0) {
    await d.from('streaks').insert({
      profile_id: profileId, streak_type: 'attendance',
      current_count: p.current_streak, longest_count: p.longest_streak,
      last_activity_at: new Date().toISOString(),
    })
  }

  // Trophy case: first N achievements by sort_order.
  const { data: achs } = await d.from('achievements').select('id').order('sort_order').limit(p.achievement_count)
  const aRows = (achs as { id: string }[] | null ?? []).map((a) => ({ profile_id: profileId, achievement_id: a.id }))
  if (aRows.length) await d.from('user_achievements').insert(aRows)

  // Adopt the circle's active practice.
  if (activePracticeId) {
    await d.from('member_practices').insert({ profile_id: profileId, practice_id: activePracticeId, active: true })
  }

  return profileId
}

/** Add `count` members (auto-populated) to an existing circle. */
export async function addDemoMembers(circleId: string, count: number): Promise<number> {
  const d = db()
  const n = Math.max(1, Math.min(count, 50))
  const [{ data: cp }, { data: posts }] = await Promise.all([
    d.from('circle_practices').select('practice_id').eq('circle_id', circleId).eq('active', true).maybeSingle(),
    d.from('posts').select('id').eq('scope_id', circleId).eq('is_demo', true).limit(40),
  ])
  const practiceId = (cp as { practice_id: string } | null)?.practice_id ?? null
  const postIds = (posts as { id: string }[] | null ?? []).map((p) => p.id)
  for (let i = 0; i < n; i++) {
    await seedMember(d, circleId, pick(NEW_MEMBER_RANKS), 'member', practiceId, postIds)
  }
  return n
}

/** Spawn a whole new circle with a host, a roster, a practice, and an event. */
export async function addDemoCircle(input: {
  name: string
  channel: string
  city?: string
  size?: number
}): Promise<{ circleId: string; members: number }> {
  const d = db()
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (rand(900) + 100)
  const { data: ch } = await d.from('topical_channels').select('id').eq('slug', input.channel).maybeSingle()
  // Pick a real practice for this channel at runtime (no hard-coded seed UUIDs):
  // prefer one in the matching category, else any public one, else none.
  const { data: pr } = await d
    .from('practices')
    .select('id')
    .eq('is_public', true)
    .eq('category', input.channel)
    .limit(1)
    .maybeSingle()
  const practiceId = (pr as { id: string } | null)?.id ?? null

  const { data: circle } = await d
    .from('circles')
    .insert({
      name: input.name,
      slug,
      hub_id: null,
      type: 'in-person',
      member_cap: 50,
      status: 'active',
      about: `A new ${input.channel.replace(/-/g, ' ')} circle in ${input.city ?? 'Encinitas'}.`,
      latitude: 33.0369 + (rand(40) - 20) / 1000,
      longitude: -117.292 + (rand(40) - 20) / 1000,
      city: input.city ?? 'Encinitas',
      topical_channel_id: (ch as { id: string } | null)?.id ?? null,
      image_url: `https://picsum.photos/seed/${slug}/400/400`,
      is_demo: true,
    })
    .select('id')
    .single()
  const circleId = (circle as { id: string }).id

  // Host first so the circle has a leader; then the roster.
  const hostId = await seedMember(d, circleId, 'conduit', 'host', practiceId, [])
  if (practiceId) {
    await d.from('circle_practices').insert({ circle_id: circleId, practice_id: practiceId, set_by: hostId, active: true })
  }

  const size = Math.max(6, Math.min(input.size ?? 14, 49))
  // crew x2, then members
  await seedMember(d, circleId, 'operative', 'crew', practiceId, [])
  await seedMember(d, circleId, 'operative', 'crew', practiceId, [])
  const { data: posts } = await d.from('posts').select('id').eq('scope_id', circleId).eq('is_demo', true)
  const postIds = (posts as { id: string }[] | null ?? []).map((p) => p.id)
  for (let i = 0; i < size - 3; i++) {
    await seedMember(d, circleId, pick(NEW_MEMBER_RANKS), 'member', practiceId, postIds)
  }

  // An upcoming event + RSVPs from the roster.
  const starts = new Date(Date.now() + (3 + rand(10)) * 86400_000)
  starts.setHours(8, 0, 0, 0)
  const ends = new Date(starts.getTime() + 90 * 60_000)
  const { data: ev } = await d
    .from('events')
    .insert({
      host_id: hostId, scope_id: circleId, scope_type: 'circle',
      title: `${input.name} — First Gathering`,
      slug: `${slug}-first-gathering`,
      starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      location: `${input.city ?? 'Encinitas'}`, is_cancelled: false, is_demo: true,
    })
    .select('id')
    .single()
  if (ev) {
    const { data: mem } = await d.from('memberships').select('profile_id').eq('circle_id', circleId)
    const rows = (mem as { profile_id: string }[] | null ?? [])
      .filter(() => Math.random() < 0.7)
      .map((m) => ({ event_id: (ev as { id: string }).id, profile_id: m.profile_id, status: 'going' }))
    if (rows.length) await d.from('event_rsvps').insert(rows)
  }

  return { circleId, members: size }
}
