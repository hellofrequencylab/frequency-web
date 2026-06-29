import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 3 "Grow" — remix lineage reads (ADR-447). In-memory fake of the admin client (the repo
// pattern, see practices-admin-search.test.ts). A small chainable builder over a per-table store
// supports exactly the operators the lineage reads issue: .select · .eq · .or (root.eq,id.eq) ·
// .not('root_practice_id','is',null) · .is('root_practice_id',null)/.is('remixed_from',null) ·
// .in · .maybeSingle.
//
// Proves:
//   • getPracticeLineage builds the tree from root_practice_id (one scan), counts remixes,
//     resolves the original + the direct parent, and honours includeHidden
//   • mostRemixed groups by root and ranks
//   • topRemixContributors attributes remixes to the root's creator

type Row = Record<string, unknown>
const store: { practices: Row[] } = { practices: [] }

function from(table: string) {
  let rows = [...(store[table as 'practices'] ?? [])]
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => {
      rows = rows.filter((r) => r[c] === v)
      return api
    },
    is: (c: string, v: null) => {
      rows = rows.filter((r) => (r[c] ?? null) === v)
      return api
    },
    not: (c: string) => {
      // Only the "is not null" form is used by the lineage reads.
      rows = rows.filter((r) => (r[c] ?? null) !== null)
      return api
    },
    in: (c: string, vs: readonly unknown[]) => {
      const set = new Set(vs)
      rows = rows.filter((r) => set.has(r[c]))
      return api
    },
    or: (clause: string) => {
      // "root_practice_id.eq.<id>,id.eq.<id>"
      const ids = [...clause.matchAll(/\.eq\.([0-9a-zA-Z-]+)/g)].map((m) => m[1])
      rows = rows.filter((r) => ids.includes(String(r.root_practice_id)) || ids.includes(String(r.id)))
      return api
    },
    async maybeSingle() {
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => from(t) }),
}))

import { getPracticeLineage, mostRemixed, topRemixContributors } from './lineage'

// A tree: root R (by u1) → A, B remix R; C remixes A (root still R). plus an unrelated original O.
function seed() {
  store.practices = [
    { id: 'R', title: 'Original', slug: 'original', created_by: 'u1', is_public: true, remixed_from: null, root_practice_id: null },
    { id: 'A', title: 'Remix A', slug: 'a', created_by: 'u2', is_public: true, remixed_from: 'R', root_practice_id: 'R' },
    { id: 'B', title: 'Remix B', slug: 'b', created_by: 'u3', is_public: true, remixed_from: 'R', root_practice_id: 'R' },
    { id: 'C', title: 'Remix C', slug: 'c', created_by: 'u2', is_public: false, remixed_from: 'A', root_practice_id: 'R' },
    { id: 'O', title: 'Other original', slug: 'o', created_by: 'u3', is_public: true, remixed_from: null, root_practice_id: null },
  ]
}
beforeEach(seed)

describe('getPracticeLineage', () => {
  it('from a remix: resolves root, parent, public tree, and count', async () => {
    const lin = await getPracticeLineage('C')
    expect(lin).not.toBeNull()
    expect(lin!.rootId).toBe('R')
    expect(lin!.isOriginal).toBe(false)
    expect(lin!.original?.id).toBe('R')
    expect(lin!.parent?.id).toBe('A') // direct parent, not the root
    // public-only tree excludes C itself (it's the seed but also non-public): A, B
    expect(lin!.remixes.map((r) => r.id).sort()).toEqual(['A', 'B'])
    expect(lin!.remixCount).toBe(2)
  })

  it('includeHidden surfaces the non-public remix', async () => {
    const lin = await getPracticeLineage('R', { includeHidden: true })
    expect(lin!.isOriginal).toBe(true)
    expect(lin!.remixes.map((r) => r.id).sort()).toEqual(['A', 'B', 'C'])
    expect(lin!.remixCount).toBe(3)
  })

  it('returns null for an unknown practice', async () => {
    expect(await getPracticeLineage('nope')).toBeNull()
  })
})

describe('mostRemixed', () => {
  it('ranks roots by public remix count', async () => {
    const rows = await mostRemixed({ limit: 5 })
    expect(rows[0].rootId).toBe('R')
    expect(rows[0].remixCount).toBe(2) // A, B public; C hidden
    expect(rows[0].creator).toBe('u1')
  })
})

describe('topRemixContributors', () => {
  it('attributes public remixes to the root creator', async () => {
    const top = await topRemixContributors({ limit: 5 })
    const u1 = top.find((t) => t.creatorId === 'u1')
    expect(u1?.originated).toBe(1) // R
    expect(u1?.remixesReceived).toBe(2) // A, B (public) off R
  })
})
