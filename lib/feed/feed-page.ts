import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { readFeedRpc, type FeedLoad } from '@/lib/feed/load-feed'
import { rankFeedPosts } from '@/lib/feed-rank'
import { blendRank, feedNowMs } from '@/lib/feed/blend-rank'
import { getViewerResonanceMap } from '@/lib/feed/viewer-resonance'

// One page of the feed for /api/v1/feed (LIVE-716). The same two RPCs the web's FeedList reads
// (components/feed/feed-list.tsx `loadPosts`), on the caller's own client so the reach model stays
// in the database, and the same ranking: 'relevant' is the blended resonance rank, 'popular' is pure
// engagement, 'recent' is recency. The web's furniture (the lead Dispatch, the nearest event) is
// page chrome and stays on the web.
//
// The RPCs take a limit and no cursor, so this is one page today (`nextCursor` null). A cursor is
// an additive change once the RPC takes one; filtering after the limit would starve a page.

export interface FeedRow {
  id: string
  body: string | null
  post_type: string
  is_pinned: boolean
  created_at: string
  media_urls: string[] | null
  is_demo?: boolean
  reaction_count: number | null
  comment_count: number | null
  engagement_score: number | null
  scope_id: string | null
  visibility: string | null
  distance_m?: number | null
  author: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }
  reactions: Array<{ id: string; reaction_type: string; profile_id: string }> | null
}

const PAGE = 40

export async function loadFeedPage(args: {
  profileId: string
  sort: 'recent' | 'relevant' | 'popular'
  scopeId?: string | null
}): Promise<FeedLoad<FeedRow>> {
  const { profileId, sort, scopeId } = args
  const fetchSort = sort === 'popular' ? 'relevant' : sort
  const supabase = await createClient()
  const [loaded, resonance] = await Promise.all([
    scopeId
      ? supabase
          .rpc('scoped_feed_for_viewer', { _scope_ids: [scopeId], _sort: fetchSort, _limit: 30 })
          .then((res) => readFeedRpc<FeedRow>('scoped_feed_for_viewer', res))
      : supabase
          .rpc('feed_for_viewer', { _sort: fetchSort, _limit: PAGE })
          .then((res) => readFeedRpc<FeedRow>('feed_for_viewer', res)),
    sort === 'relevant' ? getViewerResonanceMap(profileId) : null,
  ])
  if (loaded.kind === 'error') return loaded
  if (resonance) {
    const items = loaded.items.map((p) => ({ ...p, authorId: p.author.id, distance_m: p.distance_m ?? null }))
    return { kind: 'ok', items: blendRank(items, { nowMs: feedNowMs(), resonance, radiusM: 25000 }, PAGE) }
  }
  return { kind: 'ok', items: rankFeedPosts(loaded.items, fetchSort, PAGE) }
}
