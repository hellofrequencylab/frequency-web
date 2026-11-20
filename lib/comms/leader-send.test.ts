import { describe, it, expect, beforeEach, vi } from 'vitest'

// EMAIL-072: a leader's note to every member of their Circles is a list fan-out. Each email carries a
// one-click List-Unsubscribe plus a footer link, rides the bulk lane, and skips anyone in a block pair
// with the leader (parity with lib/comms/bulk-dm.ts).

const enqueueEmail = vi.fn()
const isBlockedBetween = vi.fn()
const resolveSendGate = vi.fn()
const openOrGetConversation = vi.fn()
const appendConversationMessage = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Grace' } }) }) }) }),
  }),
}))
vi.mock('@/app/(main)/lead/load-led-circles', () => ({ getLedCircles: async () => [{ id: 'circle-1' }] }))
vi.mock('@/lib/studio/campaigns', () => ({
  resolveSegment: async () => [
    { contactId: 'c-1', email: 'ana@example.com', profileId: 'p-ana' },
    { contactId: 'c-2', email: 'ben@example.com', profileId: 'p-ben' },
    { contactId: 'c-3', email: 'lead@example.com', profileId: null },
  ],
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: (...a: unknown[]) => resolveSendGate(...a) }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: (...a: unknown[]) => isBlockedBetween(...a) }))
vi.mock('@/lib/email', () => ({
  enqueueEmail: (...a: unknown[]) => enqueueEmail(...a),
  listUnsubscribeHeaders: (url: string) => ({
    'List-Unsubscribe': `<${url.replace('/unsubscribe?', '/api/unsubscribe?')}>, <${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }),
}))
vi.mock('@/lib/queue/outbox', () => ({ bulkRunAfter: (i: number, at: Date) => new Date(at.getTime() + i) }))
vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildUnsubscribeUrl: ({ baseUrl, profileId, category }: { baseUrl: string; profileId: string; category: string }) =>
    `${baseUrl}/unsubscribe?p=${profileId}&c=${category}&t=tok`,
}))
vi.mock('@/lib/comms/reply-address', () => ({
  buildConversationReplyAddress: (ref: string) => `reply+${ref}-hmac@reply.test`,
  conversationSigningAvailable: () => true,
}))
vi.mock('@/lib/comms/conversations', () => ({
  openOrGetConversation: (...a: unknown[]) => openOrGetConversation(...a),
  appendConversationMessage: (...a: unknown[]) => appendConversationMessage(...a),
  newConversationMessageId: (ref: string) => `<msg-${ref}@reply.test>`,
}))
vi.mock('@/lib/comms/from-address', () => ({
  conversationFrom: (name: string | null) => `${name ?? 'Someone'} via Frequency <people@people.test>`,
  withDisplayName: (from: string, addr: string) => `${from.split(' <')[0]} <${addr}>`,
}))

import { sendLeaderMessageToDownline, leaderSendFooter } from './leader-send'

beforeEach(() => {
  enqueueEmail.mockReset().mockResolvedValue(undefined)
  isBlockedBetween.mockReset().mockResolvedValue(false)
  resolveSendGate.mockReset().mockResolvedValue({ allowed: true, reason: 'ok' })
  openOrGetConversation.mockReset().mockImplementation(async (i: { externalEmail: string }) => ({ id: `conv-${i.externalEmail}`, ref: '1042' }))
  appendConversationMessage.mockReset().mockResolvedValue({ id: 'm1' })
})

describe('sendLeaderMessageToDownline (EMAIL-072)', () => {
  it('sends each member a one-click unsubscribe header and footer on the bulk lane', async () => {
    const res = await sendLeaderMessageToDownline('leader-1', { subject: 'Saturday', body: 'See you there' })
    expect(res).toEqual({ total: 3, sent: 2, skipped: 1 })
    expect(enqueueEmail).toHaveBeenCalledTimes(2)
    const [msg, opts] = enqueueEmail.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    const headers = msg.headers as Record<string, string>
    expect(headers['Message-ID']).toBe('<msg-1042@reply.test>')
    expect(headers['List-Unsubscribe']).toContain('/api/unsubscribe?p=p-ana&c=lifecycle')
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(msg.html).toContain('/unsubscribe?p=p-ana&c=lifecycle')
    expect(msg.html).toContain('Unsubscribe from these emails')
    expect(msg.text).toContain('Unsubscribe from these emails: ')
    expect(opts.lane).toBe('bulk')
    expect(opts.runAfter).toBeInstanceOf(Date)
  })

  it('skips a member in a block pair with the leader and never opens a thread for them', async () => {
    isBlockedBetween.mockImplementation(async (_a: string, b: string) => b === 'p-ben')
    const res = await sendLeaderMessageToDownline('leader-1', { subject: 'Saturday', body: 'See you there' })
    expect(isBlockedBetween).toHaveBeenCalledWith('leader-1', 'p-ana')
    expect(isBlockedBetween).toHaveBeenCalledWith('leader-1', 'p-ben')
    expect(res).toEqual({ total: 3, sent: 1, skipped: 2 })
    expect(enqueueEmail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['ana@example.com'])
    expect(openOrGetConversation.mock.calls.map((c) => (c[0] as { externalEmail: string }).externalEmail)).toEqual(['ana@example.com'])
  })

  it('skips the member when the block check itself fails (fail closed)', async () => {
    isBlockedBetween.mockRejectedValue(new Error('rpc down'))
    const res = await sendLeaderMessageToDownline('leader-1', { subject: 'Saturday', body: 'See you there' })
    expect(res).toEqual({ total: 3, sent: 0, skipped: 3 })
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('keeps the stored conversation message free of the footer', async () => {
    await sendLeaderMessageToDownline('leader-1', { subject: 'Saturday', body: 'See you there' })
    const appended = appendConversationMessage.mock.calls[0][0] as { body: string; bodyHtml: string }
    expect(appended.body).toBe('See you there')
    expect(appended.bodyHtml).not.toContain('Unsubscribe')
  })
})

describe('leaderSendFooter', () => {
  it('links the unsubscribe URL in both parts', () => {
    const f = leaderSendFooter('https://x.test/unsubscribe?p=1&c=lifecycle&t=tok')
    expect(f.html).toContain('href="https://x.test/unsubscribe?p=1&c=lifecycle&t=tok"')
    expect(f.text).toContain('https://x.test/unsubscribe?p=1&c=lifecycle&t=tok')
  })
})
