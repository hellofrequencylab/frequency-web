/** Pure import adapters. No fetch, OAuth, browsing capture, database, or implied live connector.
 * The server caller must derive access and the exact page allow-list from authenticated ownership.
 * Search rows are aggregate provider evidence, never a source of individual browsing histories.
 * Google shape: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 * Bing citation input below is an owner-mapped snapshot, not a documented native API payload.
 */
import { validateDiscoveryObservation } from './discovery-evidence'
import type { ProfileCoachingEvidence } from './coaching-evidence'

type Access = Parameters<typeof validateDiscoveryObservation>[1]
type Validated = ReturnType<typeof validateDiscoveryObservation>
export interface DiscoveryImportContext {
  access: Access
  /** Independently resolved tenant identity for this import, not a provider-row grant. */
  spaceId: string
  importId: string
  /** Exact canonical public pages the caller may analyze. A shared host is not tenant authority. */
  authorizedPageUrls: readonly string[]
  observedAt: string
  retrievedAt: string
  period: { from: string; to: string }
}
export interface DiscoveryImportResult {
  observations: Validated[]
  rejectedRows: number
  limitations: string[]
  error?: 'unauthorized' | 'invalid_context' | 'unsupported_shape' | 'too_many_rows'
}
const MAX_ROWS = 25_000
const MAX_PAGES = 200
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
function pageUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash ? u.href : null } catch { return null }
}
function prepare(ctx: DiscoveryImportContext): DiscoveryImportResult['error'] | Set<string> {
  if (!ctx.access.authorized || !ctx.spaceId || ctx.spaceId !== ctx.access.spaceId) return 'unauthorized'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ctx.importId) || ctx.authorizedPageUrls.length > MAX_PAGES || !ctx.authorizedPageUrls.length) return 'invalid_context'
  const pages = ctx.authorizedPageUrls.map(pageUrl)
  if (pages.some((p) => !p)) return 'invalid_context'
  return new Set(pages as string[])
}
function result(limits: string[] = []): DiscoveryImportResult { return { observations: [], rejectedRows: 0, limitations: limits } }
function emit(out: DiscoveryImportResult, ctx: DiscoveryImportContext, now: Date, page: string, provider: string, metric: string, value: number, unit: string, coverage: string, category: string, denominator: number | null = null, sampleSize: number | null = null, countingUnit = 'unknown') {
  out.observations.push(validateDiscoveryObservation({
    id: `${ctx.importId}_${out.observations.length}`, category, provider, metric, value, unit,
    collectionMethod: provider === 'google_search_console' ? 'api_response' : provider === 'bing_webmaster' ? 'owner_mapped_snapshot' : 'first_party_reader',
    denominator, sampleSize, countingUnit, coverage, kind: 'measured', sourceUrl: page,
    observedAt: ctx.observedAt, publishedAt: null, retrievedAt: ctx.retrievedAt,
    period: ctx.period, region: { countryCode: null, regionCode: null },
    scope: { spaceId: ctx.spaceId, consentId: ctx.access.consent?.id ?? '' },
    comparison: { status: 'unavailable', baseline: null },
  }, ctx.access, now))
}

/** Google API JSON only, not guessed CSV column translations. Dimensions must accompany the rows.
 * Require page grouping to isolate shared-host tenants. Query text and other dimensions are not retained.
 * API date bounds are inclusive Pacific dates; caller supplies explicit evidence period, not UTC guesses.
 */
export function normalizeGoogleSearchAnalytics(ctx: DiscoveryImportContext, input: unknown, now: Date): DiscoveryImportResult {
  const out = result(['Imported Search Console rows are top available rows, not guaranteed complete site traffic. Query text is discarded. Search visibility does not establish bookings or attendance. Recent provider data may still be preliminary; finality is not asserted.', 'The caller must preserve the requested Pacific-time date interval in the evidence period.'])
  const pages = prepare(ctx)
  if (!(pages instanceof Set)) return { ...out, error: pages }
  const raw = record(input)
  const dimensions = raw?.dimensions
  const response = record(raw?.response)
  const rows = response?.rows ?? []
  if (!response || !Array.isArray(dimensions) || dimensions.length > 7 || !dimensions.every((d) => typeof d === 'string' && ['page', 'query', 'country', 'device', 'searchAppearance', 'date', 'hour'].includes(d)) || new Set(dimensions).size !== dimensions.length || !dimensions.includes('page') || !Array.isArray(rows)) return { ...out, error: 'unsupported_shape' }
  if (rows.length > MAX_ROWS) return { ...out, error: 'too_many_rows' }
  const pageIndex = dimensions.indexOf('page')
  const seen = new Set<string>()
  const sums = new Map<string, { clicks: number; impressions: number; weightedPosition: number; hasPosition: boolean }>()
  for (const value of rows) {
    const row = record(value)
    const keys = row?.keys
    if (!row || !Array.isArray(keys) || keys.length !== dimensions.length || !keys.every((k) => typeof k === 'string' && k.length <= 2048) || !count(row.clicks) || !count(row.impressions) || row.clicks > row.impressions) { out.rejectedRows++; continue }
    const page = pageUrl(keys[pageIndex])
    const signature = JSON.stringify(keys)
    if (!page || !pages.has(page) || seen.has(signature) || (row.ctr !== undefined && (typeof row.ctr !== 'number' || !Number.isFinite(row.ctr) || row.ctr < 0 || row.ctr > 1))) { out.rejectedRows++; continue }
    seen.add(signature)
    const sum = sums.get(page) ?? { clicks: 0, impressions: 0, weightedPosition: 0, hasPosition: true }
    if (!count(sum.clicks + row.clicks) || !count(sum.impressions + row.impressions)) { out.rejectedRows++; continue }
    sum.clicks += row.clicks; sum.impressions += row.impressions
    if (typeof row.position === 'number' && Number.isFinite(row.position) && row.position > 0 && row.position <= 100_000) sum.weightedPosition += row.position * row.impressions
    else if (row.impressions > 0) sum.hasPosition = false
    sums.set(page, sum)
  }
  for (const [page, sum] of sums) {
    emit(out, ctx, now, page, 'google_search_console', 'search_clicks', sum.clicks, 'count', 'unknown', 'demand')
    emit(out, ctx, now, page, 'google_search_console', 'search_impressions', sum.impressions, 'count', 'unknown', 'demand')
    if (sum.impressions > 0) {
      emit(out, ctx, now, page, 'google_search_console', 'search_ctr', sum.clicks / sum.impressions, 'rate', 'unknown', 'demand', sum.impressions, sum.impressions)
      if (sum.hasPosition) emit(out, ctx, now, page, 'google_search_console', 'average_search_position', sum.weightedPosition / sum.impressions, 'position', 'unknown', 'demand', null, sum.impressions)
    }
  }
  if (!rows.length) out.limitations.push('No rows were returned. Missing rows do not establish zero impressions or a ranking failure.')
  return out
}

/** Owner-mapped Bing dashboard observations, NOT a documented native Bing API/CSV schema.
 * A citation is Microsoft-surface visibility, never a click, referral, conversion, or all-AI share.
 */
export function normalizeBingCitationSnapshot(ctx: DiscoveryImportContext, input: unknown, now: Date): DiscoveryImportResult {
  const out = result(['Owner-supplied, manually mapped Bing AI Performance snapshot; no live API connector or native export parser is implemented.', 'Bing citation coverage is partial Microsoft/partner visibility. Citations are not clicks, people, conversions, or coverage of every AI provider. Grounding queries are not retained.'])
  const pages = prepare(ctx)
  if (!(pages instanceof Set)) return { ...out, error: pages }
  const raw = record(input)
  if (raw?.format !== 'owner_mapped_bing_citations_v1' || !Array.isArray(raw.rows)) return { ...out, error: 'unsupported_shape' }
  if (raw.rows.length > MAX_PAGES) return { ...out, error: 'too_many_rows' }
  const seen = new Set<string>()
  for (const value of raw.rows) {
    const row = record(value); const page = pageUrl(row?.pageUrl)
    if (!row || !page || !pages.has(page) || seen.has(page) || !count(row.citations)) { out.rejectedRows++; continue }
    seen.add(page)
    emit(out, ctx, now, page, 'bing_webmaster', 'ai_citations', row.citations, 'count', 'sampled', 'provider_citation')
  }
  return out
}

/** Adapt the existing Space profile aggregate reader. No member IDs or event histories accepted. */
export function normalizeSpaceProfileObservations(ctx: DiscoveryImportContext, input: { spaceId: string; pageUrl: string; evidence: ProfileCoachingEvidence }, now: Date): DiscoveryImportResult {
  const out = result(['Profile views are deduplicated daily buckets, including a coarse anonymous bucket, not unique visitors or raw pageviews.', 'CTA clicks and check-ins are separate aggregates. They cannot establish conversion or marketing attribution.'])
  const pages = prepare(ctx)
  if (!(pages instanceof Set)) return { ...out, error: pages }
  if (input.spaceId !== ctx.spaceId) return { ...out, error: 'unauthorized' }
  const page = pageUrl(input.pageUrl)
  if (!page || !pages.has(page)) return { ...out, error: 'unauthorized' }
  const evidence = input.evidence
  if (!evidence || evidence.observedFrom !== ctx.period.from || evidence.observedThrough !== ctx.period.to) return { ...out, error: 'invalid_context' }
  for (const [metric, value] of [['profile_view_buckets', evidence.profileViews], ['profile_cta_clicks', evidence.ctaClicks]] as const) {
    if (count(value)) emit(out, ctx, now, page, 'first_party_aggregate', metric, value, 'count', 'unknown', 'engagement', null, null, metric === 'profile_view_buckets' ? 'page_buckets' : 'events')
    else out.limitations.push(`${metric} is unavailable, not zero.`)
  }
  const attendance = evidence.attendance
  if (attendance && count(attendance.checkins) && count(attendance.people) && attendance.people <= attendance.checkins) {
    emit(out, ctx, now, page, 'first_party_aggregate', 'verified_checkin_records', attendance.checkins, 'count', 'unknown', 'conversion', null, attendance.people, 'events')
    emit(out, ctx, now, page, 'first_party_aggregate', 'distinct_checked_in_people', attendance.people, 'count', 'unknown', 'conversion', null, attendance.people, 'people')
    if (count(attendance.returnPeople) && attendance.returnPeople <= attendance.people) emit(out, ctx, now, page, 'first_party_aggregate', 'repeat_attendees', attendance.returnPeople, 'count', 'unknown', 'conversion', null, attendance.people, 'people')
  } else out.limitations.push('Verified attendance is unavailable, not zero.')
  return out
}
