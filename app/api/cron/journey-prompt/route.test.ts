import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Scan two L2-02 + L2-04 (2026-09-05). The daily Journey prompt inserted one notifications row per
// enrolled member per invocation with nothing to refuse a second row the same day (L2-02), and
// swallowed every loader and push error into `ok: true, inapp: 0, push: 0`, so the loader being
// down for everyone read exactly like nobody being due (L2-04). These tests pin, against the real
// handler: the in-app row carries `journey-prompt:<profile_id>:<day>` and a unique violation on it
// is a dedupe, not a send and not a failure; a loader throw and a push throw are each logged at
// error level with the member id, counted, and turn the response into a 500; and the loader-failed
// count is reported on its own.

const state = vi.hoisted(() => ({
  members: [] as string[],
  loaderThrows: new Set<string>(),
  /** Members with nothing left to do (loader resolves null). */
  nothingDue: new Set<string>(),
  pushThrows: new Set<string>(),
  /** dedupe keys already present in notifications. */
  existingKeys: new Set<string>(),
  insertFails: new Set<string>(),
  inserted: [] as Record<string, unknown>[],
  pushed: [] as string[],
  logged: { error: [] as { event: string; fields?: Record<string, unknown> }[] },
}))

vi.mock('@/lib/journeys/progress', () => ({
  listEnrolledMemberIds: () => Promise.resolve(state.members),
}))
vi.mock('@/lib/journey-prompt', () => ({
  formatJourneyPrompt: (p: { journeyTitle: string; practiceTitle: string }) => `${p.journeyTitle}: ${p.practiceTitle}`,
  getDailyJourneyPrompt: (id: string) => {
    if (state.loaderThrows.has(id)) return Promise.reject(new Error('column journey_enrollments.x does not exist'))
    if (state.nothingDue.has(id)) return Promise.resolve(null)
    return Promise.resolve({ planId: 'plan-1', journeyTitle: 'Rest', practiceTitle: 'Breathe', timeNote: '' })
  },
}))
vi.mock('@/lib/push', () => ({
  sendPushToProfile: (id: string) => {
    if (state.pushThrows.has(id)) return Promise.reject(new Error('VAPID key missing'))
    state.pushed.push(id)
    return Promise.resolve(1)
  },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'notifications') throw new Error(`unexpected table ${table}`)
      return {
        insert: (row: Record<string, unknown>) => {
          state.inserted.push(row)
          const key = String(row.dedupe_key)
          if (state.insertFails.has(String(row.recipient_id))) {
            return Promise.resolve({ error: { code: '42703', message: 'column body does not exist' } })
          }
          if (state.existingKeys.has(key)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
          }
          state.existingKeys.add(key)
          return Promise.resolve({ error: null })
        },
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

const req = new Request('http://localhost/api/cron/journey-prompt') as unknown as NextRequest

beforeEach(() => {
  state.members = []
  state.loaderThrows.clear()
  state.nothingDue.clear()
  state.pushThrows.clear()
  state.existingKeys.clear()
  state.insertFails.clear()
  state.inserted.length = 0
  state.pushed.length = 0
  state.logged.error.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-05T13:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/journey-prompt, one in-app prompt per member per day (L2-02)', () => {
  it('stamps journey-prompt:<profile_id>:<day> on the in-app row', async () => {
    state.members = ['p1']
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(state.inserted[0]).toMatchObject({
      recipient_id: 'p1',
      type: 'journey_next_step',
      reference_id: 'plan-1',
      dedupe_key: 'journey-prompt:p1:2026-09-05',
    })
    expect(await res.json()).toMatchObject({ ok: true, candidates: 1, inapp: 1, push: 1, deduped: 0, failed: 0 })
  })

  it('a second run the same day inserts nothing new and reports it as deduped, not failed', async () => {
    state.members = ['p1', 'p2']
    await GET(req)
    const second = await GET(req)
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ ok: true, inapp: 0, deduped: 2, failed: 0 })
    expect(state.logged.error).toEqual([])
  })

  it('the next day is a fresh key', async () => {
    state.members = ['p1']
    await GET(req)
    vi.setSystemTime(new Date('2026-09-06T13:00:00Z'))
    const res = await GET(req)
    expect(state.inserted.at(-1)?.dedupe_key).toBe('journey-prompt:p1:2026-09-06')
    expect(await res.json()).toMatchObject({ inapp: 1, deduped: 0 })
  })

  it('an insert error that is not a unique violation is counted as failed and logged with the member', async () => {
    state.members = ['p1', 'p2']
    state.insertFails.add('p1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, inapp: 1, deduped: 0, failed: 1 })
    expect(state.logged.error).toEqual([
      { event: 'cron.journey_prompt.notify_failed', fields: { profile_id: 'p1', error: 'column body does not exist' } },
    ])
  })
})

describe('GET /api/cron/journey-prompt, nothing is swallowed (L2-04)', () => {
  it('"nobody was due" is ok: true with skipped = candidates and loaderFailed 0', async () => {
    state.members = ['p1', 'p2']
    state.nothingDue.add('p1').add('p2')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, candidates: 2, inapp: 0, push: 0, skipped: 2, loaderFailed: 0, failed: 0 })
  })

  it('the loader failing for everyone is ok: false, 500, loaderFailed = candidates, each member logged at error', async () => {
    state.members = ['p1', 'p2']
    state.loaderThrows.add('p1').add('p2')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, candidates: 2, inapp: 0, push: 0, skipped: 0, loaderFailed: 2, failed: 2 })
    expect(state.logged.error.map((l) => [l.event, l.fields?.profile_id])).toEqual([
      ['cron.journey_prompt.loader_failed', 'p1'],
      ['cron.journey_prompt.loader_failed', 'p2'],
    ])
    expect(state.logged.error[0].fields?.error).toBe('column journey_enrollments.x does not exist')
    expect(state.inserted).toEqual([])
  })

  it('a loader throw for one member does not stop the others', async () => {
    state.members = ['p1', 'p2', 'p3']
    state.loaderThrows.add('p2')
    const res = await GET(req)
    expect(state.inserted.map((r) => r.recipient_id)).toEqual(['p1', 'p3'])
    expect(await res.json()).toMatchObject({ ok: false, inapp: 2, loaderFailed: 1, failed: 1 })
  })

  it('a push throw is logged at error with the member id and counted, and the in-app row still lands', async () => {
    state.members = ['p1']
    state.pushThrows.add('p1')
    const res = await GET(req)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ ok: false, inapp: 1, push: 0, failed: 1, loaderFailed: 0 })
    expect(state.logged.error).toEqual([
      { event: 'cron.journey_prompt.push_failed', fields: { profile_id: 'p1', error: 'VAPID key missing' } },
    ])
  })
})
