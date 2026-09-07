import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// ── A GET of a lead's unsubscribe link must NEVER unsubscribe anyone (LIVE-156) ─────────────────
//
// WHY THIS TEST EXISTS. /u/scan is the unsubscribe URL in every scan-intro / nurture email sent to a
// LEAD (a contacts row with no profile, so the member-keyed /unsubscribe page does not apply). Until
// 2026-09-06 the GET handler flipped contacts.consent_state to 'unsubscribed' before it rendered:
// corporate link scanners and mail-client prefetchers GET every URL in an email, so leads were opted
// out without a click, and nothing failed loudly. SCAN-552 fixed exactly this on the member sibling
// (app/unsubscribe/page.tsx + app/api/unsubscribe/route.ts); this is the same fix on this route.
//
// Three things are pinned here:
//   1. a GET with a VALID token writes nothing and touches no table, and renders a confirm button;
//   2. POST still performs the write (the confirm form's submit AND the RFC 8058 one-click), and
//      still re-verifies the token;
//   3. the source shape: the GET handler's own body never names the write.

const db = vi.hoisted(() => ({
  /** Every table the handler reached for, in order. A GET must leave this empty. */
  tables: [] as string[],
  /** Every patch applied to contacts, with the id it was scoped to. */
  updates: [] as { patch: Record<string, unknown>; id: unknown }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      db.tables.push(table)
      return {
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: unknown) {
              db.updates.push({ patch, id })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }),
}))

import { GET, POST } from './route'
import { makeLeadUnsubToken } from '@/lib/connections/lead-unsub'

const CONTACT = '11111111-2222-3333-4444-555555555555'
const url = (c: string, t: string) => `https://x.test/u/scan?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}`

// Comments are stripped before the shape check: this file's header names the write ON PURPOSE (it
// is the record of what went wrong), and a shape test measures code, not prose.
const ROUTE = readFileSync('app/u/scan/route.ts', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-lead-unsub-route-test-0000')
  db.tables.length = 0
  db.updates.length = 0
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /u/scan is inert', () => {
  it('renders a confirm form for a valid token and writes nothing', async () => {
    const res = await GET(new Request(url(CONTACT, makeLeadUnsubToken(CONTACT))))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Unsubscribe from Frequency email?')
    expect(body).toMatch(/<form method="post"/)
    expect(body).toMatch(/<button type="submit"/)
    // The confirm form posts the SAME token back to this route.
    expect(body).toContain(`/u/scan?c=${CONTACT}&amp;t=${makeLeadUnsubToken(CONTACT)}`)
    // Nothing that looks like the done state, because nothing happened.
    expect(body).not.toContain("You're unsubscribed")

    expect(db.tables).toEqual([])
    expect(db.updates).toEqual([])
  })

  it('shows the expired layout, and no button, for a bad token', async () => {
    const res = await GET(new Request(url(CONTACT, 'f'.repeat(32))))
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toContain('Link expired')
    expect(body).not.toMatch(/<button/)
    expect(db.tables).toEqual([])
  })

  it('shows the expired layout when a param is missing', async () => {
    const res = await GET(new Request('https://x.test/u/scan'))
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Link expired')
    expect(db.tables).toEqual([])
  })
})

describe('POST /u/scan performs the unsubscribe', () => {
  it('writes consent_state unsubscribed for a valid token', async () => {
    const res = await POST(new Request(url(CONTACT, makeLeadUnsubToken(CONTACT)), { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("You're unsubscribed")

    expect(db.tables).toEqual(['contacts'])
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].id).toBe(CONTACT)
    expect(db.updates[0].patch.consent_state).toBe('unsubscribed')
  })

  it('re-verifies the token: a bad one writes nothing', async () => {
    const res = await POST(new Request(url(CONTACT, 'f'.repeat(32)), { method: 'POST' }))
    expect(res.status).toBe(400)
    expect(db.tables).toEqual([])
    expect(db.updates).toEqual([])
  })
})

describe('source shape: the write can only happen from POST', () => {
  it('the GET handler body never names the write or the unsubscribed state', () => {
    const get = /export async function GET[\s\S]*?\n\}/.exec(ROUTE)?.[0] ?? ''
    expect(get).not.toBe('')
    expect(get).not.toMatch(/unsubscribed/)
    expect(get).not.toMatch(/\bunsubscribe\(/)
    expect(get).not.toMatch(/createAdminClient/)
    // Positive control: GET still VERIFIES, so a bad link never gets a confirm button.
    expect(get).toMatch(/verifiedContactId\(/)
  })

  it('the POST handler body is the one that reaches the write', () => {
    const post = /export async function POST[\s\S]*?\n\}/.exec(ROUTE)?.[0] ?? ''
    expect(post).toMatch(/\bunsubscribe\(/)
    expect(post).toMatch(/verifiedContactId\(/)
  })
})
