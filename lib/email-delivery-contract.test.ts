import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => { process.env.RESEND_API_KEY = 'test-only'; return { send: vi.fn(), enqueue: vi.fn(), suppressed: vi.fn() } })
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
vi.mock('@/lib/queue/outbox', () => ({ enqueue: mocks.enqueue }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: mocks.suppressed }))
import { enqueueEmail, sendRawEmail } from './email'
import type { EmailDeliveryContextV1 } from './comms/email-delivery-contract'
const context: EmailDeliveryContextV1 = { version: 1, logicalSendKey: 'k', recipientKey: 'r', spaceId: null, purpose: 'notification', topic: null, identity: { kind: 'frequency', identityId: null, revision: null }, source: { kind: 'platform', id: null } }
const payload = { to: 'test@example.test', subject: 'Controlled fixture', html: '<p>Fixture</p>' }
beforeEach(() => { vi.clearAllMocks(); mocks.suppressed.mockResolvedValue(false); mocks.send.mockResolvedValue({ data: { id: 'provider-fixture' }, error: null }) })
describe('real email boundary with versioned provenance', () => {
  it('persists context through enqueue and strips it before provider invocation', async () => {
    await enqueueEmail({ ...payload, deliveryContext: context }, { dedupeKey: 'logical-k' })
    const queued = mocks.enqueue.mock.calls[0][1]
    expect(queued.deliveryContext).toEqual(context)
    expect(await sendRawEmail(queued)).toEqual({ id: 'provider-fixture' })
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('deliveryContext')
    expect(mocks.send.mock.calls[0][0].subject).toBe(payload.subject)
  })
  it('refuses a malformed context before queueing or provider invocation', async () => {
    const bad = { ...payload, deliveryContext: { ...context, version: 2 } as unknown as EmailDeliveryContextV1 }
    await expect(enqueueEmail(bad)).rejects.toThrow()
    await expect(sendRawEmail(bad)).rejects.toThrow()
    expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled()
  })
  it('keeps existing legacy delivery and suppression behavior', async () => {
    await enqueueEmail(payload)
    expect(mocks.enqueue.mock.calls[0][1]).not.toHaveProperty('deliveryContext')
    mocks.suppressed.mockResolvedValue(true)
    expect(await sendRawEmail(payload)).toEqual({ id: null })
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
