import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Spaces DIRECTORY discovery read (ENTITY-SPACES-BUILD §A/§B). What is locked here, network-free
// (the admin client + the follows read are mocked):
//   1. listNetworkedSpaces returns the networked, active, non-root Spaces, ordered by brand name.
//   2. The "Following" FILTER (onlyFollowed) intersects the networked set with the viewer's follows:
//      only followed Spaces survive, a viewer who follows nothing gets [], and a signed-out viewer
//      (no profile id) gets [] (follows nothing). Fail-safe throughout.
//   3. The SORT param orders the catalog: name (A–Z, default) / newest (created_at desc) / members
//      (active member count desc). normalizeSpaceSort coerces stray values back to 'name'.

// ── Mock the follows read the directory intersects against (toggled per test) ──────────────────────
let followed: Set<string> = new Set()
vi.mock('./follows', () => ({
  listFollowedSpaceIds: async (profileId: string | null) =>
    profileId ? followed : new Set<string>(),
}))

// ── A chainable admin-client mock backed by an in-memory set of spaces rows ─────────────────────────
type SpaceRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  brand_name: string | null
  brand_logo_url: string | null
  tagline: string | null
  visibility: string
  created_at: string
}
const store: { spaces: SpaceRow[]; counts: Record<string, number> } = { spaces: [], counts: {} }

function spacesBuilder() {
  const eqs: Record<string, string> = {}
  let neqType: string | null = null
  let orderCol = 'name'
  let orderAsc = true
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqs[col] = val
      return api
    },
    neq(col: string, val: string) {
      if (col === 'type') neqType = val
      return api
    },
    or() {
      return api
    },
    order(col: string, opts: { ascending: boolean }) {
      orderCol = col
      orderAsc = opts.ascending
      return api
    },
    limit() {
      // Terminal: apply the recorded filters + the recorded DB order and resolve. (The 'members'
      // sort is applied in app code AFTER counts, so the DB order there is name — exactly this.)
      const rows = store.spaces
        .filter((r) => (eqs.visibility ? r.visibility === eqs.visibility : true))
        .filter((r) => (eqs.status ? r.status === eqs.status : true))
        .filter((r) => (eqs.type ? r.type === eqs.type : true))
        .filter((r) => (neqType ? r.type !== neqType : true))
        .sort((a, b) => {
          const cmp =
            orderCol === 'created_at'
              ? a.created_at.localeCompare(b.created_at)
              : a.name.localeCompare(b.name)
          return orderAsc ? cmp : -cmp
        })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

// The member-count read (select('space_id').eq('status','active').in('space_id', ids)) — returns one
// row per active member from store.counts, so the "Most members" sort has real counts to order by.
function membersBuilder() {
  let ids: string[] = []
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    in(_col: string, vals: string[]) {
      ids = vals
      const data = ids.flatMap((id) => Array.from({ length: store.counts[id] ?? 0 }, () => ({ space_id: id })))
      return Promise.resolve({ data, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'space_members' ? membersBuilder() : spacesBuilder()),
  }),
}))

import { listNetworkedSpaces, normalizeSpaceSort } from './discovery'

const VIEWER = 'viewer-0000-4000-a000-0000000viewr'

beforeEach(() => {
  followed = new Set()
  store.counts = {}
  store.spaces = [
    { id: 's1', slug: 'river-yoga', name: 'River Yoga', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2026-01-10T00:00:00Z' },
    { id: 's2', slug: 'sound-co', name: 'Sound Co', type: 'business', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2026-03-01T00:00:00Z' },
    { id: 's3', slug: 'forest-org', name: 'Forest Org', type: 'organization', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2026-02-15T00:00:00Z' },
    // Excluded by the discovery boundary: private + root, never listed.
    { id: 's4', slug: 'private-one', name: 'Private One', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'private', created_at: '2026-01-01T00:00:00Z' },
    { id: 'root', slug: 'frequency', name: 'Frequency', type: 'root', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2025-01-01T00:00:00Z' },
  ]
})

describe('listNetworkedSpaces (no Following filter)', () => {
  it('lists networked, active, non-root spaces, ordered by name', async () => {
    const spaces = await listNetworkedSpaces({})
    expect(spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2']) // Forest Org, River Yoga, Sound Co
  })
})

describe('the "Following" filter (onlyFollowed)', () => {
  it('intersects the networked set with the viewer’s follows', async () => {
    followed = new Set(['s1', 's3', 's4']) // s4 is private, so it can never surface even if followed
    const spaces = await listNetworkedSpaces({
      followerProfileId: VIEWER,
      onlyFollowed: true,
    })
    expect(spaces.map((s) => s.id).sort()).toEqual(['s1', 's3'])
  })

  it('a viewer who follows nothing gets an empty directory', async () => {
    followed = new Set()
    expect(await listNetworkedSpaces({ followerProfileId: VIEWER, onlyFollowed: true })).toEqual([])
  })

  it('a signed-out viewer (no profile id) follows nothing -> []', async () => {
    followed = new Set(['s1']) // even if a set existed, no profile id means nothing resolves
    expect(await listNetworkedSpaces({ followerProfileId: null, onlyFollowed: true })).toEqual([])
  })
})

describe('the sort param', () => {
  it('defaults to name (A–Z) when sort is absent or unknown', async () => {
    const byDefault = await listNetworkedSpaces({})
    const byName = await listNetworkedSpaces({ sort: 'name' })
    // @ts-expect-error — a stray value coerces back to 'name'
    const byStray = await listNetworkedSpaces({ sort: 'bogus' })
    const names = ['s3', 's1', 's2'] // Forest Org, River Yoga, Sound Co
    expect(byDefault.map((s) => s.id)).toEqual(names)
    expect(byName.map((s) => s.id)).toEqual(names)
    expect(byStray.map((s) => s.id)).toEqual(names)
  })

  it('newest orders by created_at descending', async () => {
    const spaces = await listNetworkedSpaces({ sort: 'newest' })
    // s2 (Mar) > s3 (Feb) > s1 (Jan)
    expect(spaces.map((s) => s.id)).toEqual(['s2', 's3', 's1'])
  })

  it('members orders by active member count descending, ties fall back to name', async () => {
    store.counts = { s1: 5, s2: 5, s3: 12 }
    const spaces = await listNetworkedSpaces({ sort: 'members' })
    // s3 (12) first; s1 & s2 tie at 5, so name breaks the tie: River Yoga before Sound Co.
    expect(spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
    expect(spaces.map((s) => s.memberCount)).toEqual([12, 5, 5])
  })

  it('members sort sinks a Space with no count below any counted one', async () => {
    store.counts = { s1: 3 } // s2, s3 have no members
    const spaces = await listNetworkedSpaces({ sort: 'members' })
    expect(spaces[0].id).toBe('s1') // the only counted Space leads
    expect(spaces.slice(1).map((s) => s.id).sort()).toEqual(['s2', 's3'])
  })
})

describe('normalizeSpaceSort', () => {
  it('passes known sorts through and coerces everything else to name', () => {
    expect(normalizeSpaceSort('name')).toBe('name')
    expect(normalizeSpaceSort('newest')).toBe('newest')
    expect(normalizeSpaceSort('members')).toBe('members')
    expect(normalizeSpaceSort('bogus')).toBe('name')
    expect(normalizeSpaceSort(undefined)).toBe('name')
    expect(normalizeSpaceSort(null)).toBe('name')
  })
})
