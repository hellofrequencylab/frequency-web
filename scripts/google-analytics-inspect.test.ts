import { expect, it, vi } from 'vitest'
import { inspectGoogleAnalytics } from './google-analytics-inspect.mjs'

it('keeps missing or invalid property selection inert without reading a generic ADC identity', async () => {
  const request = vi.fn()
  const readCredentialFile = vi.fn()
  const absent = await inspectGoogleAnalytics({ env: { GOOGLE_APPLICATION_CREDENTIALS: '/platform/identity' }, request, readCredentialFile })
  expect(absent.state).toBe('not_configured')
  const invalid = await inspectGoogleAnalytics({ env: { GA4_REPORTING_PROPERTY_ID: 'G-MEASUREMENT', GOOGLE_APPLICATION_CREDENTIALS: '/platform/identity' }, request, readCredentialFile })
  expect(invalid.state).toBe('blocked')
  expect(request).not.toHaveBeenCalled()
  expect(readCredentialFile).not.toHaveBeenCalled()
})

it('inspects existing setup with GET only and returns no stream or credential data', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ dataStreams: [{ type: 'WEB_DATA_STREAM', displayName: 'private stream name', webStreamData: { measurementId: 'G-TEST', defaultUri: 'https://private.example' } }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ keyEvents: [{ eventName: 'purchase' }, { eventName: 'sign_up' }] })))
  const result = await inspectGoogleAnalytics({ env: { GA4_REPORTING_PROPERTY_ID: '123', GA4_REPORTING_ACCESS_TOKEN: 'secret-token', NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TEST' }, request })
  expect(result.state).toBe('verified')
  if (!('matchingMeasurementStreams' in result) || !('needsAttention' in result)) throw new Error('Expected successful setup inspection')
  expect(result.matchingMeasurementStreams).toBe(1)
  expect(result.needsAttention).toContain('key_event_missing:generate_lead')
  for (const call of request.mock.calls) expect(call[1].method).toBe('GET')
  expect(JSON.stringify(result)).not.toContain('secret-token')
  expect(JSON.stringify(result)).not.toContain('private stream name')
  expect(JSON.stringify(result)).not.toContain('private.example')
})
it('does not claim a matching setup after permission denial or incomplete pagination', async () => {
  // A token accepted by reporting would still need an independent successful Admin API read.
  const request = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
  const result = await inspectGoogleAnalytics({ env: { GA4_REPORTING_PROPERTY_ID: '123', GA4_REPORTING_ACCESS_TOKEN: 'token' }, request })
  expect(result.state).toBe('blocked')
  expect(result.reason).toBe('permission_denied')
  expect(request.mock.calls[0][0]).toContain('https://analyticsadmin.googleapis.com/')
  expect(result).not.toHaveProperty('keyEvents')
})


it('reads the officially defined enhanced-measurement singleton and detects effective history page views', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ dataStreams: [{ name: 'properties/123/dataStreams/456', type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-TEST' } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ keyEvents: ['sign_up', 'generate_lead', 'purchase'].map((eventName) => ({ eventName })) })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'properties/123/dataStreams/456/enhancedMeasurementSettings', streamEnabled: true, pageChangesEnabled: true })))
  const result = await inspectGoogleAnalytics({ env: { GA4_REPORTING_PROPERTY_ID: '123', GA4_REPORTING_ACCESS_TOKEN: 'token', NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TEST' }, request })
  if (!('historyPageViews' in result) || !('needsAttention' in result)) throw new Error('Expected setup inspection')
  expect(result.historyPageViews.state).toBe('verified')
  expect(result.historyPageViews.historyCollectionEnabled).toBe(true)
  expect(result.needsAttention).toContain('disable_enhanced_history_page_views')
  expect(request.mock.calls[2][0]).toBe('https://analyticsadmin.googleapis.com/v1alpha/properties/123/dataStreams/456/enhancedMeasurementSettings')
  expect(request.mock.calls[2][1].method).toBe('GET')
})

it('retains an explicit manual prerequisite when the enhanced-measurement API is denied', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ dataStreams: [{ name: 'properties/123/dataStreams/456', type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-TEST' } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ keyEvents: [] })))
    .mockResolvedValueOnce(new Response('{}', { status: 403 }))
  const result = await inspectGoogleAnalytics({ env: { GA4_REPORTING_PROPERTY_ID: '123', GA4_REPORTING_ACCESS_TOKEN: 'token', NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TEST' }, request })
  if (!('historyPageViews' in result) || !('needsAttention' in result)) throw new Error('Expected partial setup inspection')
  expect(result.historyPageViews.state).toBe('unavailable')
  expect(result.historyPageViews.historyCollectionEnabled).toBeNull()
  expect(result.needsAttention).toContain('history_page_view_setting_unverified')
})
