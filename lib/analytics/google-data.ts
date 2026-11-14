// Fixed, read-only GA4 queries shared by the server dashboard and the readiness CLI.
// No arbitrary endpoint, property or report query is accepted from a browser.
import { pixelSafePath } from './sanitize.ts'
export interface GoogleReport {
  id: 'acquisition' | 'landing_pages' | 'conversions' | 'audience_summary' | 'user_populations' | 'page_activity' | 'actions'
  label: string
  dimensions: string[]
  metrics: string[]
  rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, number> }>
  warnings: string[]
  rowCount: number
}
interface GoogleAnalyticsData {
  state: 'available'
  propertyId: string
  hostname: string
  computedAt: string
  period: { startDate: '30daysAgo'; endDate: 'yesterday' }
  reports: GoogleReport[]
}
export type GoogleAnalyticsReading = GoogleAnalyticsData | {
  state: 'unavailable'
  reason: 'not_configured' | 'credentials_unavailable' | 'permission_denied' | 'provider_error'
  message: string
}

const PERIOD = { startDate: '30daysAgo', endDate: 'yesterday' } as const
export const GOOGLE_DATA_REPORTS = [
  { id: 'acquisition', label: 'Acquisition quality', dimensions: ['sessionSource', 'sessionMedium', 'sessionCampaignName'], metrics: ['sessions', 'engagedSessions', 'keyEvents', 'sessionKeyEventRate'] },
  { id: 'landing_pages', label: 'Landing pages', dimensions: ['landingPage', 'deviceCategory'], metrics: ['sessions', 'engagedSessions', 'keyEvents'] },
  { id: 'conversions', label: 'Campaign conversions', dimensions: ['sessionCampaignName', 'eventName'], metrics: ['eventCount', 'keyEvents', 'purchaseRevenue'] },
  { id: 'audience_summary', label: 'Reported audience', dimensions: [], metrics: ['totalUsers', 'activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'eventCount'] },
  { id: 'user_populations', label: 'New and returning users', dimensions: ['newVsReturning'], metrics: ['activeUsers', 'totalUsers', 'sessions', 'engagedSessions'] },
  { id: 'page_activity', label: 'Page activity', dimensions: ['pagePath', 'deviceCategory'], metrics: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'sessions'] },
  { id: 'actions', label: 'Recorded actions and events', dimensions: ['eventName'], metrics: ['eventCount', 'totalUsers'] },
] as const
type ReportSpec = typeof GOOGLE_DATA_REPORTS[number]
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export function googleReportingConfig(env: Record<string, string | undefined> = process.env): { propertyId: string; hostname: string } | null {
  const propertyId = env.GA4_REPORTING_PROPERTY_ID?.trim()
  const hostname = (env.GA4_REPORTING_HOSTNAME?.trim() || 'frequencylocal.com').toLowerCase()
  if (!propertyId || !/^\d{1,20}$/.test(propertyId)) return null
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) return null
  return { propertyId, hostname }
}

export function googleReportRequest(spec: ReportSpec, hostname: string) {
  const host = { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: hostname, caseSensitive: false } } }
  const dimensionFilter = spec.id === 'conversions'
    ? { andGroup: { expressions: [host, { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up', 'generate_lead', 'purchase'] } } }] } }
    : host
  return {
    dateRanges: [PERIOD], dimensions: spec.dimensions.map((name) => ({ name })),
    metrics: spec.metrics.map((name) => ({ name })), dimensionFilter,
    orderBys: [{ metric: { metricName: spec.metrics[0] }, desc: true }],
    limit: '100', keepEmptyRows: false, returnPropertyQuota: true,
  }
}

/** Schema mismatches, omitted values and nonfinite metrics are failures, never synthetic zeros. */
export function parseGoogleReport(spec: ReportSpec, raw: unknown): GoogleReport {
  const body = object(raw)
  if (!body) throw new Error('invalid_google_response')
  const headers = (key: string) => Array.isArray(body[key]) ? body[key].map((v) => object(v)?.name) : []
  if (JSON.stringify(headers('dimensionHeaders')) !== JSON.stringify(spec.dimensions) || JSON.stringify(headers('metricHeaders')) !== JSON.stringify(spec.metrics)) throw new Error('invalid_google_headers')
  const rawRows = body.rows === undefined ? [] : body.rows
  if (!Array.isArray(rawRows) || rawRows.length > 100) throw new Error('invalid_google_rows')
  const rowCount = body.rowCount === undefined && rawRows.length === 0 ? 0 : Number(body.rowCount)
  if (!Number.isSafeInteger(rowCount) || rowCount < rawRows.length) throw new Error('invalid_google_count')
  const rows = rawRows.map((value) => {
    const row = object(value)
    const dimensions = row?.dimensionValues ?? (spec.dimensions.length === 0 ? [] : undefined)
    const metrics = row?.metricValues
    if (!Array.isArray(dimensions) || dimensions.length !== spec.dimensions.length || !Array.isArray(metrics) || metrics.length !== spec.metrics.length) throw new Error('invalid_google_row')
    return {
      dimensions: Object.fromEntries(spec.dimensions.map((key, i) => {
        const text = object(dimensions[i])?.value
        if (typeof text !== 'string') throw new Error('invalid_google_dimension')
        // Private report labels are bounded, never HTML and never passed to the AI brief.
        return [key, (key === 'landingPage' || key === 'pagePath' ? pixelSafePath(text) : text).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256)]
      })),
      metrics: Object.fromEntries(spec.metrics.map((key, i) => {
        const value = object(metrics[i])?.value
        if (typeof value !== 'string' || value.trim() === '') throw new Error('invalid_google_metric')
        const n = Number(value)
        if (!Number.isFinite(n) || n < 0 || (key.endsWith('Rate') && n > 1)) throw new Error('invalid_google_metric')
        return [key, n]
      })),
    }
  })
  const metadata = object(body.metadata)
  const warnings = ['GA processing latency and consent exclusions apply. Staff/bot filtering depends on the property configuration.']
  warnings.push('Reporting dates follow the GA property time zone; they may differ from first-party UTC windows.')
  if (spec.id === 'audience_summary') warnings.push('Google users are measured browser/account identities, not verified unique people. Use this total instead of summing users from overlapping report rows.')
  if (spec.id === 'user_populations') warnings.push('A user can appear as new and returning during the same period. Population rows overlap and must not be added into a unique-user total.')
  if (spec.id === 'page_activity') warnings.push('Page users and sessions overlap across pages and devices. These page totals are not an ordered path, a conversion funnel or evidence of abandonment. Engagement duration is recorded seconds.')
  if (spec.id === 'actions') warnings.push('These are recorded events and distinct users per event type, not conversions. Users overlap across event rows; automatic collection and missing instrumentation limit which actions are visible.')
  if (spec.metrics.some((metric) => metric === 'purchaseRevenue')) {
    const currency = metadata?.currencyCode
    warnings.push(typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? `Revenue uses the property reporting currency: ${currency}.` : 'Revenue uses the GA property reporting currency, which was not returned with this reading.')
  }
  if (rowCount > rows.length) warnings.push(`Top ${rows.length} rows of ${rowCount}; totals across these rows are incomplete.`)
  if (metadata?.subjectToThresholding === true) warnings.push('Google privacy thresholding can hide eligible rows.')
  if (metadata?.dataLossFromOtherRow === true) warnings.push('High-cardinality dimensions caused data loss into the other row.')
  if (Array.isArray(metadata?.samplingMetadatas) && metadata.samplingMetadatas.length) warnings.push('Google sampled this report; do not treat it as an exact operational count.')
  return { id: spec.id, label: spec.label, dimensions: [...spec.dimensions], metrics: [...spec.metrics], rows, rowCount, warnings }
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('empty_google_response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > 512 * 1024) throw new Error('google_response_too_large')
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { await reader.cancel().catch(() => undefined) }
}

/** Hard endpoints, deadlines and row limits keep a dashboard refresh bounded. Never retries quota errors automatically. */
export async function readGoogleReports(config: { propertyId: string; hostname: string }, accessToken: string, request: typeof fetch = fetch): Promise<GoogleAnalyticsReading> {
  if (!googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: config.propertyId, GA4_REPORTING_HOSTNAME: config.hostname })) return { state: 'unavailable', reason: 'not_configured', message: 'Choose a numeric GA4 property and production hostname in environment settings.' }
  try {
    const reports: GoogleReport[] = []
    // Sequential to limit each refresh to one in-flight Google request and stop on denial.
    for (const spec of GOOGLE_DATA_REPORTS) {
      const response = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`, {
        method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(googleReportRequest(spec, config.hostname)),
        redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
      })
      if (response.status === 401 || response.status === 403) return { state: 'unavailable', reason: 'permission_denied', message: 'Google reporting access was refused. Verify the credential has Viewer access to the selected property and the Analytics Data API is enabled.' }
      if (!response.ok) return { state: 'unavailable', reason: 'provider_error', message: response.status === 429 ? 'Google reporting quota is exhausted. Try later; no missing data has been treated as zero.' : 'Google could not provide all reports. No complete acquisition reading is available.' }
      reports.push(parseGoogleReport(spec, await boundedJson(response)))
    }
    return { state: 'available', ...config, computedAt: new Date().toISOString(), period: PERIOD, reports }
  } catch {
    return { state: 'unavailable', reason: 'provider_error', message: 'Google reporting could not return a complete valid reading. Check connection access and try later.' }
  }
}
