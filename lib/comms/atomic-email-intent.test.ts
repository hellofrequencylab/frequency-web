import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mock }))
import { atomicBridgeEnabled, atomicBridgeMessageId, enqueueAtomicConversationEmail } from './atomic-email-intent'
const input = { conversationId: 'conv', actorProfileId: 'actor', externalMessageId: '<received>', observedSender: 'actor@example.test', body: 'reply', payload: { to: 'member@example.test', subject: 'reply', html: '<p>reply</p>' } }
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs() })
describe('atomic bridge RPC adapter', () => {
  it('is off by default and needs exact activation', () => {
    vi.stubEnv('EMAIL_ATOMIC_BRIDGE_ENABLED', '')
    expect(atomicBridgeEnabled()).toBe(false)
    vi.stubEnv('EMAIL_ATOMIC_BRIDGE_ENABLED', '1'); expect(atomicBridgeEnabled()).toBe(false)
    vi.stubEnv('EMAIL_ATOMIC_BRIDGE_ENABLED', 'true'); expect(atomicBridgeEnabled()).toBe(true)
  })
  it('retains one deterministic outgoing Message-ID across receive retries', () => {
    expect(atomicBridgeMessageId('conv', '<received>')).toBe(atomicBridgeMessageId('conv', '<received>'))
    expect(atomicBridgeMessageId('other', '<received>')).not.toBe(atomicBridgeMessageId('conv', '<received>'))
  })
  it('submits exactly one transaction RPC and preserves duplicate outcome', async () => {
    mock.rpc.mockResolvedValue({ data: { intentId: 'intent', messageId: 'message', jobId: 'job', duplicate: true }, error: null })
    expect((await enqueueAtomicConversationEmail(input)).duplicate).toBe(true)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
    expect(mock.rpc.mock.calls[0][0]).toBe('enqueue_conversation_email_intent')
    expect(mock.rpc.mock.calls[0][1].p_observed_sender).toBe(input.observedSender)
  })
  it('does not acknowledge enqueue failure as recorded', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'queue transaction aborted' } })
    await expect(enqueueAtomicConversationEmail(input)).rejects.toThrow('transaction aborted')
  })
  it('refuses malformed RPC acknowledgement and missing receipt key', async () => {
    mock.rpc.mockResolvedValue({ data: {}, error: null })
    await expect(enqueueAtomicConversationEmail(input)).rejects.toThrow('invalid result')
    await expect(enqueueAtomicConversationEmail({ ...input, externalMessageId: '' })).rejects.toThrow('Message-ID')
  })
})
