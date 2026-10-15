import 'server-only'
import { cache } from 'react'
import { getPublicEvents, getPublicPosts, type PublicEvent } from '@/lib/discover'
import { rankHomeEvents, wallNowMs, type HomeHistory, type RankedHomeEvent } from '@/lib/feed/home-rank'
import { HOME_TZ } from '@/lib/time/zone'
import type { FeedRow } from '@/lib/feed/feed-page'

// THE ANONYMOUS FEED'S READS (SCAN-889). A signed-out visitor on /feed (Frequency) sees the real member
// Feed with the viewer drawn as Anonymous (lib/nav/anon-feed.ts). Where the member Feed reads through the
// viewer's profile, this reads the PUBLIC data lib/discover already serves the anonymous /discover pages,
// and nothing else:
//
//   posts   public_posts: visibility 'public', top-level, not hidden, a safe author shape
//   events  public_events: upcoming, published, visibility 'public', never a walled Space's
//
// Both are SECURITY DEFINER RPCs called through createPublicClient (cookieless, the `anon` role), so no
// admin client, no viewer cookie and no member-only row is in reach. React-cached per request, so the
// Feed body and the right rail share one read of each.

/** The stand-in viewer the member shell draws for a signed-out visitor. No id a read could key on. */
export const ANON_FEED_PROFILE = {
  id: '',
  display_name: 'Friend', // SCAN-911: "Good evening, Friend." (was Anonymous)
  handle: 'anonymous',
  avatar_url: null,
  community_role: 'member',
} as const

export const loadAnonPublicEvents = cache((): Promise<PublicEvent[]> => getPublicEvents(12))

// VERA'S LINES ON THE PUBLIC FEED (SCAN-911). The platform system profile (profiles.is_system, drawn as
// "Vera"; its handle is `moderation`) posts the automated lines through lib/system-line.ts: join notices
// and personal streak milestones. public_posts does not return post_type, so they arrived here as full
// posts and outnumbered the members. On the public Feed:
//   · a streak milestone is a member's own moment, not a public headline, so it is left out;
//   · join notices become the member Feed's quiet one-line notice (post_type 'system', PostItem's .fa-join),
//     and a run of them collapses into ONE line ("@a, @b and 3 more joined"), so joins read as activity
//     between posts instead of posts.
const SYSTEM_HANDLE = 'moderation'
const JOIN_RE = /joined (?:the community|through @[A-Za-z0-9_]+)/
const MENTION_RE = /@[A-Za-z0-9_]+/

function joinLine(handles: string[]): string {
  const shown = handles.slice(0, 3)
  const more = handles.length - shown.length
  if (more > 0) return `${shown.join(', ')} and ${more} more joined 👋`
  if (shown.length === 1) return `${shown[0]} joined 👋`
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]} joined 👋`
}

/** Public posts in the member stream's row shape (lib/feed/feed-page.ts FeedRow), counts unknown, with
 *  Vera's lines folded as above. */
export const loadAnonPosts = cache(async (): Promise<FeedRow[]> => {
  const posts = await getPublicPosts(50)
  const out: FeedRow[] = []
  let run: { first: (typeof posts)[number]; handles: string[] } | null = null
  const flush = () => {
    if (!run) return
    out.push({
      id: run.first.id,
      body: joinLine(run.handles),
      post_type: 'system',
      is_pinned: false,
      created_at: run.first.created_at,
      media_urls: null,
      reaction_count: null,
      comment_count: null,
      engagement_score: null,
      scope_id: null,
      visibility: 'public',
      author: { id: '', display_name: null, handle: null, avatar_url: null },
      reactions: [],
    })
    run = null
  }
  for (const p of posts) {
    if (p.author_handle === SYSTEM_HANDLE) {
      const who = JOIN_RE.test(p.body ?? '') ? MENTION_RE.exec(p.body)?.[0] : undefined
      if (!who) continue // a streak milestone or any other automated line stays off the public Feed
      if (run) run.handles.push(who)
      else run = { first: p, handles: [who] }
      continue
    }
    flush()
    out.push({
      id: p.id,
      body: p.body,
      post_type: 'post',
      is_pinned: false,
      created_at: p.created_at,
      media_urls: p.media_urls,
      reaction_count: null,
      comment_count: null,
      engagement_score: null,
      scope_id: null,
      visibility: 'public',
      author: { id: '', display_name: p.author_display_name, handle: p.author_handle, avatar_url: p.author_avatar_url },
      reactions: [],
    })
  }
  flush()
  return out
})

const NO_HISTORY: HomeHistory = { hostCounts: {}, spaceCounts: {}, hostNames: {}, weekdays: [], hours: [] }

/** The public events, through the member Feed's own ranking (lib/feed/home-rank.ts) with no history,
 *  no home and no RSVPs: the Up next card and Near you list draw them exactly as a member's. */
export function rankAnonEvents(events: PublicEvent[], now = new Date()): RankedHomeEvent[] {
  return rankHomeEvents(
    events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      location: e.city,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      category: null,
      energyTag: null,
      coverUrl: null,
      hostId: null,
      hostSpaceId: null,
      hostName: e.circle_name,
      myCircleName: null,
      distanceMi: null,
      goingCount: 0,
      friends: [],
      myStatus: null,
    })),
    NO_HISTORY,
    wallNowMs(now, HOME_TZ),
  )
}
