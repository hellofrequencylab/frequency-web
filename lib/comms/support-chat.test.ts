import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// PARTIAL mock: the token mint/verify are stubbed, but isSupportChatAvailable / chatSigningAvailable
// stay REAL so the production-without-a-secret test below exercises the true predicate (scan2 L3-06).
vi.mock('@/lib/comms/chat-token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-token')>()),
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
  // The dev fallback (signing-secret.ts) needs SOMETHING to sign with outside production.
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-key-for-tests-0123456789abcdef'
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

// ── scan2 L3-06 (2026-09-05): the prerequisites are checked BEFORE anything is written ─────────────
//
// In production with CONVERSATION_TOKEN_SECRET unset, makeChatToken throws. Before the fix that throw
// came AFTER openOrGetConversation + appendConversationMessage: one orphan conversation and one orphan
// message per attempt, and a generic server-action error for the visitor instead of the action's
// "Support is unavailable" copy (which a null return produces).

describe('startSupportChat — runtime prerequisites are checked before the first write', () => {
  const saved = new Map<string, string | undefined>()
  const KEYS = ['NODE_ENV', 'CONVERSATION_TOKEN_SECRET', 'CRM_INBOX_OWNER_PROFILE_ID'] as const
  function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
    for (const k of KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = v
    }
  }
  afterEach(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string>)[k] = v
    }
    saved.clear()
    vi.restoreAllMocks()
  })

  it('production with no secret: returns null and creates NO conversation row and NO message', async () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: undefined, CRM_INBOX_OWNER_PROFILE_ID: 'owner-1' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = await startSupportChat({ name: 'Visitor', email: 'visitor@example.com', message: 'hello' })

    expect(out).toBeNull()
    expect(openOrGetConversation).not.toHaveBeenCalled()
    expect(appendConversationMessage).not.toHaveBeenCalled()
    // The refusal is LOGGED (structured, no interpolated input), not swallowed.
    expect(err).toHaveBeenCalled()
    const [msg, detail] = err.mock.calls[0] as [string, Record<string, unknown>]
    expect(msg).toContain('[support-chat]')
    expect(detail.signing).toBe(false)
    expect(detail.production).toBe(true)
  })

  it('production WITH the secret opens the thread as before', async () => {
    setEnv({ NODE_ENV: 'production', CONVERSATION_TOKEN_SECRET: 'a-real-secret-of-at-least-32-bytes-long', CRM_INBOX_OWNER_PROFILE_ID: 'owner-1' })
    const out = await startSupportChat({ name: 'Visitor', email: 'visitor@example.com', message: 'hello' })
    expect(out).toEqual({ ref: '1042', token: 'token-for-1042' })
    expect(openOrGetConversation).toHaveBeenCalledTimes(1)
  })

  it('a BLANK inbox owner counts as unset (L3-02) and nothing is written', async () => {
    setEnv({ CRM_INBOX_OWNER_PROFILE_ID: '   ' })
    expect(await startSupportChat({ name: 'V', email: 'v@example.com', message: 'hi' })).toBeNull()
    expect(openOrGetConversation).not.toHaveBeenCalled()
  })
})
