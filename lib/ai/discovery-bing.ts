import 'server-only'
import { fetchPinned as pinnedFetch } from '@/lib/net/pinned-fetch'
import { appOrigin } from '@/lib/sites/host'
import { validateDiscoveryObservation } from './discovery-evidence'
import { openDiscoveryProvider, discoveryProviderSessionCurrent, type DiscoveryProviderDependencies } from './discovery-provider-access'

// Official JSON/HTTP (not retired SOAP/POX):
// https://learn.microsoft.com/en-us/bingwebmaster/api-protocols
// https://learn.microsoft.com/en-us/bingwebmaster/oauth2
// https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getrankandtrafficstats
const BASE = 'https://ssl.bing.com/webmaster/api.svc/json/'
const MAX_ROWS = 5000
const DAY = 86_400_000
const LIMITS = [
  'Bing reports clicks and impressions across its search verticals, including Chat. These are not AI citations, distinct people, referrals or conversions.',
  'Only returned provider records whose timestamps fall within the selected interval are summed. The evidence interval ends at the latest selected provider timestamp, not the requested end. It does not assert complete calendar-day buckets. Provider coverage and date-boundary completeness are unknown; missing records are not zero.',
  'Provider record timestamps determine freshness. A new retrieval does not make old data fresh. No comparison or causal effect is established.',
]
type Reason = 'permission_denied' | 'consent_required' | 'invalid_context' | 'not_connected' | 'connection_expired' | 'property_scope_unavailable' | 'property_unverified' | 'provider_error' | 'rate_limited' | 'invalid_response' | 'no_data'
type BingDiscoveryResult =
  | { status: 'unavailable'; reason: Reason; retryAfterSeconds?: number; providerStatus?: number }
  | { status: 'completed'; provider: 'bing_webmaster'; propertyUrl: string; observations: ReturnType<typeof validateDiscoveryObservation>[]; limitations: string[] }
export interface BingDiscoveryDependencies extends DiscoveryProviderDependencies { request?: typeof pinnedFetch }
type BingUnavailable = Extract<BingDiscoveryResult, { status: 'unavailable' }>
const unavailable = (reason: Reason, providerStatus?: number): BingUnavailable => ({ status: 'unavailable', reason, ...([400, 401, 403, 404, 408, 429, 500, 502, 503, 504].some(status => status === providerStatus) ? { providerStatus } : {}) })
const record = (raw: unknown): Record<string, unknown> | null => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
const count = (raw: unknown): raw is number => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0
function stamp(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  // WCF JSON's epoch is an absolute instant; its optional offset is not another
  // offset to add. Do not reinterpret this as a promised UTC/calendar-day boundary.
  const found = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(raw)
  if (!found) return null
  const time = Number(found[1])
  return Number.isSafeInteger(time) && Number.isFinite(new Date(time).getTime()) ? time : null
}
function dedicatedProperty(property: string, pages: readonly string[]): boolean {
  try {
    const url = new URL(property)
    const shared = new URL(appOrigin()).hostname
    return url.protocol === 'https:' && url.href === property && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password && !url.port && url.hostname !== shared && !url.hostname.endsWith(`.${shared}`) && pages.includes(property)
  } catch { return false }
}
async function openVerifiedBing(spaceId: string, deps: BingDiscoveryDependencies) {
  const opened = await openDiscoveryProvider(spaceId, 'bing_webmaster', 'Webmaster.read', deps)
  if (opened.status !== 'ready') return opened
  const session = opened.session
  const property = session.connection.propertyUrl
  if (session.connection.propertyScope !== 'dedicated_property' || !dedicatedProperty(property, session.access.authorizedPageUrls)) return unavailable('property_scope_unavailable')
  // The broader write scope is not needed for any method this reader calls.
  if (session.connection.scopes.some(scope => scope.toLowerCase() === 'webmaster.manage')) return unavailable('not_connected')
  const request = deps.request ?? pinnedFetch
  let requestFailure: BingUnavailable | null = null
  async function get(method: 'GetUserSites' | 'GetRankAndTrafficStats'): Promise<unknown[] | null> {
    if (!(await discoveryProviderSessionCurrent(session, deps))) { requestFailure = unavailable('permission_denied'); return null }
    const url = new URL(method, BASE)
    if (method === 'GetRankAndTrafficStats') url.searchParams.set('siteUrl', property)
    const response = await request(url.href, { maxBytes: 1_048_576, timeoutMs: 8000, maxRedirects: 0, headers: { Authorization: `Bearer ${session.connection.accessToken}`, Accept: 'application/json' } })
    if (!(await discoveryProviderSessionCurrent(session, deps))) { requestFailure = unavailable('permission_denied'); return null }
    if (!response) { requestFailure = unavailable('provider_error'); return null }
    if (response.status === 429) {
      const raw = response.headers['retry-after']
      const seconds = /^\d{1,5}$/.test(raw ?? '') ? Number(raw) : NaN
      requestFailure = { status: 'unavailable', reason: 'rate_limited', providerStatus: 429, ...(Number.isFinite(seconds) ? { retryAfterSeconds: Math.max(1, Math.min(86400, seconds)) } : {}) }
      return null
    }
    if (response.status === 401 || response.status === 403) { requestFailure = unavailable('not_connected', response.status); return null }
    if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers['content-type'] ?? '') || response.body.length > 1_048_576) { requestFailure = unavailable('provider_error', response.status); return null }
    let body: Record<string, unknown> | null
    try { body = record(JSON.parse(response.body.toString('utf8'))) } catch { body = null }
    if (!body || 'ErrorCode' in body || !Array.isArray(body.d) || body.d.length > MAX_ROWS) { requestFailure = unavailable('invalid_response'); return null }
    return body.d
  }
  try {
    const sites = await get('GetUserSites')
    if (!sites) return requestFailure ?? unavailable('provider_error')
    if (!sites.some(raw => {
      const site = record(raw)
      if (site?.IsVerified !== true || typeof site.Url !== 'string' || site.Url.length > 2048) return false
      // The documented provider response may omit the root slash. Canonical URL
      // identity permits that spelling, never a prefix, query or different protocol.
      try { return new URL(site.Url).href === property } catch { return false }
    })) return unavailable('property_unverified')
    return { status: 'ready' as const, session, property, get, failure: () => requestFailure }
  } catch { return unavailable('provider_error') }
}

/** Verify authorization independently of search activity. A new/quiet verified property
 * can connect without any traffic rows; this operation never reads performance data. */
export async function verifyBingSearchProperty(spaceId: string, deps: BingDiscoveryDependencies): Promise<BingUnavailable | { status: 'completed'; propertyUrl: string }> {
  const reader = await openVerifiedBing(spaceId, deps)
  if (reader.status !== 'ready') return reader
  if (!(await discoveryProviderSessionCurrent(reader.session, deps))) return unavailable('permission_denied')
  return { status: 'completed', propertyUrl: reader.property }
}

/** A real read-only connector, usable only through a server-owned credential/permission broker.
 * It deliberately refuses shared-host properties: Bing's documented site statistics cannot
 * restrict a request to one Space's pages. No connection/storage/OAuth provisioning is implied.
 */
export async function observeBingDiscovery(spaceId: string, period: { from: string; to: string }, deps: BingDiscoveryDependencies): Promise<BingDiscoveryResult> {
  const now = deps.now?.() ?? new Date()
  const from = Date.parse(period?.from), to = Date.parse(period?.to)
  if (typeof period?.from !== 'string' || typeof period?.to !== 'string' || !period.from.includes('T') || !period.to.includes('T') || !Number.isFinite(now.getTime()) || !Number.isFinite(from) || !Number.isFinite(to) || from >= to || to > now.getTime() || to - from > 31 * DAY || from < now.getTime() - 90 * DAY) return unavailable('invalid_context')
  const reader = await openVerifiedBing(spaceId, deps)
  if (reader.status !== 'ready') return reader
  const { session, property, get } = reader
  try {
    const rows = await get('GetRankAndTrafficStats')
    if (!rows) return reader.failure() ?? unavailable('provider_error')
    const seen = new Set<number>()
    let clicks = 0, impressions = 0, latest = -Infinity, selected = 0
    for (const raw of rows) {
      const row = record(raw), time = stamp(row?.Date)
      if (!row || time === null || !count(row.Clicks) || !count(row.Impressions) || row.Clicks > row.Impressions || seen.has(time)) return unavailable('invalid_response')
      seen.add(time)
      if (time < from || time >= to) continue
      clicks += row.Clicks; impressions += row.Impressions
      if (!count(clicks) || !count(impressions)) return unavailable('invalid_response')
      latest = Math.max(latest, time); selected++
    }
    if (!(await discoveryProviderSessionCurrent(session, deps))) return unavailable('permission_denied')
    if (!selected || latest <= from) return unavailable('no_data')
    const evaluated = deps.now?.() ?? new Date()
    const access = { spaceId, authorized: true, consent: session.access.consent }
    const observations = ([['search_clicks', clicks], ['search_impressions', impressions]] as const).map(([metric, value], index) => validateDiscoveryObservation({
      id: `bing_${index}`, category: 'demand', provider: 'bing_webmaster', collectionMethod: 'api_response', metric, value, unit: 'count', countingUnit: 'events', denominator: null, sampleSize: null,
      coverage: 'unknown', kind: 'measured', sourceUrl: property, observedAt: new Date(latest).toISOString(), publishedAt: null, retrievedAt: evaluated.toISOString(), period: { from: period.from, to: new Date(latest).toISOString() },
      region: { countryCode: null, regionCode: null }, scope: { spaceId, consentId: session.access.consent.id }, comparison: { status: 'unavailable', baseline: null },
    }, access, evaluated))
    if (observations.some(item => item.status !== 'accepted')) return unavailable('invalid_response')
    return { status: 'completed', provider: 'bing_webmaster', propertyUrl: property, observations, limitations: [...LIMITS, `${selected} provider records were selected; ${rows.length - selected} records outside the interval were excluded.`] }
  } catch { return unavailable('provider_error') }
}
