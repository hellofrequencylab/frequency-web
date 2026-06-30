import { describe, it, expect, vi, beforeEach } from 'vitest'

// The MANAGED-Spaces reader behind the header mega-menu launcher (WEBSITE-CHANGES-PLAN §6 E.3).
// What is locked here (the supabase admin client + auth seams are mocked, so it's network-free):
//   1. TENANCY + AUTHORITY: a Space is returned only when the viewer OWNS it or holds an ACTIVE
//      editor+ membership. A plain `viewer` membership, an `invited`/`suspended` membership, and
//      a Space the viewer has no relation to are all excluded — no cross-tenant leak.
//   2. SHAPE: owner-ness wins on de-dup, brand_name leads the label, the settings deep link is
//      /spaces/<slug>/settings, dead (suspended/archived) Spaces are dropped, ordered by name.
//   3. FAIL-SAFE: a signed-out viewer (null profile) and any read error both yield [].

// ── Mock the caller identity (toggled per test) ────────────────────────────────────────────────────
let currentProfileId: string | null = 'alice'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

// ── An in-memory backing store for the two tables the reader reads ──────────────────────────────────
type SpaceRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  brand_name: string | null
  owner_profile_id: string | null
}
type MemberRow = { space_id: string; profile_id: string; role: string; status: string }

const store: { spaces: SpaceRow[]; members: MemberRow[]; failSpaces: boolean } = {
  spaces: [],
  members: [],
  failSpaces: false,
}

// A chainable builder over one table. `select().eq()/.in()/.order()` resolves (thenable) to the
// filtered rows; the spaces table can be forced to error to assert the fail-safe path.
function builder(table: 'spaces' | 'space_members') {
  const eqFilters: Record<string, string> = {}
  let inFilter: { col: string; vals: string[] } | null = null

  function rows() {
    if (table === 'space_members') {
      return store.members.filter((r) =>
        Object.entries(eqFilters).every(([c, v]) => (r as unknown as Record<string, string>)[c] === v),
      )
    }
    if (store.failSpaces) throw new Error('boom')
    return store.spaces.filter((r) => {
      const eqOk = Object.entries(eqFilters).every(
        ([c, v]) => (r as unknown as Record<string, string | null>)[c] === v,
      )
      const inOk = !inFilter || inFilter.vals.includes((r as unknown as Record<string, string>)[inFilter.col])
      return eqOk && inOk
    })
  }

  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqFilters[col] = val
      return api
    },
    in(col: string, vals: string[]) {
      inFilter = { col, vals }
      return api
    },
    order() {
      return api
    },
    then(resolve: (r: { data: unknown[] | null; error: unknown }) => unknown) {
      try {
        return Promise.resolve(resolve({ data: rows(), error: null }))
      } catch (error) {
        return Promise.resolve(resolve({ data: null, error }))
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t as 'spaces' | 'space_members') }),
}))

import { listManagedSpaces } from './managed'

function space(over: Partial<SpaceRow>): SpaceRow {
  return {
    id: over.id ?? 's',
    slug: over.slug ?? 's',
    name: over.name ?? 'Space',
    type: over.type ?? 'practitioner',
    status: over.status ?? 'active',
    brand_name: over.brand_name ?? null,
    owner_profile_id: over.owner_profile_id ?? null,
  }
}

beforeEach(() => {
  currentProfileId = 'alice'
  store.spaces = []
  store.members = []
  store.failSpaces = false
  // listManagedSpaces is React.cache-wrapped; vitest gives each test a fresh module-less cache via
  // the per-test reset, but the cache memo can persist within a run — vary inputs by reseeding the
  // mocked store, and rely on the distinct profile/space ids per test to avoid collisions.
})

describe('listManagedSpaces (the launcher reader, tenancy + fail-safe)', () => {
  it('returns the Spaces the viewer OWNS, brand name leading, with the manage deep link', async () => {
    currentProfileId = 'owner-1'
    store.spaces = [
      // A practitioner is a CONSOLE type (ADR-441 EM1-3), so its manage entry is the unified /manage.
      space({ id: 'a', slug: 'river-yoga', name: 'River Yoga', brand_name: 'River', owner_profile_id: 'owner-1' }),
    ]
    const out = await listManagedSpaces()
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'a',
      name: 'River', // brand_name wins over name
      isOwner: true,
      settingsHref: '/spaces/river-yoga/manage',
    })
  })

  it('routes a CONSOLE type (event_space) to the unified /manage console (ADR-441 EM2-3)', async () => {
    currentProfileId = 'owner-2'
    store.spaces = [
      space({ id: 'c', slug: 'the-loft', name: 'The Loft', type: 'event_space', owner_profile_id: 'owner-2' }),
    ]
    const out = await listManagedSpaces()
    expect(out).toHaveLength(1)
    expect(out[0].settingsHref).toBe('/spaces/the-loft/manage')
  })

  it('routes coaching to the unified /manage console (Space Modes M3, ADR-461/464)', async () => {
    // Coaching joined the console with Space Modes M3; it no longer falls back to the legacy /settings hub.
    currentProfileId = 'owner-3'
    store.spaces = [
      space({ id: 'd', slug: 'the-academy', name: 'The Academy', type: 'coaching', owner_profile_id: 'owner-3' }),
    ]
    const out = await listManagedSpaces()
    expect(out).toHaveLength(1)
    expect(out[0].settingsHref).toBe('/spaces/the-academy/manage')
  })

  it('includes Spaces reached via an ACTIVE editor+ membership, marked as not owned', async () => {
    currentProfileId = 'ed-1'
    store.spaces = [space({ id: 'b', slug: 'studio', name: 'Studio', owner_profile_id: 'someone-else' })]
    store.members = [{ space_id: 'b', profile_id: 'ed-1', role: 'editor', status: 'active' }]
    const out = await listManagedSpaces()
    expect(out.map((s) => s.id)).toEqual(['b'])
    expect(out[0].isOwner).toBe(false)
  })

  it('EXCLUDES a plain viewer membership and invited/suspended memberships (no authority)', async () => {
    currentProfileId = 'v-1'
    store.spaces = [
      space({ id: 'c', slug: 'c', owner_profile_id: 'x' }),
      space({ id: 'd', slug: 'd', owner_profile_id: 'x' }),
      space({ id: 'e', slug: 'e', owner_profile_id: 'x' }),
    ]
    store.members = [
      { space_id: 'c', profile_id: 'v-1', role: 'viewer', status: 'active' }, // viewer can't manage
      { space_id: 'd', profile_id: 'v-1', role: 'admin', status: 'invited' }, // not yet active
      { space_id: 'e', profile_id: 'v-1', role: 'admin', status: 'suspended' }, // no standing
    ]
    const out = await listManagedSpaces()
    expect(out).toEqual([])
  })

  it('de-dupes an owned-and-member Space with owner-ness winning, and drops dead Spaces', async () => {
    currentProfileId = 'o-2'
    store.spaces = [
      space({ id: 'f', slug: 'mine', name: 'Mine', owner_profile_id: 'o-2' }),
      space({ id: 'g', slug: 'dead', name: 'Dead', status: 'archived', owner_profile_id: 'o-2' }),
    ]
    store.members = [{ space_id: 'f', profile_id: 'o-2', role: 'moderator', status: 'active' }]
    const out = await listManagedSpaces()
    expect(out.map((s) => s.id)).toEqual(['f']) // 'g' archived → dropped
    expect(out[0].isOwner).toBe(true) // owner row wins the de-dup
  })

  it('fails safe to [] for a signed-out viewer', async () => {
    currentProfileId = null
    store.spaces = [space({ id: 'h', slug: 'h', owner_profile_id: 'anyone' })]
    expect(await listManagedSpaces()).toEqual([])
  })

  it('fails safe to [] when the spaces read errors', async () => {
    currentProfileId = 'err-1'
    store.failSpaces = true
    store.spaces = [space({ id: 'i', slug: 'i', owner_profile_id: 'err-1' })]
    expect(await listManagedSpaces()).toEqual([])
  })
})
