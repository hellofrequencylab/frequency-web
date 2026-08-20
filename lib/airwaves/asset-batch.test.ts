import { describe, it, expect, vi, beforeEach } from 'vitest'

// Meta-scan finder C, 2026-08-20: two Airwaves read paths resolved their per-item facts with one
// Supabase query PER ITEM (N+1). assembleShowFeed asked library_assets once per episode enclosure
// on the public RSS feed + Show page; getLoomAssetUsage asked recording_attachments once per
// recording (up to 200) on the janitor usage route. Both are now single batched `.in(...)` reads.
//
// These lock the batch contracts:
//   1. ONE query per table, never one per item (the N+1 regression guard — counted below).
//   2. Same output: enclosure drop-on-miss preserved; attachment grouping + placeCount preserved.
//   3. getAssetMetaMap keys only the assets that resolve to a usable url; a url-less row is absent.

type Row = Record<string, unknown>

const tables: Record<string, Row[]> = {}
const queries: Array<{ table: string; in: Array<[string, unknown[]]>; eq: Array<[string, unknown]> }> = []

function builder(table: string) {
  const q = { table, in: [] as Array<[string, unknown[]]>, eq: [] as Array<[string, unknown]> }
  queries.push(q)
  const rowsFor = () => {
    let data = tables[table] ?? []
    for (const [col, val] of q.eq) data = data.filter((r) => r[col] === val)
    for (const [col, vals] of q.in) {
      const set = new Set(vals as unknown[])
      data = data.filter((r) => set.has(r[col]))
    }
    return data
  }
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
    limit: () => api,
    order: () => api,
    maybeSingle: () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null }),
    then(resolve: (r: { data: Row[] | null; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: rowsFor(), error: null }))
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

import { getAssetMetaMap, assembleShowFeed } from './shows'
import { getLoomAssetUsage } from './asset-usage'

function count(table: string) {
  return queries.filter((q) => q.table === table).length
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  queries.length = 0
})

describe('getAssetMetaMap (batched enclosure resolve)', () => {
  it('resolves many asset ids in ONE library_assets query', async () => {
    tables.library_assets = [
      { id: 'a1', url: 'https://x/a1.mp3', mime: 'audio/mpeg', bytes: 10 },
      { id: 'a2', url: 'https://x/a2.mp3', mime: 'audio/mpeg', bytes: 20 },
      { id: 'a3', url: 'https://x/a3.mp3', mime: 'audio/mpeg', bytes: 30 },
    ]
    const map = await getAssetMetaMap(['a1', 'a2', 'a3'])
    expect(count('library_assets')).toBe(1)
    expect(map.size).toBe(3)
    expect(map.get('a2')).toEqual({ url: 'https://x/a2.mp3', mime: 'audio/mpeg', bytes: 20 })
  })

  it('omits a url-less asset and issues NO query for an empty/blank list', async () => {
    tables.library_assets = [{ id: 'a1', url: '', mime: null, bytes: null }]
    const map = await getAssetMetaMap(['a1'])
    expect(map.has('a1')).toBe(false)
    queries.length = 0
    expect((await getAssetMetaMap([null, undefined, '  '])).size).toBe(0)
    expect(count('library_assets')).toBe(0)
  })

  it('defaults mime and bytes the same way getAssetMeta does', async () => {
    tables.library_assets = [{ id: 'a1', url: 'https://x/a1', mime: null, bytes: 'nope' }]
    const map = await getAssetMetaMap(['a1'])
    expect(map.get('a1')).toEqual({ url: 'https://x/a1', mime: 'audio/mpeg', bytes: 0 })
  })
})

describe('assembleShowFeed (no enclosure N+1)', () => {
  it('reads library_assets ONCE for many episodes and drops unresolved enclosures', async () => {
    tables.podcast_shows = [
      {
        id: 'show-1', space_id: 'space-a', slug: 'the-show', title: 'The Show', description: null,
        author: null, cover_asset_id: 'cover-1', itunes_category: 'Society & Culture', explicit: false,
        language: 'en', owner_name: null, owner_email: null, feed_visibility: 'public',
        status: 'published', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
      },
    ]
    tables.recordings = [1, 2, 3].map((n) => ({
      id: `rec-${n}`, space_id: 'space-a', show_id: 'show-1', loom_asset_id: `loom-${n}`,
      media_kind: 'audio', title: `Ep ${n}`, slug: `ep-${n}`, description: null, transcript: null,
      chapters: null, duration_seconds: 60, price: 0, required_entitlement: null, visibility: 'public',
      published_at: '2026-01-02T00:00:00Z', sort_order: n, created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }))
    // Cover + two of three episodes resolve; loom-2 is missing, so that episode is dropped.
    tables.library_assets = [
      { id: 'cover-1', url: 'https://x/cover.jpg', mime: 'image/jpeg', bytes: 5 },
      { id: 'loom-1', url: 'https://x/1.mp3', mime: 'audio/mpeg', bytes: 11 },
      { id: 'loom-3', url: 'https://x/3.mp3', mime: 'audio/mpeg', bytes: 33 },
    ]
    const feed = await assembleShowFeed('space-a', 'the-show')
    expect(feed).not.toBeNull()
    // cover is one maybeSingle read; the three episode enclosures are ONE batched read.
    expect(count('library_assets')).toBe(2)
    expect(feed!.coverUrl).toBe('https://x/cover.jpg')
    expect(feed!.episodes.map((e) => e.recording.id)).toEqual(['rec-1', 'rec-3'])
  })
})

describe('getLoomAssetUsage (no attachment N+1)', () => {
  it('reads recording_attachments ONCE for many recordings and groups per recording', async () => {
    tables.recordings = [
      { id: 'rec-1', title: 'One', media_kind: 'audio', show_id: 'show-1', loom_asset_id: 'loom-x' },
      { id: 'rec-2', title: 'Two', media_kind: 'video', show_id: null, loom_asset_id: 'loom-x' },
    ]
    tables.recording_attachments = [
      { recording_id: 'rec-1', host_kind: 'space' },
      { recording_id: 'rec-1', host_kind: 'event' },
      { recording_id: 'rec-2', host_kind: 'practice' },
    ]
    const usage = await getLoomAssetUsage('loom-x')
    expect(count('recording_attachments')).toBe(1)
    const one = usage.recordings.find((r) => r.recordingId === 'rec-1')!
    const two = usage.recordings.find((r) => r.recordingId === 'rec-2')!
    expect(one.hosts.sort()).toEqual(['Event', 'Space'])
    expect(one.placeCount).toBe(3) // 2 attachments + 1 episode (show_id present)
    expect(two.placeCount).toBe(1) // 1 attachment + 0 (no show_id)
    expect(usage.totalPlaces).toBe(4)
  })
})
