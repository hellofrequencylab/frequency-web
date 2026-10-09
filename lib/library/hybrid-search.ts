import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedText } from '@/lib/ai/embed'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { toVectorLiteral } from './embeddings'
import { fuseRankedArms } from './search-rank'
import { fetchLibraryItemsByIds, type LibraryGalleryItem } from './store'

// The Loom: "Most relevant" ranks meaning AND words in one query (LIVE-586, ADR-1597).
//
// Before this, the Studio's relevant sort called a cosine-only RPC and, when that came back empty,
// fell back to the in-process keyword rank. The two never met: an asset whose title IS the query
// could lose to a vague semantic neighbour, and a typo got meaning from the misspelling and no help
// from its letters. search_library_assets (20270345009600) ranks a full-text arm, a title trigram
// arm and, when given an embedding, a cosine arm, and fuses them by reciprocal rank.
//
// The embedding is best effort. With AI off, over the library-search cap, or the embed call failing,
// the RPC gets a null embedding and still ranks the two word arms, so the relevant sort needs no
// fallback of its own. Service-role only, like every Loom read; fails to [] like its neighbours in
// embeddings.ts, with one log line so a broken RPC is visible rather than silently empty.

const FEATURE = 'library-search'

/** One row of the RPC: an id, its fused score, and its rank in each arm (null = that arm missed). */
export type HybridRankRow = {
  id: string
  rrf_score: number
  fts_rank: number | null
  trgm_rank: number | null
  vec_rank: number | null
}

/** Rebuild the three ranked arms from the RPC's per-arm ranks and fold them with the one RRF
 *  function, so the order the page shows is the order the unit test pins. */
export function orderHybridRows(rows: readonly HybridRankRow[]): string[] {
  const arm = (key: 'fts_rank' | 'trgm_rank' | 'vec_rank') =>
    rows
      .filter((r) => typeof r[key] === 'number')
      .sort((a, b) => (a[key] as number) - (b[key] as number))
      .map((r) => r.id)
  return fuseRankedArms([arm('fts_rank'), arm('trgm_rank'), arm('vec_rank')])
}

/** The query embedding, or null when meaning is unavailable. Never throws. */
async function queryEmbedding(q: string, profileId: string | null): Promise<string | null> {
  try {
    if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null
    const v = await embedText(q)
    await recordAiUsage({
      feature: FEATURE,
      model: 'gte-small',
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      profileId,
    })
    return toVectorLiteral(v)
  } catch {
    return null
  }
}

/** "Most relevant" within one Space: words and meaning fused. [] for a blank query or on error. */
export async function searchLibraryAssetsHybrid(
  spaceId: string,
  query: string,
  opts: { kind?: string; limit?: number; profileId?: string | null } = {},
): Promise<LibraryGalleryItem[]> {
  const q = (query || '').trim().slice(0, 300)
  if (!q) return []

  const embedding = await queryEmbedding(q, opts.profileId ?? null)
  try {
    const { data, error } = await createAdminClient().rpc('search_library_assets', {
      p_space_id: spaceId,
      p_query: q,
      // Omitted rather than null: the SQL defaults ARE null, and the generated Args type has no
      // null arm for an optional argument (the match_library_assets precedent).
      p_embedding: embedding ?? undefined,
      p_kind: opts.kind ?? undefined,
      match_count: opts.limit ?? 48,
    })
    if (error) throw new Error(error.message)
    const ids = orderHybridRows((data as HybridRankRow[] | null) ?? [])
    return fetchLibraryItemsByIds(spaceId, ids)
  } catch (e) {
    console.error('[loom] search_library_assets failed:', e instanceof Error ? e.message : e)
    return []
  }
}
