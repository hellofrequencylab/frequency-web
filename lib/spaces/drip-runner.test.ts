import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE DRIP RUNNER (the FIRE job, ADR-561). What is locked here, all network-free:
//   1. IDEMPOTENT CLAIM: each due enrollment is claimed with a conditional update re-asserting
//      status='enrolled'. An enrollment whose claim returns no row (another pass won) is NOT sent.
//   2. SEND + ADVANCE: a claimed enrollment sends its CURRENT step via the system seam, then advances
//      current_step + next_run_at to the next enabled step, or marks 'done' at the end.
//   3. FAIL-SAFE: a hard seam refusal stops the enrollment; a per-row error never throws out of the pass.

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
const store: { enrollments: EnrRow[]; steps: StepRow[] } = { enrollments: [], steps: [] }

function enrollmentsBuilder() {
  let mode: 'select' | 'update' = 'select'
  const eqs: Record<string, string> = {}
  let patch: Record<string, unknown> = {}
  function applyUpdate(): { id: string } | null {
    const row = store.enrollments.find(
      (r) => r.id === eqs.id && (eqs.status === undefined || r.status === eqs.status),
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
    lte() {
      return api
    },
    order() {
      return api
    },
    limit() {
      // terminal for the due-list read: status 'enrolled' (next_run_at <= now honored by seeding past dates)
      const due = store.enrollments.filter((r) => r.status === 'enrolled')
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => (t === 'space_drip_steps' ? stepsBuilder() : enrollmentsBuilder()),
  }),
}))

import { runDueSpaceDrips } from './drip-runner'

const PAST = '2020-01-01T00:00:00Z'

beforeEach(() => {
  store.enrollments = []
  store.steps = []
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
