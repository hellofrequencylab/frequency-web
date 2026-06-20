import { describe, it, expect, beforeEach, vi } from 'vitest'

// SPACE-SCOPED CODES (ENTITY-SPACES-BUILD §C, Phase 2). All network-free (the supabase admin client +
// auth + store + capability seam are mocked). Locked here:
//   1. codeCapForPlan is pure + fail-small (unknown/unset plan -> the free cap).
//   2. PERMISSION GATING: createSpaceCode / setCodeSplash require canEditProfile (anonymous +
//      non-editor are rejected, nothing is written). listSpaceCodes / listSpaceScanRows return [] for
//      a non-editor (and the real rows for a janitor staff preview).
//   3. PER-PLAN CAP: a create past the Space's cap is rejected.
//   4. CROSS-SPACE ISOLATION: listSpaceCodes returns only THIS Space's codes; setCodeSplash on a code
//      whose own Space the caller cannot edit is rejected.
//   5. SPLASH: a headingless splash is rejected; null clears the stored splash.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-0000000editr'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

// The resolved Space per id (so cross-space tests can resolve A and B). plan rides on the row for the
// untyped `spaces.plan` read inside space-codes.ts.
const spacesById: Record<string, { id: string; slug: string; ownerProfileId?: string | null }> = {
  'space-a': { id: 'space-a', slug: 'a', ownerProfileId: 'owner-a' },
  'space-b': { id: 'space-b', slug: 'b', ownerProfileId: 'owner-b' },
}
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => spacesById[id] ?? null,
}))

// canEditProfile is true for the Space whose id matches `editableSpaceId` (default space-a). This
// models "the caller can edit Space A but not Space B".
let editableSpaceId: string | null = 'space-a'
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async (space: { id?: string } | null) => {
    const canEdit = !!space && space.id === editableSpaceId
    return {
      isOwner: canEdit,
      isAdmin: canEdit,
      role: canEdit ? 'admin' : null,
      canEditProfile: canEdit,
      canManageMembers: canEdit,
      canInvite: canEdit,
    }
  },
}))

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type CodeRow = {
  id: string
  space_id: string
  slug: string
  title: string
  destination_type: string
  target_url: string | null
  active: boolean
  scan_count: number | null
  splash: unknown
  created_at: string
  created_by?: string | null
}
type ScanRow = { qr_code_id: string; profile_id: string | null; scanned_at: string; medium: string }
type SpaceRow = { id: string; plan: string | null }

const db = {
  codes: [] as CodeRow[],
  scans: [] as ScanRow[],
  spaces: [] as SpaceRow[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: string; patch: Record<string, unknown> }[],
}

function codesBuilder() {
  const f: { space_id?: string; slug?: string; id?: string } = {}
  let pendingInsert: Record<string, unknown>[] | null = null
  let pendingUpdate: Record<string, unknown> | null = null
  const api = {
    select() {
      // a select that follows an insert returns the insert-result chain
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') f.space_id = val
      if (col === 'slug') f.slug = val
      if (col === 'id') f.id = val
      if (pendingUpdate && col === 'id') {
        const row = db.codes.find((c) => c.id === val)
        if (row) Object.assign(row, pendingUpdate)
        db.updates.push({ id: val, patch: pendingUpdate })
        return Promise.resolve({ error: null })
      }
      return api
    },
    in(col: string, vals: string[]) {
      // only used for qr_scans (the scans builder), but kept here harmlessly
      void col
      void vals
      return api
    },
    order() {
      let rows = db.codes
      if (f.space_id) rows = rows.filter((c) => c.space_id === f.space_id)
      return Promise.resolve({ data: rows, error: null })
    },
    insert(rows: Record<string, unknown>[]) {
      pendingInsert = rows
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
    async maybeSingle() {
      if (pendingInsert) {
        const r = pendingInsert[0]!
        const row = {
          id: `code-${db.codes.length}`,
          scan_count: 0,
          splash: null,
          created_at: '2026-06-20T00:00:00.000Z',
          ...(r as object),
        } as CodeRow
        db.codes.push(row)
        db.inserts.push(r)
        return { data: row, error: null }
      }
      // a read: by slug (slugTaken), by id (setCodeSplash space_id resolve)
      let rows = db.codes
      if (f.slug) rows = rows.filter((c) => c.slug === f.slug)
      if (f.id) rows = rows.filter((c) => c.id === f.id)
      return { data: rows[0] ?? null, error: null }
    },
  }
  return api
}

function scansBuilder() {
  const f: { ids?: string[] } = {}
  const api = {
    select() {
      return api
    },
    in(_col: string, vals: string[]) {
      f.ids = vals
      return Promise.resolve({
        data: db.scans.filter((s) => (f.ids ?? []).includes(s.qr_code_id)),
        error: null,
      })
    },
  }
  return api
}

function spacesBuilder() {
  const f: { id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'id') f.id = val
      return api
    },
    async maybeSingle() {
      const row = db.spaces.find((s) => s.id === f.id) ?? null
      return { data: row, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'qr_codes') return codesBuilder()
      if (table === 'qr_scans') return scansBuilder()
      if (table === 'spaces') return spacesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  codeCapForPlan,
  listSpaceCodes,
  listSpaceScanRows,
  createSpaceCode,
  setCodeSplash,
} from './space-codes'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000editr'
  currentWebRole = 'none'
  editableSpaceId = 'space-a'
  db.codes = []
  db.scans = []
  db.spaces = [
    { id: 'space-a', plan: 'free' },
    { id: 'space-b', plan: 'pro' },
  ]
  db.inserts = []
  db.updates = []
})

function seedCode(over: Partial<CodeRow> = {}) {
  db.codes.push({
    id: `code-${db.codes.length}`,
    space_id: 'space-a',
    slug: `s${db.codes.length}`,
    title: 'A code',
    destination_type: 'url',
    target_url: 'https://example.com',
    active: true,
    scan_count: 0,
    splash: null,
    created_at: '2026-06-19T00:00:00.000Z',
    ...over,
  })
}

describe('codeCapForPlan (pure, fail-small)', () => {
  it('maps known plans', () => {
    expect(codeCapForPlan('free')).toBe(3)
    expect(codeCapForPlan('starter')).toBe(25)
    expect(codeCapForPlan('pro')).toBe(100)
    expect(codeCapForPlan('business')).toBe(500)
  })
  it('falls to the free cap for unset / unknown plans', () => {
    expect(codeCapForPlan(null)).toBe(3)
    expect(codeCapForPlan(undefined)).toBe(3)
    expect(codeCapForPlan('enterprise-xl')).toBe(3)
  })
})

describe('listSpaceCodes (read gating + tenancy)', () => {
  it('returns [] for an anonymous caller', async () => {
    currentProfileId = null
    expect(await listSpaceCodes('space-a')).toEqual([])
  })

  it('returns [] for a non-editor', async () => {
    editableSpaceId = null
    seedCode()
    expect(await listSpaceCodes('space-a')).toEqual([])
  })

  it('returns the real codes for a janitor staff preview', async () => {
    editableSpaceId = null
    currentWebRole = 'janitor'
    seedCode({ title: 'Seen by staff' })
    const codes = await listSpaceCodes('space-a')
    expect(codes).toHaveLength(1)
    expect(codes[0]!.title).toBe('Seen by staff')
  })

  it('returns only THIS Space codes (cross-space isolation)', async () => {
    seedCode({ space_id: 'space-a', title: 'A1' })
    seedCode({ space_id: 'space-b', title: 'B1' })
    const codes = await listSpaceCodes('space-a')
    expect(codes.map((c) => c.title)).toEqual(['A1'])
  })

  it('reports hasSplash from a valid stored splash', async () => {
    seedCode({ splash: { heading: 'Hi', links: [] } })
    seedCode({ splash: { blurb: 'no heading' } }) // invalid -> hasSplash false
    const codes = await listSpaceCodes('space-a')
    const flags = codes.map((c) => c.hasSplash).sort()
    expect(flags).toEqual([false, true])
  })
})

describe('createSpaceCode (gating + cap + validation)', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await createSpaceCode('space-a', { title: 'X', targetUrl: 'https://x.com' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor and writes nothing', async () => {
    editableSpaceId = null
    const r = await createSpaceCode('space-a', { title: 'X', targetUrl: 'https://x.com' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a bad target url', async () => {
    const r = await createSpaceCode('space-a', { title: 'X', targetUrl: 'notaurl' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('creates a code with a generated slug', async () => {
    const r = await createSpaceCode('space-a', { title: 'Poster', targetUrl: 'https://x.com' })
    expect('error' in r).toBe(false)
    if ('data' in r) expect(r.data.slug).toMatch(/^[a-z0-9]+$/)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]!.space_id).toBe('space-a')
    expect(db.inserts[0]!.target_url).toBe('https://x.com')
  })

  it('honors a valid custom slug', async () => {
    const r = await createSpaceCode('space-a', {
      title: 'Poster',
      targetUrl: 'https://x.com',
      slug: 'Open House',
    })
    expect('error' in r).toBe(false)
    if ('data' in r) expect(r.data.slug).toBe('open-house')
  })

  it('rejects a custom slug already taken', async () => {
    seedCode({ slug: 'taken' })
    const r = await createSpaceCode('space-a', {
      title: 'Poster',
      targetUrl: 'https://x.com',
      slug: 'taken',
    })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/taken/i)
  })

  it('enforces the per-plan cap (free = 3)', async () => {
    seedCode()
    seedCode()
    seedCode() // 3 codes on a free Space (cap 3)
    const r = await createSpaceCode('space-a', { title: 'Fourth', targetUrl: 'https://x.com' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/plan allows 3/i)
    expect(db.inserts).toHaveLength(0)
  })
})

describe('setCodeSplash (gating + cross-space + splash validation)', () => {
  it('rejects an anonymous caller', async () => {
    seedCode()
    currentProfileId = null
    const r = await setCodeSplash('code-0', { heading: 'Hi', blurb: null, imageUrl: null, links: [] })
    expect('error' in r).toBe(true)
    expect(db.updates).toHaveLength(0)
  })

  it('rejects editing a code whose own Space the caller cannot edit (cross-space)', async () => {
    // The code belongs to space-b; the caller can edit only space-a.
    seedCode({ id: 'code-b', space_id: 'space-b', slug: 'b1' })
    const r = await setCodeSplash('code-b', { heading: 'Hi', blurb: null, imageUrl: null, links: [] })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.updates).toHaveLength(0)
  })

  it('rejects a headingless splash', async () => {
    seedCode({ id: 'code-a' })
    const r = await setCodeSplash('code-a', {
      heading: '   ',
      blurb: null,
      imageUrl: null,
      links: [],
    })
    expect('error' in r).toBe(true)
    expect(db.updates).toHaveLength(0)
  })

  it('stores a valid splash for an editable code', async () => {
    seedCode({ id: 'code-a' })
    const r = await setCodeSplash('code-a', {
      heading: 'Welcome',
      blurb: 'Hi',
      imageUrl: null,
      links: [{ label: 'Book', url: 'https://x.com' }],
    })
    expect('error' in r).toBe(false)
    expect(db.updates).toHaveLength(1)
    const stored = db.updates[0]!.patch.splash as { heading: string }
    expect(stored.heading).toBe('Welcome')
  })

  it('clears the splash when passed null', async () => {
    seedCode({ id: 'code-a', splash: { heading: 'Old' } })
    const r = await setCodeSplash('code-a', null)
    expect('error' in r).toBe(false)
    expect(db.updates[0]!.patch.splash).toBeNull()
  })
})

describe('listSpaceScanRows (read gating + tenancy)', () => {
  it('returns [] for a non-editor', async () => {
    editableSpaceId = null
    seedCode({ id: 'code-a' })
    db.scans.push({ qr_code_id: 'code-a', profile_id: null, scanned_at: 'x', medium: 'qr' })
    expect(await listSpaceScanRows('space-a')).toEqual([])
  })

  it('returns [] when the Space has no codes (no empty-filter leak)', async () => {
    // space-a has no codes; scans exist for some other code id.
    db.scans.push({ qr_code_id: 'code-x', profile_id: null, scanned_at: 'x', medium: 'qr' })
    expect(await listSpaceScanRows('space-a')).toEqual([])
  })

  it('returns only this Space scans (scoped to its code ids)', async () => {
    seedCode({ id: 'code-a', space_id: 'space-a' })
    seedCode({ id: 'code-b', space_id: 'space-b' })
    db.scans.push({ qr_code_id: 'code-a', profile_id: 'p1', scanned_at: 'x', medium: 'qr' })
    db.scans.push({ qr_code_id: 'code-b', profile_id: 'p2', scanned_at: 'x', medium: 'qr' })
    const rows = await listSpaceScanRows('space-a')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.qr_code_id).toBe('code-a')
  })
})
