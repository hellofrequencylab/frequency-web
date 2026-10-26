import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { observeGoogleSearchConsole, listGoogleSearchConsoleProperties, GOOGLE_SEARCH_READ_SCOPE, type GoogleDiscoveryDependencies } from './discovery-google'
import { openDiscoveryProvider, discoveryProviderSessionCurrent, type DiscoveryProviderAccess, type DiscoveryProviderConnection } from './discovery-provider-access'

const page = 'https://frequencylocal.com/spaces/alpha'
const time = new Date('2026-10-26T18:00:00.000Z')
let access: DiscoveryProviderAccess
let connection: DiscoveryProviderConnection
let deps: GoogleDiscoveryDependencies
let request: ReturnType<typeof vi.fn>
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
beforeEach(() => {
  access = { spaceId: 'space-a', actorProfileId: 'owner', canEditProfile: true, authorizedPageUrls: [page], consent: { id: 'grant-a', purpose: 'discovery_coaching', grantedAt: '2026-10-25T18:00:00.000Z', expiresAt: '2026-11-25T18:00:00.000Z', revokedAt: null } }
  connection = { provider: 'google_search_console', connectionId: 'connection-a', spaceId: 'space-a', actorProfileId: 'owner', consentId: 'grant-a', propertyUrl: 'sc-domain:frequencylocal.com', propertyScope: 'page_urls', accessToken: 'private-token', expiresAt: '2026-10-26T19:00:00.000Z', revokedAt: null, scopes: [GOOGLE_SEARCH_READ_SCOPE] }
  request = vi.fn(async (url: string) => url.endsWith('/sites') ? response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] }) : response({ rows: [{ keys: [page], clicks: 8, impressions: 40, ctr: .2, position: 4 }] }))
  deps = { resolveAccess: vi.fn(async () => structuredClone(access)), resolveConnection: vi.fn(async () => structuredClone(connection)), now: () => time, request: request as typeof fetch }
})
const run = () => observeGoogleSearchConsole('space-a', { startDate: '2026-10-20', endDate: '2026-10-24' }, deps)
describe('Google Search Console bounded observation', () => {
  it('verifies current property permission and queries only approved exact Space pages', async () => {
    const result = await run()
    expect(result.status).toBe('completed')
    if (result.status !== 'completed') return
    expect(result.imported.observations.some(o => o.status === 'accepted')).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
    const [url, init] = request.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Afrequencylocal.com/searchAnalytics/query')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit' })
    expect(JSON.parse(String(init.body))).toMatchObject({ dimensions: ['page'], dataState: 'final', dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'page', operator: 'equals', expression: page }] }] })
    expect(JSON.stringify(result)).not.toContain('private-token')
    const accepted = result.imported.observations.find(o => o.status === 'accepted')
    if (accepted?.status === 'accepted') expect(accepted.observation.period).toEqual({ from: '2026-10-20T07:00:00.000Z', to: '2026-10-25T07:00:00.000Z' })
  })
  it.each(['space', 'actor', 'consent', 'revoked', 'write_scope', 'expired_scope'])('denies mismatched/revoked %s before provider IO', async (variant) => {
    if (variant === 'space') connection.spaceId = 'space-b'
    if (variant === 'actor') connection.actorProfileId = 'stranger'
    if (variant === 'consent') connection.consentId = 'old'
    if (variant === 'revoked') access.consent.revokedAt = time.toISOString()
    if (variant === 'write_scope') connection.scopes.push('https://www.googleapis.com/auth/webmasters')
    if (variant === 'expired_scope') connection.scopes = []
    expect((await run()).status).toBe('unavailable')
    expect(request).not.toHaveBeenCalled()
  })
  it('preserves the Pacific DST day as a 25-hour evidence interval', async () => {
    deps.now = () => new Date('2026-11-05T18:00:00.000Z')
    connection.expiresAt = '2026-11-06T18:00:00.000Z'
    const result = await observeGoogleSearchConsole('space-a', { startDate: '2026-11-01', endDate: '2026-11-01' }, deps)
    if (result.status !== 'completed') throw new Error('Expected DST observation')
    const item = result.imported.observations.find(o => o.status === 'accepted')
    if (item?.status !== 'accepted') throw new Error('Expected validated evidence')
    expect(item.observation.period).toEqual({ from: '2026-11-01T07:00:00.000Z', to: '2026-11-02T08:00:00.000Z' })
  })

  it('does not read credentials for an outsider', async () => {
    access.canEditProfile = false
    expect(await run()).toMatchObject({ status: 'unavailable', reason: 'permission_denied' })
    expect(deps.resolveConnection).not.toHaveBeenCalled()
  })
  it.each(['siteRestrictedUser', 'siteUnverifiedUser'])('rejects %s property permissions', async permissionLevel => {
    request.mockImplementation(async () => response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel }] }))
    expect(await run()).toMatchObject({ status: 'unavailable', reason: 'property_not_verified' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('does not substitute another property even when its domain suffix looks similar', async () => {
    request.mockImplementation(async () => response({ siteEntry: [{ siteUrl: 'sc-domain:evilfrequencylocal.com', permissionLevel: 'siteOwner' }] }))
    expect(await run()).toMatchObject({ reason: 'property_not_verified' })
  })
  it('lists only relevant properties and rejects pages outside a URL prefix', async () => {
    request.mockImplementation(async () => response({ siteEntry: [{ siteUrl: 'https://frequencylocal.com/spaces/beta', permissionLevel: 'siteOwner' }, { siteUrl: 'https://frequencylocal.com/', permissionLevel: 'siteFullUser' }] }))
    expect(await listGoogleSearchConsoleProperties('space-a', deps)).toEqual({ status: 'completed', propertyUrls: ['https://frequencylocal.com/'] })
  })
  it('rechecks revocation during a provider read and returns no observations', async () => {
    request.mockImplementation(async () => { access.consent.revokedAt = time.toISOString(); return response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] }) })
    expect((await run()).status).toBe('unavailable')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('discards out-of-Space rows even if Google returns them against a filter', async () => {
    request.mockImplementation(async (url: string) => url.endsWith('/sites') ? response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] }) : response({ rows: [{ keys: ['https://frequencylocal.com/spaces/beta'], clicks: 4, impressions: 20 }] }))
    const result = await run()
    expect(result.status).toBe('completed')
    if (result.status === 'completed') { expect(result.imported.observations).toEqual([]); expect(result.imported.rejectedRows).toBe(1) }
  })
  it('missing rows do not invent a zero observation', async () => {
    request.mockImplementation(async (url: string) => url.endsWith('/sites') ? response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] }) : response({}))
    const result = await run()
    if (result.status !== 'completed') throw new Error('Expected completed empty read')
    expect(result.imported.observations).toEqual([])
    expect(result.limitations.join(' ')).toContain('Missing rows')
  })
  it.each([{ startDate: '2026-02-30', endDate: '2026-03-02' }, { startDate: '2026-10-01', endDate: '2026-11-10' }, { startDate: '2026-10-26', endDate: '2026-10-26' }])('rejects invalid, excessive or unfinished periods before any provider access', async dates => {
    expect(await observeGoogleSearchConsole('space-a', dates, deps)).toMatchObject({ reason: 'invalid_context' })
    expect(request).not.toHaveBeenCalled()
  })
  it('enforces page and streamed response limits', async () => {
    access.authorizedPageUrls = Array.from({ length: 21 }, (_, i) => `https://frequencylocal.com/spaces/alpha/${i}`)
    expect(await run()).toMatchObject({ reason: 'scope_limit' })
    expect(request).not.toHaveBeenCalled()
    access.authorizedPageUrls = [page]
    request.mockImplementation(async () => new Response('x'.repeat(262145), { headers: { 'content-type': 'application/json' } }))
    expect(await run()).toMatchObject({ reason: 'provider_error' })
  })
  it('stops the read when its overall HTTP budget is exhausted', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      request.mockImplementation(async () => { clock.mockReturnValue(30_001); return response({ siteEntry: [{ siteUrl: connection.propertyUrl, permissionLevel: 'siteOwner' }] }) })
      expect(await run()).toMatchObject({ reason: 'provider_error' })
      expect(request).toHaveBeenCalledTimes(1)
    } finally { clock.mockRestore() }
  })

  it.each([401, 403, 429, 500])('fails unavailable on provider status%s without exposing body/token', async status => {
    request.mockImplementation(async () => response({ message: 'private-token' }, status))
    expect(await run()).toEqual({ status: 'unavailable', reason: 'provider_error' })
  })
})
describe('shared private credential broker gates', () => {
  it('refreshes once through the private broker while retaining bindings', async () => {
    connection.expiresAt = '2026-10-26T17:00:00.000Z'
    deps.refreshConnection = vi.fn(async old => { connection = { ...old, accessToken: 'rotated', expiresAt: '2026-10-26T19:00:00.000Z' }; return connection })
    expect((await run()).status).toBe('completed')
    expect(deps.refreshConnection).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(request.mock.calls)).toContain('Bearer rotated')
  })
  it('rejects scope removal and connection revoke after session creation', async () => {
    const opened = await openDiscoveryProvider('space-a', 'google_search_console', GOOGLE_SEARCH_READ_SCOPE, deps)
    if (opened.status !== 'ready') throw new Error('missing fixture session')
    connection.scopes = []
    expect(await discoveryProviderSessionCurrent(opened.session, deps)).toBe(false)
    connection.scopes = [GOOGLE_SEARCH_READ_SCOPE]; connection.revokedAt = time.toISOString()
    expect(await discoveryProviderSessionCurrent(opened.session, deps)).toBe(false)
  })
  it('rejects a refresh that moves credentials to another actor/property or races consent revoke', async () => {
    connection.expiresAt = '2026-10-26T17:00:00.000Z'
    deps.refreshConnection = vi.fn(async old => ({ ...old, actorProfileId: 'stranger', expiresAt: '2026-10-26T19:00:00.000Z' }))
    expect(await run()).toMatchObject({ reason: 'connection_expired' })
    deps.refreshConnection = vi.fn(async old => { access.consent.revokedAt = time.toISOString(); return { ...old, expiresAt: '2026-10-26T19:00:00.000Z' } })
    expect(await run()).toMatchObject({ reason: 'connection_expired' })
    expect(request).not.toHaveBeenCalled()
  })
})
