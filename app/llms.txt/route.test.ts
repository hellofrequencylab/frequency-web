import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

// ── /llms.txt is the paragraph answer engines quote about us ───────────────────────────────────
//
// WHY THIS TEST EXISTS. This is the third of the routes that are `public` BY HUMAN ASSERTION in
// scripts/authz-route-ledger.json while reading through the RLS-bypassing admin client (LIVE-030).
// Its ledger entry says it reads "live public counts and the operator's pricing config, all of
// which /pricing and the public pages already show. No caller identity anywhere." Two things make
// that worth pinning rather than trusting:
//
//   1. WHAT IT PUBLISHES IS AGGREGATE. Every stat is a `head: true, count: 'exact'` query — a
//      NUMBER, with no rows fetched. Dropping `head: true` is a one-word edit that still renders an
//      identical page (the route only reads `count`) while pulling every matching member row into
//      the process. So the tests below hand the handler POISONED rows alongside each count and
//      require that not one character of them reaches the output, AND that the query stayed a head
//      count. The output alone cannot tell you which of those two things is true.
//   2. IT IS DAILY-ISR AND WORLD-READABLE. Whatever this emits is cached for a day and then quoted
//      back by machines we do not control. A leak here has no reader who might notice.
//
// The third claim is structural: a fail-safe that swallows errors must still be OBSERVABLE, so the
// last block proves the degraded page is a page (200, no stats lines) and not a leaked stack trace.

const db = vi.hoisted(() => ({
  selects: [] as { table: string; columns: string; options: unknown }[],
  results: {} as Record<string, { count?: number | null; data?: unknown; error?: unknown }>,
  throwOnEveryQuery: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const settle = () => {
        if (db.throwOnEveryQuery) return Promise.reject(new Error('supabase unreachable: connection refused at db.internal:5432'))
        return Promise.resolve(db.results[table] ?? { count: null, data: null, error: null })
      }
      const builder: Record<string, unknown> = {
        select(columns: string, options?: unknown) {
          db.selects.push({ table, columns, options })
          return builder
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => settle().then(resolve, reject),
      }
      for (const chain of ['eq', 'in', 'is', 'gte', 'lte', 'order', 'limit', 'not', 'or']) {
        builder[chain] = () => builder
      }
      builder.maybeSingle = settle
      return builder
    },
  }),
}))

import { GET } from './route'

const SOON = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()

/** Rows nobody may ever see in a public brand summary. They ride along with each count so the test
 *  measures the ROUTE's discipline rather than the fixture's tidiness. */
const POISON = [
  { id: 'p1', display_name: 'Jane Poison', handle: 'janepoison', email: 'jane.poison@example.com' },
  { id: 'p2', display_name: 'Sam Poison', handle: 'sampoison', email: 'sam.poison@example.com' },
]
const POISON_STRINGS = ['Jane Poison', 'janepoison', 'jane.poison@example.com', 'Sam Poison', 'sampoison']

beforeEach(() => {
  db.selects.length = 0
  db.throwOnEveryQuery = false
  db.results = {
    profiles: { count: 1234, data: POISON, error: null },
    circles: { count: 56, data: POISON, error: null },
    practices: { count: 78, data: POISON, error: null },
    pillars: { count: 4, data: POISON, error: null },
    events: {
      count: 9,
      data: [
        { id: 'e1', starts_at: SOON, parent_event_id: null },
        { id: 'e2', starts_at: SOON, parent_event_id: 'e1' },
        { id: 'e3', starts_at: SOON, parent_event_id: null, title: 'Jane Poison book club' },
      ],
      error: null,
    },
    pricing_settings: { data: [], error: null },
  }
})

const body = async () => (await GET()).text()

describe('it publishes counts, and only counts', () => {
  it('states each live number', async () => {
    const out = await body()
    expect(out).toContain('## Frequency Stats')
    expect(out).toContain('Members: 1,234')
    expect(out).toContain('Live Circles: 56')
    expect(out).toContain('Practices: 78')
    expect(out).toContain('Pillars: 4')
  })

  it('emits not one character of the rows those queries returned', async () => {
    const out = await body()
    for (const leak of POISON_STRINGS) expect(out, leak).not.toContain(leak)
  })

  it('keeps every stat query a HEAD count, so no rows are fetched in the first place', async () => {
    await body()
    const counted = db.selects.filter((s) => ['profiles', 'circles', 'practices', 'pillars'].includes(s.table))
    expect(counted.map((s) => s.table).sort()).toEqual(['circles', 'pillars', 'practices', 'profiles'])
    for (const s of counted) {
      expect(s.columns, s.table).toBe('*')
      expect(s.options, s.table).toMatchObject({ head: true, count: 'exact' })
    }
  })

  it('counts upcoming Events as SERIES, not rows (ADR-897)', async () => {
    // Three rows, two series: e2 is a later date of e1. Publishing the row count would tell an
    // answer engine there are more gatherings than a visitor could actually show up to.
    expect(await body()).toContain('Upcoming Events: 2')
  })
})

describe('what a world-readable, day-cached file must never contain', () => {
  it('carries no email address but the published contact one', async () => {
    const emails = new Set((await body()).match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])
    expect([...emails]).toEqual([CONTACT_EMAIL])
  })

  it('links only to public pages, under our own origin', async () => {
    const links = [...(await body()).matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(10)
    for (const href of links) {
      expect(href.startsWith(SITE_URL), href).toBe(true)
      const path = href.slice(SITE_URL.length)
      expect(/^\/(admin|manage|api|settings|dev|auth|onboarding)\b/.test(path), href).toBe(false)
    }
  })

  it('is served as plain text with a public, shared-cache header', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('cache-control')).toContain('public')
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('the fail-safe degrades to fewer facts, never to an error page', () => {
  it('still serves the summary when every read throws, with the stats block simply absent', async () => {
    db.throwOnEveryQuery = true
    const res = await GET()
    const out = await res.text()
    expect(res.status).toBe(200)
    expect(out).not.toContain('## Frequency Stats')
    expect(out).toContain('# Frequency')
    expect(out).toContain('## Key pages')
    // A swallowed error must not reappear in the body: no message, no host, no stack.
    for (const trace of ['supabase unreachable', 'db.internal', 'Error:', 'at Object.']) {
      expect(out, trace).not.toContain(trace)
    }
  })
})
