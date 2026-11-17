import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-2346: "Send to picked people as conversations" (sendSpaceEmailDraftAsConversations) read the
// draft's status, opened one conversation per person, and only then stamped it sent. A double press or a
// second tab both passed the read and mailed every picked person twice. It now claims the row as
// 'sending' first, the LIVE-2329 claim. Network-free: the database row is stateful so the claim can be
// raced, and every send seam is mocked.

const LEASE_MS = 15 * 60_000

interface Row {
  status: string
  sending_started_at: string | null
  recipient_count?: number
}
let row: Row
const conversations: { email: string }[] = []
let conversationThrows = false

vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => ({
    id, slug: 'river-studio', name: 'River Studio', brandName: 'River Studio', ownerProfileId: 'owner-1', status: 'active', plan: 'business',
  }),
}))
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => 'editor-1',
  getCallerProfile: async () => ({ id: 'editor-1' }),
  getCachedUser: async () => null,
}))
vi.mock('@/lib/spaces/entitlements', async (orig) => ({
  ...(await orig<typeof import('@/lib/spaces/entitlements')>()),
  getSpaceCapabilities: async () => ({ canEditProfile: true, role: 'admin' }),
}))
vi.mock('@/lib/spaces/functions', async (orig) => ({
  ...(await orig<typeof import('@/lib/spaces/functions')>()),
  spaceFunctionAccess: () => true,
}))
vi.mock('./email', async (orig) => ({
  ...(await orig<typeof import('./email')>()),
  isSpaceEmailEnabled: async () => true,
}))
vi.mock('@/lib/spaces/counted-meters', () => ({
  checkCampaignMonthMeter: async () => ({ ok: true }),
}))
vi.mock('@/lib/crm/contact-consent', () => ({
  canEmailContact: async () => ({ allowed: true }),
}))
vi.mock('@/lib/comms/contact-preferences', () => ({
  isContactTopicMuted: async () => false,
}))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => ({ allowed: true }),
}))
vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildSpaceUnsubscribeUrl: ({ email }: { email: string }) => `https://example.test/u/${email}`,
}))
vi.mock('@/lib/comms/conversation-compose', () => ({
  startConversationMessage: async (input: { email: string }) => {
    await new Promise((r) => setTimeout(r, 5))
    if (conversationThrows) throw new Error('compose down')
    conversations.push({ email: input.email })
    return true
  },
  spaceConversationFrom: (name: string) => name,
  resolveSpaceConversationSender: async (_id: string, name: string) => ({ from: name, identityId: null }),
  brandSenderUnavailable: (err: unknown) => (err instanceof Error ? err.message : 'unavailable'),
}))

/** Does the row match a PostgREST `or` filter of the shape the claim builds? */
function matchesOr(filter: string, r: Row): boolean {
  const inList = /status\.in\.\(([^)]*)\)/.exec(filter)?.[1]?.split(',') ?? []
  if (inList.includes(r.status)) return true
  const stale = /and\(status\.eq\.sending,sending_started_at\.lt\.([^)]+)\)/.exec(filter)?.[1]
  return !!stale && r.status === 'sending' && !!r.sending_started_at && r.sending_started_at < stale
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      let patch: Record<string, unknown> | null = null
      const checks: ((r: Row) => boolean)[] = []
      const apply = () => {
        if (!patch || !checks.every((c) => c(row))) return false
        Object.assign(row, patch)
        return true
      }
      const api: Record<string, unknown> = {
        select: () => api,
        update: (value: Record<string, unknown>) => { patch = value; return api },
        eq: (col: string, val: string) => { if (col === 'status') checks.push((r) => r.status === val); return api },
        or: (filter: string) => { checks.push((r) => matchesOr(filter, r)); return api },
        in: (col: string, vals: string[]) => {
          if (table === 'contacts') {
            return Promise.resolve({ data: vals.map((email, i) => ({ id: `c${i}`, email, profile_id: null })), error: null })
          }
          if (col === 'status') checks.push((r) => vals.includes(r.status))
          return api
        },
        maybeSingle: () =>
          Promise.resolve(
            patch
              ? { data: apply() ? { id: 'draft-1' } : null, error: null }
              : { data: { id: 'draft-1', subject: 'Spring', preheader: '', block_json: null, status: row.status, space_id: 'space-A' }, error: null },
          ),
        then: (resolve: (r: unknown) => unknown) => { apply(); return Promise.resolve(resolve({ data: null, error: null })) },
      }
      return api
    },
  }),
}))

import { sendSpaceEmailDraftAsConversations } from './email-drafts'

const picked = [{ email: 'a@b.com' }, { email: 'c@d.com' }]
const send = () => sendSpaceEmailDraftAsConversations('space-A', 'draft-1', picked)

beforeEach(() => {
  row = { status: 'draft', sending_started_at: null }
  conversations.length = 0
  conversationThrows = false
})

describe('sendSpaceEmailDraftAsConversations claims the draft before it sends (LIVE-2346)', () => {
  it('two presses at once mail each picked person once; the second is refused', async () => {
    const [a, b] = await Promise.all([send(), send()])
    expect(conversations).toEqual([{ email: 'a@b.com' }, { email: 'c@d.com' }])
    expect([a, b].filter((r) => 'error' in r)).toEqual([{ error: 'This email is already going out, or has gone out.' }])
    expect(row.status).toBe('sent')
    expect(row.recipient_count).toBe(2)
  })

  it('a draft another send holds right now is never sent again', async () => {
    row = { status: 'sending', sending_started_at: new Date().toISOString() }
    expect(await send()).toEqual({ error: 'This email is already going out, or has gone out.' })
    expect(conversations).toHaveLength(0)
  })

  it('a sent draft is refused', async () => {
    row = { status: 'sent', sending_started_at: null }
    expect(await send()).toEqual({ error: 'This email has already gone out.' })
    expect(conversations).toHaveLength(0)
  })

  it('a send that died part way (claim older than the lease) can be sent again', async () => {
    row = { status: 'sending', sending_started_at: new Date(Date.now() - LEASE_MS - 60_000).toISOString() }
    expect(await send()).toEqual({ data: { recipientCount: 2, skippedCount: 0 } })
    expect(row.status).toBe('sent')
  })

  it('a claim with no lease stamp is never treated as stale', async () => {
    row = { status: 'sending', sending_started_at: null }
    expect(await send()).toEqual({ error: 'This email is already going out, or has gone out.' })
    expect(conversations).toHaveLength(0)
  })

  it('a send that throws before anyone is reached hands the draft back so the owner can retry', async () => {
    conversationThrows = true
    expect(await send()).toEqual({ error: 'The send did not go out. Try again in a moment.' })
    expect(row).toMatchObject({ status: 'draft', sending_started_at: null })
    conversationThrows = false
    expect(await send()).toEqual({ data: { recipientCount: 2, skippedCount: 0 } })
    expect(row.status).toBe('sent')
  })

  it('a reclaimed stale send that reaches nobody goes back as failed, not stuck sending', async () => {
    row = { status: 'sending', sending_started_at: new Date(Date.now() - LEASE_MS - 60_000).toISOString() }
    conversationThrows = true
    expect(await send()).toEqual({ error: 'The send did not go out. Try again in a moment.' })
    expect(row).toMatchObject({ status: 'failed', sending_started_at: null })
  })
})
