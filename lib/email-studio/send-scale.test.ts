import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The 585 person launch send (2026-11-12) queued recipients one at a time at ~1 a second, died at the
// 5 minute function limit 300 people in, and the scheduled-send cron skipped the stranded 'sending' row.
// These drive the real sendCampaignNow over an in-memory campaigns row and send ledger with a 450
// person audience and lock the properties that make 10,000+ send without anyone pressing anything:
//   • the audience is queued in CHUNKS (one insert per chunk, not one per person),
//   • a run that runs out of time hands the rest to the next run and nobody is queued twice,
//   • an abandoned 'sending' row (a killed function) resumes, and only while its lease is still expired,
//   • a pause between chunks wins over the handoff.

type CampaignRow = Record<string, unknown>
let row: CampaignRow
/** Every update patch applied to the campaigns row, in order. */
let updates: CampaignRow[]
/** The outreach_sends ledger: one row per recipient this campaign has been queued to (LIVE-172). */
let ledger: { campaign_id: string; contact_id: string | null; email: string; status: string; resend_id?: string | null }[]
/** Make the ledger READ fail, so the fail-closed re-send path can be driven. */
let failLedgerRead: boolean

function from(table: string) {
  type Filter = { col: string; value: unknown }
  const filters: Filter[] = []
  const notFilters: Filter[] = []
  let inserted: Record<string, unknown>[] | null = null
  let op: 'select' | 'update' = 'select'
  let patch: CampaignRow | null = null
  let selectCols: string | null = null
  let wantRows = false
  let single = false

  const ltFilters: Filter[] = []
  const matches = () =>
    filters.every((f) => (f.col === 'id' ? row.id === f.value : row[f.col] === f.value)) &&
    ltFilters.every((f) => typeof row[f.col] === 'string' && (row[f.col] as string) < (f.value as string))

  const api = {
    select: (cols?: string) => {
      if (op === 'update') wantRows = true
      else selectCols = cols ?? '*'
      return api
    },
    // outreach_sends only: the ledger read is `.select().eq().neq().range()` and the write is
    // `.insert([row])`, so the in-memory table answers both (LIVE-172).
    neq: (col: string, value: unknown) => {
      notFilters.push({ col, value })
      return api
    },
    range: () => api,
    insert: (rows: Record<string, unknown>[]) => {
      inserted = rows
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
    lt: (col: string, value: unknown) => {
      ltFilters.push({ col, value })
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
        if (table === 'outreach_sends') {
          if (inserted) {
            for (const r of inserted) {
              ledger.push({
                campaign_id: String(r.campaign_id),
                contact_id: (r.contact_id as string) ?? null,
                email: String(r.email),
                status: String(r.status),
                resend_id: (r.resend_id as string | undefined) ?? null,
              })
            }
            return Promise.resolve({ data: null, error: null }).then(resolve)
          }
          if (failLedgerRead) {
            return Promise.resolve({ data: null, error: { message: 'ledger unreadable' } }).then(resolve)
          }
          const rows = ledger
            .filter((l) => filters.every((f) => (l as unknown as Record<string, unknown>)[f.col] === f.value))
            .filter((l) => notFilters.every((f) => (l as unknown as Record<string, unknown>)[f.col] !== f.value))
            .map((l) => ({ contact_id: l.contact_id, email: l.email }))
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        }
        if (table !== 'campaigns') throw new Error(`unexpected table ${table}`)
        if (op === 'update') {
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


const AUDIENCE = Array.from({ length: 450 }, (_, i) => ({
  contactId: `c${i}`,
  email: `person${i}@example.test`,
  profileId: `p${i}`,
}))

/** Every email ever handed to the outbox, in order, with the size of the batch it rode in. */
let queued: { to: string; batch: number; dedupeKey?: string }[]
/** The outbox dedupe keys already taken, like the partial unique index: a repeat is not queued again. */
let takenKeys: Set<string>
const batchSizes: number[] = []

vi.mock('@/lib/email', () => ({
  enqueueEmail: async () => {
    throw new Error('the fan-out must queue in batches, not one recipient at a time')
  },
  enqueueEmailBatch: async (items: { payload: { to: string }; dedupeKey?: string }[]) => {
    batchSizes.push(items.length)
    let enqueued = 0
    for (const it of items) {
      if (it.dedupeKey && takenKeys.has(it.dedupeKey)) continue
      if (it.dedupeKey) takenKeys.add(it.dedupeKey)
      queued.push({ to: it.payload.to, batch: items.length, dedupeKey: it.dedupeKey })
      enqueued++
    }
    return { enqueued, duplicates: items.length - enqueued }
  },
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/studio/campaigns', () => ({
  resolveSegment: async () => AUDIENCE,
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
vi.mock('./data-blocks', () => ({ resolveDataBlockRefs: async (layout: unknown) => layout }))
// EMAIL-076: the broadcast path. Off unless a test sets EMAIL_BROADCASTS_ENABLED; the provider call is a spy.
const broadcastCalls = vi.hoisted(() => [] as { recipients: { email: string }[]; html: string; subject: string }[])
const broadcastFails = vi.hoisted(() => ({ value: false }))
vi.mock('./broadcast', async (importOriginal) => {
  const real = await importOriginal<typeof import('./broadcast')>()
  return {
    ...real,
    sendCampaignAsBroadcast: async (input: { recipients: { email: string }[]; html: string; subject: string }) => {
      if (broadcastFails.value) throw new Error('resend refused the broadcast')
      broadcastCalls.push(input)
      return { broadcastId: 'bc_1', existing: false }
    },
  }
})

// EMAIL-084: the weekly marketing slot. Every person gets a slot unless a test marks them as already mailed this week.
const capState = vi.hoisted(() => ({ cappedEmails: new Set<string>(), reserved: [] as string[], released: [] as string[] }))
vi.mock('./campaign-cap', () => ({
  reserveCampaignSend: async (_db: unknown, input: { email: string }) => {
    if (capState.cappedEmails.has(input.email)) return false
    capState.reserved.push(input.email)
    return true
  },
  releaseCampaignSends: async (_db: unknown, _id: string, emails: string[]) => {
    capState.released.push(...emails)
  },
}))

import { sendCampaignNow } from './send'
import { FAN_OUT_CHUNK } from './fan-out'
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
  ledger = []
  failLedgerRead = false
  queued = []
  takenKeys = new Set()
  batchSizes.length = 0
  broadcastCalls.length = 0
  broadcastFails.value = false
  delete process.env.EMAIL_BROADCASTS_ENABLED
  capState.cappedEmails.clear()
  capState.reserved.length = 0
  capState.released.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const unique = (xs: string[]) => new Set(xs).size

describe('a large send', () => {
  it('queues the audience in chunks, once each, and lands sent', async () => {
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 450 } })
    expect(row.status).toBe('sent')
    expect(row.recipient_count).toBe(450)
    // 450 people = 5 inserts, not 450 (the per-recipient loop was the 1 a second bottleneck).
    expect(batchSizes).toEqual([FAN_OUT_CHUNK, FAN_OUT_CHUNK, FAN_OUT_CHUNK, FAN_OUT_CHUNK, 50])
    expect(unique(queued.map((q) => q.to))).toBe(450)
    expect(ledger).toHaveLength(450)
    // Every email carries a per-recipient dedupe key, so a resumed run cannot queue anyone twice.
    expect(queued.every((q) => q.dedupeKey?.startsWith('campaign:camp-1:'))).toBe(true)
  })

  it('out of time: hands the rest to the next run (scheduled, due now), and the next run sends only the rest', async () => {
    let calls = 0
    const res = await sendCampaignNow('camp-1', { exhausted: () => ++calls > 1 })

    // Two chunks went out, then the clock was spent.
    expect(res).toEqual({ data: { recipientCount: 2 * FAN_OUT_CHUNK, complete: false } })
    expect(row.status).toBe('scheduled')
    expect(row.recipient_count).toBe(2 * FAN_OUT_CHUNK)
    expect(row.sent_at).toBeNull()
    expect(new Date(row.scheduled_for as string).getTime()).toBeLessThanOrEqual(Date.now())
    expect(ledger).toHaveLength(2 * FAN_OUT_CHUNK)

    // The cron's next pass picks the 'scheduled' row up and finishes it.
    const second = await sendCampaignNow('camp-1')
    expect(second).toEqual({ data: { recipientCount: 450 - 2 * FAN_OUT_CHUNK } })
    expect(row.status).toBe('sent')
    expect(row.recipient_count).toBe(450)
    // Nobody twice, nobody missed.
    expect(queued).toHaveLength(450)
    expect(unique(queued.map((q) => q.to))).toBe(450)
  })

  it('a send can be handed off many times and still reaches everyone exactly once', async () => {
    let status: unknown = null
    for (let pass = 0; pass < 10 && status !== 'sent'; pass++) {
      let first = true
      await sendCampaignNow('camp-1', { exhausted: () => (first ? ((first = false), false) : true) })
      status = row.status
    }
    expect(row.status).toBe('sent')
    expect(queued).toHaveLength(450)
    expect(unique(queued.map((q) => q.to))).toBe(450)
  })

  it('a pause between chunks wins over the handoff and stops the fan-out', async () => {
    let calls = 0
    const res = await sendCampaignNow('camp-1', {
      exhausted: () => {
        // The operator presses Pause during the first chunk.
        if (++calls === 1) row.status = 'paused'
        return true
      },
    })
    expect('error' in res).toBe(false)
    expect(row.status).toBe('paused')
    expect(queued.length).toBeLessThan(450)
  })

  it('a function killed mid-send (status sending, lease expired) is resumed without repeating anyone', async () => {
    // The killed run got 300 people out and wrote their ledger rows + dedupe keys, then died.
    for (const r of AUDIENCE.slice(0, 300)) {
      ledger.push({ campaign_id: 'camp-1', contact_id: r.contactId, email: r.email, status: 'queued' })
      takenKeys.add(`campaign:camp-1:${r.contactId}`)
    }
    row = freshRow({
      status: 'sending',
      recipient_count: 300,
      sending_started_at: new Date(Date.now() - SENDING_LEASE_MS - 60_000).toISOString(),
    })
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 150 } })
    expect(row.status).toBe('sent')
    expect(row.recipient_count).toBe(450)
    expect(queued.map((q) => q.to)).toEqual(AUDIENCE.slice(300).map((r) => r.email))
  })

  it('a live sender (fresh lease) is never taken over', async () => {
    row = freshRow({ status: 'sending', sending_started_at: new Date().toISOString() })
    const res = await sendCampaignNow('camp-1')
    expect('error' in res).toBe(true)
    expect(queued).toHaveLength(0)
  })

  it('an interrupted chunk (queued, ledger row never written) is not queued twice on the next run', async () => {
    // The previous run queued chunk 1 but died before its ledger rows landed: the outbox dedupe key is
    // the second line of defence.
    for (const r of AUDIENCE.slice(0, FAN_OUT_CHUNK)) takenKeys.add(`campaign:camp-1:${r.contactId}`)
    row = freshRow({ status: 'failed', recipient_count: 0 })
    await sendCampaignNow('camp-1')
    expect(row.status).toBe('sent')
    expect(unique(queued.map((q) => q.to))).toBe(450 - FAN_OUT_CHUNK)
  })
})

describe('EMAIL-076: sent as one Resend broadcast when EMAIL_BROADCASTS_ENABLED is on', () => {
  it('hands the whole gated audience to one broadcast, queues nothing on the outbox, and lands sent', async () => {
    process.env.EMAIL_BROADCASTS_ENABLED = '1'
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 450 } })
    expect(queued).toEqual([])
    expect(broadcastCalls).toHaveLength(1)
    expect(unique(broadcastCalls[0].recipients.map((r) => r.email))).toBe(450)
    // One html for everyone: Resend fills the opt-out link and the name in per recipient.
    expect(broadcastCalls[0].html).toContain('{{{RESEND_UNSUBSCRIBE_URL}}}')
    expect(broadcastCalls[0].html).toContain('{{{contact.manage_url}}}')
    // The subject is static, so an inbox list never shows a raw placeholder.
    expect(broadcastCalls[0].subject).toBe('Hello there')
    expect(row.status).toBe('sent')
    expect(ledger).toHaveLength(450)
    // EMAIL-077: every ledger row carries the broadcast id, so the webhook can attribute its events.
    expect(ledger.every((l) => l.resend_id === 'bc_1' && l.status === 'sent')).toBe(true)
  })

  it('a provider refusal records the campaign failed (re-sendable), never sent', async () => {
    process.env.EMAIL_BROADCASTS_ENABLED = '1'
    broadcastFails.value = true
    const res = await sendCampaignNow('camp-1')
    expect('error' in res).toBe(true)
    expect(row.status).toBe('failed')
    expect(row.sent_at).toBeNull()
    expect(queued).toEqual([])
  })

  it('switch off: the outbox path runs exactly as before', async () => {
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 450 } })
    expect(broadcastCalls).toEqual([])
    expect(queued).toHaveLength(450)
  })
})

// EMAIL-084 (Daniel, 2026-11-19, "One per 7 days"): one marketing email per person per rolling week.
describe('the weekly marketing limit (EMAIL-084)', () => {
  it('skips everyone who already had a campaign this week and sends to the rest', async () => {
    for (let i = 0; i < 450; i += 3) capState.cappedEmails.add(`person${i}@example.test`)
    const res = await sendCampaignNow('camp-1')
    expect(res).toEqual({ data: { recipientCount: 300 } })
    expect(queued.some((q) => capState.cappedEmails.has(q.to))).toBe(false)
    expect(capState.reserved).toHaveLength(300)
  })

  it('a chunk that fails to queue gives its weekly slots back', async () => {
    const email = await import('@/lib/email')
    vi.spyOn(email, 'enqueueEmailBatch').mockRejectedValueOnce(new Error('outbox down'))
    await sendCampaignNow('camp-1')
    expect(capState.released).toHaveLength(FAN_OUT_CHUNK)
  })

  it('the broadcast path skips capped people too, and a refused broadcast gives every slot back', async () => {
    process.env.EMAIL_BROADCASTS_ENABLED = '1'
    capState.cappedEmails.add('person0@example.test')
    await sendCampaignNow('camp-1')
    expect(broadcastCalls[0].recipients.some((r) => r.email === 'person0@example.test')).toBe(false)
    expect(broadcastCalls[0].recipients).toHaveLength(449)

    row = freshRow()
    ledger = []
    capState.reserved.length = 0
    broadcastFails.value = true
    await sendCampaignNow('camp-1')
    expect(capState.released.sort()).toEqual([...capState.reserved].sort())
  })
})
