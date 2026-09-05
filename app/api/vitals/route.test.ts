import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ── /api/vitals is ANONYMOUS BY DESIGN, and that is a promise, not a description ────────────────
//
// WHY THIS TEST EXISTS. This handler is one of three routes that are `public` BY HUMAN ASSERTION in
// scripts/authz-route-ledger.json while writing through the RLS-bypassing admin client (LIVE-030).
// Its ledger entry says it "never resolves or stores a profile_id", and that single sentence is what
// keeps web-vitals rows OUTSIDE the `analytics` consent scope (lib/consent/scopes.ts, ADR-922):
// consent governs data tied to an ACCOUNT, and these rows are tied to none. A reason is not a proof,
// so everything the reason claims is asserted here against the real handler.
//
// The failure this closes is silent in every direction. Adding a `profile_id` here would throw
// nothing, fail nothing and 204 exactly as before, while quietly moving a whole telemetry stream
// inside a consent scope nobody asked the member about. Reading a cookie to "enrich" a vital would
// do the same. Neither would show up in a type, a lint, or the response — the endpoint returns an
// EMPTY body by design, so there is nothing to eyeball. That silence is why these assertions exist.

const db = vi.hoisted(() => ({
  tables: [] as string[],
  inserts: [] as Record<string, unknown>[][],
  fail: false,
  /** What a RESOLVED insert carries. supabase-js resolves `{ error }`; it never rejects on a DB error. */
  result: { error: null as { message: string } | null },
}))
const logged = vi.hoisted(() => ({
  error: [] as { event: string; fields?: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      db.tables.push(table)
      return {
        insert(rows: Record<string, unknown>[]) {
          db.inserts.push(rows)
          // The route chains `.then(undefined, () => {})`, so the mock has to be a real thenable —
          // and a rejecting one is how the fail-safe below is exercised.
          // 2026-09-05 (scan2 L2-08): the route now awaits and READS `{ error }`. The rejecting arm
          // stays for the transport case; `db.result` is the resolved-error case the old chain
          // never saw, and the one supabase-js actually produces.
          return db.fail ? Promise.reject(new Error('interaction_events is down')) : Promise.resolve(db.result)
        },
      }
    },
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

const vital = (over: Record<string, unknown> = {}) => ({
  name: 'LCP',
  value: 1234.6,
  rating: 'good',
  id: 'v1-1700000000000-1',
  navigationType: 'navigate',
  path: '/circles/:id',
  t: Date.now(),
  ...over,
})

/** A request the handler may only read the BODY of. Touching `headers`, `cookies` or `nextUrl`
 *  throws, which is how "it never resolves a caller" is proved rather than described. */
function sealedRequest(body: unknown): NextRequest {
  const real = new Request('https://frequencylocal.com/api/vitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-access-token=REAL_SESSION' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'headers' || prop === 'cookies' || prop === 'nextUrl') {
        throw new Error(`the vitals sink read req.${String(prop)} — it must never resolve a caller`)
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as NextRequest
}

const rows = () => db.inserts.flat()

beforeEach(() => {
  db.tables.length = 0
  db.inserts.length = 0
  db.fail = false
  db.result = { error: null }
  logged.error.length = 0
})

describe('what a vitals row must never carry', () => {
  it('writes profile_id NULL and surface NULL on every row, whatever the payload says', async () => {
    // The payload is attacker-shaped on purpose: a client asking to be identified must be ignored.
    const res = await POST(
      sealedRequest({
        sessionId: 'tab-abc',
        profile_id: '00000000-0000-0000-0000-000000000001',
        events: [vital(), vital({ name: 'CLS', value: 0.0123, id: 'v1-2' })],
      }),
    )
    expect(res.status).toBe(204)
    expect(db.tables).toEqual(['interaction_events'])
    expect(rows()).toHaveLength(2)
    for (const row of rows()) {
      expect(row.profile_id).toBeNull()
      expect(row.surface).toBeNull()
    }
  })

  it('never lets a member-identifying key reach the props bag', async () => {
    await POST(sealedRequest({ sessionId: 's', events: [vital({ profileId: 'p1', email: 'a@b.c', ip: '1.2.3.4' })] }))
    // `vp` is the viewport BUCKET (three values, a property of the page view — ADR-922); everything
    // else is the metric itself. A subset check rather than an exact list, so adding a page-level
    // field is allowed and adding a person-level one is not.
    const allowed = new Set(['metric', 'value', 'rating', 'mid', 'nav', 'vp'])
    const props = rows()[0].props as Record<string, unknown>
    expect(Object.keys(props).filter((k) => !allowed.has(k))).toEqual([])
  })

  it('answers with an EMPTY body, so the sink can never echo a payload back', async () => {
    const res = await POST(sealedRequest({ sessionId: 's', events: [vital()] }))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('never reads the caller: headers and cookies are off limits', async () => {
    // The Proxy throws on any such read, so a handler that grew one would fail here rather than
    // quietly start tying page performance to a session.
    await expect(POST(sealedRequest({ sessionId: 's', events: [vital()] }))).resolves.toBeDefined()
  })
})

describe('the bounds that stand in for the rate limiter it deliberately does not have', () => {
  it('caps a batch at MAX_VITALS_BATCH rows however many are posted', async () => {
    const events = Array.from({ length: 50 }, (_, i) => vital({ id: `v-${i}` }))
    await POST(sealedRequest({ sessionId: 's', events }))
    expect(rows().length).toBeLessThanOrEqual(8)
  })

  it('truncates the session id and drops a non-string one', async () => {
    await POST(sealedRequest({ sessionId: 'x'.repeat(200), events: [vital()] }))
    expect(String(rows()[0].session_id)).toHaveLength(64)
    db.inserts.length = 0
    await POST(sealedRequest({ sessionId: { evil: true }, events: [vital()] }))
    expect(rows()[0].session_id).toBeNull()
  })

  it('never banks a timestamp from the future', async () => {
    const before = Date.now()
    await POST(sealedRequest({ sessionId: 's', events: [vital({ t: Date.now() + 10 * 365 * 24 * 3600_000 })] }))
    expect(new Date(String(rows()[0].occurred_at)).getTime()).toBeLessThanOrEqual(Date.now())
    expect(new Date(String(rows()[0].occurred_at)).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('writes NOTHING when the batch normalises to nothing', async () => {
    const res = await POST(sealedRequest({ sessionId: 's', events: [{ name: 'NOT_A_VITAL', value: 1 }, 'garbage', null] }))
    expect(res.status).toBe(204)
    expect(db.inserts).toEqual([]) // no empty insert, no round trip
  })
})

describe('the fail-safe posture: telemetry never surfaces an error', () => {
  it('400s a malformed body with no message', async () => {
    const res = await POST(sealedRequest('{not json'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('')
  })

  it('still 204s when the write fails, and leaks nothing about why', async () => {
    db.fail = true
    const res = await POST(sealedRequest({ sessionId: 's', events: [vital()] }))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    // 2026-09-05 (scan2 L2-08): leaks nothing to the CLIENT. The logs get the whole story.
    expect(logged.error).toHaveLength(1)
    expect(logged.error[0].fields).toMatchObject({ table: 'interaction_events', error: 'interaction_events is down' })
  })

  // Scan two L2-08 (2026-09-05): `.then(undefined, () => {})` only ever handled a rejection, and
  // supabase-js resolves `{ error }`, so a failing insert was dropped with nothing in the logs. The
  // resolved-error shape is the one that matters, and it must land in the log at error level with
  // the table name while the beacon still gets its 204.
  it('logs a RESOLVED { error } at error level with the table name, and still answers 204', async () => {
    db.result = { error: { message: 'permission denied for table interaction_events' } }
    const res = await POST(sealedRequest({ sessionId: 's', events: [vital()] }))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(logged.error).toEqual([
      {
        event: 'vitals.insert_failed',
        fields: { table: 'interaction_events', rows: 1, error: 'permission denied for table interaction_events' },
      },
    ])
  })

  it('logs nothing when the write succeeds', async () => {
    await POST(sealedRequest({ sessionId: 's', events: [vital()] }))
    expect(logged.error).toEqual([])
  })
})
