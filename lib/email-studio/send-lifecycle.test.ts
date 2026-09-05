import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// scan2 L5-04 (2026-09-05): sendCampaignNow must NEVER return with the row still at 'sending'.
//
// Before the fix the final `update({ status: 'sent' })` discarded its result, so a failed write returned
// `ok` while the list showed "sending" and the row could never be re-sent (a 'sending' row is refused,
// and the state machine has no edge out of it). A loop failure reset the status silently and threw away
// the count of emails already queued. These tests drive the real sendCampaignNow over an in-memory
// campaigns row whose update chain applies its patch at await-time, like PostgREST, and read the row back.

type CampaignRow = Record<string, unknown>
let row: CampaignRow
/** Every update patch applied to the campaigns row, in order. */
let updates: CampaignRow[]
/** Inject a failure for an update whose patch satisfies the predicate. */
let failUpdateWhen: ((patch: CampaignRow) => boolean) | null

function from(table: string) {
  type Filter = { col: string; value: unknown }
  const filters: Filter[] = []
  let op: 'select' | 'update' = 'select'
  let patch: CampaignRow | null = null
  let selectCols: string | null = null
  let wantRows = false
  let single = false

  const matches = () => filters.every((f) => (f.col === 'id' ? row.id === f.value : row[f.col] === f.value))

  const api = {
    select: (cols?: string) => {
      if (op === 'update') wantRows = true
      else selectCols = cols ?? '*'
      return api
    },
    update: (p: CampaignRow) => {
      op = 'update'
      patch = p
      return api
    },
    eq: (col: string, value: unknown) => {
      filters.push({ col, value })
      return api
    },
    in: () => api,
    order: () => api,
    limit: () => api,
    maybeSingle: () => {
      single = true
      return api
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      try {
        if (table === 'contacts') return Promise.resolve({ data: [], error: null }).then(resolve)
        if (table !== 'campaigns') throw new Error(`unexpected table ${table}`)
        if (op === 'update') {
          if (failUpdateWhen && failUpdateWhen(patch!)) {
            return Promise.resolve({ data: null, error: { message: 'simulated write failure' } }).then(resolve)
          }
          const hit = matches()
          if (hit) {
            Object.assign(row, patch)
            updates.push({ ...patch })
          }
          return Promise.resolve({ data: wantRows ? (hit ? [{ id: row.id }] : []) : null, error: null }).then(resolve)
        }
        // select
        const cols = (selectCols ?? '*').split(',').map((c) => c.trim())
        const data: CampaignRow = {}
        for (const c of cols) data[c] = row[c] ?? null
        return Promise.resolve({ data: single ? data : [data], error: null }).then(resolve)
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e)
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

const enqueueEmail = vi.fn()
vi.mock('@/lib/email', () => ({
  enqueueEmail: (...a: unknown[]) => enqueueEmail(...a),
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/studio/campaigns', () => ({
  resolveSegment: async () => [
    { contactId: 'c1', email: 'one@example.test', profileId: 'p1' },
    { contactId: 'c2', email: 'two@example.test', profileId: 'p2' },
    { contactId: 'c3', email: 'three@example.test', profileId: 'p3' },
  ],
  sendCategoryForSegment: () => 'lifecycle',
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/lib/queue/outbox', () => ({ bulkRunAfter: () => new Date() }))
vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildUnsubscribeUrl: () => 'https://x.test/unsubscribe?t=1',
  buildSpaceUnsubscribeUrl: () => 'https://x.test/unsubscribe?s=1',
  buildManageEmailsUrl: () => 'https://x.test/manage?t=1',
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root-space' }))
vi.mock('@/lib/outbound/approvals', () => ({ assertApproved: async () => undefined }))
vi.mock('@/lib/comms/conversations', () => ({
  openOrGetConversation: vi.fn(),
  appendConversationMessage: vi.fn(),
  newConversationMessageId: () => '<m@x.test>',
}))
vi.mock('@/lib/comms/reply-address', () => ({
  buildConversationReplyAddress: () => 'reply+1-x@reply.test',
  conversationSigningAvailable: () => true,
}))
vi.mock('./product-block', () => ({
  resolveProductRefs: async (layout: unknown) => layout,
  productVarsFromLayout: () => ({}),
}))

import { sendCampaignNow, sendStoppedCopy, sentUnrecordedCopy } from './send'
import { SENDING_LEASE_MS } from '@/lib/messaging/status'

function freshRow(over: CampaignRow = {}): CampaignRow {
  return {
    id: 'camp-1',
    subject: 'Hello {{contact.first_name}}',
    preheader: '',
    block_json: { rows: [] },
    segment: 'members',
    status: 'draft',
    phase_id: null,
    sent_at: null,
    scheduled_for: null,
    recipient_count: 0,
    from_name: null,
    from_address: null,
    reply_mode: 'broadcast',
    created_by: null,
    sending_started_at: null,
    send_error: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  row = freshRow()
  updates = []
  failUpdateWhen = null
  enqueueEmail.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('sendCampaignNow never leaves a campaign at sending', () => {
  it('a sender that throws after two recipients leaves status failed with recipient_count 2 and the error', async () => {
    enqueueEmail
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('provider down'))

    const res = await sendCampaignNow('camp-1')

    expect('error' in res).toBe(true)
    expect(row.status).toBe('failed')
    expect(row.recipient_count).toBe(2)
    expect(row.send_error).toBe('provider down')
    expect(row.sent_at).toBeNull()
    // The claim stamped the lease, the failure cleared nothing it should not have.
    expect(typeof row.sending_started_at).toBe('string')
    // The operator copy says how many were queued and that the row is marked failed.
    const message = (res as { error: string }).error
    expect(message).toBe(sendStoppedCopy(2, true))
    expect(message).toContain('2 emails were queued')
    expect(message).toContain('marked failed')
    expect(message).not.toMatch(/[\u2013\u2014]/)
  })

  it('a send that stops before any email keeps the count at 0 and still records failed', async () => {
    enqueueEmail.mockRejectedValue(new Error('boom'))
    const res = await sendCampaignNow('camp-1')
    expect(row.status).toBe('failed')
    expect(row.recipient_count).toBe(0)
    expect((res as { error: string }).error).toBe(sendStoppedCopy(0, true))
  })

  it('success moves the row to sent with the recipient count', async () => {
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 3 } })
    expect(row.status).toBe('sent')
    expect(row.recipient_count).toBe(3)
    expect(typeof row.sent_at).toBe('string')
    expect(enqueueEmail).toHaveBeenCalledTimes(3)
  })

  it('a failed "sent" write is NOT reported as ok, and the row is moved to failed instead of staying at sending', async () => {
    failUpdateWhen = (p) => p.status === 'sent'
    const res = await sendCampaignNow('camp-1')
    expect('error' in res).toBe(true)
    expect(row.status).toBe('failed')
    expect(row.status).not.toBe('sending')
    expect(row.recipient_count).toBe(3)
    expect(String(row.send_error)).toContain('could not record the sent status')
    expect((res as { error: string }).error).toBe(sentUnrecordedCopy(3, true))
    expect((res as { error: string }).error).toContain('Do not send it again')
  })

  it('when even the failed write fails, the operator is told the row may still show as sending', async () => {
    failUpdateWhen = (p) => p.status === 'sent' || p.status === 'failed'
    const res = await sendCampaignNow('camp-1')
    expect((res as { error: string }).error).toBe(sentUnrecordedCopy(3, false))
    expect((res as { error: string }).error).toContain('may still show as sending')
  })
})

describe('the "already sending" refusal is reachable only while a send is genuinely in flight', () => {
  it('a sending row with a live lease is refused, and nothing is enqueued', async () => {
    row = freshRow({ status: 'sending', sending_started_at: new Date(Date.now() - 60_000).toISOString() })
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ error: 'This campaign is already sending.' })
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(row.status).toBe('sending')
  })

  it('a sending row with NO lease stamp (pre-migration) is refused: fail closed', async () => {
    row = freshRow({ status: 'sending', sending_started_at: null })
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ error: 'This campaign is already sending.' })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('a sending row whose lease expired is re-claimed and sent', async () => {
    row = freshRow({ status: 'sending', sending_started_at: new Date(Date.now() - SENDING_LEASE_MS - 1000).toISOString() })
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 3 } })
    expect(row.status).toBe('sent')
    // The re-claim was a conditional update on status = 'sending', not a bare write.
    expect(updates[0]).toEqual({ status: 'sending' })
  })

  it('the claim stamps the lease and clears a previous error', async () => {
    row = freshRow({ status: 'failed', send_error: 'old failure' })
    await sendCampaignNow('camp-1')
    const stamp = updates.find((u) => 'sending_started_at' in u)
    expect(stamp).toBeDefined()
    expect(stamp!.send_error).toBeNull()
    expect(row.status).toBe('sent')
  })
})
