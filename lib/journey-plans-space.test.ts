import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for JOURNEYS (journey_plans) (ENTITY-SPACES-BUILD Epic 0.3 / §4.3).
// Locks two things:
//   1. STAMP — createPlan stamps space_id, defaulting to the ROOT space (the canary).
//   2. ISOLATION — listJourneyPlansForSpace filters by space_id, so a journey in space A can
//      never resolve for space B.

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
    insert(payload: Record<string, unknown>) {
      inserts.push(payload)
      insertedRow = { id: 'j-new', ...payload }
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

// createPlan doesn't touch practices, but the module imports adoptPractice — stub it out.
vi.mock('@/lib/practices', () => ({ adoptPractice: async () => {} }))

import { createPlan, listJourneyPlansForSpace } from './journey-plans'

beforeEach(() => {
  inserts.length = 0
  eqCalls.length = 0
  store.rows = {}
})

describe('createPlan (stamps space_id)', () => {
  it('STAMP: with no spaceId, the insert is stamped to the ROOT space', async () => {
    await createPlan({ authorId: 'u1', title: 'A journey' })
    expect(inserts[0]?.space_id).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    await createPlan({ authorId: 'u1', title: 'Studio journey', spaceId: SPACE_A })
    expect(inserts[0]?.space_id).toBe(SPACE_A)
  })
})

describe('listJourneyPlansForSpace (by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    store.rows[ROOT_ID] = [{ id: 'j1', space_id: ROOT_ID, title: 'Root journey' }]
    const rows = await listJourneyPlansForSpace()
    expect(rows.map((r) => r.id)).toEqual(['j1'])
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
  })

  it('ISOLATION: a journey saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    expect((await listJourneyPlansForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listJourneyPlansForSpace(SPACE_B)).toEqual([])
  })
})
