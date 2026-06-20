import { describe, it, expect, beforeEach, vi } from 'vitest'

// EVENT SPACE TICKETING (MASTER-PLAN ADMIN-03, ticketing v1). What is locked here, all network-free
// (the supabase admin client + auth + store + capability seam are mocked):
//   1. PURE normalization is fail-closed: a nameless / malformed tier is dropped; capacity is cleaned
//      (blank/garbage -> unlimited); kind defaults to 'free'; sort is re-numbered to list order; only
//      an explicit isActive=false turns off.
//   2. PERMISSION GATING on the actions: setTicketTiers / listSpaceRsvps require canEditProfile
//      (anonymous + non-editor are rejected, nothing is written / [] is returned).
//   3. RSVP respects: the tier must be a real, ACTIVE, 'rsvp' tier of THIS Space; a free tier is not
//      reservable; the one-going-RSVP rule (already going -> rejected, and the unique-index race is
//      translated into the same friendly message); and CAPACITY (a full tier is rejected).
//   4. CANCEL ownership: the member who reserved may cancel; a non-member non-admin may not; a space
//      admin may cancel another member's.
//   5. NO MONEY: there is no price anywhere in the shape (asserted structurally by the tier helper).

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
  slug: 'river-hall',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
let isAdmin = true
vi.mock('./entitlements', () => ({
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
  kind: string
  capacity: number | null
  description: string | null
  sort: number
  is_active: boolean
}
type RsvpRow = {
  id: string
  space_id: string
  tier_id: string
  member_profile_id: string
  status: string
  reserved_at: string
}
const db = {
  tiers: [] as TierRow[],
  rsvps: [] as RsvpRow[],
  profiles: [] as { id: string; display_name: string | null }[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
  // A switch to simulate the partial-unique-index rejection on a second going RSVP.
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

function rsvpsBuilder() {
  const filters: {
    space_id?: string
    status?: string
    id?: string
    tier_id?: string
    member_profile_id?: string
  } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  let countHead = false
  const api = {
    select(_cols: string, opts?: { count: 'exact'; head: true }) {
      if (opts?.head) countHead = true
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      if (col === 'status') filters.status = val
      if (col === 'id') filters.id = val
      if (col === 'tier_id') filters.tier_id = val
      if (col === 'member_profile_id') filters.member_profile_id = val
      // an eq after update() is the terminal write
      if (pendingUpdate && col === 'id') {
        const row = db.rsvps.find((m) => m.id === val)
        if (row) Object.assign(row, pendingUpdate)
        return Promise.resolve({ error: null })
      }
      // a head/count terminal: resolve the count of matching rows on the LAST eq (status)
      if (countHead && col === 'status') {
        const n = db.rsvps.filter(
          (m) => m.tier_id === filters.tier_id && m.status === val,
        ).length
        return Promise.resolve({ count: n })
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
          id: `r${db.rsvps.length}`,
          reserved_at: '2026-06-20T00:00:00.000Z',
          ...(pendingInsert as object),
        } as RsvpRow
        db.rsvps.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      // a read: by id, or by (tier_id, member_profile_id, status)
      let rows = db.rsvps
      if (filters.id) rows = rows.filter((m) => m.id === filters.id)
      if (filters.space_id) rows = rows.filter((m) => m.space_id === filters.space_id)
      if (filters.tier_id) rows = rows.filter((m) => m.tier_id === filters.tier_id)
      if (filters.member_profile_id)
        rows = rows.filter((m) => m.member_profile_id === filters.member_profile_id)
      if (filters.status) rows = rows.filter((m) => m.status === filters.status)
      return { data: rows[0] ?? null, error: null }
    },
    then(resolve: (r: { data: RsvpRow[] | null; error: null }) => unknown) {
      let data = db.rsvps.filter((m) => m.space_id === filters.space_id)
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
      if (table === 'space_ticket_tiers') return tiersBuilder()
      if (table === 'space_ticket_rsvps') return rsvpsBuilder()
      if (table === 'profiles') return profilesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeTicketTier,
  normalizeTicketTierSet,
  normalizeCapacity,
  setTicketTiers,
  listTicketTiers,
  listAllTicketTiers,
  getMyRsvp,
  rsvpToTier,
  cancelRsvp,
  listSpaceRsvps,
  type TicketTier,
} from './tickets'

beforeEach(() => {
  currentProfileId = 'member-0000-4000-a000-0000000membr'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-1', slug: 'river-hall', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  isAdmin = true
  db.tiers = []
  db.rsvps = []
  db.profiles = []
  db.inserts = []
  db.deletes = []
  db.failNextInsert = false
})

function tier(over: Partial<TicketTier> = {}): TicketTier {
  return {
    name: 'General admission',
    kind: 'rsvp',
    capacity: null,
    description: null,
    sort: 0,
    isActive: true,
    ...over,
  }
}

function seedRsvpTier(id = 't0', over: Partial<TierRow> = {}) {
  db.tiers.push({
    id,
    space_id: 'space-1',
    name: 'General admission',
    kind: 'rsvp',
    capacity: null,
    description: null,
    sort: 0,
    is_active: true,
    ...over,
  })
}

describe('normalizeCapacity (pure, fail-closed)', () => {
  it('blank / null / garbage reads as null (unlimited)', () => {
    expect(normalizeCapacity('')).toBeNull()
    expect(normalizeCapacity(null)).toBeNull()
    expect(normalizeCapacity(undefined)).toBeNull()
    expect(normalizeCapacity('abc')).toBeNull()
    expect(normalizeCapacity(-3)).toBeNull()
  })
  it('clamps a valid number to a non-negative integer', () => {
    expect(normalizeCapacity('50')).toBe(50)
    expect(normalizeCapacity(50.7)).toBe(51)
    expect(normalizeCapacity(0)).toBe(0)
  })
})

describe('normalizeTicketTier (pure, fail-closed; NO money)', () => {
  it('accepts a valid tier, keeps a string id, and never carries a price', () => {
    const t = normalizeTicketTier({
      id: 'abc',
      name: '  VIP ',
      kind: 'rsvp',
      capacity: '20',
      description: '  front row ',
      sort: 3,
      isActive: false,
    })
    expect(t).toEqual({
      id: 'abc',
      name: 'VIP',
      kind: 'rsvp',
      capacity: 20,
      description: 'front row',
      sort: 3,
      isActive: false,
    })
    // NO money: the shape has no price-ish key.
    expect(Object.keys(t ?? {})).not.toContain('priceCents')
    expect(Object.keys(t ?? {})).not.toContain('price')
  })

  it('drops a tier with no name', () => {
    expect(normalizeTicketTier({ name: '   ', capacity: 10 })).toBeNull()
    expect(normalizeTicketTier({ capacity: 10 })).toBeNull()
  })

  it('defaults a bad kind to free and a garbage capacity to null', () => {
    const t = normalizeTicketTier({ name: 'Basic', kind: 'paid', capacity: 'lots' })
    expect(t?.kind).toBe('free')
    expect(t?.capacity).toBeNull()
  })

  it('is active by default; only an explicit false turns it off', () => {
    expect(normalizeTicketTier({ name: 'A' })?.isActive).toBe(true)
    expect(normalizeTicketTier({ name: 'A', isActive: false })?.isActive).toBe(false)
    expect(normalizeTicketTier({ name: 'A', isActive: 'no' })?.isActive).toBe(true)
  })
})

describe('normalizeTicketTierSet (pure)', () => {
  it('drops invalid tiers and re-numbers sort to list order', () => {
    const set = normalizeTicketTierSet([
      { name: 'First', sort: 9 },
      { name: '' }, // dropped
      { name: 'Second', sort: 0 },
    ])
    expect(set).toHaveLength(2)
    expect(set.map((t) => t.name)).toEqual(['First', 'Second'])
    expect(set.map((t) => t.sort)).toEqual([0, 1])
  })

  it('returns [] for a non-array', () => {
    expect(normalizeTicketTierSet('nope')).toEqual([])
  })
})

describe('setTicketTiers (action) — permission gating', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await setTicketTiers('space-1', [tier()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
    expect(db.deletes).toHaveLength(0)
  })

  it('rejects a caller without canEditProfile and writes nothing', async () => {
    canEdit = false
    const r = await setTicketTiers('space-1', [tier()])
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a missing Space', async () => {
    resolvedSpace = null
    const r = await setTicketTiers('nope', [tier()])
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an authorized editor replaces the tiers (delete then insert), dropping invalid ones', async () => {
    const r = await setTicketTiers('space-1', [
      tier({ name: 'VIP' }),
      tier({ name: '' }), // invalid: dropped
    ])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1') // cleared first
    expect(db.inserts).toHaveLength(1) // only the valid tier was inserted
    expect(db.inserts[0]!.name).toBe('VIP')
    expect(db.inserts[0]!.sort).toBe(0)
    // NO money: the persisted row carries no price column.
    expect(db.inserts[0]).not.toHaveProperty('price_cents')
  })

  it('an empty list clears tiers (valid "no tickets")', async () => {
    seedRsvpTier()
    const r = await setTicketTiers('space-1', [])
    expect('error' in r).toBe(false)
    expect(db.deletes).toContain('space-1')
    expect(db.inserts).toHaveLength(0)
  })
})

describe('listTicketTiers / listAllTicketTiers (actions)', () => {
  it('listTicketTiers returns only ACTIVE tiers, to any caller', async () => {
    seedRsvpTier('t0')
    seedRsvpTier('t1', { name: 'Retired', is_active: false })
    currentProfileId = null // public-readable via the server component
    const tiers = await listTicketTiers('space-1')
    expect(tiers.map((t) => t.name)).toEqual(['General admission'])
  })

  it('listAllTicketTiers includes inactive but is gated on canEditProfile', async () => {
    seedRsvpTier('t0')
    seedRsvpTier('t1', { name: 'Retired', is_active: false })
    expect((await listAllTicketTiers('space-1')).map((t) => t.name)).toEqual([
      'General admission',
      'Retired',
    ])
    canEdit = false
    expect(await listAllTicketTiers('space-1')).toEqual([])
  })

  it('a platform janitor (staff preview) reads all tiers even as a non-editor', async () => {
    seedRsvpTier('t0')
    canEdit = false
    currentWebRole = 'janitor'
    expect((await listAllTicketTiers('space-1')).map((t) => t.name)).toEqual(['General admission'])
  })
})

describe('rsvpToTier (action)', () => {
  beforeEach(() => {
    seedRsvpTier('t0')
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await rsvpToTier('space-1', 't0')
    expect('error' in r).toBe(true)
    expect(db.rsvps).toHaveLength(0)
  })

  it('rejects a tier that is not a real active tier of this Space', async () => {
    const r = await rsvpToTier('space-1', 'does-not-exist')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/no longer available/i)
    expect(db.rsvps).toHaveLength(0)
  })

  it('rejects RSVPing an inactive tier', async () => {
    seedRsvpTier('t1', { name: 'Retired', is_active: false })
    const r = await rsvpToTier('space-1', 't1')
    expect('error' in r).toBe(true)
    expect(db.rsvps).toHaveLength(0)
  })

  it('rejects RSVPing a free tier (nothing to reserve)', async () => {
    seedRsvpTier('tfree', { name: 'Open door', kind: 'free' })
    const r = await rsvpToTier('space-1', 'tfree')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/free entry/i)
    expect(db.rsvps).toHaveLength(0)
  })

  it('records a going RSVP for a valid rsvp tier (no charge)', async () => {
    const r = await rsvpToTier('space-1', 't0')
    expect('error' in r).toBe(false)
    expect(db.rsvps).toHaveLength(1)
    expect(db.rsvps[0]!.status).toBe('going')
    expect(db.rsvps[0]!.tier_id).toBe('t0')
    expect(db.rsvps[0]!.member_profile_id).toBe(currentProfileId)
  })

  it('rejects a second RSVP while already going (pre-check)', async () => {
    db.rsvps.push({
      id: 'r0',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: currentProfileId!,
      status: 'going',
      reserved_at: '2026-06-19T00:00:00.000Z',
    })
    const r = await rsvpToTier('space-1', 't0')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/already have a spot/i)
    expect(db.rsvps).toHaveLength(1) // unchanged
  })

  it('translates the unique-index race (insert error) into the friendly message', async () => {
    db.failNextInsert = true // simulate the partial-unique-index rejection
    const r = await rsvpToTier('space-1', 't0')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/already have a spot/i)
  })

  it('rejects an RSVP when the tier is at capacity', async () => {
    seedRsvpTier('tcap', { name: 'Limited', kind: 'rsvp', capacity: 1 })
    db.rsvps.push({
      id: 'r0',
      space_id: 'space-1',
      tier_id: 'tcap',
      member_profile_id: 'other-0000-4000-a000-00000000othr',
      status: 'going',
      reserved_at: '2026-06-18T00:00:00.000Z',
    })
    const r = await rsvpToTier('space-1', 'tcap')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/full/i)
    // No new RSVP recorded.
    expect(db.rsvps.filter((x) => x.tier_id === 'tcap')).toHaveLength(1)
  })

  it('a cancelled prior RSVP does NOT block a re-RSVP', async () => {
    db.rsvps.push({
      id: 'r0',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: currentProfileId!,
      status: 'cancelled',
      reserved_at: '2026-06-10T00:00:00.000Z',
    })
    const r = await rsvpToTier('space-1', 't0')
    expect('error' in r).toBe(false)
    expect(db.rsvps.filter((m) => m.status === 'going')).toHaveLength(1)
  })
})

describe('getMyRsvp (action)', () => {
  it('returns null when the viewer has no going RSVP', async () => {
    expect(await getMyRsvp('space-1')).toBeNull()
  })

  it('returns the going RSVP with its tier name', async () => {
    seedRsvpTier('t0', { name: 'VIP' })
    db.rsvps.push({
      id: 'r0',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: currentProfileId!,
      status: 'going',
      reserved_at: '2026-06-18T00:00:00.000Z',
    })
    const mine = await getMyRsvp('space-1')
    expect(mine?.tierName).toBe('VIP')
    expect(mine?.id).toBe('r0')
  })
})

describe('cancelRsvp (action) — permission', () => {
  beforeEach(() => {
    db.rsvps.push({
      id: 'r1',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: 'member-0000-4000-a000-0000000membr',
      status: 'going',
      reserved_at: '2026-06-15T00:00:00.000Z',
    })
  })

  it('the member may cancel their own RSVP', async () => {
    const r = await cancelRsvp('r1')
    expect('error' in r).toBe(false)
    expect(db.rsvps[0]!.status).toBe('cancelled')
  })

  it('a non-member who is NOT an admin may not cancel', async () => {
    currentProfileId = 'other-0000-4000-a000-00000000othr'
    canEdit = false
    isAdmin = false
    const r = await cancelRsvp('r1')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.rsvps[0]!.status).toBe('going') // unchanged
  })

  it('a space admin may cancel another member RSVP', async () => {
    currentProfileId = 'admin-0000-4000-a000-00000000admn'
    isAdmin = true
    const r = await cancelRsvp('r1')
    expect('error' in r).toBe(false)
    expect(db.rsvps[0]!.status).toBe('cancelled')
  })

  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await cancelRsvp('r1')
    expect('error' in r).toBe(true)
  })
})

describe('listSpaceRsvps (action) — owner only', () => {
  beforeEach(() => {
    seedRsvpTier('t0', { name: 'VIP' })
    db.profiles.push({ id: 'm1', display_name: 'Ada Lovelace' })
    db.rsvps.push({
      id: 'rsvp1',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: 'm1',
      status: 'going',
      reserved_at: '2026-06-12T00:00:00.000Z',
    })
  })

  it('returns [] for a non-editor (gated on canEditProfile)', async () => {
    canEdit = false
    expect(await listSpaceRsvps('space-1')).toEqual([])
  })

  it('a platform janitor (staff preview) sees the real RSVPs even as a non-editor', async () => {
    canEdit = false
    currentWebRole = 'janitor'
    const list = await listSpaceRsvps('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
  })

  it('returns the owner RSVPs with member + tier names', async () => {
    const list = await listSpaceRsvps('space-1')
    expect(list).toHaveLength(1)
    expect(list[0]!.memberName).toBe('Ada Lovelace')
    expect(list[0]!.tierName).toBe('VIP')
  })

  it('falls back to generic names when the profile / tier is missing', async () => {
    db.profiles = []
    db.tiers = []
    const list = await listSpaceRsvps('space-1')
    expect(list[0]!.memberName).toBe('A member')
    expect(list[0]!.tierName).toBe('Ticket')
  })

  it('excludes cancelled RSVPs', async () => {
    db.rsvps.push({
      id: 'rsvp2',
      space_id: 'space-1',
      tier_id: 't0',
      member_profile_id: 'm2',
      status: 'cancelled',
      reserved_at: '2026-06-01T00:00:00.000Z',
    })
    const list = await listSpaceRsvps('space-1')
    expect(list.map((m) => m.id)).toEqual(['rsvp1'])
  })
})
