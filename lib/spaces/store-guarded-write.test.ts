import { beforeEach, describe, expect, it, vi } from 'vitest'

// PROG-E5B. The compare and the write are ONE update: the filters on the statement are the guard. This pins the
// statement the store sends (which row, which stored counter) and how its outcome is read.

const db = vi.hoisted(() => ({ calls: [] as unknown[][], result: { data: [{ id: 's' }] as { id: string }[] | null, error: null as { message: string } | null } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = {
      update: (value: unknown) => { db.calls.push(['update', value]); return chain },
      eq: (column: string, value: string) => { db.calls.push(['eq', column, value]); return chain },
      is: (column: string, value: null) => { db.calls.push(['is', column, value]); return chain },
      select: async (columns: string) => { db.calls.push(['select', columns]); return db.result },
    }
    return { from: (table: string) => { db.calls.push(['from', table]); return chain } }
  },
}))
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }))

import { writeSpacePreferencesAtRevision } from './store'

const SPACE = '0f0e0d0c-0b0a-4908-8706-050403020100'
const KEY = 'profileLayoutDraftRevision'

beforeEach(() => {
  db.calls.length = 0
  db.result = { data: [{ id: SPACE }], error: null }
})

describe('writeSpacePreferencesAtRevision', () => {
  it('writes only where the stored counter still equals the one expected, in a single update', async () => {
    const preferences = { accent: 'sky', [KEY]: 4 }
    expect(await writeSpacePreferencesAtRevision(SPACE, preferences, { revisionKey: KEY, expected: 3 })).toBe('written')
    expect(db.calls).toEqual([
      ['from', 'spaces'],
      ['update', { preferences }],
      ['eq', 'id', SPACE],
      ['eq', `preferences->>${KEY}`, '3'],
      ['select', 'id'],
    ])
  })

  it('treats a Space that has never had a canvas save as revision 0: the counter must still be absent', async () => {
    await writeSpacePreferencesAtRevision(SPACE, { [KEY]: 1 }, { revisionKey: KEY, expected: 0 })
    expect(db.calls).toContainEqual(['is', `preferences->>${KEY}`, null])
  })

  it('reports stale when no row matched (someone else moved the counter), and error when the write failed', async () => {
    db.result = { data: [], error: null }
    expect(await writeSpacePreferencesAtRevision(SPACE, {}, { revisionKey: KEY, expected: 3 })).toBe('stale')
    db.result = { data: null, error: { message: 'boom' } }
    expect(await writeSpacePreferencesAtRevision(SPACE, {}, { revisionKey: KEY, expected: 3 })).toBe('error')
  })

  it('sends nothing for a bad guard', async () => {
    for (const guard of [{ revisionKey: 'a->>b', expected: 1 }, { revisionKey: KEY, expected: -1 }, { revisionKey: KEY, expected: 1.5 }]) {
      expect(await writeSpacePreferencesAtRevision(SPACE, {}, guard)).toBe('error')
    }
    expect(await writeSpacePreferencesAtRevision('', {}, { revisionKey: KEY, expected: 1 })).toBe('error')
    expect(db.calls).toEqual([])
  })
})
