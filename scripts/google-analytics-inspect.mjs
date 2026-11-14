// Inspect the selected property's existing web stream and key-event setup. GET only; never creates or changes Google resources.
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { googleReportingConfig } from '../lib/analytics/google-data.ts'
import { getGoogleReportingAccessToken, googleCredentialConfigured } from '../lib/analytics/google-auth.ts'

const EXPECTED = ['sign_up', 'generate_lead', 'purchase']
async function json(response) {
  if (!response.ok || !response.body) throw new Error(response.status === 401 || response.status === 403 ? 'permission_denied' : 'provider_error')
  const reader = response.body.getReader()
  const parts = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 128 * 1024) throw new Error('response_too_large')
      parts.push(part.value)
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'))
  } finally { await reader.cancel().catch(() => undefined) }
}

export async function inspectGoogleAnalytics(options = {}) {
  const env = options.env ?? process.env
  const config = googleReportingConfig(env)
  const base = { propertyConfigured: !!env.GA4_REPORTING_PROPERTY_ID?.trim(), credentialConfigured: googleCredentialConfigured(env), measurementConfigured: !!env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() }
  if (!config) return { ...base, state: base.propertyConfigured ? 'blocked' : 'not_configured', reason: 'select_numeric_property' }
  const token = await getGoogleReportingAccessToken({ env, request: options.request, readCredentialFile: options.readCredentialFile })
  if (!token) return { ...base, state: 'blocked', reason: 'credentials_unavailable_or_unsupported' }
  const request = options.request ?? fetch
  const getAll = async (resource, field) => {
    const rows = []
    let pageToken
    const tokens = new Set()
    for (let page = 0; page < 5; page++) {
      const url = new URL(`https://analyticsadmin.googleapis.com/v1beta/properties/${config.propertyId}/${resource}`)
      url.searchParams.set('pageSize', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const body = await json(await request(url.href, { method: 'GET', headers: { authorization: `Bearer ${token}` }, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000) }))
      if (!body || typeof body !== 'object' || (body[field] !== undefined && !Array.isArray(body[field]))) throw new Error('invalid_provider_response')
      rows.push(...(body[field] ?? []))
      if (!body.nextPageToken) return rows
      if (typeof body.nextPageToken !== 'string' || tokens.has(body.nextPageToken)) throw new Error('invalid_pagination')
      tokens.add(body.nextPageToken)
      pageToken = body.nextPageToken
    }
    throw new Error('inspection_truncated')
  }
  try {
    const streams = await getAll('dataStreams', 'dataStreams')
    const keyEvents = await getAll('keyEvents', 'keyEvents')
    const expectedMeasurement = env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
    const matchedStreams = expectedMeasurement ? streams.filter((s) => s?.type === 'WEB_DATA_STREAM' && s.webStreamData?.measurementId === expectedMeasurement) : []
    const matches = matchedStreams.length
    // Official contract: googleapis/googleapis, google/analytics/admin/v1alpha/analytics_admin.proto
    // GetEnhancedMeasurementSettings and resources.proto EnhancedMeasurementSettings.
    // Only GET the singleton beneath a validated stream returned by this selected property.
    /** @type {{state: 'not_checked' | 'verified' | 'unavailable', streamsChecked: number, historyCollectionEnabled: boolean | null, reason: string}} */
    const historyPageViews = { state: 'not_checked', streamsChecked: 0, historyCollectionEnabled: null, reason: 'matching_stream_required' }
    if (matchedStreams.length > 0 && matchedStreams.length <= 10) {
      try {
        let enabled = false
        for (const stream of matchedStreams) {
          if (typeof stream.name !== 'string' || !new RegExp(`^properties/${config.propertyId}/dataStreams/[0-9]{1,20}$`).test(stream.name)) throw new Error('invalid_stream_resource')
          const name = `${stream.name}/enhancedMeasurementSettings`
          const settings = await json(await request(`https://analyticsadmin.googleapis.com/v1alpha/${name}`, { method: 'GET', headers: { authorization: `Bearer ${token}` }, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(8000) }))
          if (!settings || settings.name !== name || (settings.streamEnabled !== undefined && typeof settings.streamEnabled !== 'boolean') || (settings.pageChangesEnabled !== undefined && typeof settings.pageChangesEnabled !== 'boolean')) throw new Error('invalid_enhanced_measurement_response')
          // Absent protobuf bool fields use their documented false default. Disabled enhanced
          // measurement makes pageChangesEnabled inert, even when its stored setting is true.
          enabled ||= settings.streamEnabled === true && settings.pageChangesEnabled === true
          historyPageViews.streamsChecked++
        }
        Object.assign(historyPageViews, { state: 'verified', historyCollectionEnabled: enabled, reason: 'enhanced_measurement_settings_read' })
      } catch {
        Object.assign(historyPageViews, { state: 'unavailable', historyCollectionEnabled: null, reason: 'inspect_history_setting_manually' })
      }
    }
    const configured = Object.fromEntries(EXPECTED.map((event) => [event, keyEvents.filter((e) => e?.eventName === event).length]))
    // Only known event names and safe status/count metadata are returned. Stream URLs, names and credentials stay private.
    return {
      ...base, state: 'verified', reason: 'existing_configuration_inspected',
      webStreams: streams.filter((s) => s?.type === 'WEB_DATA_STREAM').length,
      matchingMeasurementStreams: matches,
      keyEvents: Object.fromEntries(EXPECTED.map((event) => [event, configured[event] > 0])),
      historyPageViews,
      manualChecks: [historyPageViews.state === 'verified' ? 'Verify exactly one page_view per navigation with page_view_source=frequency_manual in DebugView.' : 'Inspect Enhanced Measurement manually, disable browser-history page views, then verify page_view_source=frequency_manual in DebugView. The history setting could not be verified through the API.'],
      duplicateRecommendedKeyEvents: EXPECTED.filter((event) => configured[event] > 1),
      needsAttention: [...(!expectedMeasurement ? ['measurement_id_missing'] : matches !== 1 ? ['measurement_stream_mismatch'] : []), ...EXPECTED.filter((event) => !configured[event]).map((event) => `key_event_missing:${event}`), ...(historyPageViews.state !== 'verified' ? ['history_page_view_setting_unverified'] : historyPageViews.historyCollectionEnabled ? ['disable_enhanced_history_page_views'] : [])],
    }
  } catch (error) {
    const known = ['permission_denied', 'provider_error', 'response_too_large', 'invalid_provider_response', 'invalid_pagination', 'inspection_truncated']
    return { ...base, state: 'blocked', reason: known.includes(error?.message) ? error.message : 'provider_error' }
  }
}

if (invokedDirectly(import.meta.url)) {
  const result = await inspectGoogleAnalytics()
  console.log(JSON.stringify(result, null, 2))
  if (result.state === 'blocked' || result.needsAttention?.length) process.exitCode = 1
}
