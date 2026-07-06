import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE DRIP ENROLLMENT + TRIGGER DISPATCH (ADR-561). What is locked here, all network-free:
//   1. ENROLL: enrollContactInSequence inserts at the sequence's FIRST enabled step with next_run_at =
//      now + that step's delay. A disabled sequence, a missing contact/email, or no step enrolls nothing.
//   2. DISPATCH: fireSpaceTrigger reads ENABLED rules on the trigger and enrolls the contact into a
//      rule's named target sequence. FIRE-SAFE: it never throws.

vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

// In-memory store the chainable admin mock reads. Keyed by table.
interface SeqRow { id: string; space_id: string; enabled: boolean }
interface ContactRow { id: string; space_id: string; email: string | null }
interface StepRow { space_id: string; sequence_id: string; step_order: number; delay_hours: number; enabled: boolean }
interface RuleRow { id: string; space_id: string; trigger_event: string; enabled: boolean; action_config: unknown }
const store = {
  sequences: [] as SeqRow[],
  contacts: [] as ContactRow[],
  steps: [] as StepRow[],
  rules: [] as RuleRow[],
  upserts: [] as Record<string, unknown>[],
}

function builder(table: string) {
  const eqs: Record<string, string> = {}
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (col: string, val: string) => {
      eqs[col] = val
      return api
    },
    order: () => {
      // steps read: filter by space_id + sequence_id
      const rows = store.steps.filter((s) => s.space_id === eqs.space_id && s.sequence_id === eqs.sequence_id)
      return Promise.resolve({ data: rows, error: null })
    },
    async maybeSingle() {
      if (table === 'space_drip_sequences') {
        return { data: store.sequences.find((s) => s.id === eqs.id && s.space_id === eqs.space_id) ?? null, error: null }
      }
      if (table === 'contacts') {
        return { data: store.contacts.find((c) => c.id === eqs.id && c.space_id === eqs.space_id) ?? null, error: null }
      }
      return { data: null, error: null }
    },
    upsert: (rows: Record<string, unknown>[]) => {
      store.upserts.push(...rows)
      return Promise.resolve({ error: null })
    },
    // rules read (fireSpaceTrigger): .eq().eq().eq() then awaited
    then: (resolve: (r: { data: unknown[]; error: null }) => unknown) => {
      let data: unknown[] = []
      if (table === 'space_automation_rules') {
        data = store.rules.filter(
          (r) => r.space_id === eqs.space_id && r.trigger_event === eqs.trigger_event && String(r.enabled) === String(eqs.enabled),
        )
      }
      return Promise.resolve(resolve({ data, error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { enrollContactInSequence, fireSpaceTrigger } from './drip-enroll'

beforeEach(() => {
  store.sequences = [{ id: 'seq-1', space_id: 'space-A', enabled: true }]
  store.contacts = [{ id: 'c1', space_id: 'space-A', email: 'a@x.com' }]
  store.steps = [
    { space_id: 'space-A', sequence_id: 'seq-1', step_order: 1, delay_hours: 24, enabled: true },
    { space_id: 'space-A', sequence_id: 'seq-1', step_order: 2, delay_hours: 48, enabled: true },
  ]
  store.rules = []
  store.upserts = []
})

describe('enrollContactInSequence', () => {
  it('enrolls at the first enabled step with next_run_at = now + delay', async () => {
    const before = Date.now()
    const res = await enrollContactInSequence('space-A', 'seq-1', 'c1')
    expect(res.enrolled).toBe(true)
    expect(store.upserts.length).toBe(1)
    const row = store.upserts[0]
    expect(row.space_id).toBe('space-A')
    expect(row.sequence_id).toBe('seq-1')
    expect(row.contact_id).toBe('c1')
    expect(row.current_step).toBe(1)
    expect(row.status).toBe('enrolled')
    // next_run_at ~ now + 24h
    const due = new Date(row.next_run_at as string).getTime()
    expect(due).toBeGreaterThanOrEqual(before + 24 * 3_600_000 - 5_000)
  })

  it('skips a disabled first step, starting on the first ENABLED step', async () => {
    store.steps[0].enabled = false
    const res = await enrollContactInSequence('space-A', 'seq-1', 'c1')
    expect(res.enrolled).toBe(true)
    expect(store.upserts[0].current_step).toBe(2)
  })

  it('a disabled sequence enrolls nothing', async () => {
    store.sequences[0].enabled = false
    const res = await enrollContactInSequence('space-A', 'seq-1', 'c1')
    expect(res.enrolled).toBe(false)
    expect(store.upserts.length).toBe(0)
  })

  it('a contact with no email enrolls nothing', async () => {
    store.contacts[0].email = null
    const res = await enrollContactInSequence('space-A', 'seq-1', 'c1')
    expect(res.enrolled).toBe(false)
  })

  it('a sequence with no enabled step enrolls nothing', async () => {
    store.steps.forEach((s) => (s.enabled = false))
    const res = await enrollContactInSequence('space-A', 'seq-1', 'c1')
    expect(res.enrolled).toBe(false)
  })

  it('missing args are a safe no-op', async () => {
    expect((await enrollContactInSequence('', 'seq-1', 'c1')).enrolled).toBe(false)
    expect((await enrollContactInSequence('space-A', '', 'c1')).enrolled).toBe(false)
    expect((await enrollContactInSequence('space-A', 'seq-1', '')).enrolled).toBe(false)
  })
})

describe('fireSpaceTrigger', () => {
  it('enrolls the contact into a rule that names a target sequence', async () => {
    store.rules = [
      { id: 'r1', space_id: 'space-A', trigger_event: 'contact.created', enabled: true, action_config: { sequenceId: 'seq-1' } },
    ]
    await fireSpaceTrigger('space-A', 'contact.created', { contactId: 'c1' })
    expect(store.upserts.length).toBe(1)
    expect(store.upserts[0].sequence_id).toBe('seq-1')
  })

  it('a rule with no target sequence enrolls nothing (one-shot action is a no-op in the runner)', async () => {
    store.rules = [
      { id: 'r1', space_id: 'space-A', trigger_event: 'contact.created', enabled: true, action_config: { subject: 'Hi', body: 'B' } },
    ]
    await fireSpaceTrigger('space-A', 'contact.created', { contactId: 'c1' })
    expect(store.upserts.length).toBe(0)
  })

  it('no rules on the trigger -> no-op', async () => {
    await fireSpaceTrigger('space-A', 'contact.created', { contactId: 'c1' })
    expect(store.upserts.length).toBe(0)
  })

  it('a missing contact id is a safe no-op (never throws)', async () => {
    await expect(fireSpaceTrigger('space-A', 'contact.created', {})).resolves.toBeUndefined()
    expect(store.upserts.length).toBe(0)
  })
})
