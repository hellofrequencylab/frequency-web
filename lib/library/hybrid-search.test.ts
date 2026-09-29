import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-586: "Most relevant" ranks meaning AND words. Two layers are pinned here:
//   1. the pure fold (fuseRankedArms), with fixtures for the row's two complaints: an exact title
//      must beat a vague neighbour that only the vector arm likes, and a typo must still get the
//      meaning of what it was aiming at;
//   2. the module: it embeds only when AI is on and under budget, passes NO embedding otherwise
//      (so the RPC still ranks words), and orders the page with the same fold.
// The SQL itself is proved on a fresh apply by supabase/tests/search_library_assets.test.sql.

const rpc = vi.fn()
const embedText = vi.fn()
const aiAvailable = vi.fn()
const featureOverBudget = vi.fn()
const fetchLibraryItemsByIds = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))
vi.mock('@/lib/ai/embed', () => ({ EMBED_DIM: 384, embedText: (...a: unknown[]) => embedText(...a) }))
vi.mock('@/lib/ai/usage', () => ({
  aiAvailable: () => aiAvailable(),
  featureOverBudget: (...a: unknown[]) => featureOverBudget(...a),
  recordAiUsage: vi.fn(),
}))
vi.mock('./store', () => ({
  fetchLibraryItemsByIds: (spaceId: string, ids: string[]) => fetchLibraryItemsByIds(spaceId, ids),
}))

import { fuseRankedArms, RRF_K } from './search-rank'
import { orderHybridRows, searchLibraryAssetsHybrid, type HybridRankRow } from './hybrid-search'

const row = (id: string, fts: number | null, trgm: number | null, vec: number | null): HybridRankRow => ({
  id,
  rrf_score: 0,
  fts_rank: fts,
  trgm_rank: trgm,
  vec_rank: vec,
})

describe('fuseRankedArms (reciprocal rank fusion)', () => {
  it('a row found by all three arms outranks a row that tops only one', () => {
    const fts = ['all-three', 'x']
    const trgm = ['all-three', 'y']
    const vec = ['only-vector', 'z', 'q', 'all-three']
    expect(fuseRankedArms([fts, trgm, vec])[0]).toBe('all-three')
  })

  it('an exact title beats the vague neighbour nearest the query embedding', () => {
    // "golden hour": the asset titled Golden hour is first on full text and trigram and only
    // second on meaning; "Warm evening light" is the nearest embedding and nothing else.
    const order = fuseRankedArms([['golden-hour'], ['golden-hour', 'hour-glass'], ['warm-evening', 'golden-hour']])
    expect(order.indexOf('golden-hour')).toBeLessThan(order.indexOf('warm-evening'))
    expect(order[0]).toBe('golden-hour')
  })

  it('a typo with no full-text hit still leads with what it meant, on letters and meaning together', () => {
    // "sunest": full text finds nothing; trigram finds "Sunset over the bay"; the embedding agrees.
    const order = fuseRankedArms([[], ['sunset-bay'], ['sunset-bay', 'blue-icon', 'golden-hour']])
    expect(order[0]).toBe('sunset-bay')
    expect(order).toEqual(['sunset-bay', 'blue-icon', 'golden-hour'])
  })

  it('is total: equal scores break on the best single rank, then id', () => {
    expect(fuseRankedArms([['b', 'a'], ['a', 'b']])).toEqual(['a', 'b'])
    expect(fuseRankedArms([['b'], ['a']])).toEqual(['a', 'b'])
  })

  it('uses the same k as the SQL', () => {
    const sql = readFileSync('supabase/migrations/20270345009600_search_library_assets_hybrid_rank.sql', 'utf8')
    const k = sql.match(/1\.0::double precision \/ \((\d+) \+ arms\.rnk\)/)
    expect(k?.[1]).toBe(String(RRF_K))
  })
})

describe('orderHybridRows', () => {
  it('rebuilds the arms from per-arm ranks and folds them the way the RPC ordered them', () => {
    const rows = [row('warm-evening', null, null, 1), row('golden-hour', 1, 1, 2), row('hour-glass', null, 2, null)]
    expect(orderHybridRows(rows)).toEqual(['golden-hour', 'warm-evening', 'hour-glass'])
  })
})

describe('searchLibraryAssetsHybrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiAvailable.mockResolvedValue(true)
    featureOverBudget.mockResolvedValue(false)
    embedText.mockResolvedValue([0.5, 0, 0.86])
    fetchLibraryItemsByIds.mockImplementation(async (_s: string, ids: string[]) => ids.map((id) => ({ id })))
    rpc.mockResolvedValue({ data: [], error: null })
  })

  it('a typo still gets semantic results: the query is embedded and the vector arm joins the rank', async () => {
    rpc.mockResolvedValue({
      data: [row('sunset-bay', null, 1, 1), row('blue-icon', null, null, 2)],
      error: null,
    })
    const out = await searchLibraryAssetsHybrid('space-1', 'sunest', { limit: 48 })
    expect(embedText).toHaveBeenCalledWith('sunest')
    expect(rpc).toHaveBeenCalledWith('search_library_assets', {
      p_space_id: 'space-1',
      p_query: 'sunest',
      p_embedding: '[0.5,0,0.86]',
      p_kind: undefined,
      match_count: 48,
    })
    expect(out.map((i: { id: string }) => i.id)).toEqual(['sunset-bay', 'blue-icon'])
  })

  it('never sends an embedding when AI is off, and still ranks words', async () => {
    aiAvailable.mockResolvedValue(false)
    rpc.mockResolvedValue({ data: [row('golden-hour', 1, 1, null)], error: null })
    const out = await searchLibraryAssetsHybrid('space-1', 'golden hour')
    expect(embedText).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1].p_embedding).toBeUndefined()
    expect(out.map((i: { id: string }) => i.id)).toEqual(['golden-hour'])
  })

  it('never sends an embedding over the library-search budget', async () => {
    featureOverBudget.mockResolvedValue(true)
    await searchLibraryAssetsHybrid('space-1', 'golden hour')
    expect(featureOverBudget).toHaveBeenCalledWith('library-search')
    expect(embedText).not.toHaveBeenCalled()
    expect(rpc.mock.calls[0][1].p_embedding).toBeUndefined()
  })

  it('an embed failure costs the meaning, not the search', async () => {
    embedText.mockRejectedValue(new Error('edge function down'))
    rpc.mockResolvedValue({ data: [row('golden-hour', 1, 1, null)], error: null })
    const out = await searchLibraryAssetsHybrid('space-1', 'golden hour')
    expect(rpc.mock.calls[0][1].p_embedding).toBeUndefined()
    expect(out).toHaveLength(1)
  })

  it('passes the kind through and asks nothing for a blank query', async () => {
    await searchLibraryAssetsHybrid('space-1', 'badge', { kind: 'icon' })
    expect(rpc.mock.calls[0][1].p_kind).toBe('icon')
    rpc.mockClear()
    expect(await searchLibraryAssetsHybrid('space-1', '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails to [] when the RPC errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    expect(await searchLibraryAssetsHybrid('space-1', 'golden hour')).toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('the Studio relevant sort is wired to the hybrid', () => {
  it('calls searchLibraryAssetsHybrid and no longer the cosine-only matcher', () => {
    const page = readFileSync('app/(main)/admin/library/page.tsx', 'utf8')
    expect(page).toMatch(/searchLibraryAssetsHybrid\(/)
    expect(page).not.toMatch(/matchLibraryAssets/)
  })
})
