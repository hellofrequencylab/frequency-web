import { describe, it, expect, beforeEach, vi } from 'vitest'

// Owner ruling 2026-10-12 (LIVE-898 follow-up): a leader's reply on a Space's thread wears the Space's
// brand, resolved from the conversation's spaceId, and its signed Reply-To is masked with the leader's
// display name. A thread with no Space keeps the plain Frequency wrapper.

const enqueueEmail = vi.fn()
const resolveBrand = vi.fn(async (_spaceId: string | null): Promise<Record<string, unknown> | null> => null)
const conversation = vi.hoisted(() => ({ spaceId: null as string | null }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireLeadFloor: async () => ({ profileId: 'leader-1', webRole: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Grace' } }) }) }) }),
  }),
}))
vi.mock('@/lib/email', () => ({ enqueueEmail: (...a: unknown[]) => enqueueEmail(...a) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/comms/reply-address', () => ({
  buildConversationReplyAddress: (ref: string) => `reply+${ref}-hmac@reply.test`,
  conversationSigningAvailable: () => true,
  CONVERSATION_SIGNING_UNAVAILABLE_COPY: 'unavailable',
}))
vi.mock('@/lib/comms/conversations', () => ({
  getConversationById: async () => ({
    id: 'conv-1', ref: '1042', spaceId: conversation.spaceId, externalEmail: 'member@example.com', subject: 'Hi',
    memberProfileId: null, contactId: 'contact-1', status: 'open', ownerProfileId: 'leader-1', assignedTo: null,
  }),
  appendConversationMessage: vi.fn(async () => ({ id: 'm1' })),
  updateConversationFields: vi.fn(),
  recordAssignment: vi.fn(),
  newConversationMessageId: (ref: string) => `<msg-${ref}@reply.test>`,
  conversationScopeRef: () => null,
}))
vi.mock('@/lib/comms/leader-send', () => ({ sendLeaderMessageToDownline: vi.fn() }))
vi.mock('@/lib/comms/outbound-batch', () => ({ conversationBatchWindowMinutes: () => 0, queueOutboundMessage: vi.fn() }))
vi.mock('@/lib/comms/signature', () => ({ resolveSignature: async (_id: string, name: string | null) => `Warmly,\n${name ?? ''}` }))
vi.mock('@/lib/comms/email-brand', () => ({ resolveSpaceEmailBrand: (id: string | null) => resolveBrand(id) }))
vi.mock('@/lib/comms/vera-conversation', () => ({ veraDraftReply: vi.fn(), veraSummarize: vi.fn(), veraSuggestTriage: vi.fn() }))

import { sendLeaderReply } from './actions'
import { SITE_TAGLINE } from '@/lib/site'

beforeEach(() => {
  enqueueEmail.mockReset().mockResolvedValue(undefined)
  resolveBrand.mockReset().mockResolvedValue(null)
  conversation.spaceId = null
  vi.stubEnv('EMAIL_CONVERSATION_FROM', 'people@people.test')
})

describe('sendLeaderReply (brand from the thread, masked Reply-To)', () => {
  it("a Space's thread wears the Space brand and masks the alias with the leader's name", async () => {
    conversation.spaceId = 'space-1'
    resolveBrand.mockResolvedValue({ name: 'Riverside Makers', logoUrl: null, accent: null, url: 'https://x.test/spaces/riverside' })
    const res = await sendLeaderReply({ conversationId: 'conv-1', body: 'Hello there' })
    expect('error' in res).toBe(false)
    expect(resolveBrand).toHaveBeenCalledWith('space-1')
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('Grace via Frequency <reply+1042-hmac@reply.test>')
    expect(sent.html).toContain('Riverside Makers')
    expect(sent.html).toContain('Sent with Frequency')
    expect(sent.text).toContain('Sent with Frequency')
  })

  it('a thread with no Space keeps the platform wrapper and still masks the alias', async () => {
    const res = await sendLeaderReply({ conversationId: 'conv-1', body: 'Hello there' })
    expect('error' in res).toBe(false)
    expect(resolveBrand).toHaveBeenCalledWith(null)
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('Grace via Frequency <reply+1042-hmac@reply.test>')
    expect(sent.html).toContain(SITE_TAGLINE)
    expect(sent.html).not.toContain('Sent with Frequency')
  })
})
