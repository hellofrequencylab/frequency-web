// The viewer's interest in each post a feed render is about to show (LIVE-677): cosine similarity
// between the post's vector and the centroid of the posts this viewer recently reacted to, replied
// to or wrote (public.post_interest_scores, migration 20270346002300). The blend reads it as its
// `interest` signal (lib/feed/blend-rank.ts).
//
// Server-only, service role: the RPC is service-role only because it takes a viewer id, and this
// passes the SIGNED-IN viewer's own id. The ids passed in are posts the viewer's RLS read already
// returned. FAIL-SAFE: any miss is an empty map, and an absent score drops the term for that post.
//
// authz-delegated: a READ. post_interest_scores only scores; it writes nothing, and the feed
// loader passes the signed-in viewer's own profile id, never a client-supplied one.

import { createAdminClient } from '@/lib/supabase/admin'

/** Map a cosine similarity (gte-small sits roughly in 0.6..1 for real text) onto [0, 1]. PURE. */
export function interestFromSimilarity(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0
  const v = (similarity - 0.6) / 0.35
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export async function getPostInterest(viewerProfileId: string | null, postIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!viewerProfileId || postIds.length === 0) return out
  try {
    const { data, error } = await createAdminClient().rpc('post_interest_scores', {
      p_viewer: viewerProfileId,
      p_post_ids: [...new Set(postIds)].slice(0, 200),
    })
    if (error || !data) return out
    for (const r of data as Array<{ post_id: string; similarity: number }>) {
      out.set(r.post_id, interestFromSimilarity(Number(r.similarity)))
    }
  } catch {
    /* fail-safe: the blend runs without the interest term */
  }
  return out
}
