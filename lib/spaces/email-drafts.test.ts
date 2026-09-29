import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-727: the Space "Message Member" composer mails through the ticketed conversation system, not
// the campaign seam, so it carries its own copy of the seam's Space-status gate. What is locked here,
// network-free: a suspended or archived Space opens no conversation and reads no draft; an active one
// gets past the gate (to the draft read). Every IO seam the gate could reach is mocked.

let spaceStatus = 'active'
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async (id: string) => ({
    id,
    slug: 'river-studio',
    name: 'River Studio',
    brandName: 'River Studio',
    ownerProfileId: 'owner-1',
    status: spaceStatus,
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
const conversations: unknown[] = []
vi.mock('@/lib/comms/conversation-compose', () => ({
  startConversationMessage: async (input: unknown) => {
    conversations.push(input)
    return true
  },
  spaceConversationFrom: (name: string) => name,
}))
// The draft read is the first IO past the gate: record that it was reached, and return no draft.
const tablesRead: string[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      tablesRead.push(table)
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }
      return api
    },
  }),
}))

import { sendSpaceEmailDraftAsConversations } from './email-drafts'
import { SPACE_NOT_ACTIVE_EMAIL_ERROR } from './email'

beforeEach(() => {
  spaceStatus = 'active'
  conversations.length = 0
  tablesRead.length = 0
})

describe('sendSpaceEmailDraftAsConversations: Space status gate (LIVE-727)', () => {
  for (const status of ['suspended', 'archived']) {
    it(`a Space that is ${status} sends nothing and never reads the draft`, async () => {
      spaceStatus = status
      const r = await sendSpaceEmailDraftAsConversations('space-A', 'draft-1', [{ email: 'a@b.com' }])
      expect(r).toEqual({ error: SPACE_NOT_ACTIVE_EMAIL_ERROR })
      expect(conversations).toHaveLength(0)
      expect(tablesRead).toHaveLength(0)
    })
  }

  it('an active Space passes the gate (it goes on to read the draft)', async () => {
    const r = await sendSpaceEmailDraftAsConversations('space-A', 'draft-1', [{ email: 'a@b.com' }])
    expect(r).toEqual({ error: 'That email no longer exists.' })
    expect(tablesRead.length).toBeGreaterThan(0)
  })
})
