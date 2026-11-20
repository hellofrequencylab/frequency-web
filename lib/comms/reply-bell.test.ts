import { describe, it, expect, beforeEach, vi } from 'vitest'

// EMAIL-074: a reply bell names the thread's lane, and a Space-lane bell resolves to that Space's own
// conversations only for the thread's owner or assignee.

const rows = vi.hoisted(() => ({
  conv: null as Record<string, unknown> | null,
  space: null as Record<string, unknown> | null,
  throws: false,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (rows.throws) throw new Error('db down')
            return { data: table === 'comms_conversations' ? rows.conv : rows.space }
          },
        }),
      }),
    }),
  }),
}))

import { replyBellReferenceType, resolveSpaceConversationHref } from './reply-bell'

const CONV = '11111111-2222-4333-8444-555555555555'
const SPACE = '99999999-2222-4333-8444-555555555555'

beforeEach(() => {
  rows.conv = { id: CONV, space_id: SPACE, owner_profile_id: 'owner-1', assigned_to: 'agent-1' }
  rows.space = { slug: 'riverside-makers' }
  rows.throws = false
})

describe('replyBellReferenceType', () => {
  it("names a leader's thread, a Space-lane thread, and a platform thread apart", () => {
    expect(replyBellReferenceType({ kind: 'leader', spaceId: null })).toBe('leader_conversation')
    expect(replyBellReferenceType({ kind: 'leader', spaceId: SPACE })).toBe('leader_conversation')
    expect(replyBellReferenceType({ kind: 'crm', spaceId: SPACE })).toBe('space_conversation')
    expect(replyBellReferenceType({ kind: 'crm', spaceId: null })).toBe('conversation')
    expect(replyBellReferenceType({ kind: 'support', spaceId: null })).toBe('conversation')
  })
})

describe('resolveSpaceConversationHref', () => {
  it("sends the owner and the assignee to that Space's conversations on the thread", async () => {
    const expected = `/spaces/riverside-makers/crm/conversations?id=${CONV}`
    expect(await resolveSpaceConversationHref(CONV, 'owner-1')).toBe(expected)
    expect(await resolveSpaceConversationHref(CONV, 'agent-1')).toBe(expected)
  })

  it('sends nobody else on, so a guessed id never reveals the Space', async () => {
    expect(await resolveSpaceConversationHref(CONV, 'someone-else')).toBeNull()
    expect(await resolveSpaceConversationHref(CONV, null)).toBeNull()
  })

  it('returns null for a bad id, a thread with no Space, a missing slug, or a read fault', async () => {
    expect(await resolveSpaceConversationHref('not-a-uuid', 'owner-1')).toBeNull()
    rows.conv = { id: CONV, space_id: null, owner_profile_id: 'owner-1', assigned_to: null }
    expect(await resolveSpaceConversationHref(CONV, 'owner-1')).toBeNull()
    rows.conv = { id: CONV, space_id: SPACE, owner_profile_id: 'owner-1', assigned_to: null }
    rows.space = null
    expect(await resolveSpaceConversationHref(CONV, 'owner-1')).toBeNull()
    rows.throws = true
    expect(await resolveSpaceConversationHref(CONV, 'owner-1')).toBeNull()
  })
})
