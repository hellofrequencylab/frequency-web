import { describe, it, expect, beforeEach, vi } from 'vitest'

// Owner ruling 2026-10-12 (LIVE-898 and its follow-up): every email a Space sends on a conversation wears
// the Space's brand, and the signed per-thread reply alias is masked with the From's display name. The
// compose path is covered in lib/comms/conversation-compose.test.ts; this locks the console REPLY.

const enqueueEmail = vi.fn()
const resolveBrand = vi.fn(async (_spaceId: string | null): Promise<Record<string, unknown> | null> => null)
const appendConversationMessage = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'manager-1', webRole: null }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', name: 'Riverside', brandName: 'Riverside Makers', ownerProfileId: 'owner-1' }),
}))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: async () => ({ canManage: true }) }))
vi.mock('@/lib/email', () => ({ enqueueEmail: (...a: unknown[]) => enqueueEmail(...a) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
vi.mock('@/lib/crm/contact-consent', () => ({ canEmailContact: async () => ({ allowed: true }) }))
vi.mock('@/lib/comms/contact-preferences', () => ({ isContactTopicMuted: async () => false }))
vi.mock('@/lib/comms/reply-address', () => ({
  conversationSigningAvailable: () => true,
  CONVERSATION_SIGNING_UNAVAILABLE_COPY: 'unavailable',
}))
vi.mock('@/lib/comms/tenant-reply-alias', () => ({
  buildSpaceConversationReplyAddress: async (ref: string) => `riverside.r2-${ref}.deadbeef.cafe@send.test`,
  spaceReplyAliasReady: () => true,
}))
vi.mock('@/lib/comms/conversations', () => ({
  getConversationById: async () => ({
    id: 'conv-1', ref: '1042', spaceId: 'space-1', externalEmail: 'lead@example.com', subject: 'Hi',
    memberProfileId: null, contactId: 'contact-1', status: 'open', ownerProfileId: 'owner-1',
  }),
  appendConversationMessage: (...a: unknown[]) => appendConversationMessage(...a),
  updateConversationFields: vi.fn(),
  recordAssignment: vi.fn(),
  newConversationMessageId: (ref: string) => `<msg-${ref}@reply.test>`,
  conversationScopeRef: () => null,
}))
vi.mock('@/lib/comms/outbound-batch', () => ({ conversationBatchWindowMinutes: () => 0, queueOutboundMessage: vi.fn() }))
vi.mock('@/lib/comms/signature', () => ({ brandSignature: (name: string) => `Warmly,\n${name}` }))
vi.mock('@/lib/comms/conversation-compose', () => ({
  resolveSpaceConversationFrom: async (_id: string, brand: string) => `${brand} <people@people.test>`,
  brandSenderUnavailable: () => 'unavailable',
  startConversationMessage: vi.fn(),
}))
vi.mock('@/lib/comms/email-brand', () => ({ resolveSpaceEmailBrand: (id: string | null) => resolveBrand(id) }))
vi.mock('@/lib/comms/workspace', () => ({ listSpaceAssignableAgents: vi.fn() }))
vi.mock('@/lib/comms/labels', () => ({ CONVERSATION_STATUSES: [], CONVERSATION_PRIORITIES: [] }))
vi.mock('@/lib/comms/vera-conversation', () => ({ veraDraftReply: vi.fn(), veraSummarize: vi.fn(), veraSuggestTriage: vi.fn() }))

import { sendSpaceConversationReplyAction } from './conversations-actions'

beforeEach(() => {
  enqueueEmail.mockReset().mockResolvedValue(undefined)
  appendConversationMessage.mockReset().mockResolvedValue({ id: 'm1' })
  resolveBrand.mockReset().mockResolvedValue(null)
})

describe('sendSpaceConversationReplyAction (Space brand + masked Reply-To)', () => {
  it('wears the Space brand in the html and text and masks the alias with the From name', async () => {
    resolveBrand.mockResolvedValue({ name: 'Riverside Makers', logoUrl: null, accent: null, url: 'https://x.test/spaces/riverside' })
    const res = await sendSpaceConversationReplyAction('riverside', { conversationId: 'conv-1', body: 'Hello there' })
    expect('error' in res).toBe(false)
    expect(resolveBrand).toHaveBeenCalledWith('space-1')
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('Riverside Makers <riverside.r2-1042.deadbeef.cafe@send.test>')
    expect(sent.html).toContain('Riverside Makers')
    expect(sent.html).toContain('Sent with Frequency')
    expect(sent.text).toContain('Sent with Frequency')
    // The stored message stays clean: no chrome on the thread.
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect(appended.bodyHtml).not.toContain('Sent with Frequency')
  })

  it('a brand read fault renders the plain wrapper and still masks the alias', async () => {
    resolveBrand.mockResolvedValue(null)
    const res = await sendSpaceConversationReplyAction('riverside', { conversationId: 'conv-1', body: 'Hello there' })
    expect('error' in res).toBe(false)
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('Riverside Makers <riverside.r2-1042.deadbeef.cafe@send.test>')
    expect(sent.html).not.toContain('Sent with Frequency')
  })
})
