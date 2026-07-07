import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Team block's member-picker server actions are gated on PER-SPACE edit permission (owner / admin /
// editor of THIS space), NOT platform staff. This test locks:
//   - an UNAUTHORIZED caller (no canEditProfile) gets [] from both search and resolve (fail-closed),
//     and never queries `profiles`.
//   - a blank / unknown slug is rejected before any query.
//   - a too-short query yields [] without a query.
//   - an authorized editor's search returns member cards; resolve preserves the requested id order and
//     drops members with no handle (nothing to link to).

const SPACE_A = 'aaaaaaaa-0000-4000-a000-00000000000a'

let caps = { canEditProfile: false }
let space: { id: string } | null = { id: SPACE_A }
let rows: Array<Record<string, unknown>> = []

// A chainable query stub: every builder method returns `this`, and awaiting resolves to { data: rows }.
const queryCalls: Array<{ method: string; args: unknown[] }> = []
function makeQuery() {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'or', 'in', 'order', 'limit']) {
    q[m] = (...args: unknown[]) => {
      queryCalls.push({ method: m, args })
      return q
    }
  }
  ;(q as { then: unknown }).then = (resolve: (v: { data: unknown }) => unknown) => resolve({ data: rows })
  return q
}
const fromMock = vi.fn(() => makeQuery())

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'caller-1' }) }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: async () => space }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => caps }))

import { searchNetworkMembers, resolveNetworkMembers } from './member-search-action'

beforeEach(() => {
  caps = { canEditProfile: false }
  space = { id: SPACE_A }
  rows = []
  queryCalls.length = 0
  fromMock.mockClear()
})

describe('gate: only a per-space editor may search or resolve members', () => {
  it('an unauthorized caller gets [] and never queries profiles', async () => {
    caps = { canEditProfile: false }
    expect(await searchNetworkMembers('willow-studio', 'ada')).toEqual([])
    expect(await resolveNetworkMembers('willow-studio', ['id1'])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('a blank / unknown slug is rejected before any query', async () => {
    caps = { canEditProfile: true }
    expect(await searchNetworkMembers('   ', 'ada')).toEqual([])
    space = null
    expect(await searchNetworkMembers('ghost', 'ada')).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('a too-short query returns [] without a query', async () => {
    caps = { canEditProfile: true }
    expect(await searchNetworkMembers('willow-studio', 'a')).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('an authorized editor searches + resolves members', () => {
  it('search maps rows to member cards (name / handle / avatar)', async () => {
    caps = { canEditProfile: true }
    rows = [{ id: 'id1', handle: 'ada', display_name: 'Ada Lovelace', avatar_url: 'https://cdn/a.png' }]
    const out = await searchNetworkMembers('willow-studio', 'ada')
    expect(out).toEqual([
      { id: 'id1', handle: 'ada', displayName: 'Ada Lovelace', avatarUrl: 'https://cdn/a.png' },
    ])
    expect(fromMock).toHaveBeenCalledWith('profiles')
  })

  it('resolve preserves the requested id order and drops handle-less rows', async () => {
    caps = { canEditProfile: true }
    // Returned unordered; a member with no handle is not linkable and must be dropped.
    rows = [
      { id: 'id2', handle: 'grace', display_name: 'Grace Hopper', avatar_url: null },
      { id: 'id1', handle: 'ada', display_name: 'Ada Lovelace', avatar_url: null },
      { id: 'id3', handle: null, display_name: 'No Handle', avatar_url: null },
    ]
    const out = await resolveNetworkMembers('willow-studio', ['id1', 'id2', 'id3'])
    expect(out.map((m) => m.id)).toEqual(['id1', 'id2'])
  })

  it('resolve falls back to the handle when the display name is blank', async () => {
    caps = { canEditProfile: true }
    rows = [{ id: 'id1', handle: 'ada', display_name: '', avatar_url: null }]
    const out = await resolveNetworkMembers('willow-studio', ['id1'])
    expect(out[0].displayName).toBe('ada')
  })
})
