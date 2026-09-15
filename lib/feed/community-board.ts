import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { circleEventVisibilities } from '@/lib/events/circle-upcoming'
import { seriesUpcomingFloor } from '@/lib/events/series'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// THE FEED'S COMMUNITY BOARD — the reader behind the first module above the composer
// (CORE-MODEL §5 Phase 7.5.3, ADR-1294). Two facts, both about the people a member already
// belongs to:
//
//   • the next GATHERING in one of their Circles, and
//   • the most recent posts in their SPACES.
//
// Two of the four nouns, read once per request. The Quest board this replaced is not gone — it
// moved to the right rail, where the game reads as "a side thing we all do together" rather than
// the first thing home says.
//
// SCOPE IS THE POLICY. These reads go through the service-role admin client, so the query is the
// gate. WHY the bypass, measured rather than assumed: the live SELECT policies cannot express this
// board for a plain member. `posts` has one read policy and every branch of it is keyed to CIRCLE
// scope, so a post scoped to a SPACE matches nothing; `events` grants `circle_only` only at role
// `crew` or above; and `spaces_read_active` hides a member's own private or draft Space because an
// owner holds no `space_members` row. The full reading is in scripts/admin-client-baseline.txt
// beside this file's entry.
//
// So the QUERY is the gate: a gathering is only eligible when it belongs to a Circle this member is
// ACTIVE in and its visibility is one an insider may be shown (`circleEventVisibilities(true)` —
// never `unlisted`, never `private`), and a post is only eligible when its scope is a Space this
// member is an active member of or owns. The same rule the rail's EventsPanel applies, from the
// same one list.
//
// FAIL-SAFE, never an error: any read that throws or errors degrades that half to nothing, so the
// module falls back to its empty state rather than taking the feed down with it.

/** Space posts the board shows. Three: enough to read as activity, short enough to scan. */
export const BOARD_ACTIVITY_SLOTS = 3

export interface BoardGathering {
  id: string
  title: string
  slug: string
  startsAt: string
  location: string | null
  /** The Circle it belongs to, when the name resolves. */
  circleName: string | null
  circleSlug: string | null
}

export interface BoardSpacePost {
  id: string
  body: string
  createdAt: string
  authorName: string | null
  spaceName: string
  spaceSlug: string | null
}

export interface CommunityBoard {
  /** The next upcoming event in one of the member's Circles, or null. */
  gathering: BoardGathering | null
  /** Recent posts across the member's Spaces, newest first. */
  activity: BoardSpacePost[]
  /** How many Circles / Spaces the member belongs to — the empty state reads differently
   *  for "you have no Circles yet" than for "your Circles have nothing on". */
  circleCount: number
  spaceCount: number
}

export const EMPTY_BOARD: CommunityBoard = {
  gathering: null,
  activity: [],
  circleCount: 0,
  spaceCount: 0,
}

type Db = ReturnType<typeof createAdminClient>

/** The member's active Circle ids and the Space ids they belong to or own. */
async function belongsTo(db: Db, profileId: string): Promise<{ circleIds: string[]; spaceIds: string[] }> {
  try {
    const [{ data: circles }, { data: members }, { data: owned }] = await Promise.all([
      db.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
      db.from('space_members').select('space_id').eq('profile_id', profileId).eq('status', 'active'),
      // A Space's owner holds no `space_members` row (the same asymmetry lib/dispatches.ts
      // handles), so their own Space would otherwise be missing from their board.
      db.from('spaces').select('id').eq('owner_profile_id', profileId),
    ])
    const spaceIds = new Set<string>()
    for (const r of (members ?? []) as { space_id: string }[]) spaceIds.add(r.space_id)
    for (const r of (owned ?? []) as { id: string }[]) spaceIds.add(r.id)
    return {
      circleIds: ((circles ?? []) as { circle_id: string }[]).map((r) => r.circle_id),
      spaceIds: [...spaceIds],
    }
  } catch {
    return { circleIds: [], spaceIds: [] }
  }
}

/** The next upcoming event in any of those Circles, with its Circle's name. */
async function nextGathering(db: Db, circleIds: string[]): Promise<BoardGathering | null> {
  if (circleIds.length === 0) return null
  // WALL CLOCK in the community's zone, not `new Date()`: events.starts_at stores the host's wall
  // clock kept as UTC parts, so at 5:01pm Pacific `new Date().toISOString()` is already tomorrow
  // and tonight's 7pm gathering drops off the board. Same floor the rail's EventsPanel uses.
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  try {
    const { data } = await db
      .from('events')
      .select('id, title, slug, location, starts_at, scope_id')
      .in('scope_id', circleIds)
      .in('scope_type', ['circle', 'group'])
      .eq('status', 'published')
      .in('visibility', circleEventVisibilities(true))
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(1)
    const row = (data ?? [])[0] as
      | { id: string; title: string; slug: string; location: string | null; starts_at: string; scope_id: string | null }
      | undefined
    if (!row) return null

    let circleName: string | null = null
    let circleSlug: string | null = null
    if (row.scope_id) {
      const { data: circle } = await db.from('circles').select('name, slug').eq('id', row.scope_id).maybeSingle()
      const c = circle as { name: string | null; slug: string | null } | null
      circleName = c?.name ?? null
      circleSlug = c?.slug ?? null
    }
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      startsAt: row.starts_at,
      location: row.location,
      circleName,
      circleSlug,
    }
  } catch {
    return null
  }
}

/** The newest posts across those Spaces, with the Space's brand name and the author. */
async function spaceActivity(db: Db, spaceIds: string[]): Promise<BoardSpacePost[]> {
  if (spaceIds.length === 0) return []
  try {
    const { data } = await db
      .from('posts')
      .select('id, body, created_at, scope_id, author:profiles!author_id ( display_name )')
      .in('scope_id', spaceIds)
      .is('parent_id', null)
      .is('hidden_at', null)
      .not('body', 'is', null)
      .order('created_at', { ascending: false })
      .limit(BOARD_ACTIVITY_SLOTS)
    const rows = (data ?? []) as {
      id: string
      body: string | null
      created_at: string | null
      scope_id: string | null
      author: { display_name: string | null } | { display_name: string | null }[] | null
    }[]
    if (rows.length === 0) return []

    const { data: spaces } = await db
      .from('spaces')
      .select('id, name, brand_name, slug')
      .in('id', [...new Set(rows.map((r) => r.scope_id).filter((id): id is string => !!id))])
    const byId = new Map<string, { name: string; slug: string | null }>()
    for (const s of (spaces ?? []) as { id: string; name: string | null; brand_name: string | null; slug: string | null }[]) {
      byId.set(s.id, { name: s.brand_name?.trim() || s.name || 'Space', slug: s.slug })
    }

    const out: BoardSpacePost[] = []
    for (const r of rows) {
      const body = (r.body ?? '').trim()
      const space = r.scope_id ? byId.get(r.scope_id) : undefined
      if (!body || !space) continue
      const author = Array.isArray(r.author) ? r.author[0] : r.author
      out.push({
        id: r.id,
        body,
        createdAt: r.created_at ?? new Date().toISOString(),
        authorName: author?.display_name ?? null,
        spaceName: space.name,
        spaceSlug: space.slug,
      })
    }
    return out
  } catch {
    return []
  }
}

/**
 * The board for one member. `cache()`d per request: the feed page renders the module and its
 * own tests read the same shape, and nothing should pay for the reads twice.
 */
export const getCommunityBoard = cache(async function getCommunityBoard(
  profileId: string,
): Promise<CommunityBoard> {
  const db = createAdminClient()
  const { circleIds, spaceIds } = await belongsTo(db, profileId)
  const [gathering, activity] = await Promise.all([
    nextGathering(db, circleIds),
    spaceActivity(db, spaceIds),
  ])
  return { gathering, activity, circleCount: circleIds.length, spaceCount: spaceIds.length }
})
