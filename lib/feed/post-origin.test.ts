import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixtures the mocked admin client returns, keyed by table. Each test seeds these
// before calling the resolver, so we exercise the precedence without a real DB.
const tableRows: Record<string, { id: string; [k: string]: unknown }[]> = {
  circles: [],
  events: [],
  profiles: [],
}

// Minimal admin-client stub: `.from(table).select(...).in('id', ids)` resolves to
// the seeded rows for that table whose id is in the requested set. Mirrors the
// shape buildPostOriginResolver relies on (batch `.in('id', ids)` reads).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              const rows = (tableRows[table] ?? []).filter((r) => ids.includes(r.id))
              return Promise.resolve({ data: rows, error: null })
            },
          }
        },
      }
    },
  }),
}))

import { buildPostOriginResolver } from './post-origin'

beforeEach(() => {
  tableRows.circles = []
  tableRows.events = []
  tableRows.profiles = []
})

describe('buildPostOriginResolver — events', () => {
  it('resolves an event-scoped post to its event origin', async () => {
    tableRows.events = [{ id: 'evt-1', title: 'Sunrise Hike', slug: 'sunrise-hike' }]
    const resolve = await buildPostOriginResolver(['evt-1'], 'self')
    expect(resolve('evt-1')).toEqual({ kind: 'event', name: 'Sunrise Hike', slug: 'sunrise-hike' })
  })

  it('keeps precedence circle → event → wall when ids are distinct', async () => {
    tableRows.circles = [{ id: 'c-1', name: 'Mind Circle', slug: 'mind' }]
    tableRows.events = [{ id: 'e-1', title: 'Beach Cleanup', slug: 'beach-cleanup' }]
    tableRows.profiles = [{ id: 'p-1', display_name: 'Ada', handle: 'ada' }]

    const resolve = await buildPostOriginResolver(['c-1', 'e-1', 'p-1'], 'self')
    expect(resolve('c-1')).toEqual({ kind: 'circle', name: 'Mind Circle', slug: 'mind' })
    expect(resolve('e-1')).toEqual({ kind: 'event', name: 'Beach Cleanup', slug: 'beach-cleanup' })
    expect(resolve('p-1')).toEqual({ kind: 'wall', name: 'Ada', handle: 'ada' })
  })

  it('reads as the feed for an unresolved scope or the timeline owner', async () => {
    tableRows.profiles = [{ id: 'self', display_name: 'Me', handle: 'me' }]
    const resolve = await buildPostOriginResolver(['self', 'unknown', null], 'self')
    expect(resolve('self')).toEqual({ kind: 'feed' })
    expect(resolve('unknown')).toEqual({ kind: 'feed' })
    expect(resolve(null)).toEqual({ kind: 'feed' })
  })
})
