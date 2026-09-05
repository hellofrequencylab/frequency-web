import { describe, it, expect, beforeEach, vi } from 'vitest'

// signup_leads had writers and no reader until scan2 L9-03. These tests pin the reader: the query
// excludes converted rows and old rows, the row mapping names the beat the visitor stopped at, and
// the CSV export is RFC 4180 clean. The admin client is a recording stub.

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Array<[string, unknown[]]>,
    rows: [] as unknown[],
    error: null as { message: string } | null,
  }
  const builder = (table: string): unknown => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'gte', 'order', 'limit']) {
      c[m] = (...args: unknown[]) => {
        state.calls.push([`${table}.${m}`, args])
        return c
      }
    }
    c.then = (resolve: (v: unknown) => void) => resolve({ data: state.rows, error: state.error })
    return c
  }
  return { state, admin: { from: (table: string) => builder(table) } }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))

import {
  listAbandonedSignupLeads,
  mapSignupLeadRow,
  summarizeSignupPayload,
  abandonedSignupLeadsToCsv,
  countByStep,
  signupStepLabel,
  type SignupLeadRow,
} from './signup-leads'

const NOW = Date.parse('2026-09-05T12:00:00.000Z')

function row(over: Partial<SignupLeadRow> = {}): SignupLeadRow {
  return {
    id: over.id ?? 'lead-1',
    email: over.email ?? 'jo@example.com',
    first_name: over.first_name ?? null,
    last_name: over.last_name ?? null,
    display_name: over.display_name ?? null,
    handle: over.handle ?? null,
    source: over.source ?? 'beta_induction',
    step_reached: over.step_reached ?? 2,
    payload: over.payload ?? {},
    created_at: over.created_at ?? '2026-09-01T00:00:00.000Z',
    updated_at: over.updated_at ?? '2026-09-03T12:00:00.000Z',
  }
}

describe('listAbandonedSignupLeads', () => {
  beforeEach(() => {
    h.state.calls = []
    h.state.rows = []
    h.state.error = null
  })

  it('reads signup_leads, excludes converted rows, bounds by age, newest activity first', async () => {
    h.state.rows = [row()]
    const leads = await listAbandonedSignupLeads({ sinceDays: 7, limit: 50 })
    expect(leads).toHaveLength(1)
    expect(leads[0].email).toBe('jo@example.com')

    const names = h.state.calls.map((c) => c[0])
    expect(names[0]).toBe('signup_leads.select')
    const isCall = h.state.calls.find((c) => c[0] === 'signup_leads.is')
    expect(isCall?.[1]).toEqual(['converted_at', null])
    const gte = h.state.calls.find((c) => c[0] === 'signup_leads.gte')
    expect(gte?.[1][0]).toBe('created_at')
    // A 7-day window: the bound is a real ISO timestamp roughly a week back.
    const since = Date.parse(String(gte?.[1][1]))
    expect(Date.now() - since).toBeGreaterThan(6.9 * 24 * 3600 * 1000)
    expect(Date.now() - since).toBeLessThan(7.1 * 24 * 3600 * 1000)
    const order = h.state.calls.find((c) => c[0] === 'signup_leads.order')
    expect(order?.[1]).toEqual(['updated_at', { ascending: false }])
    const limit = h.state.calls.find((c) => c[0] === 'signup_leads.limit')
    expect(limit?.[1]).toEqual([50])
  })

  it('fails safe to an empty list on a read error', async () => {
    h.state.error = { message: 'boom' }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const leads = await listAbandonedSignupLeads()
    expect(leads).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    // Structured second argument, never interpolated into the format string.
    expect(spy.mock.calls[0][0]).not.toContain('boom')
    expect(spy.mock.calls[0][1]).toMatchObject({ message: 'boom' })
    spy.mockRestore()
  })
})

describe('mapSignupLeadRow', () => {
  it('names the beat, composes a name, and counts age in whole days', () => {
    const lead = mapSignupLeadRow(row({ first_name: 'Ada', last_name: 'Lovelace', step_reached: 2 }), NOW)
    expect(lead.name).toBe('Ada Lovelace')
    expect(lead.stepLabel).toBe('Feature pick')
    expect(lead.ageDays).toBe(2)
  })

  it('prefers the display name and tolerates an empty row', () => {
    expect(mapSignupLeadRow(row({ display_name: 'Ada L', first_name: 'Ada' }), NOW).name).toBe('Ada L')
    expect(mapSignupLeadRow(row(), NOW).name).toBeNull()
  })

  it('labels every step the induction writes, and falls back for an unknown one', () => {
    expect(signupStepLabel(1)).toBe('Email')
    expect(signupStepLabel(3)).toBe('Identity')
    expect(signupStepLabel(4)).toBe('Identity')
    expect(signupStepLabel(9)).toBe('Step 9')
  })
})

describe('summarizeSignupPayload', () => {
  it('flattens the funnel answers to one line', () => {
    const s = summarizeSignupPayload({
      personas: ['creator'],
      interests: ['music', 'breathwork'],
      core_feature: 'events',
      location: 'Lisbon',
      sequence: 'spring',
    })
    expect(s).toBe('creator · music, breathwork · wants events · Lisbon · via spring')
  })

  it('ignores non-object payloads and non-string members', () => {
    expect(summarizeSignupPayload(null)).toBe('')
    expect(summarizeSignupPayload('x')).toBe('')
    expect(summarizeSignupPayload({ personas: [1, 'host'], location: 3 })).toBe('host')
  })
})

describe('countByStep + CSV', () => {
  it('counts by the label and escapes CSV cells', () => {
    const leads = [
      mapSignupLeadRow(row({ id: 'a', step_reached: 1 }), NOW),
      mapSignupLeadRow(row({ id: 'b', step_reached: 3, display_name: 'Quote "Q", Inc' }), NOW),
      mapSignupLeadRow(row({ id: 'c', step_reached: 4 }), NOW),
    ]
    expect(countByStep(leads)).toEqual({ Email: 1, Identity: 2 })

    const csv = abandonedSignupLeadsToCsv(leads)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('email,name,handle,source,step,step_label,summary,created_at,updated_at')
    expect(lines).toHaveLength(4)
    expect(lines[2]).toContain('"Quote ""Q"", Inc"')
    expect(lines[1].startsWith('jo@example.com,,,beta_induction,1,Email,')).toBe(true)
  })
})
