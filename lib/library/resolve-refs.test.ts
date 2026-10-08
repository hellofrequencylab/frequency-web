import { describe, it, expect, vi, beforeEach } from 'vitest'

// The server half of the AssetField seam (PROG-D2, ADR-1130): the published-render
// refresh that re-points ref caches at each asset's CURRENT url. The properties that
// matter: a legacy document makes NO query at all, a failed query leaves every cache
// standing (fail-open), and a deleted asset degrades to ITS cache while its
// neighbours still refresh.

const scopedCalls: { method: string; key: string; value: unknown }[] = []
const inCalls: { table: string; ids: string[] }[] = []
let result: { data: { id: string; url: string | null }[] | null; error: unknown } = { data: [], error: null }
let throwOnQuery = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          if (throwOnQuery) throw new Error('no credentials at build time')
          inCalls.push({ table, ids })
          const query = { then: (fulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(fulfilled), eq: (key: string, value: unknown) => { scopedCalls.push({ method: 'eq', key, value }); return query }, neq: (key: string, value: unknown) => { scopedCalls.push({ method: 'neq', key, value }); return query }, or: (value: unknown) => { scopedCalls.push({ method: 'or', key: '', value }); return query } }
          return query
        },
      }),
    }),
  }),
}))

import { refreshAssetRefUrls } from './resolve-refs'

const ID_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const ID_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

beforeEach(() => {
  inCalls.length = 0
  scopedCalls.length = 0
  result = { data: [], error: null }
  throwOnQuery = false
})

describe('refreshAssetRefUrls', () => {
  it('makes no query for a ref-free document and returns the SAME object', async () => {
    const doc = { content: [{ type: 'Hero', props: { image: 'https://legacy/a.jpg' } }] }
    expect(await refreshAssetRefUrls(doc)).toBe(doc)
    expect(inCalls).toEqual([])
  })

  it('re-points a stale cache and leaves a deleted asset on its cache', async () => {
    const doc = {
      content: [
        { type: 'Hero', props: { image: { assetId: ID_A, url: 'https://cdn/old.jpg' } } },
        { type: 'Media', props: { image: { assetId: ID_B, url: 'https://cdn/gone.jpg' } } },
      ],
    }
    result = { data: [{ id: ID_A, url: 'https://cdn/new.jpg' }], error: null }
    const out = (await refreshAssetRefUrls(doc)) as typeof doc
    expect(inCalls[0]?.table).toBe('library_assets')
    expect(inCalls[0]?.ids.sort()).toEqual([ID_A, ID_B].sort())
    expect(out.content[0].props.image).toEqual({ assetId: ID_A, url: 'https://cdn/new.jpg' })
    expect(out.content[1].props.image).toEqual({ assetId: ID_B, url: 'https://cdn/gone.jpg' })
  })

  it('fails open to the cache when the query errors or throws', async () => {
    const doc = { content: [{ type: 'Hero', props: { image: { assetId: ID_A, url: 'https://cdn/cached.jpg' } } }] }
    result = { data: null, error: { message: 'boom' } }
    expect(await refreshAssetRefUrls(doc)).toBe(doc)

    throwOnQuery = true
    expect(await refreshAssetRefUrls(doc)).toBe(doc)
  })

  it('bounds website refreshes to own unprotected unexpired assets without changing saved copies', async () => {
    const doc = { image: { assetId: ID_A, url: 'https://cdn/cached.jpg' }, other: { assetId: ID_B, url: 'https://cdn/other-cache.jpg' } }
    result = { data: [{ id: ID_A, url: 'https://cdn/new.jpg', space_id: 'own', is_protected: false }, { id: ID_B, url: 'https://cdn/foreign-master.jpg', space_id: 'foreign' }] as typeof result.data, error: null }
    const refreshed = await refreshAssetRefUrls(doc, { websiteSpaceId: 'own' })
    expect(scopedCalls).toContainEqual({ method: 'eq', key: 'space_id', value: 'own' })
    expect(refreshed.image.url).toBe('https://cdn/new.jpg')
    expect(refreshed.other.url).toBe('https://cdn/other-cache.jpg')
    expect(doc.image.url).toBe('https://cdn/cached.jpg')
    result = { data: [{ id: ID_A, url: 'https://cdn/master.jpg', space_id: 'own', is_protected: true }] as typeof result.data, error: null }
    expect(await refreshAssetRefUrls(doc, { websiteSpaceId: 'own' })).toBe(doc)
  })
  it('ignores an asset whose url is empty — an empty cache overwrite would blank the page', async () => {
    const doc = { content: [{ type: 'Hero', props: { image: { assetId: ID_A, url: 'https://cdn/cached.jpg' } } }] }
    result = { data: [{ id: ID_A, url: '' }], error: null }
    expect(await refreshAssetRefUrls(doc)).toBe(doc)
  })
})
