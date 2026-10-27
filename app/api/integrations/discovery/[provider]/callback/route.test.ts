vi.mock('server-only', () => ({}))
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ allowed: true, actor: 'owner', consumed: false, verify: true, verifyReason: 'provider_property_unverified', providerStatus: undefined as number | undefined, save: true, freshGrant: 'grant', events: [] as string[] }))
vi.mock('@/lib/sites/host', () => ({ appOrigin: () => 'https://frequencylocal.com' }))
vi.mock('@/lib/spaces/discovery-access', () => ({ authorizeDiscoveryEditor: vi.fn(async () => { m.events.push('authorize'); return m.allowed ? { actor: m.actor, space: { slug: 'alpha', id: 'space' } } : null }) }))
vi.mock('@/lib/ai/discovery-connection-store', () => ({
  consumeSearchConnection: vi.fn(async () => { m.events.push('consume'); if (m.consumed) return null; m.consumed = true; return { binding: { spaceId: 'space', provider: 'google_search_console', connectionId: 'generation', revision: 2, actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:example.com', propertyScope: 'page_urls' }, verifier: 'private-verifier' } }),
  invalidateSearchConnection: vi.fn(async () => { m.events.push('invalidate'); return true }),
  saveSearchConnection: vi.fn(async () => { m.events.push('save'); return m.save }),
}))
vi.mock('@/lib/ai/discovery-search-runtime', () => ({ resolveSearchAccess: vi.fn(async () => { m.events.push('access'); return m.allowed ? { actorProfileId: m.actor, consent: { id: m.freshGrant } } : null }), verifySearchConnection: vi.fn(async () => { m.events.push('verify'); return m.verify ? { status: 'verified' } : { status: 'unavailable', reason: m.verifyReason, providerStatus: m.providerStatus } }) }))
vi.mock('@/lib/integrations/discovery/oauth', () => ({ searchProvider: (v: string) => v === 'google' ? 'google_search_console' : v === 'bing' ? 'bing_webmaster' : null, exchangeSearchCode: vi.fn(async () => { m.events.push('exchange'); return { accessToken: 'private-token', refreshToken: 'private-refresh', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['readonly'] } }) }))
import { GET } from './route'
import { consumeSearchConnection, invalidateSearchConnection, saveSearchConnection } from '@/lib/ai/discovery-connection-store'
import { verifySearchConnection } from '@/lib/ai/discovery-search-runtime'
import { exchangeSearchCode } from '@/lib/integrations/discovery/oauth'
const validState = '00000000-0000-4000-8000-000000000001.' + 'a'.repeat(43)
const get = (query = `state=${validState}&code=private-code`, provider = 'google') => GET(new Request('https://frequencylocal.com/api/integrations/discovery/' + provider + '/callback?' + query.replaceAll('state=opaque', `state=${validState}`)), { params: Promise.resolve({ provider }) })
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.actor = 'owner'; m.consumed = false; m.verify = true; m.verifyReason = 'provider_property_unverified'; m.providerStatus = undefined; m.save = true; m.freshGrant = 'grant'; m.events = [] })
describe('discovery OAuth callback boundaries', () => {
  it.each(['google', 'bing'])('shows only the finite invalid-scope outcome without consuming or exchanging for %s', async provider => {
    for (const state of ['', `&state=${validState}`]) {
      const response = await get(`error=invalid_scope&error_description=private-provider-message${state}`, provider)
      expect(response.headers.get('location')).toBe('https://frequencylocal.com/spaces/operating?search=provider_invalid_scope')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(JSON.stringify([...response.headers])).not.toMatch(/private-provider-message|00000000/)
    }
    expect(consumeSearchConnection).not.toHaveBeenCalled()
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(saveSearchConnection).not.toHaveBeenCalled()
    expect(invalidateSearchConnection).not.toHaveBeenCalled()
  })
  it('does not accept arbitrary or duplicate provider errors as finite diagnostics or grants', async () => {
    for (const query of ['error=private-provider-message', 'error=invalid_scope&error=other', 'error=INVALID_SCOPE']) {
      expect((await get(query, 'bing')).headers.get('location')).toContain('search=missing_state')
    }
    expect((await get(`error=invalid_scope&code=private-code&state=${validState}`, 'bing')).headers.get('location')).toContain('search=cancelled')
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(saveSearchConnection).not.toHaveBeenCalled()
  })
  it.each(['google', 'bing'])('distinguishes absent, malformed and rejected state without token exchange for %s', async provider => {
    for (const query of ['code=private-code&error=private-provider-error', 'state=&code=private-code']) {
      const response = await get(query, provider)
      expect(response.headers.get('location')).toBe('https://frequencylocal.com/spaces/operating?search=missing_state')
    }
    for (const query of ['state=changed-sensitive-value&code=private-code', `state=${validState}&state=${validState}&code=private-code`]) {
      const response = await get(query, provider)
      expect(response.headers.get('location')).toBe('https://frequencylocal.com/spaces/operating?search=malformed_state')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    }
    expect(consumeSearchConnection).not.toHaveBeenCalled()
    m.consumed = true
    const rejected = await get(`state=${validState}&code=private-code&error=private-provider-error`, provider)
    expect(rejected.headers.get('location')).toBe('https://frequencylocal.com/spaces/operating?search=rejected_state')
    expect(consumeSearchConnection).toHaveBeenCalledWith(provider === 'bing' ? 'bing_webmaster' : 'google_search_console', validState)
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(saveSearchConnection).not.toHaveBeenCalled()
    expect(invalidateSearchConnection).not.toHaveBeenCalled()
    expect(JSON.stringify([...rejected.headers])).not.toMatch(/private-code|private-provider-error|changed-sensitive-value|00000000/)
  })
  it('consumes before exchange, verifies the selected property before save, and redirects without any secret', async () => {
    const response = await get()
    expect(m.events).toEqual(['consume', 'authorize', 'access', 'exchange', 'verify', 'save'])
    expect(response.headers.get('location')).toBe('https://frequencylocal.com/spaces/alpha/settings/coach?search=connected')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(JSON.stringify([...response.headers])).not.toMatch(/private-token|private-refresh|private-code|private-verifier|opaque/)
  })
  it('cannot replay an already consumed callback', async () => {
    await get(); const replay = await get()
    expect(exchangeSearchCode).toHaveBeenCalledTimes(1)
    expect(saveSearchConnection).toHaveBeenCalledTimes(1)
    expect(replay.headers.get('location')).toContain('search=rejected_state')
  })
  it.each(['error=private-provider-error&state=opaque', 'state=opaque'])('cancellation/missing code invalidates only the consumed generation (%s)', async query => {
    const response = await get(query)
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(invalidateSearchConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'generation', revision: 2 }))
    expect(response.headers.get('location')).toContain('search=cancelled')
    expect(response.headers.get('location')).not.toContain('private-provider-error')
  })
  it.each(['permission', 'actor'])('does not exchange a code after fresh %s denial', async cause => {
    if (cause === 'permission') m.allowed = false; else m.actor = 'other-actor'
    const response = await get()
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(saveSearchConnection).not.toHaveBeenCalled()
    expect(response.headers.get('location')).not.toContain('search=connected')
  })
  it('does not exchange after the active discovery grant is replaced', async () => {
    m.freshGrant = 'new-grant'
    const response = await get()
    expect(exchangeSearchCode).not.toHaveBeenCalled()
    expect(response.headers.get('location')).not.toContain('search=connected')
  })

  it('does not save credentials for an unverified/out-of-scope property', async () => {
    m.verify = false
    const response = await get()
    expect(saveSearchConnection).not.toHaveBeenCalled()
    expect(invalidateSearchConnection).toHaveBeenCalledTimes(1)
    expect(response.headers.get('location')).toContain('search=provider_property_unverified')
  })
  it.each(['property_scope_changed', 'provider_property_unverified', 'provider_auth_failed', 'property_provider_unavailable', 'property_provider_invalid_response', 'property_provider_rate_limited'])('preserves fixed verification stage %s and never saves', async reason => {
    m.verify = false; m.verifyReason = reason; m.providerStatus = 400
    const response = await get()
    expect(response.headers.get('location')).toBe(`https://frequencylocal.com/spaces/alpha/settings/coach?search=${reason}&provider_status=400`)
    expect(saveSearchConnection).not.toHaveBeenCalled()
    expect(invalidateSearchConnection).toHaveBeenCalledTimes(1)
    expect(JSON.stringify([...response.headers])).not.toMatch(/private-token|private-code|private-verifier/)
  })
  it('does not echo unexpected reason/status values from a failed verification', async () => {
    m.verify = false; m.verifyReason = 'private-provider-message'; m.providerStatus = NaN
    expect((await get()).headers.get('location')).toBe('https://frequencylocal.com/spaces/alpha/settings/coach?search=unavailable')
    expect(saveSearchConnection).not.toHaveBeenCalled()
  })
  it('reports token exchange failure before verification/storage and without provider payloads', async () => {
    vi.mocked(exchangeSearchCode).mockResolvedValueOnce(null)
    expect((await get()).headers.get('location')).toContain('search=token_exchange_failed')
    expect(verifySearchConnection).not.toHaveBeenCalled()
    expect(saveSearchConnection).not.toHaveBeenCalled()
  })
  it('does not claim connected after a stale callback save CAS fails', async () => {
    m.save = false
    const response = await get()
    expect(invalidateSearchConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'generation' }))
    expect(response.headers.get('location')).toContain('search=storage_failed')
  })
  it('drops provider exceptions without exposing token or code details', async () => {
    vi.mocked(exchangeSearchCode).mockRejectedValueOnce(new Error('private-token private-code'))
    const response = await get()
    expect(response.headers.get('location')).not.toMatch(/private-token|private-code/)
    expect(response.headers.get('location')).toContain('search=token_exchange_failed')
    expect(invalidateSearchConnection).toHaveBeenCalledTimes(1)
  })
  it('rejects an unknown provider before consuming state', async () => {
    await get('state=opaque&code=private-code', 'unknown')
    expect(consumeSearchConnection).not.toHaveBeenCalled()
    expect(exchangeSearchCode).not.toHaveBeenCalled()
  })
})
