import { beforeEach, describe, expect, it, vi } from 'vitest'
// EMAIL-022: the inbound router resolves a Space's public address BEFORE the signed alias, and a Space
// address never falls through to alias parsing or the contact-match fallback.
const state = vi.hoisted(() => ({ route: { kind: 'none' } as Record<string, unknown>, landed: { status: 'recorded', conversationId: 'conv1', ref: '77' } as Record<string, unknown> }))
const aliasResolve = vi.hoisted(() => vi.fn(async () => ({ kind: 'none' })))
const quarantine = vi.hoisted(() => vi.fn(async () => undefined))
const record = vi.hoisted(() => vi.fn(async () => state.landed))
vi.mock('./space-inbox-address', () => ({ resolveSpaceInboxRoute: async () => state.route, quarantineSpaceInboxMessage: quarantine, recordSpaceInboxMessage: record }))
vi.mock('./tenant-reply-alias', () => ({ buildSpaceConversationReplyAddress: async (ref: string) => `reply+${ref}@fixture.test`, resolveTenantReplyAlias: aliasResolve, quarantineTenantReplyAlias: vi.fn() }))
vi.mock('./conversations', () => ({ getConversationByRef: async () => null, appendConversationMessage: vi.fn(), reopenConversationIfClosed: async () => undefined, conversationScopeRef: () => null }))
vi.mock('@/lib/email', () => ({ enqueueEmail: vi.fn(), fetchReceivedEmail: vi.fn(), findReceivedEmailIdByMessageId: vi.fn() }))
import { routeInboundReply } from './inbound'
const message = { from: 'person@example.org', recipients: ['hello@labs.frequencylocal.com'], subject: 'Hi', text: 'body', messageId: 'm1', inReplyTo: null, referencesIds: null, autoSubmitted: null, precedence: null }
beforeEach(() => { state.route = { kind: 'none' }; state.landed = { status: 'recorded', conversationId: 'conv1', ref: '77' }; aliasResolve.mockClear(); quarantine.mockClear(); record.mockClear() })
describe('Space inbox address routing in the inbound router', () => {
  it('lands a mail to a verified Space address as a new Space conversation, before any alias lookup', async () => {
    state.route = { kind: 'ready', spaceId: 's1', ownerProfileId: 'o1', brandName: 'Labs', address: 'hello@labs.frequencylocal.com' }
    expect(await routeInboundReply(message)).toEqual({ status: 'recorded', conversationId: 'conv1', ref: '77' })
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 's1' }), expect.objectContaining({ from: 'person@example.org' }))
    expect(aliasResolve).not.toHaveBeenCalled()
  })
  it('quarantines a paused or unknown Space address and never reaches the alias or contact-match paths', async () => {
    state.route = { kind: 'quarantine', reason: 'inbox_address_unverified' }
    expect(await routeInboundReply(message)).toEqual({ status: 'quarantined_alias' })
    expect(quarantine).toHaveBeenCalledWith('inbox_address_unverified', message.recipients, 'm1')
    expect(record).not.toHaveBeenCalled(); expect(aliasResolve).not.toHaveBeenCalled()
  })
  it('drops automated mail to a Space address and surfaces a recording fault as a redelivery', async () => {
    state.route = { kind: 'ready', spaceId: 's1', ownerProfileId: 'o1', brandName: 'Labs', address: 'hello@labs.frequencylocal.com' }
    expect(await routeInboundReply({ ...message, autoSubmitted: 'auto-replied' })).toEqual({ status: 'dropped_automated' })
    expect(record).not.toHaveBeenCalled()
    state.landed = { status: 'error' }
    expect(await routeInboundReply(message)).toEqual({ status: 'error' })
  })
  it('hands every other recipient on to the alias path as before', async () => {
    expect(await routeInboundReply({ ...message, recipients: ['reply+1-abc@reply.frequencylocal.com'] })).toMatchObject({ status: expect.any(String) })
    expect(aliasResolve).toHaveBeenCalledTimes(1); expect(record).not.toHaveBeenCalled()
  })
})
