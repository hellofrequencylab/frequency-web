import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ allowed: true, actor: 'owner', consumed: false, verify: true, save: true, freshGrant: 'grant', events: [] as string[] }))
vi.mock('@/lib/sites/host', () => ({ appOrigin: () => 'https://frequencylocal.com' }))
vi.mock('@/lib/spaces/discovery-access', () => ({ authorizeDiscoveryEditor: vi.fn(async () => { m.events.push('authorize'); return m.allowed ? { actor: m.actor, space: { slug: 'alpha', id: 'space' } } : null }) }))
vi.mock('@/lib/ai/discovery-connection-store', () => ({
  consumeSearchConnection: vi.fn(async () => { m.events.push('consume'); if (m.consumed) return null; m.consumed = true; return { binding: { spaceId: 'space', provider: 'google_search_console', connectionId: 'generation', revision: 2, actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:example.com', propertyScope: 'page_urls' }, verifier: 'private-verifier' } }),
  invalidateSearchConnection: vi.fn(async () => { m.events.push('invalidate'); return true }),
  saveSearchConnection: vi.fn(async () => { m.events.push('save'); return m.save }),
}))
vi.mock('@/lib/ai/discovery-search-runtime', () => ({ resolveSearchAccess: vi.fn(async () => { m.events.push('access'); return m.allowed ? { actorProfileId: m.actor, consent: { id: m.freshGrant } } : null }), verifySearchConnection: vi.fn(async () => { m.events.push('verify'); return m.verify }) }))
vi.mock('@/lib/integrations/discovery/oauth', () => ({ searchProvider: (v: string) => v === 'google' ? 'google_search_console' : null, exchangeSearchCode: vi.fn(async () => { m.events.push('exchange'); return { accessToken: 'private-token', refreshToken: 'private-refresh', expiresAt: '2099-01-01T00:00:00.000Z', scopes: ['readonly'] } }) }))
import { GET } from './route'
import { consumeSearchConnection, invalidateSearchConnection, saveSearchConnection } from '@/lib/ai/discovery-connection-store'
import { exchangeSearchCode } from '@/lib/integrations/discovery/oauth'
const get = (query = 'state=opaque&code=private-code', provider = 'google') => GET(new Request('https://frequencylocal.com/api/integrations/discovery/google/callback?' + query), { params: Promise.resolve({ provider }) })
beforeEach(() => { vi.clearAllMocks(); m.allowed = true; m.actor = 'owner'; m.consumed = false; m.verify = true; m.save = true; m.freshGrant = 'grant'; m.events = [] })
describe('discovery OAuth callback boundaries', () => {
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
    expect(replay.headers.get('location')).toContain('search=unavailable')
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
    expect(response.headers.get('location')).toContain('search=unavailable')
  })
  it('does not claim connected after a stale callback save CAS fails', async () => {
    m.save = false
    const response = await get()
    expect(invalidateSearchConnection).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'generation' }))
    expect(response.headers.get('location')).not.toContain('search=connected')
  })
  it('drops provider exceptions without exposing token or code details', async () => {
    vi.mocked(exchangeSearchCode).mockRejectedValueOnce(new Error('private-token private-code'))
    const response = await get()
    expect(response.headers.get('location')).not.toMatch(/private-token|private-code/)
    expect(invalidateSearchConnection).toHaveBeenCalledTimes(1)
  })
  it('rejects an unknown provider before consuming state', async () => {
    await get('state=opaque&code=private-code', 'unknown')
    expect(consumeSearchConnection).not.toHaveBeenCalled()
    expect(exchangeSearchCode).not.toHaveBeenCalled()
  })
})
