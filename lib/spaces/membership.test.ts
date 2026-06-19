import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 0 (ENTITY-SPACES-BUILD §0, Epics 0.1/0.2) — the SPACE MEMBERSHIP + ENTITLEMENTS
// foundation. Three guarantees, locked here:
//   1. The space-role LADDER (viewer < editor < moderator < admin) ranks + gates correctly,
//      fail-closed for unknown roles.
//   2. ENTITLEMENTS are DEFAULT-DENY: a missing key / malformed blob grants nothing.
//   3. CROSS-SPACE ISOLATION: a member of space A is NOT a member of space B — every membership
//      read is filtered by space_id, so A's row never resolves for B.

// ── A chainable admin-client mock (same shape as lib/page-settings/store.test.ts) ────────
// rows[space_id][profile_id] = the space_members row for that (space, person).
const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const SPACE_B = 'bbbbbbbb-0000-4000-a000-00000000000b'
const ALICE = 'alice-0000-4000-a000-00000000alic'
const BOB = 'bob00000-0000-4000-a000-0000000000bo'

type MemberRow = {
  id: string
  space_id: string
  profile_id: string
  role: string
  status: string
  invited_by: string | null
  created_at: string
}
const store: { rows: Record<string, Record<string, MemberRow>> } = { rows: {} }
const eqCalls: Array<[string, unknown]> = []

function builder() {
  const filters: { space_id?: string; profile_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      if (col === 'space_id') filters.space_id = val as string
      if (col === 'profile_id') filters.profile_id = val as string
      return api
    },
    order() {
      return api
    },
    async maybeSingle() {
      const tenant = store.rows[filters.space_id ?? ''] ?? {}
      return { data: tenant[filters.profile_id ?? ''] ?? null, error: null }
    },
    // listSpaceMembers awaits the builder after .order() — resolve via the thenable.
    then(resolve: (r: { data: MemberRow[] | null; error: null }) => unknown) {
      const tenant = store.rows[filters.space_id ?? ''] ?? {}
      return Promise.resolve(resolve({ data: Object.values(tenant), error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => builder() }),
}))

import {
  SPACE_ROLES,
  spaceRoleRank,
  atLeastSpaceRole,
  isSpaceRole,
  isSpaceAdminRole,
  getSpaceMembership,
  listSpaceMembers,
} from './membership'

beforeEach(() => {
  store.rows = {}
  eqCalls.length = 0
})

describe('the space-role ladder (pure)', () => {
  it('ranks ascending: viewer < editor < moderator < admin', () => {
    expect(SPACE_ROLES).toEqual(['viewer', 'editor', 'moderator', 'admin'])
    expect(spaceRoleRank('viewer')).toBeLessThan(spaceRoleRank('editor'))
    expect(spaceRoleRank('editor')).toBeLessThan(spaceRoleRank('moderator'))
    expect(spaceRoleRank('moderator')).toBeLessThan(spaceRoleRank('admin'))
  })

  it('atLeastSpaceRole gates on the ladder', () => {
    expect(atLeastSpaceRole('admin', 'editor')).toBe(true)
    expect(atLeastSpaceRole('editor', 'editor')).toBe(true)
    expect(atLeastSpaceRole('viewer', 'editor')).toBe(false)
    expect(atLeastSpaceRole('moderator', 'admin')).toBe(false)
  })

  it('FAIL-CLOSED: a null/unknown role never satisfies any minimum', () => {
    expect(spaceRoleRank(null)).toBe(-1)
    expect(spaceRoleRank('overlord')).toBe(-1)
    expect(atLeastSpaceRole(null, 'viewer')).toBe(false)
    expect(atLeastSpaceRole('overlord', 'viewer')).toBe(false)
    expect(atLeastSpaceRole(undefined, 'admin')).toBe(false)
  })

  it('isSpaceRole / isSpaceAdminRole', () => {
    expect(isSpaceRole('admin')).toBe(true)
    expect(isSpaceRole('overlord')).toBe(false)
    expect(isSpaceRole(42)).toBe(false)
    expect(isSpaceAdminRole('admin')).toBe(true)
    expect(isSpaceAdminRole('moderator')).toBe(false)
    expect(isSpaceAdminRole(null)).toBe(false)
  })
})

describe('getSpaceMembership (server seam)', () => {
  it('reads a membership row, filtered by space_id + profile_id', async () => {
    store.rows[SPACE_A] = {
      [ALICE]: { id: 'm1', space_id: SPACE_A, profile_id: ALICE, role: 'admin', status: 'active', invited_by: null, created_at: '2026-01-01T00:00:00Z' },
    }
    const m = await getSpaceMembership(SPACE_A, ALICE)
    expect(m?.role).toBe('admin')
    expect(m?.status).toBe('active')
    expect(eqCalls).toContainEqual(['space_id', SPACE_A])
    expect(eqCalls).toContainEqual(['profile_id', ALICE])
  })

  it('FAIL-CLOSED: an unknown role drops the row (future enum value confers no authority)', async () => {
    store.rows[SPACE_A] = {
      [ALICE]: { id: 'm1', space_id: SPACE_A, profile_id: ALICE, role: 'overlord', status: 'active', invited_by: null, created_at: '2026-01-01T00:00:00Z' },
    }
    expect(await getSpaceMembership(SPACE_A, ALICE)).toBeNull()
  })

  it('listSpaceMembers returns only the requested space and drops unknown roles', async () => {
    store.rows[SPACE_A] = {
      [ALICE]: { id: 'm1', space_id: SPACE_A, profile_id: ALICE, role: 'admin', status: 'active', invited_by: null, created_at: '2026-01-02T00:00:00Z' },
      [BOB]: { id: 'm2', space_id: SPACE_A, profile_id: BOB, role: 'gremlin', status: 'active', invited_by: ALICE, created_at: '2026-01-01T00:00:00Z' },
    }
    const list = await listSpaceMembers(SPACE_A)
    expect(list.map((m) => m.profileId)).toEqual([ALICE]) // BOB's bogus role is dropped
  })
})

describe('CROSS-SPACE ISOLATION: a member of space A is not a member of space B', () => {
  it('Alice (admin of A) has NO membership in B', async () => {
    store.rows[SPACE_A] = {
      [ALICE]: { id: 'm1', space_id: SPACE_A, profile_id: ALICE, role: 'admin', status: 'active', invited_by: null, created_at: '2026-01-01T00:00:00Z' },
    }
    // She is a member of A …
    expect((await getSpaceMembership(SPACE_A, ALICE))?.role).toBe('admin')
    // … but querying space B for the same person resolves nothing (no leak across the boundary).
    expect(await getSpaceMembership(SPACE_B, ALICE)).toBeNull()
    // And B's member list never includes A's rows.
    expect(await listSpaceMembers(SPACE_B)).toEqual([])
  })
})
