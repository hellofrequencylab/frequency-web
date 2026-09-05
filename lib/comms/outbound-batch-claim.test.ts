import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// scan2 L6-05 (2026-09-05): flushConversationBatches used to read every `queued` outbound message, enqueue
// one email per conversation, and only THEN mark the rows sent — no claim in between, and enqueueEmail has
// no dedupe key — so two overlapping cron runs emailed the external contact the same burst twice. The fix
// claims each burst row-by-row (a conditional UPDATE on `metadata`) before anything is enqueued; only a run
// holding every row sends. These tests drive two flushes over ONE in-memory comms_messages table whose
// update chain applies its patch at await-time, exactly like PostgREST's per-row conditional UPDATE.

type Row = {
  id: string
  conversation_id: string
  direction: string
  delivery_status: string
  body: string
  body_html: string | null
  occurred_at: string
  metadata: Record<string, unknown>
  external_message_id?: string | null
}

let rows: Row[] = []
const sent: { to: string; text: string; messageId: string }[] = []
const warnings: string[] = []

/** A tiny PostgREST-shaped fake: filters accumulate, the operation runs when the chain is awaited. */
function from(table: string) {
  if (table !== 'comms_messages') throw new Error(`unexpected table ${table}`)
  type Pred = (r: Row) => boolean
  const preds: Pred[] = []
  let op: 'select' | 'update' = 'select'
  let patch: Partial<Row> | null = null
  let wantRows = false

  const jsonText = (r: Row, path: string) => {
    const key = path.replace('metadata->>', '')
    const v = r.metadata?.[key]
    return v === undefined || v === null ? null : String(v)
  }
  const col = (r: Row, c: string) => (c.startsWith('metadata->>') ? jsonText(r, c) : (r as Record<string, unknown>)[c])

  const api = {
    select: () => {
      wantRows = true
      return api
    },
    update: (p: Partial<Row>) => {
      op = 'update'
      patch = p
      return api
    },
    eq: (c: string, v: unknown) => {
      preds.push((r) => col(r, c) === v)
      return api
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.includes(col(r, c)))
      return api
    },
    or: (expr: string) => {
      // "<col>.is.null,<col>.lt.<value>" — the two shapes the claim uses.
      const alts = expr.split(',').map((part) => {
        const [c, opName, ...rest] = part.split('.')
        const val = rest.join('.')
        if (opName === 'is' && val === 'null') return (r: Row) => col(r, c) === null || col(r, c) === undefined
        if (opName === 'lt') return (r: Row) => String(col(r, c)) < val
        throw new Error(`unsupported or() clause: ${part}`)
      })
      preds.push((r) => alts.some((a) => a(r)))
      return api
    },
    order: () => api,
    limit: () => api,
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      try {
        const matched = rows.filter((r) => preds.every((p) => p(r)))
        if (op === 'update') for (const r of matched) Object.assign(r, patch)
        const data = op === 'select' || wantRows ? matched.map((r) => ({ ...r })) : null
        return Promise.resolve({ data, error: null }).then(resolve)
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => from(t) }) }))
vi.mock('@/lib/email', () => ({
  enqueueEmail: async (p: { to: string; text: string; headers?: Record<string, string> }) => {
    sent.push({ to: p.to, text: p.text, messageId: p.headers?.['Message-ID'] ?? '' })
  },
}))
vi.mock('@/lib/comms/conversations', () => ({
  getConversationById: async (id: string) => ({ id, ref: 'ref-1', subject: 'Hello', externalEmail: 'contact@example.com' }),
  newConversationMessageId: () => `<msg-${Math.random().toString(36).slice(2)}@test>`,
  appendConversationMessage: async () => null,
}))
vi.mock('@/lib/comms/reply-address', () => ({ buildConversationReplyAddress: () => 'reply@test' }))
vi.mock('@/lib/comms/email-template', () => ({
  renderCoalescedEmail: (text: string, html: string) => ({ text, html }),
}))

import { flushConversationBatches, BATCH_CLAIM_STALE_MINUTES } from './outbound-batch'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function queued(id: string, body: string, occurredMinutesAgo: number, metadata: Record<string, unknown> = {}): Row {
  return {
    id,
    conversation_id: 'conv-1',
    direction: 'outbound',
    delivery_status: 'queued',
    body,
    body_html: null,
    occurred_at: minutesAgo(occurredMinutesAgo),
    metadata,
  }
}

beforeEach(() => {
  rows = []
  sent.length = 0
  warnings.length = 0
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '))
  })
  process.env.CONVERSATION_BATCH_WINDOW_MINUTES = '5'
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CONVERSATION_BATCH_WINDOW_MINUTES
})

describe('flushConversationBatches — claim before send (scan2 L6-05)', () => {
  it('a single flush claims, sends ONE coalesced email, and marks the burst sent', async () => {
    rows = [queued('m1', 'first', 12), queued('m2', 'second', 8)]
    const res = await flushConversationBatches()
    expect(res).toEqual({ conversations: 1, emails: 1, messages: 2 })
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('first')
    expect(sent[0].text).toContain('second')
    expect(rows.every((r) => r.delivery_status === 'sent')).toBe(true)
    // The claim stamp is on every row of the burst, from one run.
    const tokens = new Set(rows.map((r) => r.metadata.batch_claim_token))
    expect(tokens.size).toBe(1)
  })

  it('two OVERLAPPING flushes send exactly one email (the loser of the newest-row claim backs off)', async () => {
    rows = [queued('m1', 'first', 12), queued('m2', 'second', 8)]
    const [a, b] = await Promise.all([flushConversationBatches(), flushConversationBatches()])
    expect(sent).toHaveLength(1)
    expect(a.emails + b.emails).toBe(1)
    expect(rows.every((r) => r.delivery_status === 'sent')).toBe(true)
  })

  it('a burst another run is still holding is skipped (no second email), and nothing it took is clobbered', async () => {
    rows = [
      queued('m1', 'first', 12, { batch_claimed_at: minutesAgo(1), batch_claim_token: 'other-run' }),
      queued('m2', 'second', 8, { batch_claimed_at: minutesAgo(1), batch_claim_token: 'other-run' }),
    ]
    const res = await flushConversationBatches()
    expect(res.emails).toBe(0)
    expect(sent).toHaveLength(0)
    expect(rows.every((r) => r.delivery_status === 'queued')).toBe(true)
    expect(rows.every((r) => r.metadata.batch_claim_token === 'other-run')).toBe(true)
    expect(warnings).toHaveLength(0)
  })

  it('a claim older than the stale window is treated as abandoned: taken over, logged, and sent once', async () => {
    const dead = minutesAgo(BATCH_CLAIM_STALE_MINUTES + 5)
    rows = [
      queued('m1', 'first', 40, { batch_claimed_at: dead, batch_claim_token: 'crashed-run' }),
      queued('m2', 'second', 30, { batch_claimed_at: dead, batch_claim_token: 'crashed-run' }),
    ]
    const res = await flushConversationBatches()
    expect(res.emails).toBe(1)
    expect(sent).toHaveLength(1)
    expect(rows.every((r) => r.delivery_status === 'sent')).toBe(true)
    expect(rows.every((r) => r.metadata.batch_claim_token !== 'crashed-run')).toBe(true)
    expect(warnings.some((w) => w.includes('reclaiming a stale batch claim') && w.includes('crashed-run'))).toBe(true)
  })

  it('a burst that has not gone quiet yet is neither claimed nor sent', async () => {
    rows = [queued('m1', 'first', 12), queued('m2', 'just now', 1)]
    const res = await flushConversationBatches()
    expect(res.emails).toBe(0)
    expect(rows.every((r) => r.metadata.batch_claimed_at === undefined)).toBe(true)
  })
})
