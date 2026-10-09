import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ atomic: vi.fn(), append: vi.fn(), enqueue: vi.fn(), conversation: vi.fn() }))
vi.mock('@/lib/comms/atomic-email-intent', () => ({ atomicBridgeEnabled: () => true, atomicBridgeMessageId: () => '<stable-fixture@frequencylocal.com>', enqueueAtomicConversationEmail: mocks.atomic }))
vi.mock('@/lib/comms/conversations', () => ({ getConversationByRef: mocks.conversation, appendConversationMessage: mocks.append }))
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
  mocks.conversation.mockResolvedValue({ id: 'conv', ref: '1001', kind: 'crm', channel: 'email', assignedTo: 'actor', ownerProfileId: 'actor', externalEmail: 'member@example.test', subject: 'Fixture', status: 'open', spaceId: 'space' })
  mocks.atomic.mockResolvedValue({ intentId: 'intent', messageId: 'message', jobId: 'job', duplicate: false })
})
describe('actual atomic house reply route', () => {
  it('records successful atomic commit with no legacy append/enqueue', async () => {
    expect((await routeInboundReply(incoming())).status).toBe('recorded_outbound')
    expect(mocks.atomic).toHaveBeenCalledTimes(1)
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('transaction failure asks webhook for retry rather than acknowledging recorded', async () => {
    mocks.atomic.mockRejectedValue(new Error('injected transaction failure'))
    expect((await routeInboundReply(incoming())).status).toBe('error')
    expect(mocks.append).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('receipt replay acknowledges duplicate without legacy write', async () => {
    mocks.atomic.mockResolvedValue({ intentId: 'intent', messageId: 'message', jobId: 'job', duplicate: true })
    expect((await routeInboundReply(incoming())).status).toBe('duplicate')
    expect(mocks.append).not.toHaveBeenCalled()
  })
  it('valid house token from a different sender cannot authorize outbound', async () => {
    expect((await routeInboundReply({ ...incoming(), from: 'stranger@example.test' })).status).toBe('error')
    expect(mocks.atomic).not.toHaveBeenCalled()
  })
})
