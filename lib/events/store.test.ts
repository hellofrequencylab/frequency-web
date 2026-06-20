import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for EVENTS (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — a new event defaults its space_id to the ROOT space (the canary).
//   2. ISOLATION — listEventsForSpace filters by space_id, so an event in space A can never
//      resolve for space B; `upcomingOnly` adds a starts_at lower bound.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

const store: { rows: Record<string, Array<Record<string, unknown>>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []
let gteCalled = false

function builder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      if (col === 'space_id') filters.space_id = val as string
      return api
    },
    gte() {
      gteCalled = true
      return api
    },
    order() {
      return api
    },
    async limit() {
      return { data: store.rows[filters.space_id ?? ''] ?? [], error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_ID,
}))

import { stampEventSpaceId, listEventsForSpace } from './store'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
  gteCalled = false
})

describe('stampEventSpaceId (create defaults to root)', () => {
  it('STAMP: with no spaceId, a new event is stamped to the ROOT space', async () => {
    expect(await stampEventSpaceId()).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    expect(await stampEventSpaceId(SPACE_A)).toBe(SPACE_A)
  })
})

describe('listEventsForSpace (by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    store.rows[ROOT_ID] = [{ id: 'e1', space_id: ROOT_ID, title: 'Root event' }]
    const rows = await listEventsForSpace()
    expect(rows.map((r) => r.id)).toEqual(['e1'])
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
    expect(gteCalled).toBe(false)
  })

  it('ISOLATION: an event saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    expect((await listEventsForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listEventsForSpace(SPACE_B)).toEqual([])
  })

  it('upcomingOnly adds a starts_at lower bound', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    await listEventsForSpace(SPACE_A, { upcomingOnly: true })
    expect(gteCalled).toBe(true)
  })
})
