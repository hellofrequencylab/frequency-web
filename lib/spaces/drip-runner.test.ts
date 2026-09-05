import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE DRIP RUNNER (the FIRE job, ADR-561). What is locked here, all network-free:
//   1. IDEMPOTENT CLAIM: each due enrollment is claimed with a conditional update re-asserting
//      status='enrolled'. An enrollment whose claim returns no row (another pass won) is NOT sent.
//   2. SEND + ADVANCE: a claimed enrollment sends its CURRENT step via the system seam, then advances
//      current_step + next_run_at to the next enabled step, or marks 'done' at the end.
//   3. FAIL-SAFE: a hard seam refusal stops the enrollment; a per-row error never throws out of the pass.
//   4. LEASE + RESUME (scan2 L6-10): the claim stamps sending_started_at; a 'sending' row whose lease
//      expired is re-claimed. If the ledger shows a send to this contact since the stale lease began,
//      the step is NOT re-sent and the enrollment only advances; otherwise the step is sent.

// ── Mocks ────────────────────────────────────────────────────────────────────────────────────────

let sendResult: { data: { sent: number; suppressed: number; failed: number } } | { error: string } = {
  data: { sent: 1, suppressed: 0, failed: 0 },
}
const sendCalls: { spaceId: string; subject: string }[] = []
vi.mock('./email', () => ({
  SPACE_UNSUBSCRIBE_PLACEHOLDER: '%%U%%',
  sendSpaceCampaignSystem: async (spaceId: string, input: { subject: string }) => {
    sendCalls.push({ spaceId, subject: input.subject })
    return sendResult
  },
}))
vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {}, time: async (_n: string, fn: () => unknown) => fn() } }))

interface EnrRow {
  id: string
  space_id: string | null
  sequence_id: string
  contact_id: string
  email: string
  current_step: number
  next_run_at: string
  status: string
  sending_started_at?: string | null
}
interface LedgerRow {
  space_id: string
  contact_id: string
  created_at: string
  status: string
}
interface StepRow {
  space_id: string
  sequence_id: string
  step_order: number
  delay_hours: number
  subject: string
  body: string
  enabled: boolean
}
const store: { enrollments: EnrRow[]; steps: StepRow[]; ledger: LedgerRow[]; ledgerError: boolean } = {
  enrollments: [],
  steps: [],
  ledger: [],
  ledgerError: false,
}

function enrollmentsBuilder() {
  let mode: 'select' | 'update' = 'select'
  const eqs: Record<string, string> = {}
  const lts: Record<string, string> = {}
  let staleBefore: string | null = null
  let patch: Record<string, unknown> = {}
  function applyUpdate(): { id: string } | null {
    const row = store.enrollments.find(
      (r) =>
        r.id === eqs.id &&
        (eqs.status === undefined || r.status === eqs.status) &&
        Object.entries(lts).every(([col, val]) => {
          const cur = (r as unknown as Record<string, string | null | undefined>)[col]
          return typeof cur === 'string' && cur < val
        }),
    )
    if (!row) return null
    Object.assign(row, patch)
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
      // terminal for the due-list read: status 'enrolled' (next_run_at <= now honored by seeding past
      // dates), plus a 'sending' row whose lease is stale
      const due = store.enrollments.filter(
        (r) =>
          r.status === 'enrolled' ||
          (r.status === 'sending' &&
            staleBefore !== null &&
            typeof r.sending_started_at === 'string' &&
            r.sending_started_at < staleBefore),
      )
      return Promise.resolve({ data: due, error: null })
    },
    update(p: Record<string, unknown>) {
      mode = 'update'
      patch = p
      return api
    },
    async maybeSingle() {
      if (mode === 'update') return { data: applyUpdate(), error: null } // the CLAIM / terminal update
      return { data: null, error: null }
    },
    then(resolve: (r: unknown) => unknown) {
      if (mode === 'update') applyUpdate() // advance() / markStatus() await update(...).eq(...)
      return Promise.resolve(resolve({ data: null, error: null }))
    },
  }
  return api
}

function stepsBuilder() {
  const eqs: Record<string, string> = {}
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqs[col] = val
      return api
    },
    order() {
      const rows = store.steps.filter(
        (s) => s.space_id === eqs.space_id && s.sequence_id === eqs.sequence_id,
      )
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

// The outreach_sends ledger the RESUME path reads: a committed send to this contact since the lease began.
function ledgerBuilder() {
  const eqs: Record<string, string> = {}
  const gtes: Record<string, string> = {}
  const neqs: Record<string, string> = {}
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      eqs[col] = val
      return api
    },
    gte(col: string, val: string) {
      gtes[col] = val
      return api
    },
    neq(col: string, val: string) {
      neqs[col] = val
      return api
    },
    limit(n: number) {
      if (store.ledgerError) return Promise.resolve({ data: null, error: { message: 'ledger down' } })
      const rows = store.ledger
        .filter(
          (r) =>
            r.space_id === eqs.space_id &&
            r.contact_id === eqs.contact_id &&
            (gtes.created_at === undefined || r.created_at >= gtes.created_at) &&
            (neqs.status === undefined || r.status !== neqs.status),
        )
        .slice(0, n)
        .map(() => ({ id: 'send' }))
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) =>
      t === 'space_drip_steps' ? stepsBuilder() : t === 'outreach_sends' ? ledgerBuilder() : enrollmentsBuilder(),
  }),
}))

import { runDueSpaceDrips } from './drip-runner'
import { SENDING_LEASE_MS } from '@/lib/messaging/status'

const PAST = '2020-01-01T00:00:00Z'
const STALE = new Date(Date.now() - SENDING_LEASE_MS - 60_000).toISOString()
const FRESH = new Date(Date.now() - 60_000).toISOString()

beforeEach(() => {
  store.enrollments = []
  store.steps = []
  store.ledger = []
  store.ledgerError = false
  sendCalls.length = 0
  sendResult = { data: { sent: 1, suppressed: 0, failed: 0 } }
})

function seedEnrollment(o: Partial<EnrRow> = {}): EnrRow {
  const row: EnrRow = {
    id: 'enr-1',
    space_id: 'space-A',
    sequence_id: 'seq-1',
    contact_id: 'c1',
    email: 'a@x.com',
    current_step: 1,
    next_run_at: PAST,
    status: 'enrolled',
    ...o,
  }
  store.enrollments.push(row)
  return row
}
function seedStep(o: Partial<StepRow> = {}): void {
  store.steps.push({
    space_id: 'space-A',
    sequence_id: 'seq-1',
    step_order: 1,
    delay_hours: 24,
    subject: 'Step 1',
    body: 'Hello',
    enabled: true,
    ...o,
  })
}

describe('runDueSpaceDrips', () => {
  it('claims a due enrollment, sends its current step, advances to the next step', async () => {
    const enr = seedEnrollment()
    seedStep({ step_order: 1, subject: 'Step 1' })
    seedStep({ step_order: 2, subject: 'Step 2', delay_hours: 48 })

    const res = await runDueSpaceDrips()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(1)
    expect(sendCalls).toEqual([{ spaceId: 'space-A', subject: 'Step 1' }])
    // Advanced to step 2, back to 'enrolled', with a future next_run_at.
    expect(enr.current_step).toBe(2)
    expect(enr.status).toBe('enrolled')
    expect(new Date(enr.next_run_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('marks an enrollment done after its LAST step', async () => {
    const enr = seedEnrollment({ current_step: 1 })
    seedStep({ step_order: 1, subject: 'Only step' })

    const res = await runDueSpaceDrips()
    expect(res.sent).toBe(1)
    expect(res.completed).toBe(1)
    expect(enr.status).toBe('done')
  })

  it('idempotent: a second pass finds no enrolled row and sends nothing', async () => {
    seedEnrollment({ current_step: 1 })
    seedStep({ step_order: 1 })
    await runDueSpaceDrips() // completes it ('done')
    sendCalls.length = 0
    const res2 = await runDueSpaceDrips()
    expect(res2.due).toBe(0)
    expect(res2.claimed).toBe(0)
    expect(sendCalls).toEqual([])
  })

  it('a hard seam refusal stops the enrollment (never retried forever)', async () => {
    const enr = seedEnrollment()
    seedStep({ step_order: 1 })
    sendResult = { error: 'Email is turned off for this space.' }

    const res = await runDueSpaceDrips()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(0)
    expect(res.stopped).toBe(1)
    expect(enr.status).toBe('stopped')
  })

  it('a consent-skipped send (sent:0, no error) still ADVANCES the sequence', async () => {
    const enr = seedEnrollment({ current_step: 1 })
    seedStep({ step_order: 1 })
    seedStep({ step_order: 2, subject: 'Step 2' })
    sendResult = { data: { sent: 0, suppressed: 1, failed: 0 } } // recipient not consented -> skipped

    const res = await runDueSpaceDrips()
    expect(res.sent).toBe(0) // nothing actually delivered
    expect(enr.current_step).toBe(2) // but the sequence progressed (next step re-checks consent)
    expect(enr.status).toBe('enrolled')
  })

  it('the claim stamps the lease (sending_started_at)', async () => {
    const enr = seedEnrollment()
    seedStep({ step_order: 1 })
    sendResult = { error: 'Email is turned off for this space.' } // stop after the claim so the stamp is observable
    await runDueSpaceDrips()
    expect(typeof enr.sending_started_at).toBe('string')
    expect(new Date(enr.sending_started_at as string).getTime()).toBeGreaterThan(Date.now() - 5_000)
  })

  it('a stale sending row is re-claimed and resumed: the step is SENT when the ledger shows no send since the lease began', async () => {
    const enr = seedEnrollment({ status: 'sending', sending_started_at: STALE })
    seedStep({ step_order: 1, subject: 'Step 1' })
    seedStep({ step_order: 2, subject: 'Step 2' })
    // An older send to this contact (before the stale lease) is not this step.
    store.ledger = [{ space_id: 'space-A', contact_id: 'c1', created_at: '2020-01-01T00:00:00Z', status: 'sent' }]
    const res = await runDueSpaceDrips()
    expect(res.due).toBe(1)
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(1)
    expect(sendCalls).toEqual([{ spaceId: 'space-A', subject: 'Step 1' }])
    expect(enr.current_step).toBe(2)
    expect(enr.status).toBe('enrolled')
    expect(enr.sending_started_at as string > STALE).toBe(true) // the lease was re-stamped
  })

  it('a stale sending row whose step already went out ADVANCES without re-sending', async () => {
    const enr = seedEnrollment({ status: 'sending', sending_started_at: STALE })
    seedStep({ step_order: 1, subject: 'Step 1' })
    seedStep({ step_order: 2, subject: 'Step 2' })
    const afterLease = new Date(Date.parse(STALE) + 1_000).toISOString()
    store.ledger = [{ space_id: 'space-A', contact_id: 'c1', created_at: afterLease, status: 'queued' }]
    const res = await runDueSpaceDrips()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(0)
    expect(sendCalls).toEqual([])
    expect(enr.current_step).toBe(2)
    expect(enr.status).toBe('enrolled')
  })

  it('a FRESH sending row (a live sender) is left alone', async () => {
    const enr = seedEnrollment({ status: 'sending', sending_started_at: FRESH })
    seedStep({ step_order: 1 })
    const res = await runDueSpaceDrips()
    expect(res.due).toBe(0)
    expect(sendCalls).toEqual([])
    expect(enr.status).toBe('sending')
  })

  it('an unreadable ledger on resume neither sends nor advances (the next lease retries)', async () => {
    const enr = seedEnrollment({ status: 'sending', sending_started_at: STALE })
    seedStep({ step_order: 1 })
    store.ledgerError = true
    const res = await runDueSpaceDrips()
    expect(res.claimed).toBe(1)
    expect(res.sent).toBe(0)
    expect(res.stopped).toBe(0)
    expect(sendCalls).toEqual([])
    expect(enr.status).toBe('sending')
    expect(enr.current_step).toBe(1)
  })

  it('skips a since-disabled step, sending the next enabled one', async () => {
    const enr = seedEnrollment({ current_step: 1 })
    seedStep({ step_order: 1, enabled: false, subject: 'disabled' })
    seedStep({ step_order: 2, enabled: true, subject: 'Step 2' })

    const res = await runDueSpaceDrips()
    expect(res.sent).toBe(1)
    expect(sendCalls).toEqual([{ spaceId: 'space-A', subject: 'Step 2' }])
    expect(enr.status).toBe('done') // step 2 was the last enabled step
  })
})
