import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE CAMPAIGNS (ENTITY-SPACES-BUILD §C Phase 3). What is locked here, all network-free (the
// supabase admin client + auth + store + capability seam + the audience resolver are mocked):
//   1. PURE validation: subject/body normalization + caps; status coercion fails closed to 'draft';
//      a past / unparseable schedule time fails closed to null.
//   2. PERMISSION GATING on the actions: create / update / schedule / send require canEditProfile
//      (anonymous + non-editor are rejected, nothing is written). list is gated too (or a janitor
//      staff preview).
//   3. CROSS-SPACE ISOLATION: list filters space_id (Space A never sees Space B's campaigns); a
//      single-campaign read is pinned to space_id, so a cross-space id resolves to "not found" and
//      cannot be edited / scheduled / sent.
//   4. SEND placeholder: a valid, ready campaign with recipients returns the "being connected"
//      message (this build does not send); an empty audience / empty campaign is rejected first.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-0000000edit'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-A',
  slug: 'river-studio',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
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

// The audience resolver is its own unit (audiences.test.ts); here we just control how many recipients
// a send resolves to, so sendSpaceCampaign's gating + validation is what's under test.
let audience: { contactId: string; email: string }[] = [{ contactId: 'c1', email: 'a@x.com' }]
vi.mock('./audiences', () => ({
  resolveAudience: async () => audience,
}))

// The send seam (@/lib/spaces/email) is its own unit (email.test.ts); mock it so this surface test is
// isolated and never runs a real send. A success returns {sent} that the surface maps to recipientCount.
vi.mock('@/lib/spaces/email', () => ({
  sendSpaceCampaign: async () => ({ data: { sent: 3, suppressed: 0, failed: 0 } }),
  SPACE_UNSUBSCRIBE_PLACEHOLDER: '%%SPACE_UNSUBSCRIBE_URL%%',
  isSpaceEmailEnabled: async () => true,
  setSpaceEmailEnabled: async () => ({ data: undefined }),
}))

// ── A chainable admin-client mock backed by an in-memory campaigns store ────────────────────────
type CampaignRow = {
  id: string
  subject: string
  body: string | null
  status: string
  recipient_count: number | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string | null
  space_id: string | null
}

const db = {
  campaigns: [] as CampaignRow[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}

function campaignsBuilder() {
  const filters: { id?: string; space_id?: string } = {}
  let pendingInsert: Record<string, unknown> | null = null
  let pendingUpdate: Record<string, unknown> | null = null
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
    limit() {
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
        const row = {
          id: `camp${db.campaigns.length}`,
          subject: '',
          body: '',
          status: 'draft',
          recipient_count: 0,
          scheduled_for: null,
          sent_at: null,
          created_at: '2026-06-20T00:00:00.000Z',
          space_id: null,
          ...(pendingInsert as object),
        } as CampaignRow
        db.campaigns.push(row)
        db.inserts.push(pendingInsert)
        return { data: row, error: null }
      }
      if (pendingUpdate) {
        const row = db.campaigns.find(
          (c) => c.id === filters.id && (!filters.space_id || c.space_id === filters.space_id),
        )
        if (row) {
          Object.assign(row, pendingUpdate)
          db.updates.push(pendingUpdate)
        }
        return { data: row ?? null, error: null }
      }
      // a single read, pinned to (id, space_id)
      const row =
        db.campaigns.find(
          (c) => c.id === filters.id && (!filters.space_id || c.space_id === filters.space_id),
        ) ?? null
      return { data: row, error: null }
    },
    then(resolve: (r: { data: CampaignRow[] | null; error: null }) => unknown) {
      const data = db.campaigns.filter((c) => c.space_id === filters.space_id)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'campaigns') return campaignsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeSubject,
  normalizeBody,
  toCampaignStatus,
  parseScheduleTime,
  listSpaceCampaigns,
  createSpaceCampaign,
  updateSpaceCampaign,
  scheduleSpaceCampaign,
  sendSpaceCampaign,
} from './campaigns'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000edit'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-A', slug: 'river-studio', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  audience = [{ contactId: 'c1', email: 'a@x.com' }]
  db.campaigns = []
  db.inserts = []
  db.updates = []
})

function seedCampaign(over: Partial<CampaignRow> = {}): CampaignRow {
  const row: CampaignRow = {
    id: `camp${db.campaigns.length}`,
    subject: 'Hello',
    body: 'A real body here.',
    status: 'draft',
    recipient_count: 0,
    scheduled_for: null,
    sent_at: null,
    created_at: '2026-06-20T00:00:00.000Z',
    space_id: 'space-A',
    ...over,
  }
  db.campaigns.push(row)
  return row
}

describe('pure validation', () => {
  it('normalizeSubject trims + caps; blank -> empty', () => {
    expect(normalizeSubject('  Hi ')).toBe('Hi')
    expect(normalizeSubject('   ')).toBe('')
    expect(normalizeSubject(undefined)).toBe('')
    expect(normalizeSubject('x'.repeat(300))).toHaveLength(200)
  })

  it('normalizeBody preserves newlines, caps length', () => {
    expect(normalizeBody('a\n\nb')).toBe('a\n\nb')
    expect(normalizeBody(42)).toBe('')
    expect(normalizeBody('x'.repeat(60000))).toHaveLength(50000)
  })

  it('toCampaignStatus fails closed to draft for unknowns', () => {
    expect(toCampaignStatus('sent')).toBe('sent')
    expect(toCampaignStatus('scheduled')).toBe('scheduled')
    expect(toCampaignStatus('queued')).toBe('draft')
    expect(toCampaignStatus(null)).toBe('draft')
  })

  it('parseScheduleTime rejects past / invalid, accepts a future ISO', () => {
    const now = new Date('2026-06-20T00:00:00.000Z')
    expect(parseScheduleTime('2026-06-21T00:00:00.000Z', now)).toBe('2026-06-21T00:00:00.000Z')
    expect(parseScheduleTime('2026-06-19T00:00:00.000Z', now)).toBeNull()
    expect(parseScheduleTime('not-a-date', now)).toBeNull()
    expect(parseScheduleTime(undefined, now)).toBeNull()
  })
})

describe('createSpaceCampaign — gating + validation', () => {
  it('rejects an anonymous caller and writes nothing', async () => {
    currentProfileId = null
    const r = await createSpaceCampaign('space-A', { subject: 'Hi', body: 'x' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a non-editor and writes nothing', async () => {
    canEdit = false
    const r = await createSpaceCampaign('space-A', { subject: 'Hi', body: 'x' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.inserts).toHaveLength(0)
  })

  it('requires a subject', async () => {
    const r = await createSpaceCampaign('space-A', { subject: '   ', body: 'x' })
    expect('error' in r).toBe(true)
    expect(db.inserts).toHaveLength(0)
  })

  it('an editor creates a draft stamped with the space_id', async () => {
    const r = await createSpaceCampaign('space-A', { subject: 'Hi', body: 'body' })
    expect('error' in r).toBe(false)
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]!.space_id).toBe('space-A')
    expect(db.inserts[0]!.status).toBe('draft')
  })
})

describe('listSpaceCampaigns — isolation + gating', () => {
  it('returns only THIS Space\'s campaigns', async () => {
    seedCampaign({ subject: 'A-one', space_id: 'space-A' })
    seedCampaign({ subject: 'B-one', space_id: 'space-B' })
    const list = await listSpaceCampaigns('space-A')
    expect(list.map((c) => c.subject)).toEqual(['A-one'])
  })

  it('returns [] for a non-editor (not a janitor)', async () => {
    seedCampaign({ space_id: 'space-A' })
    canEdit = false
    expect(await listSpaceCampaigns('space-A')).toEqual([])
  })

  it('a janitor staff preview reads the real list even as a non-editor', async () => {
    seedCampaign({ subject: 'A-one', space_id: 'space-A' })
    canEdit = false
    currentWebRole = 'janitor'
    const list = await listSpaceCampaigns('space-A')
    expect(list.map((c) => c.subject)).toEqual(['A-one'])
  })
})

describe('updateSpaceCampaign — isolation + immutability', () => {
  it('cannot edit a campaign that belongs to another Space (pinned read -> not found)', async () => {
    const b = seedCampaign({ subject: 'B', space_id: 'space-B' })
    const r = await updateSpaceCampaign('space-A', b.id, { subject: 'Hacked' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(b.subject).toBe('B') // unchanged
  })

  it('a sent campaign is immutable', async () => {
    const c = seedCampaign({ status: 'sent', space_id: 'space-A' })
    const r = await updateSpaceCampaign('space-A', c.id, { subject: 'New' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/already gone out/i)
  })

  it('an editor updates a draft in their Space', async () => {
    const c = seedCampaign({ space_id: 'space-A' })
    const r = await updateSpaceCampaign('space-A', c.id, { subject: 'Updated' })
    expect('error' in r).toBe(false)
    expect(c.subject).toBe('Updated')
  })
})

describe('scheduleSpaceCampaign', () => {
  it('rejects a past time', async () => {
    const c = seedCampaign({ space_id: 'space-A' })
    const r = await scheduleSpaceCampaign('space-A', c.id, '2020-01-01T00:00:00.000Z')
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/future/i)
    expect(c.status).toBe('draft') // unchanged
  })

  it('cannot schedule another Space\'s campaign', async () => {
    const b = seedCampaign({ space_id: 'space-B' })
    const future = new Date(Date.now() + 86400000).toISOString()
    const r = await scheduleSpaceCampaign('space-A', b.id, future)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
  })

  it('schedules a draft for a future time', async () => {
    const c = seedCampaign({ space_id: 'space-A' })
    const future = new Date(Date.now() + 86400000).toISOString()
    const r = await scheduleSpaceCampaign('space-A', c.id, future)
    expect('error' in r).toBe(false)
    expect(c.status).toBe('scheduled')
    expect(c.scheduled_for).toBe(future)
  })
})

describe('sendSpaceCampaign — placeholder + guards', () => {
  it('rejects a non-editor', async () => {
    const c = seedCampaign({ space_id: 'space-A' })
    canEdit = false
    const r = await sendSpaceCampaign('space-A', c.id)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
  })

  it('cannot send another Space\'s campaign', async () => {
    const b = seedCampaign({ space_id: 'space-B' })
    const r = await sendSpaceCampaign('space-A', b.id)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
  })

  it('rejects an empty audience before reaching the seam', async () => {
    const c = seedCampaign({ space_id: 'space-A' })
    audience = []
    const r = await sendSpaceCampaign('space-A', c.id)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/no one matched/i)
  })

  it('a ready campaign with recipients delegates to the send seam and reports the sent count', async () => {
    const c = seedCampaign({ subject: 'Hi', body: 'Real body.', space_id: 'space-A' })
    const r = await sendSpaceCampaign('space-A', c.id)
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data.recipientCount).toBe(3)
  })
})
