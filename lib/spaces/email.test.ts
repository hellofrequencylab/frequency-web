import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE EMAIL send backbone (ENTITY-SPACES-BUILD Phase 3). What is locked here, all network-free
// (auth + store + capability seam + the Resend sender + suppression + token + admin client are mocked,
// so NO real email is ever sent):
//   1. KILL-SWITCH fail-closed: a Space with email_enabled=false sends NOTHING and returns an error.
//   2. SUPPRESSION filtering: a recipient suppressed GLOBALLY or for THIS Space is skipped (logged
//      'suppressed'), never handed to the sender.
//   3. DAILY CAP: a Space at/over the per-day cap sends nothing; under the cap it sends up to the
//      remaining budget only.
//   4. CROSS-SPACE isolation: a send for space A writes only space A rows and reads only space A's
//      enabled flag / cap, never space B's.
//   5. GATING: anonymous + non-editor callers are rejected and nothing sends; setSpaceEmailEnabled
//      requires canEditProfile AND (to enable) an explicit acknowledgement.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'editor-0000-4000-a000-0000000editr'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

let resolvedSpace:
  | { id: string; slug: string; name: string; brandName: string | null; ownerProfileId?: string | null }
  | null = {
  id: 'space-A',
  slug: 'river-studio',
  name: 'River Studio',
  brandName: 'River Studio',
  ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
}
vi.mock('./store', () => ({
  getSpaceById: async (id: string) => (resolvedSpace && resolvedSpace.id === id ? resolvedSpace : null),
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

// The Resend sender mock: records each call so we can assert WHAT was sent (and that nothing is sent
// when fail-closed). Returns a fake provider id by default. NO real email leaves the process.
const sends: { to: string; subject: string; from?: string; headers?: Record<string, string> }[] = []
let nextSendId: string | null = 'resend-id-xyz'
let throwOnSend = false
vi.mock('@/lib/email', () => ({
  sendRawEmail: async (payload: { to: string; subject: string; from?: string; headers?: Record<string, string> }) => {
    sends.push(payload)
    if (throwOnSend) throw new Error('provider boom')
    return { id: nextSendId }
  },
  listUnsubscribeHeaders: (url: string) => ({
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }),
}))

// Suppression mock: a set of "global" addresses + a set of (space,email) pairs.
const globalSuppressed = new Set<string>()
const spaceSuppressed = new Set<string>() // key: `${spaceId}:${email}`
const suppressCalls: { email: string; reason: string; spaceId?: string }[] = []
vi.mock('@/lib/suppression', () => ({
  isSuppressed: async (email: string, spaceId?: string) => {
    const e = email.trim().toLowerCase()
    if (globalSuppressed.has(e)) return true
    if (spaceId && spaceSuppressed.has(`${spaceId}:${e}`)) return true
    return false
  },
  suppress: async (email: string, reason: string, spaceId?: string) => {
    suppressCalls.push({ email: email.trim().toLowerCase(), reason, spaceId })
  },
}))

vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildSpaceUnsubscribeUrl: ({ baseUrl, spaceId, email }: { baseUrl: string; spaceId: string; email: string }) =>
    `${baseUrl}/unsubscribe?s=${spaceId}&e=${encodeURIComponent(email)}&t=tok`,
}))

// ── In-memory admin client: spaces.email_enabled, outreach_sends, the today-count query ──────────
const db = {
  // space_id -> email_enabled
  enabled: new Map<string, boolean>(),
  // outreach_sends rows (created_at always "today" for the test clock)
  outreach: [] as {
    id: string
    space_id: string
    campaign_id: string | null
    contact_id: string | null
    email: string
    status: string
    resend_id: string | null
    error: string | null
    created_at: string
  }[],
  spaceUpdates: [] as { id: string; email_enabled: boolean }[],
}

function spacesBuilder() {
  // Supports: .select('email_enabled').eq('id', x).maybeSingle()
  //           .update({ email_enabled }).eq('id', x)
  let pendingUpdate: Record<string, unknown> | null = null
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    update(patch: Record<string, unknown>) {
      pendingUpdate = patch
      return api
    },
    eq(_col: string, val: string) {
      if (pendingUpdate) {
        db.spaceUpdates.push({ id: val, email_enabled: pendingUpdate.email_enabled as boolean })
        db.enabled.set(val, pendingUpdate.email_enabled as boolean)
        return Promise.resolve({ error: null })
      }
      // a read by id
      ;(api as { _id?: string })._id = val
      return api
    },
    maybeSingle() {
      const id = (api as { _id?: string })._id
      const enabled = id ? db.enabled.get(id) ?? false : false
      return Promise.resolve({ data: { email_enabled: enabled } })
    },
  }
  return api
}

function outreachBuilder() {
  // Supports: insert([rows])
  //           select('id', {count:'exact',head:true}).eq('space_id',x).neq('status',y).gte('created_at',z)
  const filters: { space_id?: string; neqStatus?: string } = {}
  const api: Record<string, unknown> = {
    insert(rows: Record<string, unknown>[]) {
      for (const r of rows) {
        db.outreach.push({
          id: `o${db.outreach.length}`,
          space_id: r.space_id as string,
          campaign_id: (r.campaign_id as string) ?? null,
          contact_id: (r.contact_id as string) ?? null,
          email: r.email as string,
          status: r.status as string,
          resend_id: (r.resend_id as string) ?? null,
          error: (r.error as string) ?? null,
          created_at: new Date().toISOString(),
        })
      }
      return Promise.resolve({ error: null })
    },
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    neq(col: string, val: string) {
      if (col === 'status') filters.neqStatus = val
      return api
    },
    gte() {
      // terminal: return the count of matching rows
      let rows = db.outreach
      if (filters.space_id) rows = rows.filter((r) => r.space_id === filters.space_id)
      if (filters.neqStatus) rows = rows.filter((r) => r.status !== filters.neqStatus)
      return Promise.resolve({ count: rows.length })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'spaces') return spacesBuilder()
      if (table === 'outreach_sends') return outreachBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  normalizeRecipients,
  normalizeEmail,
  spaceFromLine,
  isSpaceEmailEnabled,
  setSpaceEmailEnabled,
  sendSpaceCampaign,
  DAILY_SEND_CAP,
} from './email'

beforeEach(() => {
  currentProfileId = 'editor-0000-4000-a000-0000000editr'
  resolvedSpace = {
    id: 'space-A',
    slug: 'river-studio',
    name: 'River Studio',
    brandName: 'River Studio',
    ownerProfileId: 'owner-0000-4000-a000-0000000ownr',
  }
  canEdit = true
  sends.length = 0
  nextSendId = 'resend-id-xyz'
  throwOnSend = false
  globalSuppressed.clear()
  spaceSuppressed.clear()
  suppressCalls.length = 0
  db.enabled.clear()
  db.outreach.length = 0
  db.spaceUpdates.length = 0
  // Space A starts ENABLED for the happy-path send tests; specific tests toggle it off.
  db.enabled.set('space-A', true)
})

const recips = (...emails: string[]) => emails.map((email) => ({ email }))

// ── PURE helpers ─────────────────────────────────────────────────────────────────────────────────

describe('normalizeEmail / normalizeRecipients (pure, fail-closed)', () => {
  it('lowercases + trims', () => {
    expect(normalizeEmail('  A@B.COM ')).toBe('a@b.com')
  })
  it('drops blanks + malformed + de-dupes, keeps a contactId', () => {
    const out = normalizeRecipients([
      { email: '  A@B.com ' },
      { email: 'a@b.com', contactId: 'c1' }, // dupe (first wins, no contactId)
      { email: 'not-an-email' },
      { email: '' },
      { email: 'c@d.com', contactId: 'c2' },
    ])
    expect(out.map((r) => r.email)).toEqual(['a@b.com', 'c@d.com'])
    expect(out[1]!.contactId).toBe('c2')
  })
  it('returns [] for a non-array', () => {
    expect(normalizeRecipients(null)).toEqual([])
  })
})

describe('spaceFromLine (pure)', () => {
  it('shows the brand name on the verified address', () => {
    expect(spaceFromLine('River Studio', 'Frequency <noreply@send.x.com>')).toBe(
      'River Studio <noreply@send.x.com>',
    )
  })
  it('falls back to the configured From when no brand name', () => {
    expect(spaceFromLine(null, 'Frequency <noreply@send.x.com>')).toBe('Frequency <noreply@send.x.com>')
  })
  it('sanitizes a hostile brand name (no header injection)', () => {
    const out = spaceFromLine('Evil"\r\n<x>', 'F <a@b.com>')
    expect(out).toBe('Evilx <a@b.com>')
  })
})

// ── isSpaceEmailEnabled / setSpaceEmailEnabled ─────────────────────────────────────────────────

describe('isSpaceEmailEnabled', () => {
  it('reads the per-Space flag (fail-safe false for an unknown space)', async () => {
    expect(await isSpaceEmailEnabled('space-A')).toBe(true)
    expect(await isSpaceEmailEnabled('space-Z')).toBe(false)
    expect(await isSpaceEmailEnabled('')).toBe(false)
  })
})

describe('setSpaceEmailEnabled: gating + acknowledgement', () => {
  it('rejects an anonymous caller', async () => {
    currentProfileId = null
    const r = await setSpaceEmailEnabled('space-A', true, true)
    expect('error' in r).toBe(true)
    expect(db.spaceUpdates).toHaveLength(0)
  })

  it('rejects a non-editor', async () => {
    canEdit = false
    const r = await setSpaceEmailEnabled('space-A', true, true)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(db.spaceUpdates).toHaveLength(0)
  })

  it('refuses to ENABLE without the acknowledgement', async () => {
    const r = await setSpaceEmailEnabled('space-A', true, false)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission to email|anti-spam/i)
    expect(db.spaceUpdates).toHaveLength(0)
  })

  it('enables with the acknowledgement', async () => {
    db.enabled.set('space-A', false)
    const r = await setSpaceEmailEnabled('space-A', true, true)
    expect('error' in r).toBe(false)
    expect(db.spaceUpdates.at(-1)).toEqual({ id: 'space-A', email_enabled: true })
  })

  it('disables WITHOUT requiring the acknowledgement (stopping is always allowed)', async () => {
    const r = await setSpaceEmailEnabled('space-A', false, false)
    expect('error' in r).toBe(false)
    expect(db.spaceUpdates.at(-1)).toEqual({ id: 'space-A', email_enabled: false })
  })
})

// ── sendSpaceCampaign ─────────────────────────────────────────────────────────────────────────

describe('sendSpaceCampaign: gating + fail-closed', () => {
  it('rejects an anonymous caller and sends nothing', async () => {
    currentProfileId = null
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    expect(sends).toHaveLength(0)
    expect(db.outreach).toHaveLength(0)
  })

  it('rejects a non-editor and sends nothing', async () => {
    canEdit = false
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/permission/i)
    expect(sends).toHaveLength(0)
  })

  it('FAIL-CLOSED: a Space with email disabled sends nothing', async () => {
    db.enabled.set('space-A', false)
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/turned off|turn it on/i)
    expect(sends).toHaveLength(0)
    expect(db.outreach).toHaveLength(0)
  })

  it('rejects an empty subject / body', async () => {
    const r = await sendSpaceCampaign('space-A', { subject: '  ', html: '', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    expect(sends).toHaveLength(0)
  })

  it('rejects when there are no valid recipients', async () => {
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('nope') })
    expect('error' in r).toBe(true)
    expect(sends).toHaveLength(0)
  })
})

describe('sendSpaceCampaign: happy path + headers', () => {
  it('sends to each valid recipient with the per-Space From + List-Unsubscribe header, and ledgers them', async () => {
    const r = await sendSpaceCampaign('space-A', {
      campaignId: 'camp-1',
      subject: 'Spring sessions',
      html: '<p>Come practice</p>',
      recipients: recips('a@b.com', 'c@d.com'),
    })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 2, suppressed: 0, failed: 0 })
    expect(sends).toHaveLength(2)
    // per-Space From (brand name on the verified address)
    expect(sends[0]!.from).toMatch(/^River Studio </)
    // RFC 8058 one-click headers present
    expect(sends[0]!.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(sends[0]!.headers!['List-Unsubscribe']).toContain('/unsubscribe?s=space-A')
    // ledger rows written with the resend id + campaign link
    const sentRows = db.outreach.filter((o) => o.status === 'sent')
    expect(sentRows).toHaveLength(2)
    expect(sentRows[0]!.resend_id).toBe('resend-id-xyz')
    expect(sentRows[0]!.campaign_id).toBe('camp-1')
  })

  it('records a provider throw as failed (does not abort the batch)', async () => {
    throwOnSend = true
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com', 'c@d.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 0, suppressed: 0, failed: 2 })
    expect(db.outreach.every((o) => o.status === 'failed')).toBe(true)
  })
})

describe('sendSpaceCampaign: suppression filtering (space + global)', () => {
  it('skips a GLOBALLY suppressed address (logged suppressed, never sent)', async () => {
    globalSuppressed.add('a@b.com')
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com', 'c@d.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 1, suppressed: 1, failed: 0 })
    expect(sends.map((s) => s.to)).toEqual(['c@d.com'])
    expect(db.outreach.find((o) => o.email === 'a@b.com')!.status).toBe('suppressed')
  })

  it('skips an address suppressed for THIS Space', async () => {
    spaceSuppressed.add('space-A:a@b.com')
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com', 'c@d.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 1, suppressed: 1, failed: 0 })
    expect(sends.map((s) => s.to)).toEqual(['c@d.com'])
  })

  it('does NOT skip an address suppressed for a DIFFERENT Space (cross-space isolation)', async () => {
    spaceSuppressed.add('space-B:a@b.com') // suppressed only in B
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 1, suppressed: 0, failed: 0 })
    expect(sends.map((s) => s.to)).toEqual(['a@b.com'])
  })
})

describe('sendSpaceCampaign: daily cap', () => {
  it('refuses to send when the Space is already at the cap', async () => {
    // Seed the cap's worth of today's sends for space-A.
    for (let i = 0; i < DAILY_SEND_CAP; i++) {
      db.outreach.push({
        id: `seed${i}`,
        space_id: 'space-A',
        campaign_id: null,
        contact_id: null,
        email: `seed${i}@x.com`,
        status: 'sent',
        resend_id: 'r',
        error: null,
        created_at: new Date().toISOString(),
      })
    }
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/daily send limit/i)
    expect(sends).toHaveLength(0)
  })

  it('sends only up to the remaining budget', async () => {
    // Seed cap-1 so exactly ONE more may send.
    for (let i = 0; i < DAILY_SEND_CAP - 1; i++) {
      db.outreach.push({
        id: `seed${i}`,
        space_id: 'space-A',
        campaign_id: null,
        contact_id: null,
        email: `seed${i}@x.com`,
        status: 'sent',
        resend_id: 'r',
        error: null,
        created_at: new Date().toISOString(),
      })
    }
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com', 'c@d.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data.sent).toBe(1) // only one slot left
    expect(sends).toHaveLength(1)
  })

  it("a DIFFERENT Space's sends do not count against this Space's cap (isolation)", async () => {
    // Fill space-B to its cap; space-A must still be free to send.
    for (let i = 0; i < DAILY_SEND_CAP; i++) {
      db.outreach.push({
        id: `b${i}`,
        space_id: 'space-B',
        campaign_id: null,
        contact_id: null,
        email: `b${i}@x.com`,
        status: 'sent',
        resend_id: 'r',
        error: null,
        created_at: new Date().toISOString(),
      })
    }
    const r = await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data.sent).toBe(1)
  })

  it("suppressed skips do NOT consume the daily budget count", async () => {
    // Seed exactly cap-1; then one suppressed + one real recipient. The suppressed one must not
    // count, so the real one still sends within budget.
    for (let i = 0; i < DAILY_SEND_CAP - 1; i++) {
      db.outreach.push({
        id: `seed${i}`,
        space_id: 'space-A',
        campaign_id: null,
        contact_id: null,
        email: `seed${i}@x.com`,
        status: 'sent',
        resend_id: 'r',
        error: null,
        created_at: new Date().toISOString(),
      })
    }
    globalSuppressed.add('skip@b.com')
    const r = await sendSpaceCampaign('space-A', {
      subject: 'Hi',
      html: '<p>x</p>',
      recipients: recips('skip@b.com', 'real@b.com'),
    })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.data).toEqual({ sent: 1, suppressed: 1, failed: 0 })
    expect(sends.map((s) => s.to)).toEqual(['real@b.com'])
  })
})

describe('sendSpaceCampaign: cross-space isolation of writes', () => {
  it('writes outreach rows only for the sending Space', async () => {
    await sendSpaceCampaign('space-A', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect(db.outreach.every((o) => o.space_id === 'space-A')).toBe(true)
  })

  it('a caller cannot send for a Space that does not resolve (no leak to another id)', async () => {
    const r = await sendSpaceCampaign('space-Z', { subject: 'Hi', html: '<p>x</p>', recipients: recips('a@b.com') })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toMatch(/not found/i)
    expect(sends).toHaveLength(0)
  })
})
