import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { recoveryExcludedSourceFilter } from '@/lib/crm/lead-sources'

// LIVE-170 (ADR-1274). The recovery cron against its real handler and the real runner, with only
// the database, the outbox and the wrappers mocked. What it pins: the driving query is bounded by
// the declared budget and ordered coldest first; a converted or already-mailed lead that the
// database hands back anyway is skipped; a qualifying lead is claimed (recovery_sent_at stamped
// with a null guard) BEFORE its note is enqueued; a per-lead failure answers 500 so the heartbeat
// fail-pings, and every lead that did claim is out of the next run's selection.

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readError: null as { message: string } | null,
  sendFails: new Set<string>(),
  claims: [] as string[],
  sent: [] as string[],
  limit: null as number | null,
  order: null as string | null,
  filters: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'signup_leads') throw new Error(`unexpected table ${table}`)
      const read = {
        is: (col: string, v: unknown) => { state.filters.push(`${col} is ${String(v)}`); return read },
        gte: (col: string, v: unknown) => { state.filters.push(`${col} >= ${String(v)}`); return read },
        // `not` joined the driving query when event-RSVP leads were excluded from recovery: a guest
        // who completed an RSVP abandoned no signup. The builder had no `not`, so the route threw and
        // answered 500 rather than failing on the assertion, which is why three cases went red at once.
        not: (col: string, op: string, v: unknown) => { state.filters.push(`${col} ${op} ${String(v)}`); return read },
        lte: (col: string) => { state.filters.push(`${col} <= cutoff`); return read },
        order: (col: string, opts: { ascending: boolean }) => {
          state.order = `${col}:${opts.ascending ? 'asc' : 'desc'}`
          return read
        },
        limit: (n: number) => {
          state.limit = n
          if (state.readError) return Promise.resolve({ data: null, error: state.readError })
          return Promise.resolve({ data: state.rows.slice(0, n), error: null })
        },
      }
      return {
        select: () => read,
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            is: (col: string, v: unknown) => ({
              select: () => {
                expect(col).toBe('recovery_sent_at')
                expect(v).toBeNull()
                expect(typeof patch.recovery_sent_at).toBe('string')
                state.claims.push(id)
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
  sendSignupRecoveryEmail: async (p: { to: string }) => {
    if (state.sendFails.has(p.to)) throw new Error('outbox unavailable')
    // The claim must already be down when the note is enqueued.
    expect(state.claims).toContain(p.to.split('@')[0])
    state.sent.push(p.to)
  },
}))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/signup-lead-recovery') as unknown as NextRequest
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

function lead(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@example.com`,
    first_name: null,
    display_name: null,
    step_reached: 2,
    updated_at: hoursAgo(30),
    converted_at: null,
    recovery_sent_at: null,
    payload: {},
    ...over,
  }
}

beforeEach(() => {
  state.rows = []
  state.readError = null
  state.sendFails.clear()
  state.claims = []
  state.sent = []
  state.limit = null
  state.order = null
  state.filters = []
})

describe('GET /api/cron/signup-lead-recovery', () => {
  it('bounds the driving query by the declared budget, coldest lead first, with the five rule filters', async () => {
    state.rows = [lead('a')]
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.limit).toBe(200)
    expect(state.order).toBe('updated_at:asc')
    // Five, not four: the source exclusion joined the rule when event guests stopped being chased
    // for a signup they never abandoned. Asserted in full rather than by length so that dropping a
    // filter cannot pass by adding another.
    expect(state.filters).toEqual([
      'converted_at is null',
      'recovery_sent_at is null',
      `source in ${recoveryExcludedSourceFilter()}`,
      'step_reached >= 2',
      'updated_at <= cutoff',
    ])
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, scanned: 1, due: 1, sent: 1, failed: 0 })
    expect(body.budget).toMatchObject({ processed: 1, remaining: 0, budget_items: 200 })
  })

  it('skips a converted lead and an already-mailed lead, and mails the qualifying one', async () => {
    state.rows = [
      lead('converted', { converted_at: hoursAgo(2) }),
      lead('mailed', { recovery_sent_at: hoursAgo(2) }),
      lead('early', { step_reached: 1 }),
      lead('warm', { updated_at: hoursAgo(3) }),
      lead('due'),
    ]
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.claims).toEqual(['due'])
    expect(state.sent).toEqual(['due@example.com'])
    expect(await res.json()).toMatchObject({ scanned: 5, due: 1, sent: 1, lost: 0, failed: 0 })
  })

  it('answers 500 when a note could not be enqueued, keeps that claim, and still sends the rest', async () => {
    state.rows = [lead('a'), lead('b')]
    state.sendFails.add('a@example.com')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(state.claims).toEqual(['a', 'b'])
    expect(state.sent).toEqual(['b@example.com'])
    expect(await res.json()).toMatchObject({ ok: false, sent: 1, failed: 1 })
  })

  it('answers 500 when the read itself fails, with nothing claimed', async () => {
    state.readError = { message: 'relation is being vacuumed' }
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(state.claims).toEqual([])
    expect(await res.json()).toEqual({ error: 'signup lead recovery failed' })
  })
})
