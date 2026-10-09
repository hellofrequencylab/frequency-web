import { describe, expect, it } from 'vitest'
import { readEmailDeliveryContext, type EmailDeliveryContextV1 } from './email-delivery-contract'
export const context: EmailDeliveryContextV1 = {
  version: 1, logicalSendKey: 'conversation:42:reply:7', recipientKey: 'contact:12', spaceId: 'space:3',
  purpose: 'human-reply', topic: null, identity: { kind: 'frequency', identityId: null, revision: null },
  source: { kind: 'conversation', id: 'conversation:42' },
}
describe('delivery provenance', () => {
  it('preserves legacy jobs without inventing a purpose', () => expect(readEmailDeliveryContext(undefined)).toBeUndefined())
  it('serializes exact known fields and detaches mutable nested input', () => {
    const parsed = readEmailDeliveryContext({ ...context, secret: 'discard' })!
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(context)
    expect(parsed.identity).not.toBe(context.identity)
  })
  it.each([null, {}, { ...context, version: 2 }, { ...context, logicalSendKey: '' }, { ...context, purpose: 'transactional-bypass' }])('refuses malformed claimed context %j', value => expect(() => readEmailDeliveryContext(value)).toThrow())
  it('rejects identity references without tenant binding and revision', () => {
    expect(() => readEmailDeliveryContext({ ...context, spaceId: null, identity: { kind: 'space', identityId: 'id', revision: '1' } })).toThrow()
  })
  it('Space context cannot claim account security identity', () => expect(() => readEmailDeliveryContext({ ...context, purpose: 'platform-security' })).toThrow())
})
