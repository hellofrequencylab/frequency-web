import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for PRACTICES (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — createPractice stamps space_id, defaulting to the ROOT space (the canary).
//   2. ISOLATION — listPracticesForSpace filters by space_id, so a practice in space A can never
//      resolve for space B.
//
// The admin client is mocked as a chainable builder. It records every insert payload (proving
// createPractice stamps space_id) and serves the by-space rows from a per-tenant store (proving
// the read filters by space_id). uniquePracticeSlug's `.select().ilike()` resolves to an empty
// "nothing taken" set so creation never collides.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

const inserts: Array<Record<string, unknown>> = []
const eqCalls: Array<[string, unknown]> = []
const store: { rows: Record<string, Array<Record<string, unknown>>> } = { rows: {} }

function builder() {
  const filters: { space_id?: string } = {}
  let insertedRow: Record<string, unknown> | null = null
  const api: Record<string, unknown> = {
    select: () => api,
    ilike: async () => ({ data: [], error: null }), // uniquePracticeSlug: nothing taken
    insert(payload: Record<string, unknown>) {
      inserts.push(payload)
      insertedRow = { id: 'p-new', ...payload }
      return api
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      if (col === 'space_id') filters.space_id = val as string
      return api
    },
    order: () => api,
    async limit() {
      return { data: store.rows[filters.space_id ?? ''] ?? [], error: null }
    },
    async maybeSingle() {
      return { data: insertedRow, error: null }
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

// Keep the creation-token reward out of the create path (best-effort side effect).
vi.mock('@/lib/rewards/creation', () => ({ awardCreationToken: async () => {} }))

import { createPractice, listPracticesForSpace } from './practices'

beforeEach(() => {
  inserts.length = 0
  eqCalls.length = 0
  store.rows = {}
})

describe('createPractice (stamps space_id)', () => {
  it('STAMP: with no spaceId, the insert is stamped to the ROOT space', async () => {
    await createPractice({ title: 'Box breathing', createdBy: 'u1', isPublic: false })
    expect(inserts[0]?.space_id).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    await createPractice({ title: 'Studio practice', createdBy: 'u1', isPublic: false, spaceId: SPACE_A })
    expect(inserts[0]?.space_id).toBe(SPACE_A)
  })
})

describe('listPracticesForSpace (by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    store.rows[ROOT_ID] = [{ id: 'p1', space_id: ROOT_ID, title: 'Root practice' }]
    const rows = await listPracticesForSpace()
    expect(rows.map((r) => r.id)).toEqual(['p1'])
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
  })

  it('ISOLATION: a practice saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    expect((await listPracticesForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listPracticesForSpace(SPACE_B)).toEqual([])
  })
})
