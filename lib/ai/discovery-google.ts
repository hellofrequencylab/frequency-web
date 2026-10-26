import 'server-only'
import { createHash } from 'node:crypto'
import { zonedWallClockToInstant } from '@/lib/time/zone'
import { normalizeGoogleSearchAnalytics, type DiscoveryImportResult } from './discovery-observations'
import { openDiscoveryProvider, discoveryProviderSessionCurrent, type DiscoveryProviderDependencies, type DiscoveryProviderSession } from './discovery-provider-access'

export const GOOGLE_SEARCH_READ_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const API = 'https://www.googleapis.com/webmasters/v3/sites'
const MAX_BYTES = 256 * 1024
const MAX_PAGES = 20
// https://developers.google.com/webmaster-tools/v1/sites/list
// https://developers.google.com/webmaster-tools/v1/searchanalytics/query
const HTTP_BUDGET_MS = 30_000
export interface GoogleDiscoveryDependencies extends DiscoveryProviderDependencies {
  /** Tests may supply an inert transport; production uses fixed Google endpoints only. */
  request?: typeof fetch
}
type Failure = { status: 'unavailable'; reason: 'permission_denied' | 'consent_required' | 'invalid_context' | 'not_connected' | 'connection_expired' | 'property_not_verified' | 'provider_error' | 'scope_limit' }
export type GoogleDiscoveryResult = Failure | { status: 'completed'; imported: DiscoveryImportResult; propertyUrl: string; limitations: string[] }
const obj = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
/** Scope matching never grants page ownership. Every queried page still comes from the independent
 * server allow-list, including when a platform-wide or Domain property is available to Google. */
function propertyContains(property: string, page: string): boolean {
  try {
    const target = new URL(page)
    if (property.startsWith('sc-domain:')) {
      const host = property.slice(10)
      return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host) && host.includes('.') && (target.hostname === host || target.hostname.endsWith('.' + host))
    }
    const prefix = new URL(property)
    return prefix.protocol === 'https:' && !prefix.username && !prefix.password && !prefix.search && !prefix.hash && prefix.href === property && target.origin === prefix.origin && page.startsWith(property)
  } catch { return false }
}
async function json(url: string, session: DiscoveryProviderSession, deps: GoogleDiscoveryDependencies, deadline: number, body?: unknown): Promise<unknown> {
  if (Date.now() >= deadline) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(8000, Math.max(1, deadline - Date.now())))
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let received: Response | undefined
  try {
    const response = await (deps.request ?? fetch)(url, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${session.connection.accessToken}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal })
    received = response
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || (response.headers.has('content-length') && Number(response.headers.get('content-length')) > MAX_BYTES) || !response.body) return null
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) { controller.abort(); return null }
      chunks.push(chunk.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch { return null }
  finally { clearTimeout(timer); if (reader) await reader.cancel().catch(() => undefined); else await received?.body?.cancel().catch(() => undefined) }
}
async function properties(session: DiscoveryProviderSession, deps: GoogleDiscoveryDependencies, deadline: number): Promise<string[] | null> {
  if (!(await discoveryProviderSessionCurrent(session, deps))) return null
  const raw = obj(await json(API, session, deps, deadline))
  if (!raw || !Array.isArray(raw.siteEntry) || raw.siteEntry.length > 1000 || !(await discoveryProviderSessionCurrent(session, deps))) return null
  const relevant: string[] = []
  for (const entry of raw.siteEntry) {
    const site = obj(entry)
    // Restricted/unverified properties cannot enable this integration. This proves provider
    // permission, not ownership of every tenant on a shared host.
    if (site && typeof site.siteUrl === 'string' && ['siteOwner', 'siteFullUser'].includes(String(site.permissionLevel)) && session.access.authorizedPageUrls.some(page => propertyContains(site.siteUrl as string, page))) relevant.push(site.siteUrl)
  }
  return [...new Set(relevant)]
}
/** Optional setup listing exposes only properties that cover the independently approved Space pages. */
export async function listGoogleSearchConsoleProperties(spaceId: string, deps: GoogleDiscoveryDependencies): Promise<Failure | { status: 'completed'; propertyUrls: string[] }> {
  const opened = await openDiscoveryProvider(spaceId, 'google_search_console', GOOGLE_SEARCH_READ_SCOPE, deps)
  if (opened.status !== 'ready') return opened
  const found = await properties(opened.session, deps, Date.now() + HTTP_BUDGET_MS)
  return found ? { status: 'completed', propertyUrls: found } : { status: 'unavailable', reason: 'provider_error' }
}
function period(start: string, end: string, now: Date): { from: string; to: string } | null {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  if (!valid(start) || !valid(end) || end < start || Date.parse(end) - Date.parse(start) > 30 * 86400000) return null
  const [y, m, d] = start.split('-').map(Number)
  const next = new Date(Date.parse(end) + 86400000)
  const from = zonedWallClockToInstant(y, m, d, 0, 0, 0, 'America/Los_Angeles')
  const to = zonedWallClockToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, 'America/Los_Angeles')
  return to.getTime() <= now.getTime() ? { from: from.toISOString(), to: to.toISOString() } : null
}
/** Concrete read-only ingestion: fresh permission/consent -> token -> live property permission ->
 * one exact page filter per approved URL -> existing validator. No queries/demographics, content
 * writes, sitemap submission, ownership mutation or retained raw provider responses. */
export async function observeGoogleSearchConsole(spaceId: string, dates: { startDate: string; endDate: string }, deps: GoogleDiscoveryDependencies): Promise<GoogleDiscoveryResult> {
  const deadline = Date.now() + HTTP_BUDGET_MS
  const now = deps.now?.() ?? new Date()
  const range = Number.isFinite(now.getTime()) && typeof dates?.startDate === 'string' && typeof dates?.endDate === 'string' ? period(dates.startDate, dates.endDate, now) : null
  if (!range) return { status: 'unavailable', reason: 'invalid_context' }
  const opened = await openDiscoveryProvider(spaceId, 'google_search_console', GOOGLE_SEARCH_READ_SCOPE, deps)
  if (opened.status !== 'ready') return opened
  const { session } = opened
  const matchingPages = session.access.authorizedPageUrls.filter(page => propertyContains(session.connection.propertyUrl, page))
  if (!matchingPages.length) return { status: 'unavailable', reason: 'property_not_verified' }
  if (matchingPages.length > MAX_PAGES) return { status: 'unavailable', reason: 'scope_limit' }
  const found = await properties(session, deps, deadline)
  if (!found) return { status: 'unavailable', reason: 'provider_error' }
  if (!found.includes(session.connection.propertyUrl)) return { status: 'unavailable', reason: 'property_not_verified' }
  const rows: unknown[] = []
  for (const page of matchingPages) {
    if (!(await discoveryProviderSessionCurrent(session, deps))) return { status: 'unavailable', reason: 'consent_required' }
    const raw = obj(await json(`${API}/${encodeURIComponent(session.connection.propertyUrl)}/searchAnalytics/query`, session, deps, deadline, { startDate: dates.startDate, endDate: dates.endDate, dimensions: ['page'], type: 'web', dataState: 'final', aggregationType: 'byPage', rowLimit: 100, startRow: 0, dimensionFilterGroups: [{ groupType: 'and', filters: [{ dimension: 'page', operator: 'equals', expression: page }] }] }))
    if (!raw || (raw.rows !== undefined && (!Array.isArray(raw.rows) || raw.rows.length > 100))) return { status: 'unavailable', reason: 'provider_error' }
    rows.push(...((raw.rows ?? []) as unknown[]))
  }
  if (!(await discoveryProviderSessionCurrent(session, deps))) return { status: 'unavailable', reason: 'consent_required' }
  const retrieved = deps.now?.() ?? new Date()
  const imported = normalizeGoogleSearchAnalytics({ spaceId, access: { spaceId, authorized: true, consent: session.access.consent }, importId: 'google_' + createHash('sha256').update(session.connection.connectionId).digest('hex').slice(0, 20), authorizedPageUrls: matchingPages, observedAt: range.to, retrievedAt: retrieved.toISOString(), period: range }, { dimensions: ['page'], response: { rows } }, retrieved)
  if (imported.error) return { status: 'unavailable', reason: 'invalid_context' }
  return { status: 'completed', imported, propertyUrl: session.connection.propertyUrl, limitations: [...imported.limitations, 'Google final-data request; Pacific calendar-day bounds. Only independently authorized exact pages were queried. Missing rows are unavailable, not zero or a ranking diagnosis.'] }
}
