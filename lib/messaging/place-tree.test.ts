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

function circlesBuilder() {
  const api = {
    select() {
      return api
    },
    eq(_c: string, val: string) {
      return Promise.resolve({ data: tree.circles.filter((c) => c.hub_id === val).map((c) => ({ id: c.id })), error: null })
    },
    in(_c: string, vals: string[]) {
      return Promise.resolve({ data: tree.circles.filter((c) => c.hub_id && vals.includes(c.hub_id)).map((c) => ({ id: c.id })), error: null })
    },
  }
  return api
}
function hubsBuilder() {
  const api = {
    select() {
      return api
    },
    eq(_c: string, val: string) {
      return Promise.resolve({ data: tree.hubs.filter((h) => h.nexus_id === val).map((h) => ({ id: h.id })), error: null })
    },
  }
  return api
}
function membershipsBuilder() {
  const f: { circleIds: string[] } = { circleIds: [] }
  const api = {
    select() {
      return api
    },
    in(_c: string, vals: string[]) {
      f.circleIds = vals
      return api
    },
    eq(_c: string, val: string) {
      const data = tree.memberships
        .filter((m) => f.circleIds.includes(m.circle_id) && m.status === val)
        .map((m) => ({ profile_id: m.profile_id }))
      return Promise.resolve({ data, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'circles') return circlesBuilder()
      if (table === 'hubs') return hubsBuilder()
      if (table === 'memberships') return membershipsBuilder()
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
