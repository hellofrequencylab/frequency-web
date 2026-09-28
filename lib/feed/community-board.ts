import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { circleEventVisibilities } from '@/lib/events/circle-upcoming'
import { seriesUpcomingFloor } from '@/lib/events/series'
import { readFeedRpc } from '@/lib/feed/load-feed'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// THE FEED'S COMMUNITY BOARD — the reader behind the rail's first panel on /feed
// (CORE-MODEL §5 Phase 7.5.3, ADR-1294; placed in the rail by ADR-1362). Two facts, both about
// the people a member already belongs to:
//
//   • the next GATHERING in one of their Circles, and
//   • the most recent posts in their SPACES.
//
// Two of the four nouns, read once per request. The Quest board this replaced is not gone — it
// moved to the right rail, where the game reads as "a side thing we all do together" rather than
// the first thing home says.
//
// THE POLICIES ARE THE GATE (LIVE-335, ADR-1545). This module read on the service role from
// 2026-09-15 to 2026-09-28 because the live SELECT policies could not express the board for a plain
// member: `events` admitted `circle_only` only at a retired rung, `spaces_read_active` hid an
// owner's own Space behind status = 'active', and the one `posts` policy admitted a `cluster`
// announcement only to someone already in the Circle. 20270345007700 (ADR-1514) re-cut all three,
// with a pgTAP proof, and this module now runs on the SESSION client: what it may show a member is
// what the policies let that member read, and a Circle or Space the member cannot see cannot be
// summed into their board by a query that happens to name it.
//
// The one read the policies still cannot serve is the AUTHOR LINE. The `profiles` policy admits
// another member's row only in the reader's own region, and nearly every profile carries no
// region, so a session read of `profiles` returns the reader alone. The posts therefore come
// through `scoped_feed_for_viewer`, the SECURITY DEFINER feed RPC that already returns `author`
// for the Circle wall and the Channel page, and 20270345009100 gave it the same Space-member
// `cluster` arm the policy has, so the RPC and the policy answer alike for the same member.
//
// The query still narrows, because belonging to a Space is not belonging to its Circles:
//   • a gathering is only eligible when it belongs to a Circle this member is ACTIVE in and its
//     visibility is one an insider may be shown (`circleEventVisibilities(true)` — never
//     `unlisted`, never `private`). The same rule the rail's EventsPanel applies, from the same
//     one list.
//   • a post is only eligible when its Circle is owned by a Space this member belongs to or owns,
//     that Circle is neither draft, archived nor unlisted, and the post is `public` or `cluster`.
//     A `group` post (circle-members only) is never eligible here even though the RPC would hand
//     one back for a Circle the member did join: the board is about the Space, and a member of
//     the Circle sees its `group` posts in the feed stream below. See `spaceActivity`.
//
// FAIL-SAFE, never an error: any read that throws or errors degrades that half to nothing, so the
// module falls back to its empty state rather than taking the feed down with it.

/** Space posts the board shows. Three: enough to read as activity, short enough to scan. */
export const BOARD_ACTIVITY_SLOTS = 3

/** Post visibilities the Space half may surface. Never `group`: that is the Circle's own room. */
export const BOARD_POST_VISIBILITIES = ['public', 'cluster'] as const

/** How many rows to ask the RPC for before the visibility narrowing above takes its three. The RPC
 *  may hand back `group` posts for Circles the member joined, and those are dropped here, so the
 *  ask is wider than the slots or a busy Circle room could starve the Space's announcements. */
const BOARD_ACTIVITY_ASK = 12

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

type Db = Awaited<ReturnType<typeof createClient>>

/** The member's active Circle ids and the Space ids they belong to or own. */
async function belongsTo(db: Db, profileId: string): Promise<{ circleIds: string[]; spaceIds: string[] }> {
  try {
    const [{ data: circles }, { data: members }, { data: owned }] = await Promise.all([
      db.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
      db.from('space_members').select('space_id').eq('profile_id', profileId).eq('status', 'active'),
      // A Space's owner holds no `space_members` row (the same asymmetry lib/dispatches.ts
      // handles), so their own Space would otherwise be missing from their board. Under RLS the
      // owner arm of spaces_read_active (ADR-1514) is what answers this read.
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

/** The shape `scoped_feed_for_viewer` hands back that this half reads. */
interface ScopedFeedRow {
  id: string
  body: string | null
  created_at: string | null
  scope_id: string | null
  visibility: string | null
  author: { display_name?: string | null } | null
}

/**
 * The newest posts in the Circles those Spaces OWN, with the Space's brand name and the author.
 *
 * 🔴 POSTS ARE CIRCLE-SCOPED, NOT SPACE-SCOPED, and this half read the wrong thing until
 * 2026-09-15. `posts` carries a bare `scope_id` and no `scope_type` column, and every writer in
 * the repo stamps a CIRCLE id on it (`app/(main)/feed/actions.ts`, `lib/circles/remix.ts`,
 * `app/(main)/admin/actions.ts`; `lib/system-line.ts` uses the system profile's own id). No path
 * anywhere scopes a post to a Space, no Space surface reads `posts`, and a live join of `posts` to
 * `spaces` returned ZERO rows. So `.in('scope_id', spaceIds)` could only ever return nothing, and
 * the fail-safe below would have hidden that forever.
 *
 * "In your Spaces" therefore resolves through `circles.space_id`: the Circles a Space owns are
 * what a Space publishes.
 *
 * THE POSTS COME THROUGH THE FEED RPC, for the author line (see the header): `scoped_feed_for_viewer`
 * already filters to top-level, unhidden posts in a discoverable Circle, admits `cluster` to a
 * member of the owning Space (20270345009100), and returns the author. It is asked newest-first
 * and wider than the slots, then narrowed here:
 *   • draft, archived and unlisted Circles never reach it, mirroring the `circles` read policy;
 *   • only `public` and `cluster` posts survive. A `group` post is circle-members-only, and this
 *     board is about the Space, so surfacing one here would put a Circle's room on a Space's
 *     noticeboard. A member of the Circle still sees its `group` posts in the feed stream.
 */
async function spaceActivity(db: Db, spaceIds: string[]): Promise<BoardSpacePost[]> {
  if (spaceIds.length === 0) return []
  try {
    const { data: circleRows } = await db
      .from('circles')
      .select('id, space_id, status, unlisted')
      .in('space_id', spaceIds)
      .not('status', 'in', '(draft,archived)')
      .eq('unlisted', false)
    const spaceOfCircle = new Map<string, string>()
    for (const c of (circleRows ?? []) as { id: string; space_id: string | null }[]) {
      if (c.space_id) spaceOfCircle.set(c.id, c.space_id)
    }
    if (spaceOfCircle.size === 0) return []

    const feed = readFeedRpc<ScopedFeedRow>(
      'scoped_feed_for_viewer',
      await db.rpc('scoped_feed_for_viewer', {
        _scope_ids: [...spaceOfCircle.keys()],
        _sort: 'newest',
        _limit: BOARD_ACTIVITY_ASK,
      }),
    )
    if (feed.kind !== 'ok') return []
    const allowed = new Set<string>(BOARD_POST_VISIBILITIES)
    const rows = feed.items
      .filter((r) => !!r.visibility && allowed.has(r.visibility) && !!(r.body ?? '').trim())
      .slice(0, BOARD_ACTIVITY_SLOTS)
    if (rows.length === 0) return []

    const spaceIdsSeen = [
      ...new Set(
        rows
          .map((r) => (r.scope_id ? spaceOfCircle.get(r.scope_id) : undefined))
          .filter((id): id is string => !!id),
      ),
    ]
    const { data: spaces } = await db
      .from('spaces')
      .select('id, name, brand_name, slug')
      .in('id', spaceIdsSeen)
    const byId = new Map<string, { name: string; slug: string | null }>()
    for (const s of (spaces ?? []) as { id: string; name: string | null; brand_name: string | null; slug: string | null }[]) {
      byId.set(s.id, { name: s.brand_name?.trim() || s.name || 'Space', slug: s.slug })
    }

    const out: BoardSpacePost[] = []
    for (const r of rows) {
      const body = (r.body ?? '').trim()
      const spaceId = r.scope_id ? spaceOfCircle.get(r.scope_id) : undefined
      const space = spaceId ? byId.get(spaceId) : undefined
      if (!body || !space) continue
      out.push({
        id: r.id,
        body,
        createdAt: r.created_at ?? new Date().toISOString(),
        authorName: r.author?.display_name ?? null,
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
 *
 * `profileId` is the signed-in member's own profile id (both callers resolve it from the session
 * first). Under RLS it can be nothing else: a foreign id would read that member's memberships as
 * an outsider and come back empty, which is the policies doing their job.
 */
export const getCommunityBoard = cache(async function getCommunityBoard(
  profileId: string,
): Promise<CommunityBoard> {
  const db = await createClient()
  const { circleIds, spaceIds } = await belongsTo(db, profileId)
  const [gathering, activity] = await Promise.all([
    nextGathering(db, circleIds),
    spaceActivity(db, spaceIds),
  ])
  return { gathering, activity, circleCount: circleIds.length, spaceCount: spaceIds.length }
})
