import { expect, it, vi } from 'vitest'
import { verifyGoogleReporting } from './google-analytics-readiness.mjs'
import { GOOGLE_DATA_REPORTS } from '../lib/analytics/google-data'

it('reports an unselected property without opening a platform credential or calling Google', async () => {
  const readCredentialFile = vi.fn()
  const request = vi.fn()
  expect(await verifyGoogleReporting({ env: { GOOGLE_APPLICATION_CREDENTIALS: '/private/adc' }, request, readCredentialFile })).toEqual({ state: 'not_configured', reason: 'property_not_selected', propertyConfigured: false, credentialConfigured: true })
  expect(readCredentialFile).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
})

it('returns safe verification metadata without tokens, campaign labels, metric values or property IDs', async () => {
  let i = 0
  const request = vi.fn(async () => {
    const spec = GOOGLE_DATA_REPORTS[i++]
    return new Response(JSON.stringify({
      dimensionHeaders: spec.dimensions.map((name) => ({ name })), metricHeaders: spec.metrics.map((name) => ({ name })),
      rowCount: 1, rows: [{ dimensionValues: spec.dimensions.map(() => ({ value: 'private-campaign-label' })), metricValues: spec.metrics.map(() => ({ value: '0' })) }],
    }))
  })
  const result = await verifyGoogleReporting({ env: { GA4_REPORTING_PROPERTY_ID: '123456789', GA4_REPORTING_ACCESS_TOKEN: 'secret-access-token' }, request })
  expect(result.state).toBe('verified')
  const output = JSON.stringify(result)
  expect(output).not.toContain('secret-access-token')
  expect(output).not.toContain('private-campaign-label')
  expect(output).not.toContain('123456789')
  expect(output).toContain('acquisition')
})

it('treats explicit invalid configuration as a blocker rather than an optional skipped integration', async () => {
  const result = await verifyGoogleReporting({ env: { GA4_REPORTING_PROPERTY_ID: 'G-MEASUREMENT' } })
  expect(result.state).toBe('blocked')
  expect(result.reason).toBe('invalid_property_or_hostname')
})
