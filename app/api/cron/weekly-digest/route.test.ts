import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Scan two L2-02 (2026-09-05): the weekly digest had no run-level idempotency and no per-member
// fail-safe. A second invocation in the same ISO week re-sent to everyone, and one member's throw
// aborted the loop for everyone after them while the run still answered 200. These tests pin the
// two guarantees against the real handler with every collaborator mocked: a member is claimed in
// cron_run_markers under `weekly-digest:<profile_id>:<ISO week>` BEFORE the send and a taken claim
// is a skip; a throw is counted, released for the next run, and turns the response into a 500 so
// the heartbeat fail-pings.

const state = vi.hoisted(() => ({
  profiles: [] as string[],
  /** Members whose assemble throws. */
  assembleThrows: new Set<string>(),
  /** Members whose send throws. */
  sendThrows: new Set<string>(),
  /** Marker keys already claimed (a previous invocation this week). */
  claimed: new Set<string>(),
  claimInserts: [] as string[],
  releases: [] as string[],
  sends: [] as string[],
  logged: { error: [] as { event: string; fields?: Record<string, unknown> }[] },
}))

vi.mock('@/lib/digest', () => ({
  listProfileIdsForDigest: () => Promise.resolve(state.profiles),
  assembleDigestForProfile: (id: string) => {
    if (state.assembleThrows.has(id)) return Promise.reject(new Error(`assemble broke for ${id}`))
    return Promise.resolve({
      profileId: id,
      displayName: 'Ana',
      email: `${id}@example.com`,
      dispatches: [],
      upcomingEvents: [{ title: 'Sunrise circle', startsAt: '2026-09-07T13:00:00Z', location: null, url: '/e' }],
      topStreak: null,
      rank: null,
      goAgain: [],
    })
  },
}))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: () => Promise.resolve({ allowed: true }),
}))
vi.mock('@/lib/email', () => ({
  sendWeeklyDigestEmail: (p: { recipientProfileId: string }) => {
    if (state.sendThrows.has(p.recipientProfileId)) return Promise.reject(new Error('enqueue(email) failed: db down'))
    state.sends.push(p.recipientProfileId)
    return Promise.resolve()
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'cron_run_markers') throw new Error(`unexpected table ${table}`)
      return {
        insert: ({ key }: { key: string }) => {
          state.claimInserts.push(key)
          if (state.claimed.has(key)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
          }
          state.claimed.add(key)
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          eq: (_col: string, key: string) => {
            state.releases.push(key)
            state.claimed.delete(key)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  }),
}))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => state.logged.error.push({ event, fields }),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/weekly-digest') as unknown as NextRequest

beforeEach(() => {
  state.profiles = []
  state.assembleThrows.clear()
  state.sendThrows.clear()
  state.claimed.clear()
  state.claimInserts.length = 0
  state.releases.length = 0
  state.sends.length = 0
  state.logged.error.length = 0
  // A Sunday 14:00 UTC run in ISO week 36 of 2026.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-06T14:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/weekly-digest, idempotency per member per ISO week', () => {
  it('claims weekly-digest:<profile_id>:<ISO week> before each send', async () => {
    state.profiles = ['p1', 'p2']
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.claimInserts).toEqual(['weekly-digest:p1:2026-W36', 'weekly-digest:p2:2026-W36'])
    expect(state.sends).toEqual(['p1', 'p2'])
    expect(await res.json()).toMatchObject({ ok: true, sent: 2, deduped: 0, failed: 0 })
  })

  it('does not send twice in one week: a second run covers nobody already claimed', async () => {
    state.profiles = ['p1', 'p2']
    await GET(req)
    state.sends.length = 0
    const second = await GET(req)
    expect(state.sends).toEqual([])
    expect(await second.json()).toMatchObject({ ok: true, sent: 0, deduped: 2, failed: 0 })
  })

  it('a member skipped by a taken claim is not a failure, and the next week is a fresh key', async () => {
    state.profiles = ['p1']
    state.claimed.add('weekly-digest:p1:2026-W36')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.sends).toEqual([])
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'))
    await GET(req)
    expect(state.claimInserts.at(-1)).toBe('weekly-digest:p1:2026-W37')
    expect(state.sends).toEqual(['p1'])
  })

  it('ISO week label crosses the year boundary the ISO way', async () => {
    state.profiles = ['p1']
    // 2027-01-01 is a Friday: it belongs to ISO week 53 of 2026, not week 1 of 2027.
    vi.setSystemTime(new Date('2027-01-01T14:00:00Z'))
    await GET(req)
    expect(state.claimInserts).toEqual(['weekly-digest:p1:2026-W53'])
  })
})

describe('GET /api/cron/weekly-digest, per-member fail-safe', () => {
  it('counts a member whose assemble throws, logs the member id, and keeps going', async () => {
    state.profiles = ['p1', 'p2', 'p3']
    state.assembleThrows.add('p2')
    const res = await GET(req)
    expect(state.sends).toEqual(['p1', 'p3'])
    expect(await res.json()).toMatchObject({ ok: false, sent: 2, failed: 1 })
    const line = state.logged.error.find((l) => l.event === 'cron.weekly_digest.member_failed')
    expect(line?.fields).toMatchObject({ profile_id: 'p2', error: 'assemble broke for p2' })
  })

  it('releases the claim when the send throws, so the next run retries that member only', async () => {
    state.profiles = ['p1', 'p2']
    state.sendThrows.add('p1')
    await GET(req)
    expect(state.releases).toEqual(['weekly-digest:p1:2026-W36'])
    expect(state.claimed.has('weekly-digest:p2:2026-W36')).toBe(true)
    // The retry.
    state.sendThrows.clear()
    state.sends.length = 0
    const retry = await GET(req)
    expect(state.sends).toEqual(['p1'])
    expect(await retry.json()).toMatchObject({ ok: true, sent: 1, deduped: 1, failed: 0 })
  })

  it('answers 500 when any member failed, so the heartbeat fail-pings', async () => {
    state.profiles = ['p1']
    state.sendThrows.add('p1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, sent: 0, failed: 1 })
  })
})
