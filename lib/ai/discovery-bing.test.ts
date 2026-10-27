import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { observeBingDiscovery, verifyBingSearchProperty, type BingDiscoveryDependencies } from './discovery-bing'
import type { DiscoveryProviderAccess, DiscoveryProviderConnection } from './discovery-provider-access'

const now = new Date('2026-10-26T12:00:00.000Z')
const property = 'https://owner.example/'
const period = { from: '2026-10-20T00:00:00.000Z', to: now.toISOString() }
let access: DiscoveryProviderAccess
let connection: DiscoveryProviderConnection
let deps: BingDiscoveryDependencies
let request: Mock<NonNullable<BingDiscoveryDependencies['request']>>
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => ({ status, headers: { 'content-type': 'application/json', ...extra }, body: Buffer.from(JSON.stringify(body)), finalUrl: 'https://ssl.bing.com/webmaster/api.svc/json/GetUserSites' })
const row = (time = '2026-10-25T07:00:00Z', clicks = 3, impressions = 30) => ({ Date: `/Date(${Date.parse(time)}-0700)/`, Clicks: clicks, Impressions: impressions })
beforeEach(() => {
  access = { spaceId: 'A', actorProfileId: 'owner', canEditProfile: true, consent: { id: 'grant', purpose: 'discovery_coaching', grantedAt: '2026-10-01T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z', revokedAt: null }, authorizedPageUrls: [property] }
  connection = { provider: 'bing_webmaster', connectionId: 'conn', spaceId: 'A', actorProfileId: 'owner', consentId: 'grant', propertyUrl: property, propertyScope: 'dedicated_property', accessToken: 'SECRET_TOKEN', expiresAt: '2026-10-27T00:00:00Z', revokedAt: null, scopes: ['Webmaster.read'] }
  request = vi.fn<NonNullable<BingDiscoveryDependencies['request']>>().mockResolvedValueOnce(json({ d: [{ Url: property, IsVerified: true, AuthenticationCode: 'PRIVATE_CODE' }, { Url: 'https://other.example/', IsVerified: true }] })).mockResolvedValueOnce(json({ d: [row(), row('2026-10-10T07:00:00Z', 99, 100)] }))
  deps = { resolveAccess: vi.fn(async () => structuredClone(access)), resolveConnection: vi.fn(async () => structuredClone(connection)), request, now: () => now }
})
describe('Bing dedicated-property read-only observations', () => {
  it('verifies exact property and reads only fixed GET endpoints; returns selected aggregate evidence without credentials or other sites', async () => {
    const out = await observeBingDiscovery('A', period, deps)
    expect(out.status).toBe('completed')
    if (out.status !== 'completed') return
    expect(out.observations.map(item => item.status === 'accepted' ? [item.observation.metric, item.observation.value, item.observation.collectionMethod] : item)).toEqual([['search_clicks', 3, 'api_response'], ['search_impressions', 30, 'api_response']])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://ssl.bing.com/webmaster/api.svc/json/GetUserSites', 'https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=https%3A%2F%2Fowner.example%2F'])
    expect(request.mock.calls[0][1]).toMatchObject({ maxBytes: 1048576, timeoutMs: 8000, maxRedirects: 0, headers: { Authorization: 'Bearer SECRET_TOKEN' } })
    expect(JSON.stringify(out)).not.toMatch(/SECRET_TOKEN|PRIVATE_CODE|other.example/)
    expect(out.observations[0]).toMatchObject({ observation: { observedAt: '2026-10-25T07:00:00.000Z', period: { from: period.from, to: '2026-10-25T07:00:00.000Z' } } })
    expect(out.limitations.join(' ')).toContain('not AI citations')
    expect(out.limitations.join(' ')).toContain('1 records outside')
  })
  it.each(['denied', 'foreign_space', 'revoked', 'expired', 'wrong_purpose', 'other_actor', 'other_grant', 'manage_scope'])('blocks %s before any network request', async kind => {
    if (kind === 'denied') access.canEditProfile = false
    if (kind === 'foreign_space') connection.spaceId = 'B'
    if (kind === 'revoked') access.consent.revokedAt = now.toISOString()
    if (kind === 'expired') connection.expiresAt = now.toISOString()
    if (kind === 'wrong_purpose') Object.assign(access.consent, { purpose: 'analytics' })
    if (kind === 'other_actor') connection.actorProfileId = 'other'
    if (kind === 'other_grant') connection.consentId = 'other'
    if (kind === 'manage_scope') connection.scopes = [...connection.scopes, 'Webmaster.manage']
    expect((await observeBingDiscovery('A', period, deps)).status).toBe('unavailable')
    expect(request).not.toHaveBeenCalled()
  })
  it('rejects scope prefixes, suffixes and mixed arrays before provider IO', async () => {
    const read = 'Webmaster.read'
    for (const scopes of [[`prefix:${read}`], [`${read}.suffix`], [read.slice(0, -1)], [read, 'unknown'], [read, read]]) {
      connection.scopes = scopes
      expect((await observeBingDiscovery('A', period, deps)).status).toBe('unavailable')
      expect(request).not.toHaveBeenCalled()
    }
  })
  it.each(['shared_host', 'path_prefix', 'page_scope', 'unowned_property'])('refuses %s without broad site reads', async kind => {
    if (kind === 'shared_host') { connection.propertyUrl = 'https://frequencylocal.com/'; access.authorizedPageUrls = [connection.propertyUrl] }
    if (kind === 'path_prefix') { connection.propertyUrl = 'https://owner.example/spaces/A'; access.authorizedPageUrls = [connection.propertyUrl] }
    if (kind === 'page_scope') connection.propertyScope = 'page_urls'
    if (kind === 'unowned_property') access.authorizedPageUrls = ['https://owner.example/about']
    expect(await observeBingDiscovery('A', period, deps)).toMatchObject({ status: 'unavailable', reason: 'property_scope_unavailable' })
    expect(request).not.toHaveBeenCalled()
  })
  it('accepts the provider root spelling without trailing slash through exact canonical identity', async () => {
    request.mockReset().mockResolvedValueOnce(json({ d: [{ Url: property.slice(0, -1), IsVerified: true }] })).mockResolvedValueOnce(json({ d: [row()] }))
    expect((await observeBingDiscovery('A', period, deps)).status).toBe('completed')
  })
  it('requires exact provider-verified property before statistics, not prefix or accessible other site', async () => {
    request.mockReset().mockResolvedValue(json({ d: [{ Url: 'https://owner.example.evil/', IsVerified: true }, { Url: property, IsVerified: false }] }))
    expect(await observeBingDiscovery('A', period, deps)).toMatchObject({ reason: 'property_unverified' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('discards permission revoked in flight and never requests statistics', async () => {
    request.mockReset().mockImplementation(async () => { access.canEditProfile = false; return json({ d: [{ Url: property, IsVerified: true }] }) })
    expect(await observeBingDiscovery('A', period, deps)).toMatchObject({ reason: 'permission_denied' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('discards results after consent replacement, domain removal or connection revocation during statistics', async () => {
    for (const change of [() => { access.consent.id = 'newgrant' }, () => { access.authorizedPageUrls = ['https://replacement.example/'] }, () => { connection.revokedAt = now.toISOString() }]) {
      access.consent.id = 'grant'; access.authorizedPageUrls = [property]; connection.revokedAt = null
      request.mockReset().mockResolvedValueOnce(json({ d: [{ Url: property, IsVerified: true }] })).mockImplementationOnce(async () => { change(); return json({ d: [row()] }) })
      expect(await observeBingDiscovery('A', period, deps)).toMatchObject({ status: 'unavailable', reason: 'permission_denied' })
    }
  })
  it.each([401, 403, 429, 500, 302])('handles HTTP%i without retry or response leakage', async status => {
    request.mockReset().mockResolvedValue(json({ secret: 'PROVIDER_BODY' }, status, { 'retry-after': '120' }))
    const out = await observeBingDiscovery('A', period, deps)
    expect(out).toMatchObject({ status: 'unavailable', reason: status === 429 ? 'rate_limited' : status < 500 && status !== 302 ? 'not_connected' : 'provider_error' })
    if (status === 429) expect(out).toMatchObject({ retryAfterSeconds: 120 })
    expect(request).toHaveBeenCalledTimes(1); expect(JSON.stringify(out)).not.toContain('PROVIDER_BODY')
  })
  it.each(['empty', 'duplicate', 'negative', 'bad_date', 'overflow', 'too_many', 'body_error', 'wrong_type', 'oversize', 'network'])('reports %s honestly without measured zero', async kind => {
    let response = json({ d: [] })
    if (kind === 'duplicate') response = json({ d: [row(), row()] })
    if (kind === 'negative') response = json({ d: [row(undefined, -1)] })
    if (kind === 'bad_date') response = json({ d: [{ ...row(), Date: 'yesterday' }] })
    if (kind === 'overflow') response = json({ d: [row(undefined, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1)] })
    if (kind === 'too_many') response = json({ d: Array(5001).fill(row()) })
    if (kind === 'body_error') response = json({ d: [], ErrorCode: 3, Message: 'secret' })
    if (kind === 'wrong_type') response.headers['content-type'] = 'text/html'
    if (kind === 'oversize') response.body = Buffer.alloc(1048577)
    request.mockReset().mockResolvedValueOnce(json({ d: [{ Url: property, IsVerified: true }] })).mockResolvedValueOnce(kind === 'network' ? null : response)
    const out = await observeBingDiscovery('A', period, deps)
    expect(out.status).toBe('unavailable')
    expect(JSON.stringify(out)).not.toContain('observations')
  })
  it('retains old provider timestamps as stale instead of refreshing them on retrieval', async () => {
    const oldPeriod = { from: '2026-10-01T00:00:00Z', to: '2026-10-20T00:00:00Z' }
    request.mockReset().mockResolvedValueOnce(json({ d: [{ Url: property, IsVerified: true }] })).mockResolvedValueOnce(json({ d: [row('2026-10-02T07:00:00Z')] }))
    const out = await observeBingDiscovery('A', oldPeriod, deps)
    expect(out.status).toBe('completed')
    if (out.status === 'completed') expect(out.observations.every(item => item.status === 'accepted' && item.observation.freshness === 'stale')).toBe(true)
  })
  it.each(['scope', 'expiry'])('discards a %s change during provider IO', async kind => {
    request.mockReset().mockResolvedValueOnce(json({ d: [{ Url: property, IsVerified: true }] })).mockImplementationOnce(async () => {
      if (kind === 'scope') connection.scopes = []
      else connection.expiresAt = now.toISOString()
      return json({ d: [row()] })
    })
    expect(await observeBingDiscovery('A', period, deps)).toMatchObject({ status: 'unavailable', reason: 'permission_denied' })
  })
  it('sanitizes a thrown transport error without exposing its token', async () => {
    request.mockReset().mockRejectedValue(new Error('SECRET_TOKEN provider detail'))
    expect(await observeBingDiscovery('A', period, deps)).toEqual({ status: 'unavailable', reason: 'provider_error' })
  })
  it('bounds time windows before any credential or provider access', async () => {
    expect(await observeBingDiscovery('A', { from: '2026-01-01', to: now.toISOString() }, deps)).toMatchObject({ reason: 'invalid_context' })
    expect(request).not.toHaveBeenCalled(); expect(deps.resolveAccess).not.toHaveBeenCalled()
  })
})


describe('Bing OAuth property verification is independent of traffic', () => {
  it('connects a verified property with no performance request or observations', async () => {
    request.mockReset().mockResolvedValue(json({ d: [{ Url: property.slice(0, -1), IsVerified: true }] }))
    expect(await verifyBingSearchProperty('A', deps)).toEqual({ status: 'completed', propertyUrl: property })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toContain('/GetUserSites')
    expect(request.mock.calls.some(call => call[0].includes('GetRankAndTrafficStats'))).toBe(false)
  })
  it.each(['unverified', 'other_property', 'permission', 'consent', 'replaced_connection'])('denies %s without statistics or credentials', async kind => {
    request.mockReset().mockImplementation(async () => {
      if (kind === 'permission') access.canEditProfile = false
      if (kind === 'consent') access.consent.revokedAt = now.toISOString()
      if (kind === 'replaced_connection') connection.connectionId = 'new-conn'
      return json({ d: [{ Url: kind === 'other_property' ? 'https://other.example/' : property, IsVerified: kind !== 'unverified' }] })
    })
    const result = await verifyBingSearchProperty('A', deps)
    expect(result.status).toBe('unavailable')
    expect(request).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('SECRET_TOKEN')
  })
  it('refuses shared properties before even listing provider sites', async () => {
    connection.propertyScope = 'page_urls'
    expect(await verifyBingSearchProperty('A', deps)).toMatchObject({ status: 'unavailable', reason: 'property_scope_unavailable' })
    expect(request).not.toHaveBeenCalled()
  })
})
