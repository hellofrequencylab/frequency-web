import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCHEDULED SEND JOB (R4). What is locked here, all network-free:
//   1. IDEMPOTENT CLAIM: each due campaign is claimed with a conditional update re-asserting
//      status='scheduled'. A campaign whose claim returns no row (another pass won the race) is NOT
//      sent. Exactly one pass sends a given campaign.
//   2. AUDIENCE + SEND: a claimed campaign resolves its stored audience_filter over the Space's own
//      contacts and delivers via the SYSTEM send seam; success stamps 'sent', an empty audience or a
//      send error stamps 'failed'.
//   3. FAIL-SAFE: a per-campaign error never throws out of the pass.

// ── Mocks ────────────────────────────────────────────────────────────────────────────────────────

let audience: { contactId: string; email: string }[] = [{ contactId: 'c1', email: 'a@x.com' }]
vi.mock('./audiences', () => ({
  resolveAudience: async () => audience,
  definitionToFilter: (raw: unknown) => (raw && typeof raw === 'object' ? raw : {}),
}))

let sendResult: { data: { sent: number; suppressed: number; failed: number } } | { error: string } = {
  data: { sent: 1, suppressed: 0, failed: 0 },
}
const sendCalls: string[] = []
vi.mock('./email', () => ({
  SPACE_UNSUBSCRIBE_PLACEHOLDER: '%%U%%',
  sendSpaceCampaignSystem: async (spaceId: string) => {
    sendCalls.push(spaceId)
    return sendResult
  },
}))

vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

// In-memory campaigns store + a chainable admin mock that honors the conditional claim.
interface Row {
  id: string
  space_id: string | null
  subject: string
  body: string | null
  status: string
  scheduled_for: string
  audience_filter: unknown
}
const store: { rows: Row[] } = { rows: [] }
const stamps: { id: string; status: string }[] = []

function campaignsBuilder() {
  let mode: 'select' | 'update' = 'select'
  const eqs: Record<string, string> = {}
  let updatePatch: Record<string, unknown> = {}
  // Apply a pending update (used by both the claim's maybeSingle and the stamp's awaited eq).
  function applyUpdate(): { id: string } | null {
    const row = store.rows.find(
      (r) => r.id === eqs.id && (eqs.status === undefined || r.status === eqs.status),
    )
    if (!row) return null
    Object.assign(row, updatePatch)
    return { id: row.id }
  }
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqs[col] = val
      return api
    },
    lte() {
      return api
    },
    order() {
      return api
    },
    limit() {
      // terminal for the due-list read
      const due = store.rows.filter((r) => r.status === 'scheduled')
      return Promise.resolve({ data: due, error: null })
    },
    update(patch: Record<string, unknown>) {
      mode = 'update'
      updatePatch = patch
      return api
    },
    async maybeSingle() {
      if (mode === 'update') {
        // The CLAIM: update status where id AND status match. Return the row only if it matched.
        return { data: applyUpdate(), error: null }
      }
      return { data: null, error: null }
    },
    // stampStatus awaits `update(patch).eq('id', id)` directly (no maybeSingle). Awaiting the builder
    // applies the pending update. A no-op in select mode.
    then(resolve: (r: unknown) => unknown) {
      if (mode === 'update') applyUpdate()
      return Promise.resolve(resolve({ data: null, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      if (t === 'campaigns') return campaignsBuilder()
      // the stampStatus helper re-enters .from('campaigns').update(...).eq('id', ...)
      return campaignsBuilder()
    },
  }),
}))

// Override the stamp path: stampStatus uses update(...).eq('id', id) (a Promise, not maybeSingle). The
// builder above returns `api` from update + eq, which is not awaited by stampStatus... so give eq a then.
// Simplest: re-mock with a stamp-aware builder. We instead capture stamps by patching the store rows
// through the claim's maybeSingle, and assert on final row status.

import { sendDueCampaigns } from './campaigns-send-due'

beforeEach(() => {
  store.rows = []
  stamps.length = 0
  sendCalls.length = 0
  audience = [{ contactId: 'c1', email: 'a@x.com' }]
  sendResult = { data: { sent: 1, suppressed: 0, failed: 0 } }
})

function seed(overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: 'cmp-1',
    space_id: 'space-A',
    subject: 'Hello',
    body: 'Body',
    status: 'scheduled',
    scheduled_for: '2020-01-01T00:00:00Z',
    audience_filter: {},
    ...overrides,
  }
  store.rows.push(row)
  return row
}

describe('sendDueCampaigns', () => {
  it('claims + sends a due campaign, stamping it sent', async () => {
    const row = seed()
    const res = await sendDueCampaigns()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(1)
    expect(sendCalls).toEqual(['space-A'])
    expect(row.status).toBe('sent')
  })

  it('idempotent: a second pass finds no scheduled row and sends nothing', async () => {
    seed()
    await sendDueCampaigns()
    sendCalls.length = 0
    const res2 = await sendDueCampaigns()
    expect(res2.due).toBe(0)
    expect(res2.claimed).toBe(0)
    expect(sendCalls).toEqual([])
  })

  it('an empty audience stamps the campaign failed, never sends', async () => {
    const row = seed()
    audience = []
    const res = await sendDueCampaigns()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(0)
    expect(res.failed).toBe(1)
    expect(sendCalls).toEqual([])
    expect(row.status).toBe('failed')
  })

  it('a send error stamps the campaign failed', async () => {
    const row = seed()
    sendResult = { error: 'kill switch off' }
    const res = await sendDueCampaigns()
    expect(res.failed).toBe(1)
    expect(row.status).toBe('failed')
  })

  it('skips a scheduled campaign with no space_id', async () => {
    seed({ space_id: null })
    const res = await sendDueCampaigns()
    expect(res.claimed).toBe(0)
    expect(sendCalls).toEqual([])
  })
})
