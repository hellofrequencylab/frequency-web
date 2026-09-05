import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Scan two L2-03 (2026-09-05). The lifecycle cron stamped lifecycle_dayN_sent whether or not the
// notifications insert succeeded (the error was logged inside a .then and the update ran anyway),
// so a member whose insert failed was marked sent, never got the check-in, and could never be
// retried, while the run counted them as sent. And the three windows were evaluated independently,
// so a membership past day 7 with nothing stamped received Day 1, Day 3 and Day 7 in one second.
// These tests pin both corrections against the real handler: a flag goes down only after the insert
// returned no error, a failed insert is `failed` and unstamped, and one membership gets one
// notification per run with the earlier due flags stamped as superseded.

type Row = {
  id: string
  profile_id: string
  circle_id: string
  joined_at: string
  lifecycle_day1_sent: boolean
  lifecycle_day3_sent: boolean
  lifecycle_day7_sent: boolean
  profile: { id: string; display_name: string | null; email: string | null }
  circle: { name: string | null }
}

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  /** membership ids whose notifications insert fails. */
  insertFails: new Set<string>(),
  /** membership ids whose memberships update fails. */
  stampFails: new Set<string>(),
  inserted: [] as Record<string, unknown>[],
  stamps: [] as { id: string; patch: Record<string, unknown> }[],
  logged: { error: [] as { event: string; fields?: Record<string, unknown> }[] },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'memberships') {
        return {
          select: () => ({
            eq: () => ({ or: () => Promise.resolve({ data: state.rows, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              if (state.stampFails.has(id)) return Promise.resolve({ error: { message: 'connection reset' } })
              state.stamps.push({ id, patch })
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'notifications') {
        return {
          insert: (row: Record<string, unknown>) => {
            if (state.insertFails.has(String(row.reference_id))) {
              return Promise.resolve({ error: { message: 'new row violates check constraint notifications_type_check' } })
            }
            state.inserted.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => state.logged.error.push({ event, fields }),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/lifecycle-triggers') as unknown as NextRequest

const NOW = new Date('2026-09-05T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

function membership(over: Partial<Row> & { id: string }): Row {
  return {
    profile_id: `profile-${over.id}`,
    circle_id: 'c1',
    joined_at: daysAgo(1),
    lifecycle_day1_sent: false,
    lifecycle_day3_sent: false,
    lifecycle_day7_sent: false,
    profile: { id: `profile-${over.id}`, display_name: 'Ana', email: null },
    circle: { name: 'Sunrise' },
    ...over,
  }
}

beforeEach(() => {
  state.rows = []
  state.insertFails.clear()
  state.stampFails.clear()
  state.inserted.length = 0
  state.stamps.length = 0
  state.logged.error.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/lifecycle-triggers, a flag is stamped only after the insert landed', () => {
  it('sends Day 1 and stamps lifecycle_day1_sent when the insert returns no error', async () => {
    state.rows = [membership({ id: 'm1', joined_at: daysAgo(1) })]
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ recipient_id: 'profile-m1', reference_id: 'm1', type: 'lifecycle_day1' })
    expect(state.stamps).toEqual([{ id: 'm1', patch: { lifecycle_day1_sent: true } }])
    expect(await res.json()).toMatchObject({ ok: true, sent: { day1: 1, day3: 0, day7: 0 }, superseded: 0, failed: 0 })
  })

  it('a failed insert is counted as failed, logged with the membership, and left UNSTAMPED for the next run', async () => {
    state.rows = [membership({ id: 'm1', joined_at: daysAgo(3) }), membership({ id: 'm2', joined_at: daysAgo(1) })]
    state.insertFails.add('m1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(state.stamps).toEqual([{ id: 'm2', patch: { lifecycle_day1_sent: true } }])
    expect(await res.json()).toMatchObject({ ok: false, sent: { day1: 1, day3: 0, day7: 0 }, failed: 1 })
    expect(state.logged.error).toEqual([
      {
        event: 'cron.lifecycle_triggers.notify_failed',
        fields: { day: 3, membership_id: 'm1', profile_id: 'profile-m1', error: 'new row violates check constraint notifications_type_check' },
      },
    ])
    // The retry, once the insert works again: m1 is sent and stamped, nothing is sent twice.
    state.insertFails.clear()
    state.inserted.length = 0
    state.rows = [membership({ id: 'm1', joined_at: daysAgo(3) })]
    const retry = await GET(req)
    expect(retry.status).toBe(200)
    expect(state.inserted.map((r) => r.type)).toEqual(['lifecycle_day3'])
    expect(state.stamps.at(-1)).toEqual({ id: 'm1', patch: { lifecycle_day1_sent: true, lifecycle_day3_sent: true } })
  })

  it('a failed stamp after a landed insert is failed too, and loud', async () => {
    state.rows = [membership({ id: 'm1', joined_at: daysAgo(1) })]
    state.stampFails.add('m1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, sent: { day1: 0, day3: 0, day7: 0 }, failed: 1 })
    expect(state.logged.error[0]).toMatchObject({ event: 'cron.lifecycle_triggers.stamp_failed', fields: { membership_id: 'm1' } })
  })
})

describe('GET /api/cron/lifecycle-triggers, one check-in per membership per run', () => {
  it('a membership past day 7 with nothing stamped gets ONLY Day 7, and Day 1 + Day 3 are stamped as superseded', async () => {
    state.rows = [membership({ id: 'old', joined_at: daysAgo(30) })]
    const res = await GET(req)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toMatchObject({ type: 'lifecycle_day7', reference_id: 'old' })
    expect(state.stamps).toEqual([
      { id: 'old', patch: { lifecycle_day1_sent: true, lifecycle_day3_sent: true, lifecycle_day7_sent: true } },
    ])
    expect(await res.json()).toMatchObject({ ok: true, sent: { day1: 0, day3: 0, day7: 1 }, superseded: 2, failed: 0 })
  })

  it('a day-4 membership with Day 1 already stamped gets Day 3 alone, no supersession', async () => {
    state.rows = [membership({ id: 'm', joined_at: daysAgo(4), lifecycle_day1_sent: true })]
    const res = await GET(req)
    expect(state.inserted.map((r) => r.type)).toEqual(['lifecycle_day3'])
    expect(state.stamps).toEqual([{ id: 'm', patch: { lifecycle_day3_sent: true } }])
    expect(await res.json()).toMatchObject({ sent: { day1: 0, day3: 1, day7: 0 }, superseded: 0 })
  })

  it('nothing due yet writes nothing', async () => {
    state.rows = [membership({ id: 'fresh', joined_at: daysAgo(0) })]
    const res = await GET(req)
    expect(state.inserted).toEqual([])
    expect(state.stamps).toEqual([])
    expect(await res.json()).toMatchObject({ ok: true, processed: 1, sent: { day1: 0, day3: 0, day7: 0 } })
  })

  it('a superseded flag is never stamped when the one send failed', async () => {
    state.rows = [membership({ id: 'old', joined_at: daysAgo(30) })]
    state.insertFails.add('old')
    await GET(req)
    expect(state.stamps).toEqual([])
  })
})
