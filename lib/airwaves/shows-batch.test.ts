import { describe, it, expect, vi, beforeEach } from 'vitest'

// The sitemap's podcast section used to issue ONE read per networked Space (FINALIZE-PLAN §9.9),
// inside a route whose catch degrades to an empty section — so a slow database dropped every
// podcast URL out of the index silently, and the cost grew with the network.
//
// These lock the batched reader's three contracts:
//   1. ONE query, whatever the number of Spaces (the N+1 regression guard).
//   2. The public-feed gate is applied IN SQL (published + public), the same filter the podcast
//      pages render, so a draft or private feed can never be advertised.
//   3. FAIL-SAFE: an error yields an empty Map, never a throw, so a failure costs the podcast
//      entries and nothing else in the sitemap.

type Row = Record<string, unknown>

const state: { rows: Row[]; throws: boolean } = { rows: [], throws: false }
const queries: Array<{ table: string; eq: Array<[string, unknown]>; in: Array<[string, unknown[]]>; limit: number | null }> = []

function builder(table: string) {
  const q = { table, eq: [] as Array<[string, unknown]>, in: [] as Array<[string, unknown[]]>, limit: null as number | null }
  queries.push(q)
  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      q.eq.push([col, val])
      return api
    },
    in: (col: string, vals: unknown[]) => {
      q.in.push([col, vals])
      return api
    },
    order: () => api,
    limit: (n: number) => {
      q.limit = n
      return api
    },
    then(resolve: (r: { data: Row[] | null; error: null }) => unknown) {
      // Thrown from `then` so the await rejects — the transport-level failure the reader catches.
      if (state.throws) throw new Error('db down')
      const ids = new Set((q.in.find(([c]) => c === 'space_id')?.[1] ?? []) as string[])
      const wanted = Object.fromEntries(q.eq)
      const data = state.rows.filter(
        (r) =>
          ids.has(String(r.space_id)) &&
          Object.entries(wanted).every(([col, val]) => r[col] === val),
      )
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: false }),
}))

import { listPublicShowsBySpace } from './shows'

function showRow(over: Row = {}): Row {
  return {
    id: 'show-1',
    space_id: 'space-a',
    slug: 'the-show',
    title: 'The Show',
    description: null,
    author: null,
    cover_asset_id: null,
    itunes_category: 'Society & Culture',
    explicit: false,
    language: 'en',
    owner_name: null,
    owner_email: null,
    feed_visibility: 'public',
    status: 'published',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...over,
  }
}

beforeEach(() => {
  state.rows = []
  state.throws = false
  queries.length = 0
})

describe('listPublicShowsBySpace (the sitemap batch)', () => {
  it('reads ONE query for many Spaces, not one per Space', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `space-${i}`)
    state.rows = ids.map((id, i) => showRow({ id: `show-${i}`, space_id: id, slug: `show-${i}` }))

    const grouped = await listPublicShowsBySpace(ids)

    expect(queries).toHaveLength(1)
    expect(queries[0].table).toBe('podcast_shows')
    expect(grouped.size).toBe(50)
  })

  it('scopes the single query to exactly the Spaces asked for', async () => {
    await listPublicShowsBySpace(['space-a', 'space-b'])
    expect(queries[0].in).toContainEqual(['space_id', ['space-a', 'space-b']])
  })

  it('groups shows under their own Space and keeps every show', async () => {
    state.rows = [
      showRow({ id: 's1', space_id: 'space-a', slug: 'one' }),
      showRow({ id: 's2', space_id: 'space-a', slug: 'two' }),
      showRow({ id: 's3', space_id: 'space-b', slug: 'three' }),
    ]
    const grouped = await listPublicShowsBySpace(['space-a', 'space-b', 'space-c'])

    expect(grouped.get('space-a')?.map((s) => s.slug)).toEqual(['one', 'two'])
    expect(grouped.get('space-b')?.map((s) => s.slug)).toEqual(['three'])
    // A Space with no public Show is ABSENT, so the sitemap advertises no empty podcasts index.
    expect(grouped.has('space-c')).toBe(false)
  })

  it('applies the published + public-feed gate in SQL', async () => {
    state.rows = [
      showRow({ id: 's1', space_id: 'space-a', slug: 'live' }),
      showRow({ id: 's2', space_id: 'space-a', slug: 'draft', status: 'draft' }),
      showRow({ id: 's3', space_id: 'space-a', slug: 'private', feed_visibility: 'private' }),
    ]
    const grouped = await listPublicShowsBySpace(['space-a'])

    expect(queries[0].eq).toContainEqual(['status', 'published'])
    expect(queries[0].eq).toContainEqual(['feed_visibility', 'public'])
    expect(grouped.get('space-a')?.map((s) => s.slug)).toEqual(['live'])
  })

  it('carries updatedAt through, so the sitemap can stamp lastModified', async () => {
    state.rows = [showRow({ space_id: 'space-a', updated_at: '2026-03-04T05:06:07Z' })]
    const grouped = await listPublicShowsBySpace(['space-a'])
    expect(grouped.get('space-a')?.[0].updatedAt).toBe('2026-03-04T05:06:07Z')
  })

  it('dedupes and trims the input, and issues NO query for an empty list', async () => {
    expect((await listPublicShowsBySpace([])).size).toBe(0)
    expect((await listPublicShowsBySpace(['', '   '])).size).toBe(0)
    expect(queries).toHaveLength(0)

    await listPublicShowsBySpace(['space-a', ' space-a ', 'space-b'])
    expect(queries[0].in).toContainEqual(['space_id', ['space-a', 'space-b']])
  })

  it('keeps the per-Space 200 ceiling the unbatched reader had, capped for a large network', async () => {
    await listPublicShowsBySpace(['space-a', 'space-b'])
    expect(queries[0].limit).toBe(400)
    queries.length = 0
    await listPublicShowsBySpace(Array.from({ length: 100 }, (_, i) => `s-${i}`))
    expect(queries[0].limit).toBe(5000)
  })

  it('FAIL-SAFE: a database failure yields an empty Map rather than throwing', async () => {
    state.throws = true
    await expect(listPublicShowsBySpace(['space-a'])).resolves.toEqual(new Map())
  })
})
