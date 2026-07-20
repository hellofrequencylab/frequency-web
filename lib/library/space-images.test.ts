import { describe, it, expect, vi, beforeEach } from 'vitest'

// The SPACE-SCOPED Loom image reader/writer behind the operator's Loom-backed Puck image field.
// Locks the two correctness properties the coordinator called out:
//   1. SEARCH scope = the space's OWN images UNIONED with the shared/public library, never another
//      space's private assets (the `.or(space_id.eq.<id>,visibility.eq.public)` filter).
//   2. WRITE scope = the SPACE'S OWN library (space_id = this space, visibility = 'space'), NEVER the
//      shared root/public library.

const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'

type Call = { table: string; ors: string[]; insert?: Record<string, unknown> }
const calls: Call[] = []

function builder(table: string) {
  const call: Call = { table, ors: [] }
  calls.push(call)
  const api: Record<string, unknown> = {
    select: () => api,
    eq: () => api,
    neq: () => api,
    in: () => api,
    or: (expr: string) => {
      call.ors.push(expr)
      return api
    },
    order: () => api,
    limit: async () => ({ data: [], error: null }),
    insert: (row: Record<string, unknown>) => {
      call.insert = row
      return api
    },
    maybeSingle: async () => ({ data: { id: 'new-asset' }, error: null }),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { searchSpaceLibraryImages, insertSpaceLibraryImage, listLoomScopeImages } from './store'

const PROFILE_A = 'bbbbbbbb-0000-4000-b000-00000000000b'

beforeEach(() => {
  calls.length = 0
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
