import { describe, it, expect, beforeEach, vi } from 'vitest'

// DONATIONS (ENTITY-SPACES-SYSTEM §2.6, donations v1; MASTER-PLAN ADMIN-01). What is locked here, all
// network-free (the supabase admin client + auth + store + capability seam are mocked):
//   1. PURE normalization is fail-closed: a label-less / malformed ask is dropped; the description is
//      cleaned; suggested amounts drop non-positive / malformed entries, de-duplicate, sort ascending,
//      and cap the count; only an explicit isActive=false turns the ask off.
//   2. PERMISSION GATING on the actions: setDonationAsk requires canEditProfile (anonymous + a
//      non-editor are rejected SERVER-SIDE, nothing is written); getOwnerDonationAsk requires
//      canEditProfile OR a janitor previewing as staff (otherwise null), and the staff preview is
//      read-only (it never confers a write).
//   3. SPACE SCOPING: every read / write filters space_id; the active-ask read hides an inactive ask.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-0000000edit'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  slug: 'river-aid',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
// Keep the PURE entitlement readers real (the action now calls spaceFunctionAccess for defense in depth,
// per-space-roles Phase 2); override only getSpaceCapabilities.
vi.mock('./entitlements', async (orig) => ({
  ...(await orig<typeof import('./entitlements')>()),
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin: canEdit,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: canEdit,
    canInvite: canEdit,
  }),
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type AskRow = {
  id: string
  space_id: string
  fund_label: string
  description: string | null
  suggested_amounts_cents: unknown
  is_active: boolean
}
const db = {
  asks: [] as AskRow[],
  inserts: [] as Record<string, unknown>[],
  deletes: [] as string[],
}

function asksBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    delete() {
      return {
        async eq(_col: string, val: string) {
          db.deletes.push(val)
          db.asks = db.asks.filter((r) => r.space_id !== val)
          return { error: null }
        },
      }
    },
    async insert(rows: Record<string, unknown>[]) {
      for (const r of rows) {
        db.inserts.push(r)
        db.asks.push({ id: `a${db.asks.length}`, ...(r as object) } as AskRow)
      }
      return { error: null }
    },
    async maybeSingle() {
      const row = db.asks.find((r) => r.space_id === filters.space_id) ?? null
      return { data: row, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_donation_asks') return asksBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeAsk,
  normalizeSuggestedAmounts,
  setDonationAsk,
  getDonationAsk,
  getOwnerDonationAsk,
  type DonationAsk,
} from './donations'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000edit'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-1', slug: 'river-aid', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  db.asks = []
  db.inserts = []
  db.deletes = []
})

function ask(over: Partial<DonationAsk> = {}): DonationAsk {
  return {
    fundLabel: 'General fund',
    description: 'Keeps the lights on.',
    suggestedAmountsCents: [2500, 5000, 10000],
    isActive: true,
    ...over,
  }
}

function seedAsk(over: Partial<AskRow> = {}) {
  db.asks.push({
    id: 'a0',
    space_id: 'space-1',
    fund_label: 'General fund',
    description: 'Keeps the lights on.',
    suggested_amounts_cents: [2500, 5000, 10000],
    is_active: true,
    ...over,
  })
}

describe('normalizeSuggestedAmounts (pure, fail-closed)', () => {
  it('drops non-positive / malformed entries, de-duplicates, sorts ascending', () => {
    expect(normalizeSuggestedAmounts([5000, 2500, 0, -1, 2500, 'x', null])).toEqual([2500, 5000])
  })
  it('returns [] for a non-array', () => {
    expect(normalizeSuggestedAmounts('nope')).toEqual([])
    expect(normalizeSuggestedAmounts(undefined)).toEqual([])
  })
  it('caps the count', () => {
    const many = Array.from({ length: 20 }, (_, i) => (i + 1) * 100)
    expect(normalizeSuggestedAmounts(many).length).toBe(8)
  })
})

describe('normalizeAsk (pure, fail-closed)', () => {
  it('accepts a valid ask and keeps a string id', () => {
    const a = normalizeAsk({
      id: 'abc',
      fundLabel: '  Roof fund ',
      description: '  fix the roof ',
      suggestedAmountsCents: [10000, 2500, 2500],
      isActive: false,
    })
    expect(a).toEqual({
      id: 'abc',
      fundLabel: 'Roof fund',
      description: 'fix the roof',
      suggestedAmountsCents: [2500, 10000],
      isActive: false,
    })
  })
  it('drops a label-less ask', () => {
    expect(normalizeAsk({ fundLabel: '   ', description: 'x' })).toBeNull()
    expect(normalizeAsk({ description: 'x' })).toBeNull()
  })
  it('defaults description to null and isActive to true', () => {
    const a = normalizeAsk({ fundLabel: 'Fund' })
    expect(a).toEqual({ fundLabel: 'Fund', description: null, suggestedAmountsCents: [], isActive: true })
  })
})

describe('setDonationAsk (gated server-side on canEditProfile)', () => {
  it('an editor saves the ask (replace-by-space)', async () => {
    const result = await setDonationAsk('space-1', ask())
    expect('data' in result).toBe(true)
    expect(db.deletes).toContain('space-1')
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]).toMatchObject({
      space_id: 'space-1',
      fund_label: 'General fund',
      is_active: true,
    })
  })

  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const result = await setDonationAsk('space-1', ask())
    expect('error' in result).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor (canEditProfile=false) and writes nothing', async () => {
    canEdit = false
    const result = await setDonationAsk('space-1', ask())
    expect('error' in result).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('null clears the ask (a valid no-donations state)', async () => {
    seedAsk()
    const result = await setDonationAsk('space-1', null)
    expect('data' in result).toBe(true)
    expect(db.deletes).toContain('space-1')
    expect(db.inserts).toHaveLength(0)
  })
})

describe('getDonationAsk (member-facing, active only)', () => {
  it('returns the active ask, space-scoped', async () => {
    seedAsk()
    const a = await getDonationAsk('space-1')
    expect(a?.fundLabel).toBe('General fund')
    expect(a?.suggestedAmountsCents).toEqual([2500, 5000, 10000])
  })
  it('hides an inactive ask', async () => {
    seedAsk({ is_active: false })
    expect(await getDonationAsk('space-1')).toBeNull()
  })
  it('returns null when no ask exists for the space', async () => {
    expect(await getDonationAsk('space-1')).toBeNull()
  })
})

describe('getOwnerDonationAsk (owner editor read, includes hidden)', () => {
  it('returns the ask for an editor, including an inactive one', async () => {
    seedAsk({ is_active: false })
    const a = await getOwnerDonationAsk('space-1')
    expect(a?.fundLabel).toBe('General fund')
    expect(a?.isActive).toBe(false)
  })
  it('returns null for a non-editor non-janitor', async () => {
    canEdit = false
    expect(await getOwnerDonationAsk('space-1')).toBeNull()
  })
  it('allows a janitor previewing as staff to read (read-only)', async () => {
    canEdit = false
    currentWebRole = 'janitor'
    seedAsk()
    const a = await getOwnerDonationAsk('space-1')
    expect(a?.fundLabel).toBe('General fund')
  })
})
