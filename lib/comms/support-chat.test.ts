import { describe, it, expect, vi, beforeEach } from 'vitest'

// The anonymous live chat (ADR-816) identifies a visitor by a capability TOKEN, but `startSupportChat`
// takes a name + email straight from an unauthenticated form. The regression these tests lock down is
// what happens when that unverified email belongs to somebody else:
//
//   openOrGetConversation reuses an open thread keyed on (kind, external_email, owner, space, scope).
//   So typing a target's address returned THEIR existing platform `crm` conversation, and the action
//   handed back makeChatToken(ref) for it — a working capability token for a thread the caller does not
//   own. loadSupportChatHistory then dumps up to 200 messages, and postSupportChatMessage appends
//   forged inbound messages as that contact.
//
// The fix is that identity has to be PROVEN to key a thread: an anonymous start always opens a new
// conversation (forceNew), and a member-bound start takes its email from the signed-in profile rather
// than from the request.

const openOrGetConversation = vi.fn()
const appendConversationMessage = vi.fn()
vi.mock('@/lib/comms/conversations', () => ({
  openOrGetConversation: (a: unknown) => openOrGetConversation(a),
  appendConversationMessage: (a: unknown) => appendConversationMessage(a),
  getConversationByRef: vi.fn(),
  reopenConversationIfClosed: vi.fn(),
}))

vi.mock('@/lib/comms/chat-token', () => ({
  makeChatToken: (ref: string) => `token-for-${ref}`,
  verifyChatToken: () => true,
}))

vi.mock('@/lib/comms/message-body', () => ({ cleanConversationBody: (b: string) => b }))
vi.mock('@/lib/search-sanitize', () => ({ escapeLike: (s: string) => s }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => 'root-space' }))

// The contacts lookup resolves the SUPPLIED email to whatever contact already exists for it — which is
// exactly why the email alone must not be allowed to key a thread.
const getUserById = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'ilike', 'or', 'is', 'order', 'insert', 'eq']) {
        b[m] = () => b
      }
      b.limit = async () => ({ data: [{ id: 'victim-contact-1' }] })
      b.single = async () => ({ data: { id: 'new-contact-1' } })
      // The member path reads profiles → auth_user_id, then resolves the account email via auth admin.
      b.maybeSingle = async () => ({ data: { display_name: 'Real Member', auth_user_id: 'auth-1' } })
      return b
    },
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  }),
}))

import { startSupportChat } from './support-chat'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRM_INBOX_OWNER_PROFILE_ID = 'owner-1'
  openOrGetConversation.mockResolvedValue({ id: 'conv-1', ref: '1042', created: true })
  appendConversationMessage.mockResolvedValue({ id: 'msg-1' })
  getUserById.mockResolvedValue({ data: { user: { email: 'real-member@example.com' } } })
})

describe('startSupportChat — an unverified email must not key a thread', () => {
  it('never adopts an existing thread for an ANONYMOUS visitor', async () => {
    await startSupportChat({ name: 'Attacker', email: 'victim@example.com', message: 'hi' })

    const arg = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    // Without forceNew the spine would return the victim's open `crm` thread and we would mint a
    // capability token for it.
    expect(arg.forceNew).toBe(true)
    expect(arg.kind).toBe('crm')
  })

  it('takes the email from the signed-in PROFILE, not from the request', async () => {
    await startSupportChat({
      name: 'Member',
      email: 'victim@example.com', // spoofed — must be ignored entirely
      message: 'hi',
      memberProfileId: 'member-1',
    })

    const arg = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    expect(arg.externalEmail).toBe('real-member@example.com')
    expect(arg.externalEmail).not.toBe('victim@example.com')
    expect(arg.memberProfileId).toBe('member-1')
    // A member-bound thread is reusable — it is keyed on a proven identity, so resuming is correct.
    expect(arg.forceNew).toBe(false)
  })

  it('fails closed when the signed-in profile has no resolvable account email', async () => {
    getUserById.mockResolvedValue({ data: { user: { email: null } } })

    const out = await startSupportChat({
      name: 'Member',
      email: 'victim@example.com',
      memberProfileId: 'member-1',
    })

    // It must NOT fall back to the submitted address, which would reopen the same hole.
    expect(out).toBeNull()
    expect(openOrGetConversation).not.toHaveBeenCalled()
  })
})
