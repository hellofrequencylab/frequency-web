import { describe, it, expect, beforeEach, vi } from 'vitest'

// MEMBERSHIPS (ENTITY-SPACES-SYSTEM §2.5, memberships v1). What is locked here, all network-free
// (the supabase admin client + auth + store + capability seam are mocked):
//   1. PURE normalization is fail-closed: a nameless / malformed tier is dropped; benefits + price
//      are cleaned; sort is re-numbered to list order; only an explicit isActive=false turns off.
//   2. PERMISSION GATING on the actions: setMembershipTiers / listSpaceMemberships require
//      canEditProfile (anonymous + non-editor are rejected, nothing is written / [] is returned).
//   3. JOIN respects the one-active-membership rule: a member already active here is rejected (the
//      pre-check), and the unique-index race is translated into the same friendly message. The tier
//      must be a real, active tier of THIS Space.
//   4. CANCEL ownership: the member who joined may cancel; a non-member non-admin may not; a space
//      admin may cancel another member's.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'member-0000-4000-a000-0000000membr'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  slug: 'river-studio',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
let isAdmin = true
// Keep the PURE entitlement readers real (the action now calls spaceFunctionAccess for defense in depth,
// per-space-roles Phase 2); override only getSpaceCapabilities.
vi.mock('./entitlements', async (orig) => ({
  ...(await orig<typeof import('./entitlements')>()),
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: isAdmin,
    canInvite: canEdit,
  }),
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type TierRow = {
  id: string
  space_id: string
  name: string
  price_cents: number
  interval: string
  description: string | null
  benefits: unknown
  sort: number
  is_active: boolean
}
type MembershipRow = {
  id: string
  space_id: string
  member_profile_id: string
  tier_id: string
  status: string
  started_at: string
}
const db = {
  tiers: [] as TierRow[],
  memberships: [] as MembershipRow[],
  profiles: [] as { id: string; display_name: string | null }[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  // A switch to simulate the partial-unique-index rejection on a second active membership.
  failNextInsert: false,
}

function tiersBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    order() {
      return api
    },
    delete() {
      return {
        async eq(_col: string, val: string) {
          db.deletes.push(val)
          db.tiers = db.tiers.filter((r) => r.space_id !== val)
          return { error: null }
        },
      }
    },
    async insert(rows: Record<string, unknown>[]) {
      for (const r of rows) {
        db.inserts.push(r)
        db.tiers.push({ id: `t${db.tiers.length}`, ...(r as object) } as TierRow)
      }
      return { error: null }
    },
    then(resolve: (r: { data: TierRow[] | null; error: null }) => unknown) {
      let data = db.tiers.filter((r) => r.space_id === filters.space_id)
      data = [...data].sort((a, b) => a.sort - b.sort)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function membershipsBuilder() {
  const filters: { space_id?: string; status?: string; id?: string; member_profile_id?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'status') filters.status = val
      if (col === 'id') filters.id = val
      if (col === 'member_profile_id') filters.member_profile_id = val
      // an eq after update() is the terminal write
      if (pendingUpdate && col === 'id') {
        const row = db.memberships.find((m) => m.id === val)
        if (row) Object.assign(row, pendingUpdate)
        return Promise.resolve({ error: null })
      }
      return api
    },
    order() {
      return api
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows[0] ?? null
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        if (db.failNextInsert) {
          db.failNextInsert = false
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        const row = {
          id: `m${db.memberships.length}`,
          started_at: '2026-06-20T00:00:00.000Z',
          ...(pendingInsert as object),
        } as MembershipRow
        db.memberships.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      // a read: by id, or by (space_id, member_profile_id, status)
      let rows = db.memberships
      if (filters.id) rows = rows.filter((m) => m.id === filters.id)
      if (filters.space_id) rows = rows.filter((m) => m.space_id === filters.space_id)
      if (filters.member_profile_id)
        rows = rows.filter((m) => m.member_profile_id === filters.member_profile_id)
      if (filters.status) rows = rows.filter((m) => m.status === filters.status)
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (r: { data: MembershipRow[] | null; error: null }) => unknown) {
      let data = db.memberships.filter((m) => m.space_id === filters.space_id)
      if (filters.status) data = data.filter((m) => m.status === filters.status)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function profilesBuilder() {
  return {
    select() {
      return {
        async in(_col: string, ids: string[]) {
          return { data: db.profiles.filter((p) => ids.includes(p.id)) }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_membership_tiers') return tiersBuilder()
      if (table === 'space_memberships') return membershipsBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeTier,
  normalizeTierSet,
  normalizeBenefits,
  setMembershipTiers,
  listMembershipTiers,
  listAllMembershipTiers,
  getMyMembership,
  joinTier,
  cancelMembership,
  listSpaceMemberships,
  type MembershipTier,
} from './memberships'

beforeEach(() => {
  currentProfileId = 'member-0000-4000-a000-0000000membr'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-1', slug: 'river-studio', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  isAdmin = true
  db.tiers = []
  db.memberships = []
  db.profiles = []
  db.inserts = []
  db.deletes = []
  db.failNextInsert = false
})

function tier(over: Partial<MembershipTier> = {}): MembershipTier {
  return {
    name: 'Unlimited',
    priceCents: 2500,
    interval: 'month',
    description: null,
    benefits: ['Unlimited classes'],
    sort: 0,
    isActive: true,
    ...over,
  }
}

function seedActiveTier(id = 't0', over: Partial<TierRow> = {}) {
  db.tiers.push({
    id,
    space_id: 'space-1',
    name: 'Unlimited',
    price_cents: 2500,
    interval: 'month',
    description: null,
    benefits: ['Unlimited classes'],
    sort: 0,
    is_active: true,
    ...over,
  })
}

describe('normalizeBenefits (pure, fail-closed)', () => {
  it('trims, drops empties + non-strings, and caps each length', () => {
    expect(normalizeBenefits(['  a ', '', 'b', 42, null])).toEqual(['a', 'b'])
  })
  it('returns [] for a non-array', () => {
    expect(normalizeBenefits('nope')).toEqual([])
    expect(normalizeBenefits(undefined)).toEqual([])
  })
})

describe('normalizeTier (pure, fail-closed)', () => {
  it('accepts a valid tier and keeps a string id', () => {
    const t = normalizeTier({
      id: 'abc',
      name: '  Gold ',
      priceCents: 1999,
      interval: 'year',
      description: '  great ',
      benefits: ['x'],
      sort: 3,
      isActive: false,
    })
    expect(t).toEqual({
      id: 'abc',
      name: 'Gold',
      priceCents: 1999,
      interval: 'year',
      description: 'great',
      benefits: ['x'],
      sort: 3,
      isActive: false,
    })
  })

  it('drops a tier with no name', () => {
    expect(normalizeTier({ name: '   ', priceCents: 100 })).toBeNull()
    expect(normalizeTier({ priceCents: 100 })).toBeNull()
  })

  it('defaults a bad interval to month and a negative price to 0', () => {
    const t = normalizeTier({ name: 'Basic', interval: 'weekly', priceCents: -5 })
    expect(t?.interval).toBe('month')
    expect(t?.priceCents).toBe(0)
  })

  it('is active by default; only an explicit false turns it off', () => {
    expect(normalizeTier({ name: 'A' })?.isActive).toBe(true)
    expect(normalizeTier({ name: 'A', isActive: false })?.isActive).toBe(false)
    expect(normalizeTier({ name: 'A', isActive: 'no' })?.isActive).toBe(true)
  })
})

describe('normalizeTierSet (pure)', () => {
  it('drops invalid tiers and re-numbers sort to list order', () => {
    const set = normalizeTierSet([
      { name: 'First', sort: 9 },
      { name: '' }, // dropped
      { name: 'Second', sort: 0 },
    ])
    expect(set).toHaveLength(2)
    expect(set.map((t) => t.name)).toEqual(['First', 'Second'])
    expect(set.map((t) => t.sort)).toEqual([0, 1])
  })

  it('returns [] for a non-array', () => {
    expect(normalizeTierSet('nope')).toEqual([])
  })
})

describe('setMembershipTiers (action) — permission gating', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await setMembershipTiers('space-1', [tier()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
    expect(db.deletes).toHaveLength(0)
  })

  it('rejects a caller without canEditProfile and writes nothing', async () => {
    canEdit = false
    const r = await setMembershipTiers('space-1', [tier()])
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a missing Space', async () => {
    resolvedSpace = null
    const r = await setMembershipTiers('nope', [tier()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an authorized editor replaces the tiers (delete then insert), dropping invalid ones', async () => {
    const r = await setMembershipTiers('space-1', [
      tier({ name: 'Gold' }),
      tier({ name: '' }), // invalid: dropped
    ])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1') // cleared first
    expect(db.inserts).toHaveLength(1) // only the valid tier was inserted
    expect(db.inserts[0]!.name).toBe('Gold')
    expect(db.inserts[0]!.sort).toBe(0)
  })

  it('an empty list clears tiers (valid "no memberships")', async () => {
    seedActiveTier()
    const r = await setMembershipTiers('space-1', [])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1')
    expect(db.inserts).toHaveLength(0)
  })
})

describe('listMembershipTiers / listAllMembershipTiers (actions)', () => {
  it('listMembershipTiers returns only ACTIVE tiers, to any caller', async () => {
    seedActiveTier('t0')
    seedActiveTier('t1', { name: 'Retired', is_active: false })
    currentProfileId = null // public-readable via the server component
    const tiers = await listMembershipTiers('space-1')
    expect(tiers.map((t) => t.name)).toEqual(['Unlimited'])
  })

  it('listAllMembershipTiers includes inactive but is gated on canEditProfile', async () => {
    seedActiveTier('t0')
    seedActiveTier('t1', { name: 'Retired', is_active: false })
    expect((await listAllMembershipTiers('space-1')).map((t) => t.name)).toEqual([
      'Unlimited',
      'Retired',
    ])
    canEdit = false
    expect(await listAllMembershipTiers('space-1')).toEqual([])
  })
})

describe('joinTier (action)', () => {
  beforeEach(() => {
    seedActiveTier('t0')
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await joinTier('space-1', 't0')
    expect('error' in r).toBe(true)
    expect(db.memberships).toHaveLength(0)
  })

  it('rejects a tier that is not a real active tier of this Space', async () => {
    const r = await joinTier('space-1', 'does-not-exist')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/no longer available/i)
    expect(db.memberships).toHaveLength(0)
  })

  it('rejects joining an inactive tier', async () => {
    seedActiveTier('t1', { name: 'Retired', is_active: false })
    const r = await joinTier('space-1', 't1')
    expect('error' in r).toBe(true)
    expect(db.memberships).toHaveLength(0)
  })

  it('records an active membership for a valid tier (no charge)', async () => {
    const r = await joinTier('space-1', 't0')
    expect('error' in r).toBe(false)
    expect(db.memberships).toHaveLength(1)
    expect(db.memberships[0]!.status).toBe('active')
    expect(db.memberships[0]!.tier_id).toBe('t0')
    expect(db.memberships[0]!.member_profile_id).toBe(currentProfileId)
  })

  it('rejects a second join while already an active member (pre-check)', async () => {
    db.memberships.push({
      id: 'm0',
      space_id: 'space-1',
      member_profile_id: currentProfileId!,
      tier_id: 't0',
      status: 'active',
      started_at: '2026-06-19T00:00:00.000Z',
    })
    const r = await joinTier('space-1', 't0')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/already a member/i)
    expect(db.memberships).toHaveLength(1) // unchanged
  })

  it('translates the unique-index race (insert error) into the friendly message', async () => {
    db.failNextInsert = true // simulate the partial-unique-index rejection
    const r = await joinTier('space-1', 't0')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/already a member/i)
  })

  it('a cancelled prior membership does NOT block a re-join', async () => {
    db.memberships.push({
      id: 'm0',
      space_id: 'space-1',
      member_profile_id: currentProfileId!,
      tier_id: 't0',
      status: 'cancelled',
      started_at: '2026-06-10T00:00:00.000Z',
    })
    const r = await joinTier('space-1', 't0')
    expect('error' in r).toBe(false)
    expect(db.memberships.filter((m) => m.status === 'active')).toHaveLength(1)
  })
})

describe('getMyMembership (action)', () => {
  it('returns null when the viewer has no active membership', async () => {
    expect(await getMyMembership('space-1')).toBeNull()
  })

  it('returns the active membership with its tier name', async () => {
    seedActiveTier('t0', { name: 'Gold' })
    db.memberships.push({
      id: 'm0',
      space_id: 'space-1',
      member_profile_id: currentProfileId!,
      tier_id: 't0',
      status: 'active',
      started_at: '2026-06-18T00:00:00.000Z',
    })
    const mine = await getMyMembership('space-1')
    expect(mine?.tierName).toBe('Gold')
    expect(mine?.id).toBe('m0')
  })
})

describe('cancelMembership (action) — permission', () => {
  beforeEach(() => {
    db.memberships.push({
      id: 'm1',
      space_id: 'space-1',
      member_profile_id: 'member-0000-4000-a000-0000000membr',
      tier_id: 't0',
      status: 'active',
      started_at: '2026-06-15T00:00:00.000Z',
    })
  })

  it('the member may cancel their own membership', async () => {
    const r = await cancelMembership('m1')
    expect('error' in r).toBe(false)
    expect(db.memberships[0]!.status).toBe('cancelled')
  })

  it('a non-member who is NOT an admin may not cancel', async () => {
    currentProfileId = 'other-0000-4000-a000-00000000othr'
    canEdit = false
    isAdmin = false
    const r = await cancelMembership('m1')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.memberships[0]!.status).toBe('active') // unchanged
  })

  it('a space admin may cancel another member membership', async () => {
    currentProfileId = 'admin-0000-4000-a000-00000000admn'
    isAdmin = true
    const r = await cancelMembership('m1')
    expect('error' in r).toBe(false)
    expect(db.memberships[0]!.status).toBe('cancelled')
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await cancelMembership('m1')
    expect('error' in r).toBe(true)
  })
})

describe('listSpaceMemberships (action) — owner only', () => {
  beforeEach(() => {
    seedActiveTier('t0', { name: 'Gold' })
    db.profiles.push({ id: 'm1', display_name: 'Ada Lovelace' })
    db.memberships.push({
      id: 'mem1',
      space_id: 'space-1',
      member_profile_id: 'm1',
      tier_id: 't0',
      status: 'active',
      started_at: '2026-06-12T00:00:00.000Z',
    })
  })

  it('returns [] for a non-editor (gated on canEditProfile)', async () => {
    canEdit = false
    expect(await listSpaceMemberships('space-1')).toEqual([])
  })

  it('a platform janitor (staff preview) sees the real members even as a non-editor', async () => {
    canEdit = false
    currentWebRole = 'janitor'
    const list = await listSpaceMemberships('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
  })

  it('returns the owner members with member + tier names', async () => {
    const list = await listSpaceMemberships('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
    expect(list[0]!.tierName).toBe('Gold')
  })

  it('falls back to generic names when the profile / tier is missing', async () => {
    db.profiles = []
    db.tiers = []
    const list = await listSpaceMemberships('space-1')
    expect(list[0]!.memberName).toBe('A member')
    expect(list[0]!.tierName).toBe('Member')
  })

  it('excludes cancelled memberships', async () => {
    db.memberships.push({
      id: 'mem2',
      space_id: 'space-1',
      member_profile_id: 'm2',
      tier_id: 't0',
      status: 'cancelled',
      started_at: '2026-06-01T00:00:00.000Z',
    })
    const list = await listSpaceMemberships('space-1')
    expect(list.map((m) => m.id)).toEqual(['mem1'])
  })
})
