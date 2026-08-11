import { describe, it, expect, beforeEach, vi } from 'vitest'

// isMutableSubject — the rule setSubjectMute gates on: may THIS member mute THIS Space/Circle?
//
// The subject id arrives from the client, so this predicate is the only thing standing between a
// signed-in caller and mute rows keyed to somebody else's Space. It answers true for a live
// belonging and false for everything else, including every error path (fail-closed).
//
//   • circle — an ACTIVE `memberships` row.
//   • space  — an ACTIVE `space_members` row, OR ownership (`spaces.owner_profile_id`), because a
//              Space owner holds no membership row and still receives that Space's Dispatches.
//
// Reads go through the SESSION client, so RLS is a second wall underneath these filters
// (`space_members` is gated on profile_id = get_my_profile_id()). The filters are asserted here
// because a dropped `.eq('status', 'active')` would silently let a suspended member back in.

type Row = { id: string } | null

const { createClient, queries } = vi.hoisted(() => ({
  createClient: vi.fn(),
  queries: [] as { table: string; filters: [string, string][] }[],
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/notification-preferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notification-preferences')>()),
  listSubjectMutes: vi.fn().mockResolvedValue([]),
}))

import { isMutableSubject } from './mute-subjects'

/** A tiny stand-in for the Supabase query builder: records the table + `.eq()` filters, then
 *  resolves whatever `rows` says that table should return. */
function stubDb(rows: Record<string, Row>) {
  return {
    from(table: string) {
      const record = { table, filters: [] as [string, string][] }
      queries.push(record)
      const chain = {
        select: () => chain,
        eq: (col: string, val: string) => {
          record.filters.push([col, val])
          return chain
        },
        maybeSingle: async () => ({ data: rows[table] ?? null }),
      }
      return chain
    },
  }
}

const filtersFor = (table: string) =>
  Object.fromEntries(queries.filter((q) => q.table === table).flatMap((q) => q.filters))

beforeEach(() => {
  vi.clearAllMocks()
  queries.length = 0
})

describe('isMutableSubject — Circles', () => {
  it('is true for an active membership, and asks for exactly that row', async () => {
    createClient.mockResolvedValue(stubDb({ memberships: { id: 'm-1' } }))
    expect(await isMutableSubject('profile-1', 'circle', 'circle-1')).toBe(true)
    expect(filtersFor('memberships')).toEqual({
      profile_id: 'profile-1',
      circle_id: 'circle-1',
      status: 'active',
    })
  })

  it('is false when the member has no row in that Circle', async () => {
    createClient.mockResolvedValue(stubDb({ memberships: null }))
    expect(await isMutableSubject('profile-1', 'circle', 'someone-elses-circle')).toBe(false)
  })

  it('never reads the Space tables for a Circle subject', async () => {
    createClient.mockResolvedValue(stubDb({ memberships: { id: 'm-1' } }))
    await isMutableSubject('profile-1', 'circle', 'circle-1')
    expect(queries.map((q) => q.table)).toEqual(['memberships'])
  })
})

describe('isMutableSubject — Spaces', () => {
  it('is true for an active space_members row', async () => {
    createClient.mockResolvedValue(stubDb({ space_members: { id: 'sm-1' }, spaces: null }))
    expect(await isMutableSubject('profile-1', 'space', 'space-1')).toBe(true)
    expect(filtersFor('space_members')).toEqual({
      profile_id: 'profile-1',
      space_id: 'space-1',
      status: 'active',
    })
  })

  it('is true for the Space OWNER, who holds no membership row', async () => {
    createClient.mockResolvedValue(stubDb({ space_members: null, spaces: { id: 'space-1' } }))
    expect(await isMutableSubject('profile-1', 'space', 'space-1')).toBe(true)
    expect(filtersFor('spaces')).toEqual({ id: 'space-1', owner_profile_id: 'profile-1' })
  })

  it('is false for a Space the caller neither belongs to nor owns', async () => {
    createClient.mockResolvedValue(stubDb({ space_members: null, spaces: null }))
    expect(await isMutableSubject('profile-1', 'space', 'a-space-i-am-not-in')).toBe(false)
  })
})

describe('isMutableSubject — fail closed', () => {
  it('is false when the read throws', async () => {
    createClient.mockRejectedValue(new Error('no session'))
    expect(await isMutableSubject('profile-1', 'space', 'space-1')).toBe(false)
  })

  it('is false for a missing profile id or a blank subject id, without a read', async () => {
    createClient.mockResolvedValue(stubDb({}))
    expect(await isMutableSubject('', 'space', 'space-1')).toBe(false)
    expect(await isMutableSubject('profile-1', 'circle', '')).toBe(false)
    expect(createClient).not.toHaveBeenCalled()
  })
})
