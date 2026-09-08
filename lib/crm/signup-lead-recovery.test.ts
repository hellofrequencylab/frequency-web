import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-170 (ADR-1274). The recovery note goes to a lead that never converted, reached step 2, went
// cold 24 hours ago and has never been mailed. The rule is pure, so these cases need no database;
// the runner cases below mock the admin client and pin the claim-then-send order.

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  /** lead ids whose conditional claim matches no row (another run got there first). */
  claimLost: new Set<string>(),
  /** lead ids whose claim update errors. */
  claimFails: new Set<string>(),
  /** lead ids whose enqueue throws. */
  sendFails: new Set<string>(),
  claims: [] as { id: string; patch: Record<string, unknown>; guard: [string, unknown] }[],
  sent: [] as { to: string; firstName: string | null; resumeUrl: string }[],
  errors: [] as string[],
  query: { filters: [] as string[], order: null as string | null, limit: null as number | null },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'signup_leads') throw new Error(`unexpected table ${table}`)
      const read = {
        is: (col: string, v: unknown) => { state.query.filters.push(`${col} is ${String(v)}`); return read },
        gte: (col: string, v: unknown) => { state.query.filters.push(`${col} >= ${String(v)}`); return read },
        lte: (col: string, v: unknown) => { state.query.filters.push(`${col} <= ${String(v)}`); return read },
        order: (col: string, opts: { ascending: boolean }) => {
          state.query.order = `${col}:${opts.ascending ? 'asc' : 'desc'}`
          return read
        },
        limit: (n: number) => {
          state.query.limit = n
          return Promise.resolve({ data: state.rows.slice(0, n), error: null })
        },
      }
      return {
        select: () => read,
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            is: (col: string, v: unknown) => ({
              select: () => {
                if (state.claimFails.has(id)) return Promise.resolve({ data: null, error: { message: 'connection reset' } })
                state.claims.push({ id, patch, guard: [col, v] })
                if (state.claimLost.has(id)) return Promise.resolve({ data: [], error: null })
                return Promise.resolve({ data: [{ id }], error: null })
              },
            }),
          }),
        }),
      }
    },
  }),
}))
vi.mock('@/lib/email', () => ({
  sendSignupRecoveryEmail: async (p: { to: string; firstName: string | null; resumeUrl: string }) => {
    const id = p.to.split('@')[0]
    if (state.sendFails.has(id)) throw new Error('outbox unavailable')
    state.sent.push(p)
  },
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string) => state.errors.push(event),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import {
  RECOVERY_MIN_STEP,
  RECOVERY_QUIET_HOURS,
  isRecoveryDue,
  recoveryCutoff,
  recoveryFirstName,
  recoveryResumeUrl,
  runSignupLeadRecovery,
  selectRecoveryLeads,
  type RecoveryCandidate,
} from './signup-lead-recovery'

const NOW = Date.parse('2026-09-08T15:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function lead(over: Partial<RecoveryCandidate> & { id: string }): RecoveryCandidate {
  return {
    email: `${over.id}@example.com`,
    step_reached: 2,
    updated_at: hoursAgo(30),
    converted_at: null,
    recovery_sent_at: null,
    ...over,
  }
}

describe('selectRecoveryLeads (pure)', () => {
  it('selects the qualifying lead: unconverted, step 2, cold for a day, never mailed', () => {
    const q = lead({ id: 'q' })
    expect(isRecoveryDue(q, NOW)).toBe(true)
    expect(selectRecoveryLeads([q], NOW)).toEqual([q])
  })

  it('skips a converted lead', () => {
    expect(selectRecoveryLeads([lead({ id: 'c', converted_at: hoursAgo(26) })], NOW)).toEqual([])
  })

  it('skips a lead that has already been mailed', () => {
    expect(selectRecoveryLeads([lead({ id: 'm', recovery_sent_at: hoursAgo(1) })], NOW)).toEqual([])
  })

  it(`skips a lead below step ${RECOVERY_MIN_STEP} (a typed address is not a half-finished signup)`, () => {
    expect(selectRecoveryLeads([lead({ id: 's0', step_reached: 0 }), lead({ id: 's1', step_reached: 1 })], NOW)).toEqual([])
    expect(selectRecoveryLeads([lead({ id: 's3', step_reached: 3 })], NOW)).toHaveLength(1)
  })

  it(`skips a lead touched within the last ${RECOVERY_QUIET_HOURS} hours, and takes one exactly at the line`, () => {
    expect(selectRecoveryLeads([lead({ id: 'warm', updated_at: hoursAgo(23) })], NOW)).toEqual([])
    expect(selectRecoveryLeads([lead({ id: 'edge', updated_at: hoursAgo(24) })], NOW)).toHaveLength(1)
  })

  it('skips a row whose updated_at does not parse rather than treating it as infinitely old', () => {
    expect(selectRecoveryLeads([lead({ id: 'bad', updated_at: 'not a date' })], NOW)).toEqual([])
  })

  it('keeps the input order and drops only the ineligible rows from a mixed batch', () => {
    const rows = [
      lead({ id: 'a' }),
      lead({ id: 'b', converted_at: hoursAgo(2) }),
      lead({ id: 'c', recovery_sent_at: hoursAgo(2) }),
      lead({ id: 'd', step_reached: 1 }),
      lead({ id: 'e', updated_at: hoursAgo(1) }),
      lead({ id: 'f', updated_at: hoursAgo(72) }),
    ]
    expect(selectRecoveryLeads(rows, NOW).map((r) => r.id)).toEqual(['a', 'f'])
  })

  it('the query cutoff is the same line the rule draws', () => {
    expect(recoveryCutoff(NOW)).toBe(hoursAgo(24))
  })
})

describe('the note inputs', () => {
  it('greets by first name, else the first word of the display name, else nothing', () => {
    expect(recoveryFirstName({ first_name: ' Ana ', display_name: null })).toBe('Ana')
    expect(recoveryFirstName({ first_name: '', display_name: 'Ana Ruiz' })).toBe('Ana')
    expect(recoveryFirstName({ first_name: null, display_name: '  ' })).toBeNull()
  })

  it('sends the lead back through /join, carrying the Funnel slug only when it is a slug', () => {
    expect(recoveryResumeUrl('https://frequencylocal.com/', {})).toBe('https://frequencylocal.com/join')
    expect(recoveryResumeUrl('https://frequencylocal.com', { sequence: 'runners' })).toBe('https://frequencylocal.com/join?seq=runners')
    expect(recoveryResumeUrl('https://frequencylocal.com', { sequence: 'x" onclick=' })).toBe('https://frequencylocal.com/join')
    expect(recoveryResumeUrl('https://frequencylocal.com', ['runners'])).toBe('https://frequencylocal.com/join')
  })
})

describe('runSignupLeadRecovery (claim, then send)', () => {
  beforeEach(() => {
    state.rows = []
    state.claimLost.clear()
    state.claimFails.clear()
    state.sendFails.clear()
    state.claims = []
    state.sent = []
    state.errors = []
    state.query = { filters: [], order: null, limit: null }
  })

  const row = (over: Partial<RecoveryCandidate> & { id: string; first_name?: string | null; payload?: unknown }) => ({
    first_name: null,
    display_name: null,
    payload: {},
    ...lead(over),
    ...over,
  })

  it('asks the database the four things the rule asks, oldest first, bounded by the budget', async () => {
    state.rows = [row({ id: 'a' })]
    await runSignupLeadRecovery({ limit: 50, now: () => NOW })
    expect(state.query.filters).toEqual([
      'converted_at is null',
      'recovery_sent_at is null',
      `step_reached >= ${RECOVERY_MIN_STEP}`,
      `updated_at <= ${hoursAgo(24)}`,
    ])
    expect(state.query.order).toBe('updated_at:asc')
    expect(state.query.limit).toBe(50)
  })

  it('claims before it sends, sends once per claimed lead, and stamps only rows still unmailed', async () => {
    state.rows = [row({ id: 'a', first_name: 'Ana', payload: { sequence: 'runners' } }), row({ id: 'b' })]
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW, baseUrl: 'https://frequencylocal.com' })
    expect(r).toMatchObject({ scanned: 2, due: 2, sent: 2, lost: 0, failed: 0, remaining: 0 })
    expect(state.claims.map((c) => c.id)).toEqual(['a', 'b'])
    expect(state.claims[0].guard).toEqual(['recovery_sent_at', null])
    expect(state.claims[0].patch).toEqual({ recovery_sent_at: new Date(NOW).toISOString() })
    expect(state.sent).toEqual([
      { to: 'a@example.com', firstName: 'Ana', resumeUrl: 'https://frequencylocal.com/join?seq=runners' },
      { to: 'b@example.com', firstName: null, resumeUrl: 'https://frequencylocal.com/join' },
    ])
  })

  it('re-applies the rule to what the database returned: a converted or already-mailed row is never claimed', async () => {
    state.rows = [
      row({ id: 'conv', converted_at: hoursAgo(2) }),
      row({ id: 'mailed', recovery_sent_at: hoursAgo(2) }),
      row({ id: 'ok' }),
    ]
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW })
    expect(r).toMatchObject({ scanned: 3, due: 1, sent: 1 })
    expect(state.claims.map((c) => c.id)).toEqual(['ok'])
    expect(state.sent.map((s) => s.to)).toEqual(['ok@example.com'])
  })

  it('a lost claim skips the send and counts as lost, not failed', async () => {
    state.rows = [row({ id: 'a' }), row({ id: 'b' })]
    state.claimLost.add('a')
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW })
    expect(r).toMatchObject({ sent: 1, lost: 1, failed: 0 })
    expect(state.sent.map((s) => s.to)).toEqual(['b@example.com'])
  })

  it('a claim error is counted as failed and the lead is not mailed', async () => {
    state.rows = [row({ id: 'a' })]
    state.claimFails.add('a')
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW })
    expect(r).toMatchObject({ sent: 0, failed: 1 })
    expect(state.sent).toEqual([])
    expect(state.errors).toContain('cron.signup_lead_recovery.claim_failed')
  })

  it('an enqueue failure is counted as failed and the claim is kept (one note, never two)', async () => {
    state.rows = [row({ id: 'a' })]
    state.sendFails.add('a')
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW })
    expect(r).toMatchObject({ sent: 0, failed: 1 })
    expect(state.claims.map((c) => c.id)).toEqual(['a'])
    expect(state.errors).toContain('cron.signup_lead_recovery.enqueue_failed')
  })

  it('stops on the clock and reports the due leads it left', async () => {
    state.rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]
    let calls = 0
    const r = await runSignupLeadRecovery({ limit: 200, now: () => NOW, exhausted: () => ++calls > 1 })
    expect(r).toMatchObject({ due: 3, sent: 1, remaining: 2 })
  })
})
