import { describe, it, expect, vi, beforeEach } from 'vitest'

// The sitemap's podcast section used to issue ONE read per networked Space (FINALIZE-PLAN §9.9),
// inside a route whose catch degrades to an empty section — so a slow database dropped every
// podcast URL out of the index silently, and the cost grew with the network.
//
// These lock the batched reader's four contracts:
//   1. ONE query per PAGE of results, never one per Space (the N+1 regression guard).
//   2. The public-feed gate is applied IN SQL (published + public), the same filter the podcast
//      pages render, so a draft or private feed can never be advertised.
//   3. PAGED past PostgREST's max_rows. `.limit()` does not raise the server-side cap, so the
//      first version of the batch silently returned 1000 rows and dropped whole trailing Spaces
//      out of the sitemap. The fake below enforces the cap exactly as PostgREST does.
//   4. FAIL-SAFE: an error yields an empty Map, never a throw, so a failure costs the podcast
//      entries and nothing else in the sitemap.

type Row = Record<string, unknown>

// supabase/config.toml `max_rows`. Applied SERVER-SIDE to every response; service_role does not
// escape it, and no error is raised when it truncates — which is what made the bug invisible.
const PG_MAX_ROWS = 1000

const state: { rows: Row[]; throws: boolean } = { rows: [], throws: false }
const queries: Array<{
  table: string
  eq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
  order: Array<[string, boolean]>
  range: [number, number] | null
}> = []

function builder(table: string) {
  const q = {
    table,
    eq: [] as Array<[string, unknown]>,
    in: [] as Array<[string, unknown[]]>,
    order: [] as Array<[string, boolean]>,
    range: null as [number, number] | null,
  }
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
    order: (col: string, opts?: { ascending?: boolean }) => {
      q.order.push([col, opts?.ascending !== false])
      return api
    },
    range: (from: number, to: number) => {
      q.range = [from, to]
      return api
    },
    then(resolve: (r: { data: Row[] | null; error: null }) => unknown) {
      // Thrown from `then` so the await rejects — the transport-level failure the reader catches.
      if (state.throws) throw new Error('db down')
      const ids = new Set((q.in.find(([c]) => c === 'space_id')?.[1] ?? []) as string[])
      const wanted = Object.fromEntries(q.eq)
      let data = state.rows.filter(
        (r) =>
          ids.has(String(r.space_id)) &&
          Object.entries(wanted).every(([col, val]) => r[col] === val),
      )
      // Apply the requested ordering, last key first, so the fake sorts the way Postgres does.
      for (const [col, asc] of [...q.order].reverse()) {
        data = [...data].sort((a, b) => {
          const cmp = String(a[col] ?? '').localeCompare(String(b[col] ?? ''))
          return asc ? cmp : -cmp
        })
      }
      // The window the caller asked for, then PostgREST's own cap on top of it.
      const [from, to] = q.range ?? [0, data.length - 1]
      data = data.slice(from, Math.min(to + 1, from + PG_MAX_ROWS))
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

    // 50 rows is a single short page, so the read ends after one round trip.
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
    // A small network's ceiling (2 × 200) is under one page, so the first range asks for exactly it.
    await listPublicShowsBySpace(['space-a', 'space-b'])
    expect(queries[0].range).toEqual([0, 399])

    // A large network clamps at 5000 total, requested a page (max_rows) at a time.
    queries.length = 0
    await listPublicShowsBySpace(Array.from({ length: 100 }, (_, i) => `s-${i}`))
    expect(queries[0].range).toEqual([0, 999])
  })

  it('RANGES the read, because .limit() does not raise PostgREST max_rows', async () => {
    await listPublicShowsBySpace(['space-a'])
    // The bug this locks: no `.range()` meant the server capped the response at 1000 rows and said
    // nothing, so Spaces past the cap silently left the sitemap.
    expect(queries[0].range).not.toBeNull()
    // A TOTAL order is required, or a created_at tie straddling a page boundary is skipped/repeated.
    expect(queries[0].order).toEqual([
      ['created_at', false],
      ['id', true],
    ])
  })

  it('PAGES past max_rows: every public Show is returned, not just the first 1000', async () => {
    // 1,500 Shows across 10 Spaces — comfortably past the cap, and inside the 10 × 200 ceiling.
    const ids = Array.from({ length: 10 }, (_, i) => `space-${i}`)
    state.rows = Array.from({ length: 1500 }, (_, i) =>
      showRow({
        id: `show-${String(i).padStart(4, '0')}`,
        space_id: `space-${i % 10}`,
        slug: `show-${i}`,
        created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
      }),
    )

    const grouped = await listPublicShowsBySpace(ids)

    const total = [...grouped.values()].reduce((n, shows) => n + shows.length, 0)
    expect(total).toBe(1500)
    // Every Space still gets its bucket — the truncation used to drop whole trailing Spaces.
    expect(grouped.size).toBe(10)
    // And no Show is double-counted across the page boundary.
    const slugs = [...grouped.values()].flat().map((s) => s.slug)
    expect(new Set(slugs).size).toBe(1500)
    // Two pages, not 10 per-Space reads: still O(rows), never O(Spaces).
    expect(queries).toHaveLength(2)
  })

  it('stops at the ceiling rather than paging forever', async () => {
    // One Space, ceiling 200, but 900 rows available: the read takes the ceiling and stops.
    state.rows = Array.from({ length: 900 }, (_, i) =>
      showRow({ id: `show-${String(i).padStart(4, '0')}`, space_id: 'space-a', slug: `show-${i}` }),
    )
    const grouped = await listPublicShowsBySpace(['space-a'])

    expect(grouped.get('space-a')).toHaveLength(200)
    expect(queries).toHaveLength(1)
  })

  it('FAIL-SAFE: a database failure yields an empty Map rather than throwing', async () => {
    state.throws = true
    await expect(listPublicShowsBySpace(['space-a'])).resolves.toEqual(new Map())
  })
})
