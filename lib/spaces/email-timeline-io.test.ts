import { describe, it, expect, beforeEach, vi } from 'vitest'

// IO seam for the Resend -> CRM timeline projection (ADR-378). Network-free: the admin client and the
// interaction recorder are mocked, so this asserts the OWNER-SCOPED resolution + exactly-once shape
// WITHOUT touching a DB or the real recordContactInteraction. What is locked:
//   1. A Space send (outreach_sends row) with a known owner + contact records the right touch.
//   2. A pure platform email (no outreach_sends row) records NOTHING (no platform-owner sentinel).
//   3. An ungated Space (owner_profile_id null) records NOTHING.
//   4. A recipient that never mapped to a contacts row records NOTHING.
//   5. Events we do not project (delivered) and a missing resend id record NOTHING.

// ── Capture every recordContactInteraction call ──────────────────────────────────────────────────
const recordCalls: { input: Record<string, unknown>; spaceId?: string | null }[] = []
vi.mock('@/lib/crm/interactions', () => ({
  recordContactInteraction: async (input: Record<string, unknown>, spaceId?: string | null) => {
    recordCalls.push({ input, spaceId })
    return { id: 'int-1' }
  },
}))

// ── In-memory admin client: outreach_sends (by resend_id), spaces (owner), contacts (by email) ─────
const db = {
  outreach: [] as { resend_id: string; space_id: string; contact_id: string | null; email: string }[],
  spaces: new Map<string, string | null>(), // space_id -> owner_profile_id
  contacts: new Map<string, string>(), // lowercased email -> contact id
}

function tableBuilder(table: string) {
  let col = ''
  let val = ''
  const api: Record<string, unknown> = {
    select() {
      return api
    },
    eq(c: string, v: string) {
      col = c
      val = v
      return api
    },
    maybeSingle() {
      if (table === 'outreach_sends') {
        const row = db.outreach.find((r) => r.resend_id === val) ?? null
        return Promise.resolve({ data: row })
      }
      if (table === 'spaces') {
        const owner = db.spaces.has(val) ? db.spaces.get(val)! : null
        return Promise.resolve({ data: { owner_profile_id: owner } })
      }
      if (table === 'contacts') {
        // resolveContactIdByEmail matches lowercased email
        const id = db.contacts.get(val) ?? null
        return Promise.resolve({ data: id ? { id } : null })
      }
      void col
      return Promise.resolve({ data: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => tableBuilder(t) }),
}))

// Keep the other email.ts deps inert (the file imports them; we only call handleSpaceSendEngagement).
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => null }))
vi.mock('./store', () => ({ getSpaceById: async () => null }))
vi.mock('./entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: false }) }))
vi.mock('./functions', () => ({ spaceFunctionAccess: () => false }))
vi.mock('@/lib/email', () => ({ sendRawEmail: async () => ({ id: null }), listUnsubscribeHeaders: () => ({}) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false, suppress: async () => {} }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildSpaceUnsubscribeUrl: () => 'https://x/u' }))

import { handleSpaceSendEngagement } from './email'

beforeEach(() => {
  recordCalls.length = 0
  db.outreach.length = 0
  db.spaces.clear()
  db.contacts.clear()
})

describe('handleSpaceSendEngagement — owner-scoped projection', () => {
  it('records an inbound touch for a Space send with a known owner + ledger contact', async () => {
    db.outreach.push({ resend_id: 're_1', space_id: 'space-A', contact_id: 'contact-9', email: 'a@b.com' })
    db.spaces.set('space-A', 'owner-1')

    await handleSpaceSendEngagement('re_1', 'opened')

    expect(recordCalls).toHaveLength(1)
    expect(recordCalls[0]!.input).toMatchObject({
      ownerProfileId: 'owner-1',
      subjectKind: 'contact',
      subjectId: 'contact-9',
      channel: 'email',
      direction: 'inbound',
      summary: 'Opened an email',
      source: 'resend',
      idempotencyKey: 'resend:re_1:opened',
    })
    expect(recordCalls[0]!.spaceId).toBe('space-A')
  })

  it('falls back to resolving the contact by lowercased email when the ledger has no contact_id', async () => {
    db.outreach.push({ resend_id: 're_2', space_id: 'space-A', contact_id: null, email: 'Cap@B.com' })
    db.spaces.set('space-A', 'owner-1')
    db.contacts.set('cap@b.com', 'contact-by-email')

    await handleSpaceSendEngagement('re_2', 'clicked')

    expect(recordCalls).toHaveLength(1)
    expect(recordCalls[0]!.input).toMatchObject({ subjectId: 'contact-by-email', summary: 'Clicked a link in an email' })
  })

  it('records bounced / complained as inbound deliverability touches', async () => {
    db.outreach.push({ resend_id: 're_3', space_id: 'space-A', contact_id: 'c1', email: 'a@b.com' })
    db.spaces.set('space-A', 'owner-1')

    await handleSpaceSendEngagement('re_3', 'bounced')
    expect(recordCalls.at(-1)!.input).toMatchObject({ direction: 'inbound', summary: 'Email bounced' })

    await handleSpaceSendEngagement('re_3', 'complained')
    expect(recordCalls.at(-1)!.input).toMatchObject({ direction: 'inbound', summary: 'Marked an email as spam' })
  })

  it('records NOTHING for a pure platform email (no outreach_sends row)', async () => {
    db.spaces.set('space-A', 'owner-1')
    await handleSpaceSendEngagement('re_unknown', 'opened')
    expect(recordCalls).toHaveLength(0)
  })

  it('records NOTHING for an ungated Space (owner_profile_id null) — no platform-owner sentinel', async () => {
    db.outreach.push({ resend_id: 're_4', space_id: 'space-plat', contact_id: 'c1', email: 'a@b.com' })
    db.spaces.set('space-plat', null)
    await handleSpaceSendEngagement('re_4', 'opened')
    expect(recordCalls).toHaveLength(0)
  })

  it('records NOTHING when the recipient never mapped to a contacts row', async () => {
    db.outreach.push({ resend_id: 're_5', space_id: 'space-A', contact_id: null, email: 'ghost@b.com' })
    db.spaces.set('space-A', 'owner-1')
    // no contacts entry for ghost@b.com
    await handleSpaceSendEngagement('re_5', 'opened')
    expect(recordCalls).toHaveLength(0)
  })

  it('records NOTHING for an unprojected event type or a missing resend id', async () => {
    db.outreach.push({ resend_id: 're_6', space_id: 'space-A', contact_id: 'c1', email: 'a@b.com' })
    db.spaces.set('space-A', 'owner-1')
    await handleSpaceSendEngagement('re_6', 'delivered' as never)
    await handleSpaceSendEngagement(null, 'opened')
    await handleSpaceSendEngagement('', 'opened')
    expect(recordCalls).toHaveLength(0)
  })
})
