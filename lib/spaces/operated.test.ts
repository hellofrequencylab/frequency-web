import { describe, it, expect, vi, beforeEach } from 'vitest'

// hasOperatedSpaces (lib/spaces/operated) — the cheap EXISTS probe that gates the operator
// "My Spaces" nav item. Locks: true when the profile OWNS a Space OR actively ADMINS one; false
// when it runs none, when the profile id is absent, and (fail-safe) on any query error.

// In-memory backing for the two probes. `owned` = spaces.owner_profile_id rows; `admin` =
// active-admin space_members rows. `fail` forces an error payload to prove the fail-safe path.
const state: { owned: string[]; admin: string[]; fail: boolean } = { owned: [], admin: [], fail: false }

function spacesBuilder() {
  const api = {
    select: () => api,
    eq: () => api,
    limit: () =>
      Promise.resolve(
        state.fail
          ? { data: null, error: new Error('boom') }
          : { data: state.owned.slice(0, 1).map((id) => ({ id })), error: null },
      ),
  }
  return api
}

function membersBuilder() {
  const api = {
    select: () => api,
    eq: () => api,
    limit: () =>
      Promise.resolve(
        state.fail
          ? { data: null, error: new Error('boom') }
          : { data: state.admin.slice(0, 1).map((id) => ({ space_id: id })), error: null },
      ),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'space_members' ? membersBuilder() : spacesBuilder()),
  }),
}))

// getSpaceById is imported by the module but unused by hasOperatedSpaces; stub it so the import
// resolves without touching the real store.
vi.mock('./store', () => ({ getSpaceById: async () => null }))

import { hasOperatedSpaces } from './operated'

const P = 'prof-0000-4000-a000-00000000prof'

beforeEach(() => {
  state.owned = []
  state.admin = []
  state.fail = false
})

describe('hasOperatedSpaces', () => {
  it('is true when the profile owns a Space', async () => {
    state.owned = ['s1']
    expect(await hasOperatedSpaces(P)).toBe(true)
  })

  it('is true when the profile actively admins a Space (owns none)', async () => {
    state.admin = ['s2']
    expect(await hasOperatedSpaces(P)).toBe(true)
  })

  it('is false when the profile owns and admins nothing', async () => {
    expect(await hasOperatedSpaces(P)).toBe(false)
  })

  it('is false for a missing profile id (no query)', async () => {
    expect(await hasOperatedSpaces(null)).toBe(false)
    expect(await hasOperatedSpaces(undefined)).toBe(false)
  })

  it('fails safe to false on a query error', async () => {
    state.owned = ['s1']
    state.fail = true
    expect(await hasOperatedSpaces(P)).toBe(false)
  })
})
