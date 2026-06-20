import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE EMAIL DELIVERABILITY READS (ENTITY-SPACES-BUILD §C Phase 3). What is locked here, all
// network-free (the supabase admin client + auth + store + capability seam are mocked):
//   1. STAT MATH: counts per status over a Space's own outreach_sends; `sent` is the attempted
//      denominator (everything except queued + suppressed); bounceRate / complaintRate are fractions
//      and are 0 (never NaN) when nothing was sent.
//   2. CROSS-SPACE ISOLATION: a Space's stats / suppressions / history NEVER include another Space's
//      rows (every read filters on space_id; the suppression union only adds the global null rows).
//   3. THE GLOBAL-SUPPRESSION UNION: listSpaceSuppressions returns this Space's own rows PLUS the
//      global (space_id = null) rows, and labels the global ones, but never another Space's own rows.
//   4. PERMISSION GATING: all three reads require canEditProfile (a non-editor gets zeros / []); a
//      platform janitor previewing as staff may read.
//   5. FAIL-SAFE: a missing table (the builder throws) or a query error resolves to zeros / [], so a
//      render never breaks and nothing leaks, even before the backbone's tables exist.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ────────────────
let currentProfileId: string | null = 'owner-0000-4000-a000-0000000ownr'
let currentWebRole: 'none' | 'admin' | 'janitor' = 'none'
vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () =>
    currentProfileId ? { id: currentProfileId, webRole: currentWebRole } : null,
}))

let resolvedSpace: { id: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canEdit = true
vi.mock('./entitlements', () => ({
  // Mirror the real resolver: an anonymous caller (null profileId) is always no-caps, regardless of
  // the canEdit toggle (which models an authenticated editor vs a non-editor).
  getSpaceCapabilities: async (_space: unknown, profileId: string | null) => {
    const allowed = !!profileId && canEdit
    return {
      isOwner: allowed,
      isAdmin: allowed,
      role: allowed ? 'admin' : null,
      canEditProfile: allowed,
      canManageMembers: allowed,
      canInvite: allowed,
    }
  },
}))

// ── A chainable admin-client mock backed by an in-memory store ────────────────────────────────────
type SendRow = {
  id: string
  space_id: string
  email: string | null
  status: string
  error: string | null
  created_at: string
}
type SuppressionRow = {
  id: string
  space_id: string | null
  email: string | null
  reason: string | null
  created_at: string
}
const db = {
  sends: [] as SendRow[],
  suppressions: [] as SuppressionRow[],
  // A switch to simulate the backbone's table not existing yet (the builder throws).
  throwOnSends: false,
  throwOnSuppressions: false,
}

function sendsBuilder() {
  if (db.throwOnSends) throw new Error('relation "outreach_sends" does not exist')
  const filters: { space_id?: string } = {}
  let lim = Infinity
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
    limit(n: number) {
      lim = n
      return api
    },
    then(resolve: (r: { data: SendRow[] | null; error: null }) => unknown) {
      let data = db.sends
      if (filters.space_id) data = data.filter((r) => r.space_id === filters.space_id)
      data = [...data]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, lim === Infinity ? undefined : lim)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

function suppressionsBuilder() {
  if (db.throwOnSuppressions) throw new Error('relation "email_suppressions" does not exist')
  // The lib reads the union via `.or('space_id.eq.<id>,space_id.is.null')`; capture + apply it.
  let orSpaceId: string | null = null
  let lim = Infinity
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    is() {
      return api
    },
    or(filter: string) {
      // Parse the `space_id.eq.<uuid>,space_id.is.null` union filter into "this space OR global".
      const m = filter.match(/space_id\.eq\.([^,]+)/)
      orSpaceId = m ? m[1] : null
      return api
    },
    order() {
      return api
    },
    limit(n: number) {
      lim = n
      return api
    },
    then(resolve: (r: { data: SuppressionRow[] | null; error: null }) => unknown) {
      let data = db.suppressions.filter(
        (r) => r.space_id === null || (orSpaceId != null && r.space_id === orSpaceId),
      )
      data = [...data]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, lim === Infinity ? undefined : lim)
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'outreach_sends') return sendsBuilder()
      if (table === 'email_suppressions') return suppressionsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { getSpaceEmailStats, listSpaceSuppressions, recentSpaceSends } from './email-analytics'

beforeEach(() => {
  currentProfileId = 'owner-0000-4000-a000-0000000ownr'
  currentWebRole = 'none'
  resolvedSpace = { id: 'space-1', ownerProfileId: 'owner-0000-4000-a000-0000000ownr' }
  canEdit = true
  db.sends = []
  db.suppressions = []
  db.throwOnSends = false
  db.throwOnSuppressions = false
})

function send(over: Partial<SendRow> = {}): SendRow {
  return {
    id: `s${db.sends.length}`,
    space_id: 'space-1',
    email: 'a@example.com',
    status: 'delivered',
    error: null,
    created_at: `2026-06-${String(10 + db.sends.length).padStart(2, '0')}T00:00:00.000Z`,
    ...over,
  }
}
function suppression(over: Partial<SuppressionRow> = {}): SuppressionRow {
  return {
    id: `g${db.suppressions.length}`,
    space_id: 'space-1',
    email: 'opt@example.com',
    reason: 'unsubscribe',
    created_at: `2026-06-${String(10 + db.suppressions.length).padStart(2, '0')}T00:00:00.000Z`,
    ...over,
  }
}

describe('getSpaceEmailStats - stat math', () => {
  it('counts per status and computes rates as fractions', async () => {
    // 1 sent + 6 delivered + 2 bounced + 1 complained + 1 failed = 11 attempted; 1 queued +
    // 1 suppressed are NOT attempted.
    db.sends.push(
      ...Array.from({ length: 6 }, () => send({ status: 'delivered' })),
      send({ status: 'sent' }),
      send({ status: 'bounced' }),
      send({ status: 'bounced' }),
      send({ status: 'complained' }),
      send({ status: 'failed' }),
      send({ status: 'queued' }),
      send({ status: 'suppressed' }),
    )
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(11) // attempted = all except queued + suppressed
    expect(stats.delivered).toBe(6)
    expect(stats.bounced).toBe(2)
    expect(stats.complained).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.suppressed).toBe(1)
    expect(stats.bounceRate).toBeCloseTo(2 / 11, 10)
    expect(stats.complaintRate).toBeCloseTo(1 / 11, 10)
  })

  it('rates are 0 (never NaN) when nothing was sent', async () => {
    db.sends.push(send({ status: 'queued' }), send({ status: 'suppressed' }))
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(0)
    expect(stats.bounceRate).toBe(0)
    expect(stats.complaintRate).toBe(0)
    expect(Number.isNaN(stats.complaintRate)).toBe(false)
  })

  it('ignores an unknown / future status (fail-closed, never inflates a count)', async () => {
    db.sends.push(send({ status: 'delivered' }), send({ status: 'teleported' }))
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(1)
    expect(stats.delivered).toBe(1)
  })
})

describe('getSpaceEmailStats - isolation + gating + fail-safe', () => {
  it('never counts another Space’s sends', async () => {
    db.sends.push(
      send({ status: 'delivered', space_id: 'space-1' }),
      send({ status: 'bounced', space_id: 'space-2' }),
      send({ status: 'complained', space_id: 'space-2' }),
    )
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(1)
    expect(stats.delivered).toBe(1)
    expect(stats.bounced).toBe(0)
    expect(stats.complained).toBe(0)
  })

  it('returns zeros for a non-editor (gated on canEditProfile)', async () => {
    canEdit = false
    db.sends.push(send({ status: 'delivered' }))
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(0)
    expect(stats.delivered).toBe(0)
  })

  it('lets a platform janitor read as staff even when not an editor', async () => {
    canEdit = false
    currentWebRole = 'janitor'
    db.sends.push(send({ status: 'delivered' }))
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.delivered).toBe(1)
  })

  it('returns zeros for an anonymous caller', async () => {
    currentProfileId = null
    db.sends.push(send({ status: 'delivered' }))
    const stats = await getSpaceEmailStats('space-1')
    expect(stats.sent).toBe(0)
  })

  it('fails safe to zeros when the table does not exist (builder throws)', async () => {
    db.throwOnSends = true
    const stats = await getSpaceEmailStats('space-1')
    expect(stats).toMatchObject({ sent: 0, delivered: 0, bounceRate: 0, complaintRate: 0 })
  })
})

describe('listSpaceSuppressions - global union + isolation', () => {
  it('returns this Space’s own rows PLUS the global (null-space) rows, labeling the global ones', async () => {
    db.suppressions.push(
      suppression({ id: 'own', space_id: 'space-1', email: 'mine@example.com' }),
      suppression({ id: 'global', space_id: null, email: 'everywhere@example.com' }),
    )
    const list = await listSpaceSuppressions('space-1')
    const byEmail = Object.fromEntries(list.map((s) => [s.email, s]))
    expect(Object.keys(byEmail).sort()).toEqual(['everywhere@example.com', 'mine@example.com'])
    expect(byEmail['mine@example.com'].isGlobal).toBe(false)
    expect(byEmail['everywhere@example.com'].isGlobal).toBe(true)
  })

  it('never includes another Space’s own suppressions', async () => {
    db.suppressions.push(
      suppression({ id: 'own', space_id: 'space-1', email: 'mine@example.com' }),
      suppression({ id: 'other', space_id: 'space-2', email: 'theirs@example.com' }),
    )
    const emails = (await listSpaceSuppressions('space-1')).map((s) => s.email)
    expect(emails).toContain('mine@example.com')
    expect(emails).not.toContain('theirs@example.com')
  })

  it('drops a suppression with no email and maps the reason / date', async () => {
    db.suppressions.push(
      suppression({ id: 'noemail', email: null }),
      suppression({ id: 'ok', email: 'real@example.com', reason: 'bounce' }),
    )
    const list = await listSpaceSuppressions('space-1')
    expect(list).toHaveLength(1)
    expect(list[0].email).toBe('real@example.com')
    expect(list[0].reason).toBe('bounce')
  })

  it('returns [] for a non-editor and [] when the table is missing', async () => {
    canEdit = false
    db.suppressions.push(suppression())
    expect(await listSpaceSuppressions('space-1')).toEqual([])
    canEdit = true
    db.throwOnSuppressions = true
    expect(await listSpaceSuppressions('space-1')).toEqual([])
  })
})

describe('recentSpaceSends - history list', () => {
  it('returns only this Space’s sends, newest first, dropping unknown statuses', async () => {
    db.sends.push(
      send({ id: 'old', status: 'delivered', created_at: '2026-06-01T00:00:00.000Z' }),
      send({ id: 'new', status: 'bounced', created_at: '2026-06-19T00:00:00.000Z' }),
      send({ id: 'other', status: 'delivered', space_id: 'space-2' }),
      send({ id: 'weird', status: 'teleported', created_at: '2026-06-18T00:00:00.000Z' }),
    )
    const list = await recentSpaceSends('space-1')
    expect(list.map((s) => s.id)).toEqual(['new', 'old']) // space-2 + unknown status excluded
  })

  it('caps to the requested limit', async () => {
    for (let i = 0; i < 5; i++) db.sends.push(send({ status: 'delivered' }))
    const list = await recentSpaceSends('space-1', 2)
    expect(list).toHaveLength(2)
  })

  it('returns [] for a non-editor and [] when the table is missing', async () => {
    canEdit = false
    db.sends.push(send())
    expect(await recentSpaceSends('space-1')).toEqual([])
    canEdit = true
    db.throwOnSends = true
    expect(await recentSpaceSends('space-1')).toEqual([])
  })
})
