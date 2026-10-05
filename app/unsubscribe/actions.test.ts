import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Unsubscribing from a marketing campaign must stop the NEXT marketing campaign (SCAN-728) ─────
//
// A global broadcast (lib/email-studio/send.ts) gates each member under the marketing consent scope
// but mints its footer and List-Unsubscribe links with category 'lifecycle'. processUnsubscribe used
// to flip only email_lifecycle, which the marketing gate never reads (lib/comms/send-gate.ts forces
// prefEnabled for marketing and decides on hasConsent(email_marketing) alone), so the member who
// clicked was delivered the next campaign. This pins the chain end to end over an in-memory ledger:
// the emitted lifecycle link, the action, then resolveSendGate(marketing) answers no_consent and the
// linked contact row reads unsubscribed.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fail: null as null | { table: string; op: string },
  reset() {
    this.tables = { notification_preferences: [], consent_records: [], contacts: [] }
    this.fail = null
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const rows = () => (db.tables[table] ??= [])
      const filters: [string, unknown][] = []
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
      let payload: Row = {}
      let single = false
      const matches = (r: Row) => filters.every(([k, v]) => r[k] === v)
      const run = () => {
        if (db.fail && db.fail.table === table && db.fail.op === op) return { data: null, error: { message: 'db down' } }
        if (op === 'insert') {
          rows().push({ ...payload, created_at: new Date(Date.now() + rows().length).toISOString() })
          return { data: null, error: null }
        }
        if (op === 'upsert') {
          const idx = rows().findIndex((r) => r.profile_id === payload.profile_id)
          if (idx >= 0) rows()[idx] = payload
          else rows().push(payload)
          return { data: null, error: null }
        }
        if (op === 'update') {
          for (const r of rows()) if (matches(r)) Object.assign(r, payload)
          return { data: null, error: null }
        }
        const found = rows().filter(matches)
        return { data: single ? found[found.length - 1] ?? null : found, error: null }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        insert: (v: Row) => ((op = 'insert'), (payload = v), b),
        upsert: (v: Row) => ((op = 'upsert'), (payload = v), b),
        update: (v: Row) => ((op = 'update'), (payload = v), b),
        eq: (k: string, v: unknown) => (filters.push([k, v]), b),
        order: () => b,
        limit: () => b,
        maybeSingle: () => ((single = true), b),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: vi.fn(async () => false), suppress: vi.fn(async () => {}) }))
vi.mock('@/lib/comms/contact-preferences', () => ({
  CONTACT_TOPICS: ['dispatches', 'events', 'marketing'],
  setContactChannelPreference: vi.fn(async () => true),
}))

import { readFileSync } from 'node:fs'
import { processUnsubscribe } from './actions'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { hasConsent } from '@/lib/consent/consent'

const PID = '00000000-0000-4000-8000-000000000728'
const EMAIL = 'member@example.com'

/** The link a global broadcast puts in its footer, as send.ts mints it (category 'lifecycle'). */
function emittedLink(): { profileId: string; category: string; token: string } {
  const send = readFileSync('lib/email-studio/send.ts', 'utf8')
  expect(send).toMatch(/buildUnsubscribeUrl\(\{[^}]*category:\s*'lifecycle'/)
  const url = new URL(buildUnsubscribeUrl({ baseUrl: 'https://app.test', profileId: PID, category: 'lifecycle' }))
  return { profileId: url.searchParams.get('p')!, category: url.searchParams.get('c')!, token: url.searchParams.get('t')! }
}

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-unsubscribe-actions-test-728')
  db.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The member opted in (lib/crm/optin/store.ts grants the scope and subscribes the contact).
  db.tables.consent_records.push({ profile_id: PID, scope: 'email_marketing', granted: true, created_at: '2026-01-01T00:00:00.000Z' })
  db.tables.contacts.push({ id: 'c1', email: EMAIL, profile_id: PID, consent_state: 'subscribed' })
})

describe('processUnsubscribe on a marketing send link (SCAN-728)', () => {
  it('the marketing gate passes before the click', async () => {
    const before = await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })
    expect(before).toEqual({ allowed: true, reason: 'ok' })
  })

  it('revokes email_marketing consent so the next campaign is refused, and unsubscribes the contact', async () => {
    const res = await processUnsubscribe(emittedLink())
    expect(res).toEqual({ data: { category: 'lifecycle' } })

    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
    const after = await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })
    expect(after).toEqual({ allowed: false, reason: 'no_consent' })
    expect(db.tables.contacts[0].consent_state).toBe('unsubscribed')
    // The lifecycle preference still flips, as before.
    expect(db.tables.notification_preferences[0]).toMatchObject({ profile_id: PID, email_lifecycle: false })
    // The ledger record names its source so the audit trail reads as an unsubscribe.
    expect(db.tables.consent_records.at(-1)).toMatchObject({ scope: 'email_marketing', granted: false, source: 'unsubscribe' })
  })

  it('is idempotent: the RFC 8058 one-click POST can re-run it', async () => {
    const link = emittedLink()
    await processUnsubscribe(link)
    const res = await processUnsubscribe(link)
    expect(res).toEqual({ data: { category: 'lifecycle' } })
    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
    expect(db.tables.contacts[0].consent_state).toBe('unsubscribed')
  })

  it('a failed consent write is a failed unsubscribe, not a silent miss', async () => {
    db.fail = { table: 'consent_records', op: 'insert' }
    const res = await processUnsubscribe(emittedLink())
    expect(res).toEqual({ error: expect.stringMatching(/Could not save/) })
  })

  it('a failed contact flip is a failed unsubscribe too', async () => {
    db.fail = { table: 'contacts', op: 'update' }
    const res = await processUnsubscribe(emittedLink())
    expect(res).toEqual({ error: expect.stringMatching(/Could not save/) })
  })

  it('a non-lifecycle category leaves marketing consent alone', async () => {
    const url = new URL(buildUnsubscribeUrl({ baseUrl: 'https://app.test', profileId: PID, category: 'events' }))
    const res = await processUnsubscribe({ profileId: PID, category: 'events', token: url.searchParams.get('t')! })
    expect(res).toEqual({ data: { category: 'events' } })
    expect(await hasConsent(PID, 'email_marketing')).toBe(true)
    expect(db.tables.contacts[0].consent_state).toBe('subscribed')
  })
})
