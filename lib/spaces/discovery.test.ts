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
  /** The preferences jsonb — carries profileData.category + headerCta for the app-code resolvers. */
  preferences?: unknown
}
const store: {
  spaces: SpaceRow[]
  counts: Record<string, number>
  followers: Record<string, number>
  upcoming: Record<string, number>
} = { spaces: [], counts: {}, followers: {}, upcoming: {} }

/** The stored directory category for a row (preferences.profileData.category), or null when unset. */
function rowCategory(r: SpaceRow): string | null {
  const prefs = r.preferences && typeof r.preferences === 'object' ? (r.preferences as Record<string, unknown>) : {}
  const pd = prefs.profileData && typeof prefs.profileData === 'object' ? (prefs.profileData as Record<string, unknown>) : {}
  return typeof pd.category === 'string' ? pd.category : null
}

function spacesBuilder() {
  const eqs: Record<string, string> = {}
  let neqType: string | null = null
  let categoryEq: string | null = null
  let categoryBusinessOrNull = false
  let orderCol = 'name'
  let orderAsc = true
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      // The category jsonb-path filter (a specific, non-business category) records separately.
      if (col.includes('category')) categoryEq = val
      else eqs[col] = val
      return api
    },
    neq(col: string, val: string) {
      if (col === 'type') neqType = val
      return api
    },
    or(filter: string) {
      // Two callers: free-text search over name/brand/slug (ignored by this mock), and the
      // 'business'-or-null category filter (matches the literal 'business' OR a missing category).
      if (filter.includes('category')) categoryBusinessOrNull = true
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
        .filter((r) => (categoryEq ? rowCategory(r) === categoryEq : true))
        .filter((r) => (categoryBusinessOrNull ? rowCategory(r) === 'business' || rowCategory(r) === null : true))
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

/** A generic grouped-count builder over a per-id count map: emits one `{ space_id }` row per counted
 *  unit for the requested ids. Tolerates the extra .eq()/.gt() calls the events read chains. */
function countBuilder(map: Record<string, number>) {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    gt() {
      return api
    },
    in(_col: string, vals: string[]) {
      const data = vals.flatMap((id) => Array.from({ length: map[id] ?? 0 }, () => ({ space_id: id })))
      return Promise.resolve({ data, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'space_members') return countBuilder(store.counts)
      if (table === 'space_follows') return countBuilder(store.followers)
      if (table === 'events') return countBuilder(store.upcoming)
      return spacesBuilder()
    },
  }),
}))

import { listNetworkedSpaces, listNetworkedSpacesPage, normalizeSpaceSort } from './discovery'

const VIEWER = 'viewer-0000-4000-a000-0000000viewr'

beforeEach(() => {
  followed = new Set()
  store.counts = {}
  store.followers = {}
  store.upcoming = {}
  store.spaces = [
    // s1 stores an explicit 'studio' category; s2 stores 'maker'; s3 has NO category (reads as 'business').
    { id: 's1', slug: 'river-yoga', name: 'River Yoga', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2026-01-10T00:00:00Z', preferences: { profileData: { category: 'studio' } } },
    { id: 's2', slug: 'sound-co', name: 'Sound Co', type: 'business', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', created_at: '2026-03-01T00:00:00Z', preferences: { profileData: { category: 'maker' } } },
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

describe('the category field + filter', () => {
  it('resolves each row category, defaulting a missing one to business', async () => {
    const spaces = await listNetworkedSpaces({})
    const byId = Object.fromEntries(spaces.map((s) => [s.id, s.category]))
    expect(byId).toEqual({ s1: 'studio', s2: 'maker', s3: 'business' }) // s3 has no stored category
  })

  it('filters to one specific category', async () => {
    const spaces = await listNetworkedSpaces({ category: 'maker' })
    expect(spaces.map((s) => s.id)).toEqual(['s2'])
  })

  it('the business filter also matches Spaces with no stored category', async () => {
    const spaces = await listNetworkedSpaces({ category: 'business' })
    expect(spaces.map((s) => s.id)).toEqual(['s3']) // only the category-less row reads as business
  })

  it("'all' / unknown / absent applies no category filter", async () => {
    const all = await listNetworkedSpaces({ category: 'all' })
    const bogus = await listNetworkedSpaces({ category: 'nope' })
    const absent = await listNetworkedSpaces({})
    const ids = ['s3', 's1', 's2'] // Forest Org, River Yoga, Sound Co (name order)
    expect(all.map((s) => s.id)).toEqual(ids)
    expect(bogus.map((s) => s.id)).toEqual(ids)
    expect(absent.map((s) => s.id)).toEqual(ids)
  })
})

describe('the resolved card action', () => {
  it('defaults to the per-type CTA off the space base path when no header CTA is set', async () => {
    const spaces = await listNetworkedSpaces({})
    const s2 = spaces.find((s) => s.id === 's2')! // type 'business'
    expect(s2.action).toEqual({ label: 'Become a member', href: '/spaces/sound-co/book' })
  })

  it('resolves an operator custom header CTA override to its label + href', async () => {
    store.spaces[1].preferences = {
      profileData: { category: 'maker' },
      headerCta: { kind: 'custom', url: 'https://book.example.com', label: 'Reserve a spot' },
    }
    const spaces = await listNetworkedSpaces({})
    const s2 = spaces.find((s) => s.id === 's2')!
    expect(s2.action).toEqual({ label: 'Reserve a spot', href: 'https://book.example.com' })
  })
})

describe('the extra per-space stats', () => {
  it('batches follower + upcoming-event counts, null when absent', async () => {
    store.followers = { s1: 4, s3: 9 }
    store.upcoming = { s1: 2 }
    const spaces = await listNetworkedSpaces({})
    const byId = Object.fromEntries(spaces.map((s) => [s.id, { f: s.followerCount, e: s.upcomingEventCount }]))
    expect(byId.s1).toEqual({ f: 4, e: 2 })
    expect(byId.s3).toEqual({ f: 9, e: null }) // no upcoming events -> null
    expect(byId.s2).toEqual({ f: null, e: null }) // neither -> null
  })
})

describe('listNetworkedSpacesPage (pagination)', () => {
  it('returns the total and a limit/offset window over the sorted set', async () => {
    const page1 = await listNetworkedSpacesPage({}, { limit: 2, offset: 0 })
    expect(page1.total).toBe(3)
    expect(page1.spaces.map((s) => s.id)).toEqual(['s3', 's1']) // name order, first 2

    const page2 = await listNetworkedSpacesPage({}, { limit: 2, offset: 2 })
    expect(page2.total).toBe(3)
    expect(page2.spaces.map((s) => s.id)).toEqual(['s2']) // the remainder
  })

  it('returns the whole set + total when no window is given', async () => {
    const page = await listNetworkedSpacesPage({})
    expect(page.total).toBe(3)
    expect(page.spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
  })

  it('carries the filters through to the page (category narrows the total)', async () => {
    const page = await listNetworkedSpacesPage({ category: 'studio' }, { limit: 12, offset: 0 })
    expect(page.total).toBe(1)
    expect(page.spaces.map((s) => s.id)).toEqual(['s1'])
  })
})
