import { describe, it, expect, beforeEach, vi } from 'vitest'

// PLACE-TREE AUDIENCE SELECTORS (CRM Phase 5). Locked here, all network-free (the admin client is
// mocked over an in-memory tree):
//   1. parsePlaceSelector is a pure, fail-safe parser: `circle:/hub:/nexus:<id>` -> selector; a bare
//      prefix or a non-place string -> null (never an unbounded audience).
//   2. resolvePlaceTreeProfileIds walks the tree down to ACTIVE memberships: circle -> its members;
//      hub -> its circles' members; nexus -> its hubs' circles' members. De-duplicated. Fail-safe [].

type Membership = { circle_id: string; profile_id: string; status: string }
const tree = {
  circles: [] as { id: string; hub_id: string | null }[],
  hubs: [] as { id: string; nexus_id: string | null }[],
  memberships: [] as Membership[],
}

function builder(table: string) {
  const rows: Record<string, unknown>[] = table === 'memberships'
    ? tree.memberships.map((row, i) => ({ ...row, id: String(i).padStart(8, '0') }))
    : table === 'circles' ? tree.circles : tree.hubs
  const filters: ((row: Record<string, unknown>) => boolean)[] = []
  let after: string | null = null
  let limit = 1000
  const api = {
    select() { return api },
    eq(key: string, value: string) { filters.push(row => row[key] === value); return api },
    in(key: string, values: string[]) { filters.push(row => values.includes(String(row[key]))); return api },
    order() { return api },
    limit(value: number) { limit = value; return api },
    gt(_key: string, value: string) { after = value; return api },
    then(resolve: (value: unknown) => unknown) {
      const result = rows.filter(row => filters.every(filter => filter(row)) && (after === null || String(row.id) > after))
        .sort((a, b) => String(a.id) < String(b.id) ? -1 : 1).slice(0, Math.min(limit, 1000))
      return Promise.resolve({ data: result, error: null }).then(resolve)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (['circles', 'hubs', 'memberships'].includes(table)) return builder(table)
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { parsePlaceSelector, isPlaceSelector, resolvePlaceTreeProfileIds } from './place-tree'

beforeEach(() => {
  tree.circles = []
  tree.hubs = []
  tree.memberships = []
})

describe('parsePlaceSelector (pure)', () => {
  it('parses each tier', () => {
    expect(parsePlaceSelector('circle:abc')).toEqual({ type: 'circle', id: 'abc' })
    expect(parsePlaceSelector('hub:h1')).toEqual({ type: 'hub', id: 'h1' })
    expect(parsePlaceSelector('nexus:n1')).toEqual({ type: 'nexus', id: 'n1' })
    expect(parsePlaceSelector('  circle:xyz  ')).toEqual({ type: 'circle', id: 'xyz' })
  })

  it('reads a bare prefix, a non-place string, and junk as null (never an unbounded audience)', () => {
    expect(parsePlaceSelector('circle:')).toBeNull()
    expect(parsePlaceSelector('circle:   ')).toBeNull()
    expect(parsePlaceSelector('seg:web-beta')).toBeNull()
    expect(parsePlaceSelector('members')).toBeNull()
    expect(parsePlaceSelector(42)).toBeNull()
    expect(parsePlaceSelector(undefined)).toBeNull()
  })

  it('isPlaceSelector agrees with the parser', () => {
    expect(isPlaceSelector('hub:h1')).toBe(true)
    expect(isPlaceSelector('seg:x')).toBe(false)
  })
})

describe('resolvePlaceTreeProfileIds (walks the tree to active members)', () => {
  it('circle -> its own active memberships, de-duplicated, inactive excluded', async () => {
    tree.memberships = [
      { circle_id: 'c1', profile_id: 'p1', status: 'active' },
      { circle_id: 'c1', profile_id: 'p2', status: 'active' },
      { circle_id: 'c1', profile_id: 'p3', status: 'inactive' },
    ]
    const ids = await resolvePlaceTreeProfileIds({ type: 'circle', id: 'c1' })
    expect(ids.sort()).toEqual(['p1', 'p2'])
  })

  it('hub -> every circle in the hub -> their active members', async () => {
    tree.circles = [
      { id: 'c1', hub_id: 'h1' },
      { id: 'c2', hub_id: 'h1' },
      { id: 'c3', hub_id: 'h2' },
    ]
    tree.memberships = [
      { circle_id: 'c1', profile_id: 'p1', status: 'active' },
      { circle_id: 'c2', profile_id: 'p2', status: 'active' },
      { circle_id: 'c3', profile_id: 'p9', status: 'active' }, // other hub, excluded
    ]
    const ids = await resolvePlaceTreeProfileIds({ type: 'hub', id: 'h1' })
    expect(ids.sort()).toEqual(['p1', 'p2'])
  })

  it('nexus -> hubs -> circles -> active members', async () => {
    tree.hubs = [
      { id: 'h1', nexus_id: 'n1' },
      { id: 'h2', nexus_id: 'n2' },
    ]
    tree.circles = [
      { id: 'c1', hub_id: 'h1' },
      { id: 'c2', hub_id: 'h2' },
    ]
    tree.memberships = [
      { circle_id: 'c1', profile_id: 'p1', status: 'active' },
      { circle_id: 'c2', profile_id: 'p9', status: 'active' }, // other nexus, excluded
    ]
    const ids = await resolvePlaceTreeProfileIds({ type: 'nexus', id: 'n1' })
    expect(ids).toEqual(['p1'])
  })

  it('an empty / unresolvable place is nobody (fail-safe), never everybody', async () => {
    expect(await resolvePlaceTreeProfileIds({ type: 'circle', id: 'nope' })).toEqual([])
    expect(await resolvePlaceTreeProfileIds({ type: 'hub', id: 'nope' })).toEqual([])
    expect(await resolvePlaceTreeProfileIds({ type: 'nexus', id: 'nope' })).toEqual([])
    expect(await resolvePlaceTreeProfileIds({ type: 'circle', id: '' })).toEqual([])
  })
})

// The service deliberately caps unpaged reads at 1,000, like supabase/config.toml.
it('resolves more than 1,000 Circle members without truncating the audience', async () => {
  tree.memberships = Array.from({ length: 1205 }, (_, i) => ({ circle_id: 'circle-a', profile_id: `p${i}`, status: 'active' }))
  expect(await resolvePlaceTreeProfileIds({ type: 'circle', id: 'circle-a' })).toHaveLength(1205)
})
it('pages every hub/circle layer while preserving the selected Nexus boundary', async () => {
  tree.hubs = Array.from({ length: 1205 }, (_, i) => ({ id: `h${String(i).padStart(5, '0')}`, nexus_id: 'n-a' }))
  tree.hubs.push({ id: 'other-hub', nexus_id: 'n-b' })
  tree.circles = tree.hubs.map(hub => ({ id: `c-${hub.id}`, hub_id: hub.id }))
  tree.memberships = tree.circles.map(circle => ({ circle_id: circle.id, profile_id: `p-${circle.id}`, status: 'active' }))
  const ids = await resolvePlaceTreeProfileIds({ type: 'nexus', id: 'n-a' })
  expect(ids).toHaveLength(1205)
  expect(ids).not.toContain('p-c-other-hub')
})
it('pages a Hub with more than 1,000 circles', async () => {
  tree.circles = Array.from({ length: 1205 }, (_, i) => ({ id: `c${String(i).padStart(5, '0')}`, hub_id: 'h-a' }))
  tree.memberships = tree.circles.map(circle => ({ circle_id: circle.id, profile_id: `p-${circle.id}`, status: 'active' }))
  expect(await resolvePlaceTreeProfileIds({ type: 'hub', id: 'h-a' })).toHaveLength(1205)
})
