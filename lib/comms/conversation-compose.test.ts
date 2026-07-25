import { describe, it, expect, vi, beforeEach } from 'vitest'

// The shared new-outreach compose primitive (ADR-821): validation fail-closed, the batch-vs-immediate
// branch, and the studio-HTML passthrough. All IO mocked; the pipeline composition is what's under test.

const openOrGetConversation = vi.fn()
const appendConversationMessage = vi.fn()
const newConversationMessageId = vi.fn((_ref: unknown) => '<msg-1@reply.test>')
vi.mock('@/lib/comms/conversations', () => ({
  openOrGetConversation: (a: unknown) => openOrGetConversation(a),
  appendConversationMessage: (a: unknown) => appendConversationMessage(a),
  newConversationMessageId: (a: unknown) => newConversationMessageId(a),
}))

const enqueueEmail = vi.fn()
vi.mock('@/lib/email', () => ({ enqueueEmail: (a: unknown) => enqueueEmail(a) }))

vi.mock('@/lib/comms/reply-address', () => ({
  buildConversationReplyAddress: (ref: string) => `reply+${ref}-hmac@reply.test`,
}))

const batchWindow = vi.fn(() => 0)
const queueOutboundMessage = vi.fn()
vi.mock('@/lib/comms/outbound-batch', () => ({
  conversationBatchWindowMinutes: () => batchWindow(),
  queueOutboundMessage: (a: unknown) => queueOutboundMessage(a),
}))

import { startConversationMessage } from './conversation-compose'

const BASE = {
  ownerProfileId: 'owner-1',
  actorProfileId: 'actor-1',
  actorAuthorKind: 'staff' as const,
  from: 'Ada via Frequency <people@test>',
  signature: 'Ada',
  email: 'lead@example.com',
  contactId: 'contact-1',
  profileId: null,
  subject: 'Hello',
  body: 'A plain first message.',
}

beforeEach(() => {
  vi.clearAllMocks()
  batchWindow.mockReturnValue(0)
  openOrGetConversation.mockResolvedValue({ id: 'conv-1', ref: '1042', created: true })
  appendConversationMessage.mockResolvedValue({ id: 'msg-1' })
  queueOutboundMessage.mockResolvedValue(true)
  enqueueEmail.mockResolvedValue(undefined)
})

describe('startConversationMessage', () => {
  it('fails closed on a missing email / subject / body / counterparty, touching nothing', async () => {
    for (const bad of [
      { ...BASE, email: 'not-an-email' },
      { ...BASE, subject: '  ' },
      { ...BASE, body: '' },
      { ...BASE, contactId: null, profileId: null },
    ]) {
      expect(await startConversationMessage(bad)).toBeNull()
    }
    expect(openOrGetConversation).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('immediate mode: sends with the reply-token Reply-To + Message-ID, then appends with a mirror', async () => {
    const res = await startConversationMessage(BASE)
    expect(res).toEqual({ ref: '1042', conversationId: 'conv-1' })
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('reply+1042-hmac@reply.test')
    expect((sent.headers as Record<string, string>)['Message-ID']).toBe('<msg-1@reply.test>')
    expect(sent.to).toBe('lead@example.com')
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect(appended.direction).toBe('outbound')
    expect((appended.mirror as Record<string, unknown>).subjectKind).toBe('contact')
    expect(queueOutboundMessage).not.toHaveBeenCalled()
  })

  it('batch mode: queues instead of emailing, carrying the from + signature for the flush', async () => {
    batchWindow.mockReturnValue(10)
    const res = await startConversationMessage(BASE)
    expect(res).toEqual({ ref: '1042', conversationId: 'conv-1' })
    expect(enqueueEmail).not.toHaveBeenCalled()
    const queued = queueOutboundMessage.mock.calls[0][0] as Record<string, unknown>
    expect(queued.from).toBe(BASE.from)
    expect(queued.signature).toBe('Ada')
  })

  it('a studio-compiled bodyHtml is sent as-is (no double-wrap); a member counterparty mirrors as profile', async () => {
    await startConversationMessage({ ...BASE, profileId: 'member-9', bodyHtml: '<table>studio</table>' })
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.html).toBe('<table>studio</table>')
    expect(sent.text).toBe(BASE.body)
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect((appended.mirror as Record<string, unknown>).subjectKind).toBe('profile')
  })

  it('returns null when the email enqueue throws (nothing appended)', async () => {
    enqueueEmail.mockRejectedValue(new Error('smtp down'))
    expect(await startConversationMessage(BASE)).toBeNull()
    expect(appendConversationMessage).not.toHaveBeenCalled()
  })
})
