import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── An unsubscribe from a marketing campaign must stop the next marketing campaign (SCAN-728) ────
//
// WHY THIS TEST EXISTS. A global broadcast mints its footer and List-Unsubscribe links with the
// `lifecycle` category (lib/email-studio/send.ts), even when the audience is the opt-in
// `subscribed_members` list, which the send-gate runs under `marketing`. Until 2026-10-05
// processUnsubscribe only flipped email_lifecycle, and the marketing gate never reads that
// preference: it decides on the email_marketing consent scope alone. So a member who clicked
// "Unsubscribe" (or whose mailbox POSTed the RFC 8058 one-click) was delivered the next campaign.
//
// Pinned here against the REAL action, the REAL consent ledger reader and the REAL send-gate over
// an in-memory stand-in for the three tables: after a lifecycle unsubscribe, the marketing gate
// denies with `no_consent` and every contacts row for the profile reads `unsubscribed`.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  prefs: [] as Row[],
  consent: [] as Row[],
  contacts: [] as Row[],
  failContacts: false,
  failConsent: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'notification_preferences') return prefsTable()
      if (table === 'consent_records') return consentTable()
      if (table === 'contacts') return contactsTable()
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))
vi.mock('@/lib/suppression', () => ({
  isSuppressed: vi.fn(async () => false),
  suppress: vi.fn(async () => {}),
}))

function prefsTable() {
  const q = {
    select: () => q,
    eq: (_k: string, v: unknown) => {
      q._pid = v as string
      return q
    },
    maybeSingle: async () => ({ data: db.prefs.find((r) => r.profile_id === q._pid) ?? null, error: null }),
    upsert: async (row: Row) => {
      const i = db.prefs.findIndex((r) => r.profile_id === row.profile_id)
      if (i >= 0) db.prefs[i] = row
      else db.prefs.push(row)
      return { error: null }
    },
    _pid: '',
  }
  return q
}

function consentTable() {
  const filters: Array<[string, unknown]> = []
  const q = {
    insert: async (row: Row) => {
      if (db.failConsent) throw new Error('consent_records down')
      db.consent.push({ ...row, created_at: new Date(Date.now() + db.consent.length).toISOString() })
      return { error: null }
    },
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters.push([k, v])
      return q
    },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => {
      const rows = db.consent
        .filter((r) => filters.every(([k, v]) => r[k] === v))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      return { data: rows[0] ?? null, error: null }
    },
  }
  return q
}

function contactsTable() {
  const q = {
    update: (patch: Row) => ({
      eq: async (k: string, v: unknown) => {
        if (db.failContacts) return { error: { message: 'contacts down' } }
        for (const r of db.contacts) if (r[k] === v) Object.assign(r, patch)
        return { error: null }
      },
    }),
  }
  return q
}

import { processUnsubscribe } from './actions'
import { makeUnsubscribeToken } from '@/lib/unsubscribe-tokens'
import { hasConsent } from '@/lib/consent/consent'
import { isError } from '@/lib/action-result'
import { resolveSendGate } from '@/lib/comms/send-gate'

const PID = 'profile-728'
const EMAIL = 'member@example.com'

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'test-secret-for-unsubscribe-actions-test-0000')
  db.prefs.length = 0
  db.consent.length = 0
  db.contacts.length = 0
  db.failContacts = false
  db.failConsent = false
  // The state after a confirmed double opt-in (lib/crm/optin/store.ts confirmOptin): marketing
  // consent granted in the ledger, and a subscribed contact row in two Spaces.
  db.consent.push({ profile_id: PID, scope: 'email_marketing', granted: true, source: 'optin_confirm', created_at: '2026-09-01T00:00:00Z' })
  db.contacts.push({ profile_id: PID, email: EMAIL, space_id: 'root', consent_state: 'subscribed' })
  db.contacts.push({ profile_id: PID, email: EMAIL, space_id: 'tenant', consent_state: 'subscribed' })
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('processUnsubscribe on the lifecycle link a campaign mints', () => {
  it('positive control: before the click the marketing gate allows the send', async () => {
    const before = await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })
    expect(before).toEqual({ allowed: true, reason: 'ok' })
  })

  it('revokes marketing consent so the next campaign is denied with no_consent', async () => {
    const res = await processUnsubscribe({ profileId: PID, category: 'lifecycle', token: makeUnsubscribeToken(PID, 'lifecycle') })
    expect(res).toEqual({ data: { category: 'lifecycle' } })

    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
    expect(db.consent.at(-1)).toMatchObject({ profile_id: PID, scope: 'email_marketing', granted: false, source: 'unsubscribe' })

    const after = await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })
    expect(after).toEqual({ allowed: false, reason: 'no_consent' })
    // The lifecycle preference still flips as before.
    expect(db.prefs.find((r) => r.profile_id === PID)).toMatchObject({ email_lifecycle: false })
  })

  it('flips every contacts row for the profile to unsubscribed (drops the subscribed_members audience)', async () => {
    await processUnsubscribe({ profileId: PID, category: 'lifecycle', token: makeUnsubscribeToken(PID, 'lifecycle') })
    expect(db.contacts.map((r) => r.consent_state)).toEqual(['unsubscribed', 'unsubscribed'])
  })

  it('is idempotent: the one-click POST re-running it changes nothing further and still succeeds', async () => {
    const token = makeUnsubscribeToken(PID, 'lifecycle')
    await processUnsubscribe({ profileId: PID, category: 'lifecycle', token })
    const res = await processUnsubscribe({ profileId: PID, category: 'lifecycle', token })
    expect(isError(res)).toBe(false)
    expect(await hasConsent(PID, 'email_marketing')).toBe(false)
    expect(db.contacts.every((r) => r.consent_state === 'unsubscribed')).toBe(true)
  })

  it('fails loudly when the consent revoke or the contact flip cannot be written', async () => {
    db.failConsent = true
    const a = await processUnsubscribe({ profileId: PID, category: 'lifecycle', token: makeUnsubscribeToken(PID, 'lifecycle') })
    expect(isError(a)).toBe(true)

    db.failConsent = false
    db.failContacts = true
    const b = await processUnsubscribe({ profileId: PID, category: 'lifecycle', token: makeUnsubscribeToken(PID, 'lifecycle') })
    expect(isError(b)).toBe(true)
  })
})

describe('processUnsubscribe on a narrow category link', () => {
  it('leaves marketing consent and the contact rows alone (only that category stops)', async () => {
    const res = await processUnsubscribe({ profileId: PID, category: 'events', token: makeUnsubscribeToken(PID, 'events') })
    expect(res).toEqual({ data: { category: 'events' } })
    expect(db.consent).toHaveLength(1)
    expect(db.contacts.every((r) => r.consent_state === 'subscribed')).toBe(true)
    expect(await resolveSendGate(PID, 'email', 'marketing', { email: EMAIL })).toEqual({ allowed: true, reason: 'ok' })
  })

  it('still rejects a token minted for another category before any write', async () => {
    const res = await processUnsubscribe({ profileId: PID, category: 'lifecycle', token: makeUnsubscribeToken(PID, 'events') })
    expect(isError(res)).toBe(true)
    expect(db.consent).toHaveLength(1)
    expect(db.contacts.every((r) => r.consent_state === 'subscribed')).toBe(true)
  })
})
