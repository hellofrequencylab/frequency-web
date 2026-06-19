import { describe, it, expect, vi, beforeEach } from 'vitest'

// Contract + regression tests for the space-scoped page-settings READERS (Phase 0.5a).
//
// These lock two things at once:
//   1. CANARY — the current single-tenant resolution still works: a caller that passes no
//      spaceId reads the ROOT space's rows (loadRootSpaceId), exactly as today.
//   2. CROSS-TENANT ISOLATION — every read is filtered by space_id, so a layout/SEO row saved
//      for space A can NEVER resolve (or cache-leak) for space B (the §4.1 invisible-leak risk).
//
// The store uses a dynamic `await import('@/lib/supabase/admin')`, so the mock below is a
// chainable query builder that records the .eq('space_id', …) / .in('route', …) filters and
// returns a settable row set keyed by space_id, proving the filter is actually applied.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

// rows[space_id][route] = the stored page_settings row for that tenant + route.
type Row = { route: string; space_id: string; layout?: unknown; seo_title?: string | null; status?: string; visibility_role?: string | null; og_image_url?: string | null; header_image_url?: string | null; seo_description?: string | null }
const store: { rows: Record<string, Record<string, Row>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []

function builder() {
  const filters: { space_id?: string; route?: string; routes?: string[] } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      if (col === 'space_id') filters.space_id = val as string
      if (col === 'route') filters.route = val as string
      return api
    },
    in(col: string, vals: string[]) {
      if (col === 'route') filters.routes = vals
      return api
    },
    async maybeSingle() {
      const tenant = store.rows[filters.space_id ?? ''] ?? {}
      return { data: tenant[filters.route ?? ''] ?? null, error: null }
    },
    // The cascade read resolves via the thenable (await on the builder itself).
    then(resolve: (r: { data: Row[] | null; error: null }) => unknown) {
      const tenant = store.rows[filters.space_id ?? ''] ?? {}
      const data = (filters.routes ?? []).map((r) => tenant[r]).filter((r): r is Row => !!r)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

// The root-space id resolver is mocked so the readers' default (no spaceId → root) is testable
// without a DB. Real callers resolve it from the seeded root space.
vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_ID,
}))

import { loadPageSettings, loadLayoutForRoute } from './store'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
})

describe('loadPageSettings (space-scoped)', () => {
  it('CANARY: with no spaceId, reads the ROOT space row (current single-tenant behavior)', async () => {
    store.rows[ROOT_ID] = { '/feed': { route: '/feed', space_id: ROOT_ID, seo_title: 'Feed' } }
    const row = await loadPageSettings('/feed')
    expect(row?.seo_title).toBe('Feed')
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
    expect(eqCalls).toContainEqual(['route', '/feed'])
  })

  it('ISOLATION: an SEO row saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = { '/feed': { route: '/feed', space_id: SPACE_A, seo_title: 'A only' } }
    expect((await loadPageSettings('/feed', SPACE_A))?.seo_title).toBe('A only')
    // Same route, different tenant → nothing (no leak across the space boundary).
    expect(await loadPageSettings('/feed', SPACE_B)).toBeNull()
  })
})

describe('loadLayoutForRoute (space-scoped cascade)', () => {
  const layout = (template: string) => ({ template, slots: {} })

  it('CANARY: with no spaceId, resolves the ROOT space cascade (route beats global)', async () => {
    store.rows[ROOT_ID] = {
      '*': { route: '*', space_id: ROOT_ID, layout: layout('two-col') },
      '/crew': { route: '/crew', space_id: ROOT_ID, layout: layout('three-col') },
    }
    expect((await loadLayoutForRoute('/crew')).template).toBe('three-col')
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
  })

  it('ISOLATION: a layout saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = { '/crew': { route: '/crew', space_id: SPACE_A, layout: layout('main-side') } }
    expect((await loadLayoutForRoute('/crew', SPACE_A)).template).toBe('main-side')
    // Space B has no rows → falls back to the empty Single default, never A's layout.
    expect((await loadLayoutForRoute('/crew', SPACE_B)).template).toBe('single')
  })
})
