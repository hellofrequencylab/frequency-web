import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchAuthorizationUrl, exchangeSearchCode, refreshSearchTokens, searchProvider, SEARCH_SCOPES } from './oauth'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sites/host', () => ({ appOrigin: () => 'https://frequencylocal.com' }))
beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-google'); vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'secret-google')
  vi.stubEnv('BING_WEBMASTER_CLIENT_ID', 'client-bing'); vi.stubEnv('BING_WEBMASTER_CLIENT_SECRET', 'secret-bing')
  vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'))
})
afterEach(() => vi.unstubAllEnvs())
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const reply = (extra = {}) => ({ access_token: 'access-private', refresh_token: 'refresh-private', token_type: 'Bearer', expires_in: 3600, ...extra })
describe('separate read-only discovery OAuth', () => {
  it('does not interpret arbitrary provider strings as supported providers', () => { expect(searchProvider('google')).toBe('google_search_console'); expect(searchProvider('bing')).toBe('bing_webmaster'); expect(searchProvider('contacts')).toBeNull() })
  it.each(['google_search_console', 'bing_webmaster'] as const)('requests only the intended read scope at fixed %s endpoint and callback', provider => {
    const url = new URL(searchAuthorizationUrl(provider, 'state-random', 'challenge')!)
    expect(url.hostname).toBe(provider === 'google_search_console' ? 'accounts.google.com' : 'www.bing.com')
    expect(url.searchParams.get('scope')).toBe(SEARCH_SCOPES[provider]); expect(url.searchParams.get('state')).toBe('state-random')
    expect(url.searchParams.get('redirect_uri')).toBe(`https://frequencylocal.com/api/integrations/discovery/${provider === 'google_search_console' ? 'google' : 'bing'}/callback`)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256'); expect(url.href).not.toContain('secret-')
  })
  it('does not fall back to sign-in/contacts scopes or another secret when setup is absent', () => { vi.stubEnv('BING_WEBMASTER_CLIENT_SECRET', ''); expect(searchAuthorizationUrl('bing_webmaster', 'state', 'challenge')).toBeNull() })
  it('exchanges a code only in a server POST, with no redirect following and bounded transport', async () => {
    const request = vi.fn(async () => json(reply({ scope: SEARCH_SCOPES.google_search_console })))
    const result = await exchangeSearchCode('google_search_console', 'one-use-code', 'a'.repeat(43), request)
    expect(result?.scopes).toEqual([SEARCH_SCOPES.google_search_console]); expect(request).toHaveBeenCalledTimes(1)
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token'); expect(options.method).toBe('POST'); expect(options.redirect).toBe('error'); expect(options.cache).toBe('no-store')
    const form = options.body as URLSearchParams; expect(form.get('code_verifier')).toBe('a'.repeat(43)); expect(form.get('client_secret')).toBe('secret-google')
    expect(JSON.stringify(result)).not.toContain('secret-google')
  })
  it.each([
    { scope: 'https://www.googleapis.com/auth/webmasters' },
    { scope: SEARCH_SCOPES.google_search_console + ' https://www.googleapis.com/auth/contacts.readonly' },
    { expires_in: 0 }, { access_token: 'bad\ntoken' }, { token_type: 'Other' },
  ])('rejects extra/write permissions and invalid token envelopes without returning raw errors %j', async extra => {
    expect(await exchangeSearchCode('google_search_console', 'code', 'a'.repeat(43), async () => json(reply(extra)))).toBeNull()
  })
  it('caps token response bytes rather than trusting content-length', async () => {
    const result = await exchangeSearchCode('bing_webmaster', 'code', 'a'.repeat(43), async () => json({ ...reply(), padding: 'x'.repeat(40_000) }))
    expect(result).toBeNull()
  })
  it('keeps a rotated refresh token and retains the prior token only if provider omits replacement', async () => {
    const previous = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: new Date().toISOString(), scopes: ['Webmaster.read'] }
    const request = vi.fn(async () => json(reply({ refresh_token: 'rotated-refresh' })))
    const rotated = await refreshSearchTokens('bing_webmaster', previous, request)
    expect(rotated?.refreshToken).toBe('rotated-refresh')
    const omitted = await refreshSearchTokens('bing_webmaster', previous, async () => json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3599 }))
    expect(omitted?.refreshToken).toBe('old-refresh')
    expect((request.mock.calls[0] as unknown as [string, RequestInit])[1].body?.toString()).toContain('grant_type=refresh_token')
  })
  it('never attempts refresh without a saved refresh token', async () => { const request = vi.fn(); expect(await refreshSearchTokens('bing_webmaster', { accessToken: 'old', scopes: ['Webmaster.read'], expiresAt: new Date().toISOString() }, request)).toBeNull(); expect(request).not.toHaveBeenCalled() })
})
