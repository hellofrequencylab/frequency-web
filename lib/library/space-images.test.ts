import { describe, it, expect, vi, beforeEach } from 'vitest'

// The SPACE-SCOPED Loom image reader/writer behind the operator's Loom-backed Puck image field.
// Locks the two correctness properties the coordinator called out:
//   1. SEARCH scope = the space's OWN images UNIONED with the shared/public library, never another
//      space's private assets (the `.or(space_id.eq.<id>,visibility.eq.public)` filter).
//   2. WRITE scope = the SPACE'S OWN library (space_id = this space, visibility = 'space'), NEVER the
//      shared root/public library.

const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'

type Call = {
  table: string
  ors: string[]
  eqs: [string, unknown][]
  textSearches: [string, string][]
  insert?: Record<string, unknown>
}
const calls: Call[] = []

/** Rows the next `maybeSingle()` should resolve to. Lets a test stand up an existing asset for the
 *  checksum-dedupe lookup without inventing a whole fake PostgREST. */
let maybeSingleRow: Record<string, unknown> | null = { id: 'new-asset' }

function builder(table: string) {
  const call: Call = { table, ors: [], eqs: [], textSearches: [] }
  calls.push(call)
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      call.eqs.push([col, val])
      return api
    },
    neq: () => api,
    in: () => api,
    contains: () => api,
    textSearch: (col: string, query: string) => {
      call.textSearches.push([col, query])
      return api
    },
    or: (expr: string) => {
      call.ors.push(expr)
      return api
    },
    order: () => api,
    range: async () => ({ data: [], count: 0, error: null }),
    limit: () => api,
    // A real PostgREST builder is THENABLE — every filter returns the builder and awaiting it runs
    // the query — so the mock is too. Making `limit` terminal instead would silently break any chain
    // that filters after it, which is exactly the shape the dedupe lookup uses.
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: [], count: 0, error: null })),
    insert: (row: Record<string, unknown>) => {
      call.insert = row
      return api
    },
    maybeSingle: async () => ({ data: maybeSingleRow, error: null }),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import {
  searchSpaceLibraryImages,
  insertSpaceLibraryImage,
  listLoomScopeImages,
  findLibraryAssetBySha256,
  searchLibraryAssets,
} from './store'

const PROFILE_A = 'bbbbbbbb-0000-4000-b000-00000000000b'

beforeEach(() => {
  calls.length = 0
  maybeSingleRow = { id: 'new-asset' }
})

describe('searchSpaceLibraryImages scopes to the space + the shared/public library', () => {
  it('filters by (space_id = thisSpace) OR (visibility = public), never another space', async () => {
    await searchSpaceLibraryImages(SPACE_A)
    const search = calls.find((c) => c.table === 'library_assets')!
    // The space-scope OR must include this space and the public shared library, and nothing else.
    expect(search.ors.some((o) => o.includes(`space_id.eq.${SPACE_A}`) && o.includes('visibility.eq.public'))).toBe(true)
  })

  it('adds a text-search OR when a query is given (title/description/category)', async () => {
    await searchSpaceLibraryImages(SPACE_A, 'logo')
    const search = calls.find((c) => c.table === 'library_assets')!
    expect(search.ors.some((o) => o.includes('title.ilike.%logo%'))).toBe(true)
  })

  it('only returns file-backed images with a resolvable URL', async () => {
    // No rows configured -> empty, and never throws (fail-safe).
    expect(await searchSpaceLibraryImages(SPACE_A)).toEqual([])
  })
})

describe('insertSpaceLibraryImage writes to the SPACE, not root/public', () => {
  it('sets space_id = thisSpace and visibility = space', async () => {
    const id = await insertSpaceLibraryImage({
      spaceId: SPACE_A,
      title: 'A logo',
      slug: 'a-logo-1',
      storageBucket: 'library-media',
      storagePath: `${SPACE_A}/x.png`,
      url: 'https://cdn/x.png',
      mime: 'image/png',
      bytes: 10,
    })
    expect(id).toBe('new-asset')
    const ins = calls.find((c) => c.insert)!.insert!
    expect(ins.space_id).toBe(SPACE_A)
    expect(ins.visibility).toBe('space')
    expect(ins.kind).toBe('image')
    // Never public / never root-shared.
    expect(ins.visibility).not.toBe('public')
  })

  it('stamps the provenance `source` when given, and omits it when not', async () => {
    await insertSpaceLibraryImage({
      spaceId: SPACE_A, title: 'seed', slug: 'seed-1', storageBucket: 'library-media',
      storagePath: `${SPACE_A}/s.png`, url: 'https://cdn/s.png', mime: 'image/png', bytes: 1, source: 'seed',
    })
    expect(calls.find((c) => c.insert)!.insert!.source).toBe('seed')

    calls.length = 0
    await insertSpaceLibraryImage({
      spaceId: SPACE_A, title: 'u', slug: 'u-1', storageBucket: 'library-media',
      storagePath: `${SPACE_A}/u.png`, url: 'https://cdn/u.png', mime: 'image/png', bytes: 1,
    })
    expect('source' in calls.find((c) => c.insert)!.insert!).toBe(false)
  })
})

describe('listLoomScopeImages: the OWNER scope spans my profile + owned spaces, hiding only seed placeholders', () => {
  it('gates a createdBy (My uploads) scope to hide ONLY seed/import placeholders (NULL + uploads + event photos stay)', async () => {
    await listLoomScopeImages({ createdBy: PROFILE_A })
    const q = calls.find((c) => c.table === 'library_assets')!
    // The provenance gate is a positive allowlist over the source vocabulary: NULL + every source EXCEPT
    // the importer's seed/import placeholders. So genuine uploads, event photos (event-claim), and legacy
    // NULLs all stay visible; seed/import are the only ones held back (never appear in the allowlist).
    const gate = q.ors.find((o) => o.includes('source.is.null') && o.includes('source.in.(upload'))
    expect(gate).toBeTruthy()
    expect(gate).toContain('event-claim')
    expect(gate).not.toContain('seed')
    expect(gate).not.toContain('import')
  })

  it('unions in the owner’s owned spaces when given (created_by = me OR space_id in my spaces)', async () => {
    await listLoomScopeImages({ createdBy: PROFILE_A, spaceIds: [SPACE_A] })
    const q = calls.find((c) => c.table === 'library_assets')!
    expect(q.ors.some((o) => o.includes(`created_by.eq.${PROFILE_A}`) && o.includes(`space_id.in.(${SPACE_A})`))).toBe(true)
  })

  it('does NOT apply the source filter to a space-scoped folder (all of the space is shown)', async () => {
    await listLoomScopeImages({ spaceId: SPACE_A })
    const q = calls.find((c) => c.table === 'library_assets')!
    expect(q.ors.some((o) => o.includes('source.'))).toBe(false)
  })
})

// ── PROG-D1: ingest metadata, checksum dedupe, and the two-armed ranked search ──────────────────

describe('insertSpaceLibraryImage carries the ingest metadata through', () => {
  const base = {
    spaceId: SPACE_A,
    title: 'A photo',
    slug: 'a-photo-1',
    storageBucket: 'library-media',
    storagePath: `${SPACE_A}/p.jpg`,
    url: 'https://cdn/p.jpg',
    mime: 'image/jpeg',
  }

  it('writes sha256/dimensions/blurhash/colors/orig_* when ingest supplied them', async () => {
    await insertSpaceLibraryImage({
      ...base,
      bytes: 4096,
      sha256: 'a'.repeat(64),
      width: 1600,
      height: 1200,
      blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
      colors: ['#0cc85a', '#123456'],
      origWidth: 4032,
      origHeight: 3024,
    })
    const ins = calls.find((c) => c.insert)!.insert!
    expect(ins).toMatchObject({
      sha256: 'a'.repeat(64),
      width: 1600,
      height: 1200,
      blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
      colors: ['#0cc85a', '#123456'],
      orig_width: 4032,
      orig_height: 3024,
    })
  })

  it('OMITS every ingest column a caller did not supply, so a pre-ingest row is unchanged', async () => {
    // The columns are nullable and the DB default is NULL; writing an explicit null would be the same
    // value but a different diff, and this shape is what keeps the six existing callers byte-identical.
    await insertSpaceLibraryImage({ ...base, bytes: 10 })
    const ins = calls.find((c) => c.insert)!.insert!
    for (const col of ['sha256', 'width', 'height', 'blurhash', 'colors', 'orig_width', 'orig_height']) {
      expect(col in ins).toBe(false)
    }
  })

  it('accepts a NULL size — "unknown", not the "0 B" the importer used to claim', async () => {
    await insertSpaceLibraryImage({ ...base, bytes: null })
    expect(calls.find((c) => c.insert)!.insert!.bytes).toBeNull()
  })

  it('still defaults visibility to the SPACE, and only writes public when asked', async () => {
    await insertSpaceLibraryImage({ ...base, bytes: 1 })
    expect(calls.find((c) => c.insert)!.insert!.visibility).toBe('space')

    calls.length = 0
    await insertSpaceLibraryImage({ ...base, bytes: 1, visibility: 'public' })
    expect(calls.find((c) => c.insert)!.insert!.visibility).toBe('public')
  })
})

describe('findLibraryAssetBySha256 is the read half of checksum dedupe', () => {
  it('matches on (space_id, sha256) — the pair the existing index is on', async () => {
    maybeSingleRow = { id: 'existing', url: 'https://cdn/old.jpg', title: 'Already here' }
    const hit = await findLibraryAssetBySha256(SPACE_A, 'b'.repeat(64))
    expect(hit).toEqual({ id: 'existing', url: 'https://cdn/old.jpg', title: 'Already here' })

    const q = calls.find((c) => c.table === 'library_assets')!
    // SCOPED TO THE SPACE. A global match would hand one space another space's asset.
    expect(q.eqs).toContainEqual(['space_id', SPACE_A])
    expect(q.eqs).toContainEqual(['sha256', 'b'.repeat(64)])
  })

  it('never queries at all for an empty checksum', async () => {
    expect(await findLibraryAssetBySha256(SPACE_A, '')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('FAILS SAFE to null — a lookup miss stores a second copy, it never returns a wrong asset', async () => {
    maybeSingleRow = null
    expect(await findLibraryAssetBySha256(SPACE_A, 'c'.repeat(64))).toBeNull()
  })
})

describe('text search runs BOTH indexed arms', () => {
  it('queries search_tsv (FTS) as well as the trigram ilike', async () => {
    await searchLibraryAssets({ spaceId: SPACE_A, q: 'lavender field' })
    const assetCalls = calls.filter((c) => c.table === 'library_assets')
    // Arm 1: the generated tsvector column, which is what the GIN index serves.
    expect(assetCalls.some((c) => c.textSearches.some(([col, q]) => col === 'search_tsv' && q === 'lavender field'))).toBe(true)
    // Arm 2: the substring/trigram filter, which is what the title gin_trgm_ops index serves.
    expect(assetCalls.some((c) => c.ors.some((o) => o.includes('title.ilike.%lavender field%')))).toBe(true)
  })

  it('does NOT reach for full-text when there is no query', async () => {
    await searchLibraryAssets({ spaceId: SPACE_A })
    expect(calls.every((c) => c.textSearches.length === 0)).toBe(true)
  })

  it('keeps the DATABASE ordering for an explicit non-relevance sort', async () => {
    // Asking for A→Z means A→Z, not "relevance, which happens to start with an A".
    await searchLibraryAssets({ spaceId: SPACE_A, q: 'lavender', sort: 'title' })
    expect(calls.every((c) => c.textSearches.length === 0)).toBe(true)
  })

  it('ranks the picker too', async () => {
    await listLoomScopeImages({ spaceId: SPACE_A }, { q: 'lavender' })
    expect(calls.some((c) => c.textSearches.some(([col]) => col === 'search_tsv'))).toBe(true)
  })
})
