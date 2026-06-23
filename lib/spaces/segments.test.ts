import { describe, it, expect, beforeEach, vi } from 'vitest'

// SAVED AUDIENCE SEGMENTS (ADR-380). What is locked here, all network-free (the supabase admin client +
// auth + store + capability seam are mocked):
//   1. PURE validation: a blank name is rejected; the definition is normalized (a nested segmentId is
//      DROPPED, only known facets kept).
//   2. PERMISSION GATING: create / update / delete require canEditProfile (anonymous + non-editor are
//      rejected, nothing is written).
//   3. CROSS-SPACE ISOLATION: list filters space_id (Space A never sees Space B's segments); a single
//      segment read is pinned to space_id, so a cross-space id resolves to "not found" and cannot be
//      updated / deleted (a no-op, no leak).

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-0000000edit'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () => (currentProfileId ? { id: currentProfileId, webRole: 'none' } : null),
}))

let resolvedSpace: { id: string; slug: string } | null = { id: 'space-A', slug: 'river-studio' }
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({
    isOwner: canEdit,
    isAdmin: canEdit,
    role: canEdit ? 'admin' : null,
    canEditProfile: canEdit,
    canManageMembers: canEdit,
    canInvite: canEdit,
  }),
}))

// ── A chainable admin-client mock backed by an in-memory space_segments store ────────────────────
type SegmentRow = {
  id: string
  name: string
  definition: unknown
  created_at: string | null
  space_id: string | null
}

const db = {
  segments: [] as SegmentRow[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: [] as string[],
}

function segmentsBuilder() {
  const filters: { id?: string; space_id?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  let pendingDelete = false
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'id') filters.id = val
      if (col === 'space_id') filters.space_id = val
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
    delete() {
      pendingDelete = true
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        const row = {
          id: `seg${db.segments.length}`,
          name: '',
          definition: {},
          created_at: '2026-06-20T00:00:00.000Z',
          space_id: null,
          ...(pendingInsert as object),
        } as SegmentRow
        db.segments.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      if (pendingUpdate) {
        const row = db.segments.find(
          (s) => s.id === filters.id && (!filters.space_id || s.space_id === filters.space_id),
        )
        if (row) {
          Object.assign(row, pendingUpdate)
          db.updates.push(pendingUpdate)
        }
        return { data: row ?? null, error: null }
      }
      if (pendingDelete) {
        const idx = db.segments.findIndex(
          (s) => s.id === filters.id && (!filters.space_id || s.space_id === filters.space_id),
        )
        if (idx >= 0) {
          db.deletes.push(db.segments[idx]!.id)
          db.segments.splice(idx, 1)
        }
        return { data: null, error: null }
      }
      // a single read, pinned to (id, space_id)
      const row =
        db.segments.find(
          (s) => s.id === filters.id && (!filters.space_id || s.space_id === filters.space_id),
        ) ?? null
      return { data: row, error: null }
    },
    then(resolve: (r: { data: SegmentRow[] | null; error: null }) => unknown) {
      const data = db.segments.filter((s) => s.space_id === filters.space_id)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_segments') return segmentsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeSegmentName,
  normalizeSegmentDefinition,
  validateSegment,
  listSpaceSegments,
  createSpaceSegment,
  updateSpaceSegment,
  deleteSpaceSegment,
} from './segments'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000edit'
  resolvedSpace = { id: 'space-A', slug: 'river-studio' }
  canEdit = true
  db.segments = []
  db.inserts = []
  db.updates = []
  db.deletes = []
})

function seedSegment(over: Partial<SegmentRow> = {}): SegmentRow {
  const row: SegmentRow = {
    id: `seg${db.segments.length}`,
    name: 'VIPs',
    definition: { tag: 'vip' },
    created_at: '2026-06-20T00:00:00.000Z',
    space_id: 'space-A',
    ...over,
  }
  db.segments.push(row)
  return row
}

describe('pure validation', () => {
  it('normalizeSegmentName trims + caps; blank -> empty', () => {
    expect(normalizeSegmentName('  VIPs ')).toBe('VIPs')
    expect(normalizeSegmentName('   ')).toBe('')
    expect(normalizeSegmentName(undefined)).toBe('')
    expect(normalizeSegmentName('x'.repeat(200))).toHaveLength(80)
  })

  it('normalizeSegmentDefinition keeps known facets and DROPS a nested segmentId', () => {
    expect(normalizeSegmentDefinition({ tag: ' vip ', consent: 'subscribed' })).toEqual({
      tag: 'vip',
      consent: 'subscribed',
    })
    // A nested segmentId is never stored (a segment never references another segment).
    expect(normalizeSegmentDefinition({ tag: 'vip', segmentId: 'other' })).toEqual({ tag: 'vip' })
    // Junk / absent -> everyone ({}).
    expect(normalizeSegmentDefinition(null)).toEqual({})
    expect(normalizeSegmentDefinition({ tag: '   ' })).toEqual({})
  })

  it('validateSegment rejects a blank name and returns the normalized payload otherwise', () => {
    const bad = validateSegment('   ', { tag: 'vip' })
    expect('error' in bad).toBe(true)
    const good = validateSegment(' VIPs ', { tag: ' vip ', segmentId: 'x' })
    expect(good).toEqual({ name: 'VIPs', definition: { tag: 'vip' } })
  })
})

describe('createSpaceSegment — gating + validation', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await createSpaceSegment('space-A', 'VIPs', { tag: 'vip' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor and writes nothing', async () => {
    canEdit = false
    const r = await createSpaceSegment('space-A', 'VIPs', { tag: 'vip' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('requires a name', async () => {
    const r = await createSpaceSegment('space-A', '   ', { tag: 'vip' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an editor creates a segment stamped with the space_id + normalized definition', async () => {
    const r = await createSpaceSegment('space-A', ' VIPs ', { tag: ' vip ', segmentId: 'x' })
    expect('error' in r).toBe(false)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]!.space_id).toBe('space-A')
    expect(db.inserts[0]!.name).toBe('VIPs')
    expect(db.inserts[0]!.definition).toEqual({ tag: 'vip' })
  })
})

describe('listSpaceSegments — isolation', () => {
  it("returns only THIS Space's segments", async () => {
    seedSegment({ name: 'A-seg', space_id: 'space-A' })
    seedSegment({ name: 'B-seg', space_id: 'space-B' })
    const list = await listSpaceSegments('space-A')
    expect(list.map((s) => s.name)).toEqual(['A-seg'])
  })

  it('returns [] for a blank spaceId', async () => {
    expect(await listSpaceSegments('')).toEqual([])
  })

  it('maps the stored definition through the normalizer', async () => {
    seedSegment({ name: 'A-seg', definition: { tag: 'vip', segmentId: 'nope' }, space_id: 'space-A' })
    const list = await listSpaceSegments('space-A')
    expect(list[0]!.definition).toEqual({ tag: 'vip' })
  })
})

describe('updateSpaceSegment — cross-space isolation', () => {
  it("cannot update another Space's segment (pinned read -> not found, a no-op)", async () => {
    const b = seedSegment({ name: 'B', space_id: 'space-B' })
    const r = await updateSpaceSegment('space-A', b.id, 'Hacked', { tag: 'x' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(b.name).toBe('B') // unchanged
    expect(db.updates).toHaveLength(0)
  })

  it('an editor renames a segment in their Space', async () => {
    const a = seedSegment({ name: 'Old', space_id: 'space-A' })
    const r = await updateSpaceSegment('space-A', a.id, 'New', { tag: 'vip' })
    expect('error' in r).toBe(false)
    expect(a.name).toBe('New')
  })
})

describe('deleteSpaceSegment — cross-space isolation', () => {
  it("cannot delete another Space's segment (pinned read -> not found, a no-op)", async () => {
    const b = seedSegment({ name: 'B', space_id: 'space-B' })
    const r = await deleteSpaceSegment('space-A', b.id)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(db.segments).toHaveLength(1) // not deleted
    expect(db.deletes).toHaveLength(0)
  })

  it('an editor deletes a segment in their Space', async () => {
    const a = seedSegment({ name: 'A', space_id: 'space-A' })
    const r = await deleteSpaceSegment('space-A', a.id)
    expect('error' in r).toBe(false)
    expect(db.segments).toHaveLength(0)
    expect(db.deletes).toEqual([a.id])
  })
})
