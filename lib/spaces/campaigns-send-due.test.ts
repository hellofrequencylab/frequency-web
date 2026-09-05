import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCHEDULED SEND JOB (R4). What is locked here, all network-free:
//   1. IDEMPOTENT CLAIM: each due campaign is claimed with a conditional update re-asserting
//      status='scheduled'. A campaign whose claim returns no row (another pass won the race) is NOT
//      sent. Exactly one pass sends a given campaign.
//   2. AUDIENCE + SEND: a claimed campaign resolves its stored audience_filter over the Space's own
//      contacts and delivers via the SYSTEM send seam; success stamps 'sent', an empty audience or a
//      send error stamps 'failed'.
//   3. FAIL-SAFE: a per-campaign error never throws out of the pass.
//   4. LEASE + RESUME (scan2 L6-10): the claim stamps sending_started_at; a 'sending' row whose lease
//      expired is re-claimed and RESUMED, sending only to recipients with no outreach_sends row yet.
//      A fresh 'sending' row is left alone. A failed send records why in send_error.

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
const sentRecipients: { contactId: string; email: string }[][] = []
vi.mock('./email', () => ({
  SPACE_UNSUBSCRIBE_PLACEHOLDER: '%%U%%',
  sendSpaceCampaignSystem: async (spaceId: string, input: { recipients: { contactId: string; email: string }[] }) => {
    sendCalls.push(spaceId)
    sentRecipients.push(input.recipients)
    return sendResult
  },
}))

vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

// GLOBAL Email Studio send seam: a global campaign (root/null space) routes here, not to the per-Space
// system. Track the ids it was called with; default to an ok result.
let globalSendResult: { data: { recipientCount: number } } | { error: string } = { data: { recipientCount: 1 } }
const globalSendCalls: string[] = []
vi.mock('@/lib/email-studio/send', () => ({
  sendCampaignNow: async (id: string) => {
    globalSendCalls.push(id)
    return globalSendResult
  },
}))
// The root-space id used to discriminate global vs per-Space campaigns. Distinct from seed()'s 'space-A'.
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root-space' }))

// In-memory campaigns store + a chainable admin mock that honors the conditional claim.
interface Row {
  id: string
  space_id: string | null
  subject: string
  body: string | null
  status: string
  scheduled_for: string
  audience_filter: unknown
  sending_started_at?: string | null
  send_error?: string | null
}
interface LedgerRow {
  campaign_id: string
  contact_id: string | null
  email: string
  status: string
}
const store: { rows: Row[]; ledger: LedgerRow[]; ledgerError: boolean } = { rows: [], ledger: [], ledgerError: false }
const stamps: { id: string; status: string }[] = []

function campaignsBuilder() {
  let mode: 'select' | 'update' = 'select'
  const eqs: Record<string, string> = {}
  const lts: Record<string, string> = {}
  let staleBefore: string | null = null
  let updatePatch: Record<string, unknown> = {}
  const matches = (r: Row) =>
    r.id === eqs.id &&
    (eqs.status === undefined || r.status === eqs.status) &&
    Object.entries(lts).every(([col, val]) => {
      const cur = (r as unknown as Record<string, string | null | undefined>)[col]
      return typeof cur === 'string' && cur < val
    })
  // Apply a pending update (used by both the claim's maybeSingle and the stamp's awaited eq).
  function applyUpdate(): { id: string } | null {
    const row = store.rows.find(matches)
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
    lt(col: string, val: string) {
      lts[col] = val
      return api
    },
    // The due read's `status.eq.scheduled,and(status.eq.sending,sending_started_at.lt.<iso>)`.
    or(filters: string) {
      staleBefore = /sending_started_at\.lt\.([^)]+)\)/.exec(filters)?.[1] ?? null
      return api
    },
    lte() {
      return api
    },
    order() {
      return api
    },
    limit() {
      // terminal for the due-list read: scheduled, plus a 'sending' row whose lease is stale
      const due = store.rows.filter(
        (r) =>
          r.status === 'scheduled' ||
          (r.status === 'sending' &&
            staleBefore !== null &&
            typeof r.sending_started_at === 'string' &&
            r.sending_started_at < staleBefore),
      )
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

// The outreach_sends ledger the RESUME path reads: rows for one campaign, any status but 'failed'.
function ledgerBuilder() {
  const eqs: Record<string, string> = {}
  const neqs: Record<string, string> = {}
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqs[col] = val
      return api
    },
    neq(col: string, val: string) {
      neqs[col] = val
      return api
    },
    range(from: number, to: number) {
      if (store.ledgerError) return Promise.resolve({ data: null, error: { message: 'ledger down' } })
      const rows = store.ledger
        .filter((r) => r.campaign_id === eqs.campaign_id && (neqs.status === undefined || r.status !== neqs.status))
        .slice(from, to + 1)
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      if (t === 'outreach_sends') return ledgerBuilder()
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
import { SENDING_LEASE_MS } from '@/lib/messaging/status'

const STALE = new Date(Date.now() - SENDING_LEASE_MS - 60_000).toISOString()
const FRESH = new Date(Date.now() - 60_000).toISOString()

beforeEach(() => {
  store.rows = []
  store.ledger = []
  store.ledgerError = false
  stamps.length = 0
  sendCalls.length = 0
  sentRecipients.length = 0
  globalSendCalls.length = 0
  globalSendResult = { data: { recipientCount: 1 } }
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

  it('the claim stamps the lease (sending_started_at) and clears send_error', async () => {
    const row = seed({ send_error: 'an old failure' })
    sendResult = { error: 'kill switch off' } // stop after the claim so the stamp is observable
    await sendDueCampaigns()
    expect(typeof row.sending_started_at).toBe('string')
    expect(new Date(row.sending_started_at as string).getTime()).toBeGreaterThan(Date.now() - 5_000)
    expect(row.status).toBe('failed')
    expect(row.send_error).toBe('kill switch off') // the failure is recorded, not just logged
  })

  it('a stale sending row is re-claimed and RESUMED without re-sending to recipients already in the ledger', async () => {
    const row = seed({ status: 'sending', sending_started_at: STALE })
    audience = [
      { contactId: 'c1', email: 'a@x.com' },
      { contactId: 'c2', email: 'b@x.com' },
      { contactId: 'c3', email: 'c@x.com' },
    ]
    store.ledger = [
      { campaign_id: 'cmp-1', contact_id: 'c1', email: 'a@x.com', status: 'sent' },
      { campaign_id: 'cmp-1', contact_id: null, email: 'B@x.com', status: 'queued' }, // matched by email
      { campaign_id: 'cmp-1', contact_id: 'c3', email: 'c@x.com', status: 'failed' }, // retried
    ]
    const res = await sendDueCampaigns()
    expect(res.due).toBe(1)
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(1)
    expect(sentRecipients).toEqual([[{ contactId: 'c3', email: 'c@x.com' }]])
    expect(row.status).toBe('sent')
    expect(row.sending_started_at as string > STALE).toBe(true) // the lease was re-stamped
  })

  it('a stale sending row whose fan-out had finished is stamped sent without sending', async () => {
    const row = seed({ status: 'sending', sending_started_at: STALE })
    store.ledger = [{ campaign_id: 'cmp-1', contact_id: 'c1', email: 'a@x.com', status: 'sent' }]
    const res = await sendDueCampaigns()
    expect(res.sent).toBe(1)
    expect(sendCalls).toEqual([])
    expect(row.status).toBe('sent')
  })

  it('a FRESH sending row (a live sender) is left alone', async () => {
    const row = seed({ status: 'sending', sending_started_at: FRESH })
    const res = await sendDueCampaigns()
    expect(res.due).toBe(0)
    expect(sendCalls).toEqual([])
    expect(row.status).toBe('sending')
  })

  it('a sending row with no lease (claimed before the column existed) is not re-claimed', async () => {
    const row = seed({ status: 'sending', sending_started_at: null })
    const res = await sendDueCampaigns()
    expect(res.due).toBe(0)
    expect(row.status).toBe('sending')
  })

  it('an unreadable ledger on resume sends NOTHING and leaves the row for the next lease', async () => {
    const row = seed({ status: 'sending', sending_started_at: STALE })
    store.ledgerError = true
    const res = await sendDueCampaigns()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(0)
    expect(res.failed).toBe(0)
    expect(sendCalls).toEqual([])
    expect(row.status).toBe('sending')
  })

  it('a stale GLOBAL sending row is not fed to the Email Studio sender (it owns its own claim)', async () => {
    seed({ space_id: null, status: 'sending', sending_started_at: STALE })
    const res = await sendDueCampaigns()
    expect(globalSendCalls).toEqual([])
    expect(res.claimed).toBe(0)
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

  it('routes a GLOBAL campaign (null space) to the Email Studio sender, not the per-Space seam', async () => {
    seed({ space_id: null })
    const res = await sendDueCampaigns()
    expect(globalSendCalls).toEqual(['cmp-1']) // sent via sendCampaignNow
    expect(sendCalls).toEqual([]) // NOT the per-Space system seam
    expect(res.sent).toBe(1)
  })

  it('routes a GLOBAL campaign (root space) to the Email Studio sender', async () => {
    seed({ space_id: 'root-space' })
    const res = await sendDueCampaigns()
    expect(globalSendCalls).toEqual(['cmp-1'])
    expect(sendCalls).toEqual([])
    expect(res.sent).toBe(1)
  })

  it('a GLOBAL send error counts as failed (does not throw)', async () => {
    seed({ space_id: null })
    globalSendResult = { error: 'gate blocked' }
    const res = await sendDueCampaigns()
    expect(res.failed).toBe(1)
    expect(res.sent).toBe(0)
  })

  it('still routes a per-Space campaign (non-root space) to the per-Space seam', async () => {
    const row = seed({ space_id: 'space-A' })
    const res = await sendDueCampaigns()
    expect(sendCalls).toEqual(['space-A'])
    expect(globalSendCalls).toEqual([])
    expect(res.sent).toBe(1)
    expect(row.status).toBe('sent')
  })
})
