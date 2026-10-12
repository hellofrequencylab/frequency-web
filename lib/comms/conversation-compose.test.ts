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

const signingAvailable = vi.fn(() => true)
vi.mock('@/lib/comms/reply-address', () => ({
  buildConversationReplyAddress: (ref: string) => `reply+${ref}-hmac@reply.test`,
  conversationSigningAvailable: () => signingAvailable(),
}))

const batchWindow = vi.fn(() => 0)
const queueOutboundMessage = vi.fn()
vi.mock('@/lib/comms/outbound-batch', () => ({
  conversationBatchWindowMinutes: () => batchWindow(),
  queueOutboundMessage: (a: unknown) => queueOutboundMessage(a),
}))

const defaultIdentity = vi.fn(async (_spaceId: string, _purpose: string): Promise<{ identityId: string; from: string } | null> => null)
vi.mock('@/lib/spaces/email-domain-onboarding', () => ({
  resolveSpaceEmailDefaultIdentity: (spaceId: string, purpose: string) => defaultIdentity(spaceId, purpose),
}))

const resolveBrand = vi.fn(async (_spaceId: string | null): Promise<Record<string, unknown> | null> => null)
vi.mock('@/lib/comms/email-brand', () => ({
  resolveSpaceEmailBrand: (spaceId: string | null) => resolveBrand(spaceId),
}))

import { startConversationMessage, resolveSpaceConversationFrom, brandSenderUnavailable } from './conversation-compose'

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
  signingAvailable.mockReturnValue(true)
  openOrGetConversation.mockResolvedValue({ id: 'conv-1', ref: '1042', created: true })
  appendConversationMessage.mockResolvedValue({ id: 'msg-1' })
  queueOutboundMessage.mockResolvedValue(true)
  enqueueEmail.mockResolvedValue(undefined)
  resolveBrand.mockResolvedValue(null)
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

  it('scan2 L3-06: when reply addresses cannot be signed, nothing is opened, queued, or sent', async () => {
    signingAvailable.mockReturnValue(false)
    expect(await startConversationMessage(BASE)).toBeNull()
    expect(openOrGetConversation).not.toHaveBeenCalled()
    expect(enqueueEmail).not.toHaveBeenCalled()
    expect(appendConversationMessage).not.toHaveBeenCalled()
    // Batch mode too: a queued row would only throw later, at flush.
    batchWindow.mockReturnValue(10)
    expect(await startConversationMessage(BASE)).toBeNull()
    expect(queueOutboundMessage).not.toHaveBeenCalled()
  })

  it('immediate mode: sends with the reply-token Reply-To + Message-ID, then appends with a mirror', async () => {
    const res = await startConversationMessage(BASE)
    expect(res).toEqual({ ref: '1042', conversationId: 'conv-1' })
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    // The From's display name masks the signed alias (owner ruling 2026-10-12); the alias rides underneath.
    expect(sent.replyTo).toBe('Ada via Frequency <reply+1042-hmac@reply.test>')
    expect((sent.headers as Record<string, string>)['Message-ID']).toBe('<msg-1@reply.test>')
    expect(sent.to).toBe('lead@example.com')
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect(appended.direction).toBe('outbound')
    expect((appended.mirror as Record<string, unknown>).subjectKind).toBe('contact')
    expect(queueOutboundMessage).not.toHaveBeenCalled()
  })

  it('a Space compose wears the Space brand in the html and masks the reply alias with the From name', async () => {
    resolveBrand.mockResolvedValue({
      name: 'Riverside Makers',
      logoUrl: null,
      accent: null,
      url: 'https://frequencylocal.com/spaces/riverside-makers',
    })
    const res = await startConversationMessage({ ...BASE, spaceId: 'space-1', from: '"Lovelace, Ada" <people@test>' })
    expect(res).toEqual({ ref: '1042', conversationId: 'conv-1' })
    expect(resolveBrand).toHaveBeenCalledWith('space-1')
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('"Lovelace, Ada" <reply+1042-hmac@reply.test>')
    expect(sent.html).toContain('Riverside Makers')
    expect(sent.html).toContain('Sent with Frequency')
    expect(sent.text).toContain('Sent with Frequency')
  })

  it('a From with no display name leaves the reply alias bare; a brand fault means the plain wrapper', async () => {
    resolveBrand.mockResolvedValue(null)
    const res = await startConversationMessage({ ...BASE, spaceId: 'space-1', from: 'people@test' })
    expect(res).toEqual({ ref: '1042', conversationId: 'conv-1' })
    const sent = enqueueEmail.mock.calls[0][0] as Record<string, unknown>
    expect(sent.replyTo).toBe('reply+1042-hmac@reply.test')
    expect(sent.html).not.toContain('Sent with Frequency')
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

  it('scope spine (ADR-827): a scoped compose passes the scope to the open AND the mirror', async () => {
    const scope = { kind: 'event' as const, id: 'ev-7' }
    await startConversationMessage({ ...BASE, scope })
    const opened = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    expect(opened.scopeKind).toBe('event')
    expect(opened.scopeId).toBe('ev-7')
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect((appended.mirror as Record<string, unknown>).scope).toEqual(scope)
  })

  it('scope spine: an unscoped compose opens with null scope keys (never inherits one)', async () => {
    await startConversationMessage(BASE)
    const opened = openOrGetConversation.mock.calls[0][0] as Record<string, unknown>
    expect(opened.scopeKind).toBeNull()
    expect(opened.scopeId).toBeNull()
    const appended = appendConversationMessage.mock.calls[0][0] as Record<string, unknown>
    expect((appended.mirror as Record<string, unknown>).scope).toBeNull()
  })
})

describe('resolveSpaceConversationFrom (EMAIL-011/012)', () => {
  it('uses the owner-chosen conversation sender, else the brand through Frequency', async () => {
    defaultIdentity.mockResolvedValueOnce({ identityId: 'i1', from: 'River <hi@river.studio>' })
    expect(await resolveSpaceConversationFrom('s1', 'River')).toBe('River <hi@river.studio>')
    expect(defaultIdentity).toHaveBeenLastCalledWith('s1', 'conversation')
    expect(await resolveSpaceConversationFrom('s1', 'River')).toMatch(/^River </)
  })

  it('refuses a held sender with its own copy instead of switching addresses', async () => {
    defaultIdentity.mockRejectedValueOnce(new Error('This sender is paused or its domain is not verified yet. Nothing was sent.'))
    const err = await resolveSpaceConversationFrom('s1', 'River').catch((e: unknown) => e)
    expect(brandSenderUnavailable(err)).toMatch(/not verified yet/)
    expect(brandSenderUnavailable('x')).toMatch(/unavailable/)
  })
})
