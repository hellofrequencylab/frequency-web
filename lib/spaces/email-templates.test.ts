import { describe, it, expect, beforeEach, vi } from 'vitest'

// REUSABLE EMAIL TEMPLATES (ADR-380). What is locked here, all network-free (the supabase admin client +
// auth + store + capability seam are mocked):
//   1. PURE validation: a blank name is rejected; subject/body are normalized + capped (the composer's
//      own caps, so a template can never carry a value the composer would reject).
//   2. PERMISSION GATING: create / update / delete require canEditProfile (anonymous + non-editor are
//      rejected, nothing is written).
//   3. CROSS-SPACE ISOLATION: list filters space_id (Space A never sees Space B's templates); a single
//      template read is pinned to space_id, so a cross-space id resolves to "not found" and cannot be
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

// ── A chainable admin-client mock backed by an in-memory space_email_templates store ─────────────
type TemplateRow = {
  id: string
  name: string
  subject: string | null
  body: string | null
  created_at: string | null
  space_id: string | null
}

const db = {
  templates: [] as TemplateRow[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: [] as string[],
}

function templatesBuilder() {
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
          id: `tpl${db.templates.length}`,
          name: '',
          subject: '',
          body: '',
          created_at: '2026-06-20T00:00:00.000Z',
          space_id: null,
          ...(pendingInsert as object),
        } as TemplateRow
        db.templates.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      if (pendingUpdate) {
        const row = db.templates.find(
          (t) => t.id === filters.id && (!filters.space_id || t.space_id === filters.space_id),
        )
        if (row) {
          Object.assign(row, pendingUpdate)
          db.updates.push(pendingUpdate)
        }
        return { data: row ?? null, error: null }
      }
      if (pendingDelete) {
        const idx = db.templates.findIndex(
          (t) => t.id === filters.id && (!filters.space_id || t.space_id === filters.space_id),
        )
        if (idx >= 0) {
          db.deletes.push(db.templates[idx]!.id)
          db.templates.splice(idx, 1)
        }
        return { data: null, error: null }
      }
      const row =
        db.templates.find(
          (t) => t.id === filters.id && (!filters.space_id || t.space_id === filters.space_id),
        ) ?? null
      return { data: row, error: null }
    },
    then(resolve: (r: { data: TemplateRow[] | null; error: null }) => unknown) {
      const data = db.templates.filter((t) => t.space_id === filters.space_id)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'space_email_templates') return templatesBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeTemplateName,
  validateTemplate,
  listSpaceEmailTemplates,
  createSpaceEmailTemplate,
  updateSpaceEmailTemplate,
  deleteSpaceEmailTemplate,
} from './email-templates'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000edit'
  resolvedSpace = { id: 'space-A', slug: 'river-studio' }
  canEdit = true
  db.templates = []
  db.inserts = []
  db.updates = []
  db.deletes = []
})

function seedTemplate(over: Partial<TemplateRow> = {}): TemplateRow {
  const row: TemplateRow = {
    id: `tpl${db.templates.length}`,
    name: 'Welcome',
    subject: 'Hello',
    body: 'A body.',
    created_at: '2026-06-20T00:00:00.000Z',
    space_id: 'space-A',
    ...over,
  }
  db.templates.push(row)
  return row
}

describe('pure validation', () => {
  it('normalizeTemplateName trims + caps; blank -> empty', () => {
    expect(normalizeTemplateName('  Welcome ')).toBe('Welcome')
    expect(normalizeTemplateName('   ')).toBe('')
    expect(normalizeTemplateName(undefined)).toBe('')
    expect(normalizeTemplateName('x'.repeat(200))).toHaveLength(80)
  })

  it('validateTemplate rejects a blank name and normalizes subject/body otherwise', () => {
    const bad = validateTemplate('   ', 'Hi', 'Body')
    expect('error' in bad).toBe(true)
    const good = validateTemplate(' Welcome ', '  Subject  ', 'Body text')
    expect(good).toEqual({ name: 'Welcome', subject: 'Subject', body: 'Body text' })
  })

  it('validateTemplate caps subject (200) and body (50000) like the composer', () => {
    const r = validateTemplate('T', 'x'.repeat(300), 'y'.repeat(60000))
    expect('error' in r).toBe(false)
    if (!('error' in r)) {
      expect(r.subject).toHaveLength(200)
      expect(r.body).toHaveLength(50000)
    }
  })
})

describe('createSpaceEmailTemplate — gating + validation', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await createSpaceEmailTemplate('space-A', 'Welcome', 'Hi', 'Body')
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor and writes nothing', async () => {
    canEdit = false
    const r = await createSpaceEmailTemplate('space-A', 'Welcome', 'Hi', 'Body')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('requires a name', async () => {
    const r = await createSpaceEmailTemplate('space-A', '   ', 'Hi', 'Body')
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an editor creates a template stamped with the space_id', async () => {
    const r = await createSpaceEmailTemplate('space-A', ' Welcome ', ' Hi ', 'Body')
    expect('error' in r).toBe(false)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]!.space_id).toBe('space-A')
    expect(db.inserts[0]!.name).toBe('Welcome')
    expect(db.inserts[0]!.subject).toBe('Hi')
  })
})

describe('listSpaceEmailTemplates — isolation', () => {
  it("returns only THIS Space's templates", async () => {
    seedTemplate({ name: 'A-tpl', space_id: 'space-A' })
    seedTemplate({ name: 'B-tpl', space_id: 'space-B' })
    const list = await listSpaceEmailTemplates('space-A')
    expect(list.map((t) => t.name)).toEqual(['A-tpl'])
  })

  it('returns [] for a blank spaceId', async () => {
    expect(await listSpaceEmailTemplates('')).toEqual([])
  })
})

describe('updateSpaceEmailTemplate — cross-space isolation', () => {
  it("cannot update another Space's template (pinned read -> not found, a no-op)", async () => {
    const b = seedTemplate({ name: 'B', space_id: 'space-B' })
    const r = await updateSpaceEmailTemplate('space-A', b.id, 'Hacked', 'X', 'Y')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(b.name).toBe('B') // unchanged
    expect(db.updates).toHaveLength(0)
  })

  it('an editor re-saves a template in their Space', async () => {
    const a = seedTemplate({ name: 'Old', space_id: 'space-A' })
    const r = await updateSpaceEmailTemplate('space-A', a.id, 'New', 'New subject', 'New body')
    expect('error' in r).toBe(false)
    expect(a.name).toBe('New')
    expect(a.subject).toBe('New subject')
  })
})

describe('deleteSpaceEmailTemplate — cross-space isolation', () => {
  it("cannot delete another Space's template (pinned read -> not found, a no-op)", async () => {
    const b = seedTemplate({ name: 'B', space_id: 'space-B' })
    const r = await deleteSpaceEmailTemplate('space-A', b.id)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(db.templates).toHaveLength(1) // not deleted
    expect(db.deletes).toHaveLength(0)
  })

  it('an editor deletes a template in their Space', async () => {
    const a = seedTemplate({ name: 'A', space_id: 'space-A' })
    const r = await deleteSpaceEmailTemplate('space-A', a.id)
    expect('error' in r).toBe(false)
    expect(db.templates).toHaveLength(0)
    expect(db.deletes).toEqual([a.id])
  })
})
