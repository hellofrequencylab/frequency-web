import { describe, expect, it } from 'vitest'
import { discoveryConsentActive, grantDiscoveryConsent, parseDiscoveryConsent } from './discovery-consent'
const now = new Date('2026-10-26T12:00:00Z')
describe('private discovery purpose consent', () => {
  it('does not borrow analytics or writing preferences as consent', () => {
    expect(parseDiscoveryConsent({ analytics: true, voice: 'friendly' })).toBeNull()
    expect(parseDiscoveryConsent({ ...grantDiscoveryConsent('actor', 'grant', now), purpose: 'ai_memory' })).toBeNull()
  })
  it('accepts only a current explicit grant and fails closed after expiry or revocation', () => {
    const value = grantDiscoveryConsent('actor', 'grant', now)
    expect(discoveryConsentActive(parseDiscoveryConsent(value), now)).toBe(true)
    expect(discoveryConsentActive(value, new Date(value.expiresAt))).toBe(false)
    expect(discoveryConsentActive({ ...value, revokedAt: now.toISOString() }, now)).toBe(false)
    expect(discoveryConsentActive(value, new Date(now.getTime() - 1))).toBe(false)
  })
  it('rejects malformed grants instead of inventing defaults', () => {
    const value = grantDiscoveryConsent('actor', 'grant', now)
    expect(parseDiscoveryConsent({ ...value, expiresAt: 'tomorrow' })).toBeNull()
    expect(parseDiscoveryConsent({ ...value, expiresAt: value.grantedAt })).toBeNull()
    expect(parseDiscoveryConsent({ ...value, token: 'private' })).toBeNull()
    expect(() => grantDiscoveryConsent('', 'grant', now)).toThrow()
  })
})
