import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchTokens } from '@/lib/integrations/discovery/oauth'
const m = vi.hoisted(() => ({ permitted: true, actor: 'owner', grant: 'grant', revoked: false, domain: null as string | null, published: true, parent: 'parent-a', spaceOwner: 'owner', domainHook: null as null | (() => void), rate: true, loaded: null as unknown, calls: [] as string[], refreshSaved: true, fetchHook: null as null | ((url: string) => void), contextHook: null as null | (() => void) }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/spaces/discovery-access', () => ({ authorizeDiscoveryEditor: vi.fn(async () => { m.calls.push('authorize'); return m.permitted ? { actor: m.actor, space: { id: 'space', slug: 'alpha', domain: m.domain, parentId: m.parent, ownerProfileId: m.spaceOwner, preferences: { published: m.published } } } : null }) }))
vi.mock('@/lib/spaces/private-state', () => ({ loadSpaceDiscoveryConsent: vi.fn(async () => { m.calls.push('consent'); return { available: true, consent: { id: m.grant, purpose: 'discovery_coaching', grantedAt: new Date(Date.now() - 86400000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: m.revoked ? new Date().toISOString() : null } } }), loadSpaceCoachProfile: vi.fn(async () => { m.contextHook?.(); return { available: true, profile: { audience: 'Local runners', voice: 'Plain' } } }) }))
vi.mock('@/lib/spaces/website', () => ({ readWebsitePublished: (preferences: { published: boolean }) => preferences?.published ? { id: 'published' } : null }))
vi.mock('@/lib/sites/site-domain', () => ({ liveSiteDomain: async () => { m.calls.push('domain'); const domain = m.published ? m.domain : null; m.domainHook?.(); return domain } }))
vi.mock('@/lib/sites/host', () => ({ appOrigin: () => 'https://frequencylocal.com' }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => { m.calls.push('rate'); return m.rate }) }))
vi.mock('./discovery-connection-store', () => ({ loadSearchConnection: vi.fn(async () => { m.calls.push('private'); return m.loaded ? structuredClone(m.loaded) : null }), refreshSearchConnection: vi.fn(async () => m.refreshSaved) }))
vi.mock('@/lib/integrations/discovery/oauth', () => ({ refreshSearchTokens: vi.fn(async (_provider: string, tokens: SearchTokens) => ({ ...tokens, accessToken: 'rotated' })) }))
vi.mock('./discovery-bing', () => ({ observeBingDiscovery: vi.fn(async () => ({ status: 'completed', observations: [], propertyUrl: 'https://owner.example/', limitations: [] })) }))
vi.mock('./discovery-coach', () => ({ coachDiscovery: vi.fn(() => ({ recommendations: [] })) }))
import { resolveSearchAccess, searchPropertyAllowed, reviewSearchSignals, searchProviderDependencies, verifySearchConnection } from './discovery-search-runtime'
import { coachDiscovery } from './discovery-coach'
import { refreshSearchConnection } from './discovery-connection-store'
import { refreshSearchTokens } from '@/lib/integrations/discovery/oauth'
import type { SearchConnectionBinding } from './discovery-oauth-state'
const bound = (): SearchConnectionBinding => ({ spaceId: 'space', provider: 'google_search_console', connectionId: 'connection', revision: 3, actorProfileId: 'owner', consentId: 'grant', propertyUrl: 'sc-domain:frequencylocal.com', propertyScope: 'page_urls' })
const tokens = () => ({ accessToken: 'private-access', refreshToken: 'private-refresh', scopes: ['https://www.googleapis.com/auth/webmasters.readonly'], expiresAt: new Date(Date.now() + 3600000).toISOString() })
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  vi.clearAllMocks(); m.permitted = true; m.actor = 'owner'; m.grant = 'grant'; m.revoked = false; m.domain = null; m.published = true; m.parent = 'parent-a'; m.spaceOwner = 'owner'; m.domainHook = null; m.rate = true; m.loaded = { binding: bound(), tokens: tokens() }; m.calls = []; m.refreshSaved = true; m.fetchHook = null; m.contextHook = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    m.calls.push('provider'); m.fetchHook?.(url)
    if (url.endsWith('/sites')) return response({ siteEntry: [{ siteUrl: (m.loaded as { binding: SearchConnectionBinding } | null)?.binding.propertyUrl ?? 'https://owner.example/', permissionLevel: 'siteOwner' }] })
    const page = JSON.parse(String(init?.body)).dimensionFilterGroups[0].filters[0].expression
    return response({ rows: [{ keys: [page], clicks: 8, impressions: 40, ctr: .2, position: 4 }] })
  }))
})
describe('connected search runtime authority and real Google integration', () => {
  it.each(['permission', 'consent'])('never accesses credentials or providers before current %s', async cause => {
    if (cause === 'permission') m.permitted = false; else m.revoked = true
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ status: 'unavailable' })
    expect(m.calls).not.toContain('private'); expect(m.calls).not.toContain('provider')
    expect(coachDiscovery).not.toHaveBeenCalled()
  })
  it('only exposes the profile and currently served custom root, never a shared host root or another Space', async () => {
    expect((await resolveSearchAccess('space'))?.authorizedPageUrls).toEqual(['https://frequencylocal.com/spaces/alpha'])
    expect(await searchPropertyAllowed('space', 'bing_webmaster', 'https://frequencylocal.com/')).toBeNull()
    expect(await searchPropertyAllowed('space', 'google_search_console', 'https://frequencylocal.com/spaces/beta')).toBeNull()
    m.domain = 'owner.example'
    expect(await searchPropertyAllowed('space', 'bing_webmaster', 'https://owner.example/')).toBe('dedicated_property')
    expect(await searchPropertyAllowed('space', 'bing_webmaster', 'https://owner.example/nested')).toBeNull()
    expect(await searchPropertyAllowed('space', 'google_search_console', 'sc-domain:evilowner.example')).toBeNull()
  })
  it('uses real Google exact-page filters even when the account also owns a separate custom site', async () => {
    m.domain = 'owner.example'; m.loaded = { binding: { ...bound(), propertyUrl: 'https://owner.example/' }, tokens: tokens() }
    const result = await reviewSearchSignals('space', 'google_search_console')
    expect(result.status).toBe('completed')
    expect(coachDiscovery).toHaveBeenCalledTimes(1)
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(call[1]?.body)).dimensionFilterGroups[0].filters[0].expression).toBe('https://owner.example/')
    expect(m.calls.indexOf('provider')).toBeGreaterThan(m.calls.indexOf('consent'))
    expect(JSON.stringify(result)).not.toMatch(/private-access|private-refresh/)
  })
  it('does not verify or observe a property without an independently owned page', async () => {
    m.loaded = { binding: { ...bound(), propertyUrl: 'https://stranger.example/' }, tokens: tokens() }
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ status: 'unavailable' })
    expect(m.calls).not.toContain('provider')
  })
  it('drops observations if permission/consent is revoked while the provider is answering', async () => {
    m.fetchHook = url => { if (!url.endsWith('/sites')) m.revoked = true }
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ status: 'unavailable' })
    expect(coachDiscovery).not.toHaveBeenCalled()
  })
  it('drops observations on a final consent or owned-domain change after provider reads', async () => {
    m.contextHook = () => { m.grant = 'replaced-grant' }
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ status: 'unavailable' })
    expect(coachDiscovery).not.toHaveBeenCalled()
  })
  it('rate limits before provider access', async () => {
    m.rate = false
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ reason: 'rate_limited' })
    expect(m.calls).not.toContain('provider')
  })
  it('verifies a selected custom property before storing tokens without requiring unrelated profile coverage', async () => {
    m.domain = 'owner.example'; m.loaded = null
    expect(await verifySearchConnection({ ...bound(), propertyUrl: 'https://owner.example/' }, tokens())).toBe(true)
    expect(m.calls).not.toContain('private')
  })
  it.each(['disconnect', 'generation'])('drops provider evidence after a %s during owner-context IO', async change => {
    m.contextHook = () => { m.loaded = change === 'disconnect' ? null : { binding: { ...bound(), connectionId: 'replacement-generation' }, tokens: tokens() } }
    expect(await reviewSearchSignals('space', 'google_search_console')).toMatchObject({ status: 'unavailable', reason: 'not_connected' })
    expect(coachDiscovery).not.toHaveBeenCalled()
  })
  it('accepts an ordinary same-generation token refresh during context IO', async () => {
    m.contextHook = () => { m.loaded = { binding: { ...bound(), revision: 4 }, tokens: { ...tokens(), accessToken: 'legitimately-rotated' } } }
    expect((await reviewSearchSignals('space', 'google_search_console')).status).toBe('completed')
  })
  it.each(['publish', 'parent', 'owner'])('rejects a stale owned domain when %s changes during domain resolution', async change => {
    m.domain = 'owner.example'
    m.domainHook = () => { if (change === 'publish') m.published = false; if (change === 'parent') m.parent = 'new-parent'; if (change === 'owner') m.spaceOwner = 'new-owner'; m.domainHook = null }
    expect(await resolveSearchAccess('space')).toBeNull()
  })

  it('does not accept a failed refresh CAS or a disconnect during refresh', async () => {
    const deps = searchProviderDependencies('google_search_console')
    const current = { ...bound(), ...tokens(), revokedAt: null }
    m.refreshSaved = false
    expect(await deps.refreshConnection!(current)).toBeNull()
    expect(refreshSearchConnection).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }), expect.objectContaining({ accessToken: 'rotated' }))
    m.refreshSaved = true
    vi.mocked(refreshSearchTokens).mockImplementationOnce(async () => { m.loaded = null; return tokens() })
    expect(await deps.refreshConnection!(current)).toBeNull()
  })
})
