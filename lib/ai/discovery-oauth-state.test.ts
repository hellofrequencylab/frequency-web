import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { newSearchOAuthState, parseSearchOAuthState, sealSearchSecret, openSearchSecret, type SearchConnectionBinding } from './discovery-oauth-state'
const binding: SearchConnectionBinding = { spaceId: 'space', provider: 'google_search_console', connectionId: '00000000-0000-4000-8000-000000000001', revision: 1, actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:example.com', propertyScope: 'page_urls' }
beforeEach(() => { vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64')) })
describe('discovery secret envelope and OAuth state', () => {
  it('encrypts with unique nonces and authenticates purpose and complete binding', () => {
    const ciphertext = sealSearchSecret(binding, 'tokens', { accessToken: 'secret' })!
    expect(ciphertext).not.toContain('secret')
    expect(sealSearchSecret(binding, 'tokens', { accessToken: 'secret' })).not.toBe(ciphertext)
    expect(openSearchSecret(binding, 'tokens', ciphertext)).toEqual({ accessToken: 'secret' })
    expect(openSearchSecret(binding, 'pending', ciphertext)).toBeNull()
    for (const patch of [{ spaceId: 'other' }, { actorProfileId: 'other' }, { consentId: 'other' }, { connectionId: 'other' }, { provider: 'bing_webmaster' as const }, { propertyUrl: 'sc-domain:evil.com' }, { propertyScope: 'dedicated_property' as const }]) expect(openSearchSecret({ ...binding, ...patch }, 'tokens', ciphertext)).toBeNull()
    expect(openSearchSecret(binding, 'tokens', ciphertext.slice(0, -3) + 'bad')).toBeNull()
  })
  it('fails closed without a canonical dedicated 32-byte key', () => {
    for (const key of ['', 'fallback-secret', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')]) { vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', key); expect(sealSearchSecret(binding, 'tokens', {})).toBeNull() }
  })
  it('uses a random opaque state and PKCE challenge rather than identity or credentials in state', () => {
    const first = newSearchOAuthState(binding.connectionId), second = newSearchOAuthState(binding.connectionId)
    expect(first.state).not.toBe(second.state)
    expect(first.state).not.toContain('owner')
    expect(first.state).not.toContain(first.verifier)
    expect(parseSearchOAuthState(first.state)).toEqual({ connectionId: binding.connectionId, nonceHash: first.nonceHash })
    expect(first.verifier).toHaveLength(64)
    expect(first.challenge).toHaveLength(43)
    expect(parseSearchOAuthState(first.state + '.extra')).toBeNull()
  })
})
