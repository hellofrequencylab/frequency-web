import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Turning newsletters off on Manage emails stops the next marketing broadcast (LIVE-2326) ─────────
//
// The Manage emails page carries the same (profileId, 'lifecycle') token as the footer's one-click
// unsubscribe, and its "lifecycle" toggle is the member's newsletter switch. Broadcasts to subscribed
// members are gated on the email_marketing CONSENT scope (lib/comms/send-gate.ts), which never reads the
// preference, so the toggle has to revoke that consent and unsubscribe the linked contacts the way the
// one-click unsubscribe does (app/unsubscribe/actions.ts, SCAN-728). Pinned over an in-memory ledger.

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
import { setEmailCategoryPreference } from './actions'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { hasConsent } from '@/lib/consent/consent'

const PID = '00000000-0000-4000-8000-000000002326'
const EMAIL = 'member@example.com'

function token(): string {
  const url = new URL(buildUnsubscribeUrl({ baseUrl: 'https://app.test', profileId: PID, category: 'lifecycle' }))
  return url.searchParams.get('t')!
}
const toggle = (category: string, subscribed: boolean) =>
  setEmailCategoryPreference({ profileId: PID, tokenCategory: 'lifecycle', token: token(), category, subscribed })

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-manage-emails-actions-test-2326')
  db.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  db.tables.consent_records.push({ profile_id: PID, scope: 'email_marketing', granted: true, created_at: '2026-01-01T00:00:00.000Z' })
  db.tables.contacts.push({ id: 'c1', email: EMAIL, profile_id: PID, consent_state: 'subscribed' })
})

describe('setEmailCategoryPreference, newsletters off (LIVE-2326)', () => {
  it('revokes email_marketing consent so the next broadcast is refused, and unsubscribes the contact', async () => {
    expect(await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })).toEqual({ allowed: true, reason: 'ok' })
    const res = await toggle('lifecycle', false)
    expect(res).toEqual({ data: { category: 'lifecycle', subscribed: false } })
    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
    expect(await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })).toEqual({ allowed: false, reason: 'no_consent' })
    expect(db.tables.contacts[0].consent_state).toBe('unsubscribed')
    expect(db.tables.notification_preferences[0]).toMatchObject({ profile_id: PID, email_lifecycle: false })
  })

  it('a failed consent write is a failed save', async () => {
    db.fail = { table: 'consent_records', op: 'insert' }
    expect(await toggle('lifecycle', false)).toEqual({ error: expect.stringMatching(/Could not save/) })
  })

  it('turning it back on grants no marketing consent', async () => {
    await toggle('lifecycle', false)
    const res = await toggle('lifecycle', true)
    expect(res).toEqual({ data: { category: 'lifecycle', subscribed: true } })
    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
  })

  it('another category leaves marketing consent alone', async () => {
    await toggle('events', false)
    expect(await hasConsent(PID, 'email_marketing')).toBe(true)
    expect(db.tables.contacts[0].consent_state).toBe('subscribed')
  })
})
