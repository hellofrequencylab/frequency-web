import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// NURTURE RUNNER on a frozen clock (functional QA, 2026-10-28). Network-free. Locked here:
//   1. DUE WINDOW: only active enrollments of ENABLED sequences whose next_run_at has passed are read.
//   2. SEND + ADVANCE: a due step is enqueued on the bulk lane, the cursor moves to the next enabled
//      step and next_run_at = now + that step's delay_hours.
//   3. LAST STEP completes the enrollment; a since-disabled tail completes instead of stalling.
//   4. CONSENT: an unsubscribed lead is cancelled, never sent; a transient gate refusal defers 15 minutes.
//   5. CLAIM: losing the next_run_at compare-and-swap means no send.

const NOW = new Date('2026-12-01T10:00:00.000Z')

const enqueued: { to: string }[] = []
vi.mock('@/lib/email', () => ({
  enqueueEmail: async (m: { to: string }) => {
    enqueued.push(m)
  },
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => gateResult,
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => suppressed }))
vi.mock('@/lib/connections/lead-unsub', () => ({ buildLeadUnsubUrl: (id: string) => `https://x.test/u/${id}` }))
vi.mock('@/lib/email-studio/data-blocks', () => ({ resolveDataBlockRefs: async (l: unknown) => l }))

let gateResult: { allowed: boolean; reason?: string } = { allowed: true }
let suppressed = false
let stealClaim = false

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}

function builder(table: string) {
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  const eqs: [string, unknown][] = []
  let ins: [string, unknown[]] | null = null
  let lte: [string, string] | null = null
  let limit = Infinity
  const match = (r: Row) =>
    eqs.every(([c, v]) => r[c] === v) &&
    (!ins || ins[1].includes(r[ins[0]])) &&
    (!lte || (typeof r[lte[0]] === 'string' && (r[lte[0]] as string) <= lte[1]))
  const run = () => {
    const rows = tables[table].filter(match)
    if (mode === 'update') {
      if (stealClaim && 'next_run_at' in patch) return { data: [] }
      rows.forEach((r) => Object.assign(r, patch))
      return { data: rows.map((r) => ({ id: r.id })) }
    }
    return { data: rows.slice(0, limit) }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    update: (p: Row) => ((mode = 'update'), (patch = p), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, v: unknown[]) => ((ins = [c, v]), api),
    lte: (c: string, v: string) => ((lte = [c, v]), api),
    order: () => api,
    limit: (n: number) => ((limit = n), api),
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import { runDueNurture } from './runner'

const iso = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString()
const H = 3_600_000

function seed(over: { consent?: string; profile?: string | null; step2Enabled?: boolean } = {}) {
  tables.nurture_sequences = [
    { id: 'seq', enabled: true },
    { id: 'paused', enabled: false },
  ]
  tables.nurture_steps = [
    { id: 's1', sequence_id: 'seq', step_order: 1, delay_hours: 0, subject: 'One', body: 'a', enabled: true, block_json: null },
    { id: 's2', sequence_id: 'seq', step_order: 2, delay_hours: 48, subject: 'Two', body: 'b', enabled: over.step2Enabled ?? true, block_json: null },
  ]
  tables.contacts = [
    { id: 'c1', consent_state: over.consent ?? 'subscribed', profile_id: over.profile ?? null, display_name: 'Sam Lee' },
  ]
  tables.nurture_enrollments = [
    { id: 'due', sequence_id: 'seq', contact_id: 'c1', email: 'sam@x.test', persona: 'p', next_step_order: 1, next_run_at: iso(-H), status: 'active' },
    { id: 'future', sequence_id: 'seq', contact_id: 'c1', email: 'f@x.test', persona: 'p', next_step_order: 1, next_run_at: iso(H), status: 'active' },
    { id: 'paused-due', sequence_id: 'paused', contact_id: 'c1', email: 'p@x.test', persona: 'p', next_step_order: 1, next_run_at: iso(-H), status: 'active' },
    { id: 'done', sequence_id: 'seq', contact_id: 'c1', email: 'd@x.test', persona: 'p', next_step_order: 1, next_run_at: iso(-H), status: 'completed' },
  ]
}
const enr = (id: string) => tables.nurture_enrollments.find((r) => r.id === id)!

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  enqueued.length = 0
  gateResult = { allowed: true }
  suppressed = false
  stealClaim = false
})
afterEach(() => vi.useRealTimers())

describe('runDueNurture', () => {
  it('sends only the due enrollment of an enabled sequence and schedules the next step by its delay', async () => {
    seed()
    const r = await runDueNurture()
    expect(r).toEqual({ processed: 1, sent: 1, completed: 0, cancelled: 0 })
    expect(enqueued.map((m) => m.to)).toEqual(['sam@x.test'])
    expect(enr('due')).toMatchObject({ next_step_order: 2, next_run_at: iso(48 * H) })
    expect(enr('future').next_run_at).toBe(iso(H))
    expect(enr('paused-due').next_run_at).toBe(iso(-H))
  })

  it('completes after the last step', async () => {
    seed()
    enr('due').next_step_order = 2
    const r = await runDueNurture()
    expect(r).toMatchObject({ sent: 1, completed: 1 })
    expect(enr('due').status).toBe('completed')
  })

  it('completes without sending when the remaining step was disabled', async () => {
    seed({ step2Enabled: false })
    enr('due').next_step_order = 2
    const r = await runDueNurture()
    expect(r).toEqual({ processed: 1, sent: 0, completed: 1, cancelled: 0 })
    expect(enqueued).toHaveLength(0)
  })

  it('cancels an unsubscribed lead without sending', async () => {
    seed({ consent: 'unsubscribed' })
    const r = await runDueNurture()
    expect(r).toMatchObject({ sent: 0, cancelled: 1 })
    expect(enr('due').status).toBe('cancelled')
  })

  it('cancels a suppressed pure lead', async () => {
    seed()
    suppressed = true
    expect(await runDueNurture()).toMatchObject({ sent: 0, cancelled: 1 })
  })

  it('defers a transient gate refusal by 15 minutes instead of cancelling', async () => {
    seed({ profile: 'p1' })
    gateResult = { allowed: false, reason: 'error' }
    const r = await runDueNurture()
    expect(r).toMatchObject({ sent: 0, cancelled: 0 })
    expect(enr('due')).toMatchObject({ status: 'active', next_run_at: iso(15 * 60 * 1000) })
  })

  it('cancels on a definitive opt-out from the gate', async () => {
    seed({ profile: 'p1' })
    gateResult = { allowed: false, reason: 'pref_off' }
    expect(await runDueNurture()).toMatchObject({ sent: 0, cancelled: 1 })
  })

  it('does not send when another run wins the claim', async () => {
    seed()
    stealClaim = true
    const r = await runDueNurture()
    expect(r.sent).toBe(0)
    expect(enqueued).toHaveLength(0)
  })

  it('honours the per-run limit', async () => {
    seed()
    tables.nurture_enrollments.push({ ...enr('due'), id: 'due2', email: 'b@x.test' })
    expect((await runDueNurture(1)).processed).toBe(1)
  })
})
