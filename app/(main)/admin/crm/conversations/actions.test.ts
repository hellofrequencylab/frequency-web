import { describe, it, expect, beforeEach, vi } from 'vitest'

// Owner ruling 2026-10-12 (LIVE-898 follow-up): the platform CRM reply keeps the Frequency wrapper (no
// Space brand on the platform lane) but its signed Reply-To is masked with the operator's display name.

const enqueueEmail = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: async () => ({ profileId: 'op-1', webRole: 'admin' }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Ada' } }) }) }) }),
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
    id: 'conv-1', ref: '1042', spaceId: null, externalEmail: 'lead@example.com', subject: 'Hi',
    memberProfileId: null, contactId: 'contact-1', status: 'open', ownerProfileId: 'op-1',
  }),
  appendConversationMessage: vi.fn(async () => ({ id: 'm1' })),
  updateConversationFields: vi.fn(),
  recordAssignment: vi.fn(),
  newConversationMessageId: (ref: string) => `<msg-${ref}@reply.test>`,
  conversationScopeRef: () => null,
}))
vi.mock('@/lib/comms/outbound-batch', () => ({ conversationBatchWindowMinutes: () => 0, queueOutboundMessage: vi.fn() }))
vi.mock('@/lib/comms/signature', () => ({ resolveSignature: async (_id: string, name: string | null) => `Warmly,\n${name ?? ''}` }))
vi.mock('@/lib/comms/vera-conversation', () => ({ veraDraftReply: vi.fn(), veraSummarize: vi.fn(), veraSuggestTriage: vi.fn() }))
vi.mock('@/lib/comms/conversation-compose', () => ({ startConversationMessage: vi.fn() }))
vi.mock('@/lib/crm/inbox', () => ({ matchContactByEmail: vi.fn() }))
vi.mock('@/lib/crm/contact-consent', () => ({ canEmailContact: async () => ({ allowed: true }) }))

import { sendConversationReply } from './actions'
import { SITE_TAGLINE } from '@/lib/site'

beforeEach(() => {
  enqueueEmail.mockReset().mockResolvedValue(undefined)
  vi.stubEnv('EMAIL_CONVERSATION_FROM', 'people@people.test')
})

describe('sendConversationReply (platform lane: Frequency wrapper, masked Reply-To)', () => {
  it('keeps the platform wrapper and masks the signed reply address with the operator name', async () => {
    const res = await sendConversationReply({ conversationId: 'conv-1', body: 'Hello there' })
    expect('error' in res).toBe(false)
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.from).toBe('Ada via Frequency <people@people.test>')
    expect(sent.replyTo).toBe('Ada via Frequency <reply+1042-hmac@reply.test>')
    expect(sent.html).toContain(SITE_TAGLINE)
    expect(sent.html).not.toContain('Sent with Frequency')
  })
})
