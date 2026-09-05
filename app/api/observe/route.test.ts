import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Scan two L2-08 (2026-09-05). /api/observe discarded its insert result with
// `.then(undefined, () => {})`: that arm handles a REJECTION, and supabase-js resolves `{ error }`,
// so a failing interaction_events insert (column drift, RLS, quota) was dropped with nothing in the
// logs and the route answered 204. A silent, total loss of first-party analytics. These tests pin
// the corrected contract with a client that RESOLVES `{ error }`, the shape supabase-js actually
// produces: the error is logged at error level with the table name, and the beacon still gets its
// 204 because a beacon must never retry.

const db = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[][],
  result: { error: null as { message: string } | null },
  reject: false,
}))
const logged = vi.hoisted(() => ({
  error: [] as { event: string; fields?: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'auth-1' } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'profile-1' } }) }) }),
      }),
    }),
}))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: () => Promise.resolve(true) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (rows: Record<string, unknown>[]) => {
        db.inserts.push(rows)
        if (db.reject) return Promise.reject(new Error(`${table} fetch failed`))
        // supabase-js RESOLVES with { error }. This is the shape the old `.then(undefined, …)` never saw.
        return Promise.resolve(db.result)
      },
    }),
  }),
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => logged.error.push({ event, fields }),
  },
}))

import { POST } from './route'

const request = (body: unknown) =>
  new Request('https://frequencylocal.com/api/observe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest

const batch = {
  sessionId: 'tab-1',
  events: [{ kind: 'view', surface: 'feed', path: '/feed', props: {}, t: Date.now() }],
}

beforeEach(() => {
  db.inserts.length = 0
  db.result = { error: null }
  db.reject = false
  logged.error.length = 0
})

describe('POST /api/observe, the insert result is read (L2-08)', () => {
  it('writes the batch and logs nothing when the insert succeeds', async () => {
    const res = await POST(request(batch))
    expect(res.status).toBe(204)
    expect(db.inserts).toHaveLength(1)
    expect(logged.error).toEqual([])
  })

  it('logs a RESOLVED { error } at error level with the table name, and still answers 204', async () => {
    db.result = { error: { message: 'column "props" of relation "interaction_events" does not exist' } }
    const res = await POST(request(batch))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(logged.error).toEqual([
      {
        event: 'observe.insert_failed',
        fields: {
          table: 'interaction_events',
          rows: 1,
          error: 'column "props" of relation "interaction_events" does not exist',
        },
      },
    ])
  })

  it('a transport that rejects outright is logged the same way and still answers 204', async () => {
    db.reject = true
    const res = await POST(request(batch))
    expect(res.status).toBe(204)
    expect(logged.error).toHaveLength(1)
    expect(logged.error[0].fields).toMatchObject({ table: 'interaction_events', error: 'interaction_events fetch failed' })
  })
})
