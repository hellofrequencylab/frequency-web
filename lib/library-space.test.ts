import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 ownership contract for PROGRAMS (community_library `programs` table)
// (ENTITY-SPACES-BUILD Epic 0.3 / §4.3). Locks two things:
//   1. STAMP — a new program defaults its space_id to the ROOT space (the canary).
//   2. ISOLATION — listProgramsForSpace filters by space_id, so a program in space A can never
//      resolve for space B.

const ROOT_ID = 'f0000000-0000-4000-a000-00000000root'
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'

const store: { rows: Record<string, Array<Record<string, unknown>>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []

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

import { stampProgramSpaceId, listProgramsForSpace } from './library'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
})

describe('stampProgramSpaceId (create defaults to root)', () => {
  it('STAMP: with no spaceId, a new program is stamped to the ROOT space', async () => {
    expect(await stampProgramSpaceId()).toBe(ROOT_ID)
  })

  it('a space-scoped caller stamps its own space', async () => {
    expect(await stampProgramSpaceId(SPACE_A)).toBe(SPACE_A)
  })
})

describe('listProgramsForSpace (by-space read)', () => {
  it('CANARY: with no spaceId, reads the ROOT space rows', async () => {
    store.rows[ROOT_ID] = [{ id: 'pr1', space_id: ROOT_ID, title: 'Root program' }]
    const rows = await listProgramsForSpace()
    expect(rows.map((r) => r.id)).toEqual(['pr1'])
    expect(eqCalls).toContainEqual(['space_id', ROOT_ID])
  })

  it('ISOLATION: a program saved for space A never resolves for space B', async () => {
    store.rows[SPACE_A] = [{ id: 'a1', space_id: SPACE_A, title: 'A only' }]
    expect((await listProgramsForSpace(SPACE_A)).map((r) => r.id)).toEqual(['a1'])
    expect(await listProgramsForSpace(SPACE_B)).toEqual([])
  })
})
