import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ atomic: vi.fn(), append: vi.fn(), mirror: vi.fn(), enqueue: vi.fn(), conversation: vi.fn(), brand: vi.fn() }))
vi.mock('@/lib/comms/email-brand', () => ({ resolveSpaceEmailBrand: mocks.brand }))
vi.mock('@/lib/comms/atomic-email-intent', () => ({ atomicBridgeEnabled: () => true, atomicBridgeMessageId: () => '<stable-fixture@frequencylocal.com>', enqueueAtomicConversationEmail: mocks.atomic }))
vi.mock('@/lib/comms/conversations', () => ({ getConversationByRef: mocks.conversation, appendConversationMessage: mocks.append, mirrorConversationMessage: mocks.mirror, conversationScopeRef: () => null }))
vi.mock('@/lib/email', () => ({ enqueueEmail: mocks.enqueue }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Actor', auth_user_id: 'auth' } }) }) }) }),
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'actor@example.test' } } }) } },
}) }))
import { routeInboundReply, type ParsedInboundMessage } from './inbound'
import { buildConversationReplyAddress } from './reply-address'
function incoming(): ParsedInboundMessage {
  return { from: 'actor@example.test', recipients: [buildConversationReplyAddress('1001', 'house')], subject: 'Reply', text: 'Body', messageId: '<receipt>', inReplyTo: null, referencesIds: null, autoSubmitted: null, precedence: null }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('CONVERSATION_TOKEN_SECRET', 'test-conversation-secret-please-32-bytes')
  mocks.conversation.mockResolvedValue({ id: 'conv', ref: '1001', kind: 'crm', channel: 'email', assignedTo: 'actor', ownerProfileId: 'actor', externalEmail: 'member@example.test', subject: 'Fixture', status: 'open', spaceId: 'space', contactId: 'contact', memberProfileId: null })
  mocks.atomic.mockResolvedValue({ intentId: 'intent', messageId: 'message', jobId: 'job', duplicate: false })
  mocks.brand.mockResolvedValue(null)
  vi.stubEnv('EMAIL_CONVERSATION_FROM', 'people@people.test')
})
describe('actual atomic house reply route', () => {
  it('records successful atomic commit with no legacy append/enqueue', async () => {
    expect((await routeInboundReply(incoming())).status).toBe('recorded_outbound')
    expect(mocks.atomic).toHaveBeenCalledTimes(1)
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('mirrors the committed reply onto the CRM timeline, keyed on the RPC message id (EMAIL-002)', async () => {
    await routeInboundReply(incoming())
    expect(mocks.mirror).toHaveBeenCalledTimes(1)
    expect(mocks.mirror).toHaveBeenCalledWith('message', expect.objectContaining({
      direction: 'outbound', body: 'Body',
      mirror: expect.objectContaining({ ownerProfileId: 'actor', subjectKind: 'contact', subjectId: 'contact', spaceId: 'space' }),
    }))
  })
  it('transaction failure asks webhook for retry rather than acknowledging recorded', async () => {
    mocks.atomic.mockRejectedValue(new Error('injected transaction failure'))
    expect((await routeInboundReply(incoming())).status).toBe('error')
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('receipt replay acknowledges duplicate without legacy write', async () => {
    mocks.atomic.mockResolvedValue({ intentId: 'intent', messageId: 'message', jobId: 'job', duplicate: true })
    expect((await routeInboundReply(incoming())).status).toBe('duplicate')
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.mirror).not.toHaveBeenCalled()
  })
  it('valid house token from a different sender cannot authorize outbound', async () => {
    expect((await routeInboundReply({ ...incoming(), from: 'stranger@example.test' })).status).toBe('error')
    expect(mocks.atomic).not.toHaveBeenCalled()
  })
  // Owner ruling 2026-10-12 (LIVE-898 follow-up): the bridged reply a Space sends wears the Space's brand
  // and its Reply-To is masked with the agent's display name; the alias stays underneath.
  it("a Space's bridged reply wears the Space brand and masks the member Reply-To with the agent name", async () => {
    mocks.brand.mockResolvedValue({ name: 'Riverside Makers', logoUrl: null, accent: null, url: 'https://x.test/spaces/riverside' })
    expect((await routeInboundReply(incoming())).status).toBe('recorded_outbound')
    expect(mocks.brand).toHaveBeenCalledWith('space')
    const payload = mocks.atomic.mock.calls[0][0].payload as Record<string, string>
    expect(payload.from).toBe('Actor via Frequency <people@people.test>')
    expect(payload.replyTo).toMatch(/^Actor via Frequency <[^<>]+@[^<>]+>$/)
    expect(payload.html).toContain('Riverside Makers'); expect(payload.html).toContain('Sent with Frequency')
    expect(payload.text).toContain('Sent with Frequency')
  })
  it('a platform thread (no brand) keeps the bare bridge body and still masks the Reply-To', async () => {
    expect((await routeInboundReply(incoming())).status).toBe('recorded_outbound')
    const payload = mocks.atomic.mock.calls[0][0].payload as Record<string, string>
    expect(payload.replyTo).toMatch(/^Actor via Frequency <[^<>]+@[^<>]+>$/)
    expect(payload.text).toBe('Body'); expect(payload.html).not.toContain('Sent with Frequency')
  })
})
