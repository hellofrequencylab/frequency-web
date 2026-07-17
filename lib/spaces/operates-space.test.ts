import { describe, it, expect, vi, beforeEach } from 'vitest'

// operatesSpace + isSpaceTeamMember (lib/spaces/operated, ADR-778). Two point checks against one
// Space:
//   • operatesSpace     — true when the profile OWNS it OR is an ACTIVE 'admin' member (who may SHARE).
//   • isSpaceTeamMember — true when the profile OWNS it OR is an ACTIVE member of ANY role (who may READ).
// Both fail-safe to false on a query error.

// Backing state for one profile P against Space S. `owns`/`admins`/`members` say how P relates to S.
// `members` here means an active member row of some role; `admins` is the subset that is role='admin'.
const state = { owns: false, admins: false, members: false, fail: false }

// A builder that records .eq filters, then resolves on .limit() from `state`.
function makeBuilder(table: 'spaces' | 'space_members') {
  const eqs: Record<string, string> = {}
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: string) => {
      eqs[col] = val
      return api
    },
    limit: () => {
      if (state.fail) return Promise.resolve({ data: null, error: new Error('boom') })
      if (table === 'spaces') {
        return Promise.resolve({ data: state.owns ? [{ id: eqs.id }] : [], error: null })
      }
      // space_members: an active member; role='admin' narrows to the admin subset.
      const wantsAdmin = eqs.role === 'admin'
      const ok = eqs.status === 'active' && (wantsAdmin ? state.admins : state.members)
      return Promise.resolve({ data: ok ? [{ space_id: eqs.space_id }] : [], error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table === 'space_members' ? 'space_members' : 'spaces'),
  }),
}))

vi.mock('./store', () => ({ getSpaceById: async () => null }))

import { operatesSpace, isSpaceTeamMember } from './operated'

const P = 'prof-0000-4000-a000-00000000prof'
const S = 'spce-0000-4000-a000-0000000space'

beforeEach(() => {
  state.owns = false
  state.admins = false
  state.members = false
  state.fail = false
})

describe('operatesSpace', () => {
  it('true when the profile owns the Space', async () => {
    state.owns = true
    expect(await operatesSpace(P, S)).toBe(true)
  })
  it('true when the profile is an active admin member', async () => {
    state.admins = true
    state.members = true
    expect(await operatesSpace(P, S)).toBe(true)
  })
  it('false for a non-admin active member (viewer/editor/moderator)', async () => {
    state.members = true // active member, but not admin
    expect(await operatesSpace(P, S)).toBe(false)
  })
  it('false when unrelated to the Space', async () => {
    expect(await operatesSpace(P, S)).toBe(false)
  })
  it('false for a missing id (no query)', async () => {
    expect(await operatesSpace(null, S)).toBe(false)
    expect(await operatesSpace(P, undefined)).toBe(false)
  })
  it('fails safe to false on a query error', async () => {
    state.owns = true
    state.fail = true
    expect(await operatesSpace(P, S)).toBe(false)
  })
})

describe('isSpaceTeamMember', () => {
  it('true when the profile owns the Space', async () => {
    state.owns = true
    expect(await isSpaceTeamMember(P, S)).toBe(true)
  })
  it('true for an active member of ANY role (a viewer counts)', async () => {
    state.members = true
    expect(await isSpaceTeamMember(P, S)).toBe(true)
  })
  it('false when unrelated to the Space', async () => {
    expect(await isSpaceTeamMember(P, S)).toBe(false)
  })
  it('fails safe to false on a query error', async () => {
    state.members = true
    state.fail = true
    expect(await isSpaceTeamMember(P, S)).toBe(false)
  })
})
