import assert from 'node:assert/strict'
import { GOOGLE_DATA_REPORTS, googleReportingConfig, googleReportRequest, parseGoogleReport } from '../../lib/analytics/google-data.ts'

assert.equal(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: 'G-PUBLIC-ID', GA4_REPORTING_HOSTNAME: 'frequencylocal.com' }), null)
assert.deepEqual(googleReportingConfig({ GA4_REPORTING_PROPERTY_ID: '539919559', GA4_REPORTING_HOSTNAME: 'frequencylocal.com' }), { propertyId: '539919559', hostname: 'frequencylocal.com' })
for (const spec of GOOGLE_DATA_REPORTS) {
  const request = googleReportRequest(spec, 'frequencylocal.com')
  const host = 'andGroup' in request.dimensionFilter ? request.dimensionFilter.andGroup.expressions[0] : request.dimensionFilter
  assert.deepEqual(host, { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'frequencylocal.com', caseSensitive: false } } })
  assert.equal(String(request.limit), '100')
  const data = { dimensionHeaders: spec.dimensions.map((name) => ({ name })), metricHeaders: spec.metrics.map((name) => ({ name })), rows: [], rowCount: 0 }
  assert.equal(parseGoogleReport(spec, data).rows.length, 0)
  assert.throws(() => parseGoogleReport(spec, { ...data, metricHeaders: [] }))
}
console.log('Google contract passed: explicit numeric property, fixed hostname-filtered reports and strict result headers.')
