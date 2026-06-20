import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Spaces DIRECTORY discovery read (ENTITY-SPACES-BUILD §A/§B). What is locked here, network-free
// (the admin client + the follows read are mocked):
//   1. listNetworkedSpaces returns the networked, active, non-root Spaces, ordered by brand name.
//   2. The "Following" FILTER (onlyFollowed) intersects the networked set with the viewer's follows:
//      only followed Spaces survive, a viewer who follows nothing gets [], and a signed-out viewer
//      (no profile id) gets [] (follows nothing). Fail-safe throughout.

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
}
const store: { spaces: SpaceRow[] } = { spaces: [] }

function spacesBuilder() {
  const eqs: Record<string, string> = {}
  let neqType: string | null = null
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
    order() {
      return api
    },
    limit() {
      // Terminal: apply the recorded filters and resolve.
      const rows = store.spaces
        .filter((r) => (eqs.visibility ? r.visibility === eqs.visibility : true))
        .filter((r) => (eqs.status ? r.status === eqs.status : true))
        .filter((r) => (eqs.type ? r.type === eqs.type : true))
        .filter((r) => (neqType ? r.type !== neqType : true))
        .sort((a, b) => a.name.localeCompare(b.name))
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

// The member-count read (select('space_id').eq('status','active').in('space_id', ids)) — return no
// rows so every count resolves to null (counts aren't under test here).
function membersBuilder() {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    in() {
      return Promise.resolve({ data: [], error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'space_members' ? membersBuilder() : spacesBuilder()),
  }),
}))

import { listNetworkedSpaces } from './discovery'

const VIEWER = 'viewer-0000-4000-a000-0000000viewr'

beforeEach(() => {
  followed = new Set()
  store.spaces = [
    { id: 's1', slug: 'river-yoga', name: 'River Yoga', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network' },
    { id: 's2', slug: 'sound-co', name: 'Sound Co', type: 'business', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network' },
    { id: 's3', slug: 'forest-org', name: 'Forest Org', type: 'organization', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network' },
    // Excluded by the discovery boundary: private + root, never listed.
    { id: 's4', slug: 'private-one', name: 'Private One', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'private' },
    { id: 'root', slug: 'frequency', name: 'Frequency', type: 'root', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network' },
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
