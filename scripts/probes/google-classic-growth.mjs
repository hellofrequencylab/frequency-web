import assert from 'node:assert/strict'
import { GOOGLE_DATA_REPORTS, googleReportRequest, parseGoogleReport } from '../../lib/analytics/google-data.ts'
const totals = GOOGLE_DATA_REPORTS.find(report => report.id === 'outcome_totals')
assert.ok(totals, 'Classic growth outcomes need their own complete event-grain report, not a sum of top campaign rows')
const daily = GOOGLE_DATA_REPORTS.find(report => report.id === 'daily_activity')
assert.ok(daily, 'Daily acquisition and engagement must have dated observations')
const { googleGrowthOverview, googlePropertyUrl } = await import('../../lib/analytics/google-overview.ts')
assert.deepEqual([...totals.dimensions], ['eventName'])
assert.deepEqual(googleReportRequest(totals, 'frequencylocal.com').dimensionFilter.andGroup.expressions[1].filter.inListFilter.values, ['sign_up', 'generate_lead', 'purchase'])
assert.deepEqual(googleReportRequest(daily, 'frequencylocal.com').orderBys, [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' }, desc: false }])
const report = (spec, values, metadata = {}) => parseGoogleReport(spec, {
  dimensionHeaders: spec.dimensions.map(name => ({ name })), metricHeaders: spec.metrics.map(name => ({ name })),
  rows: values.map(([dimension, metrics]) => ({ dimensionValues: [{ value: dimension }], metricValues: spec.metrics.map(name => ({ value: String(metrics[name] ?? 0) })) })), rowCount: values.length, metadata,
})
const measured = report(totals, [['generate_lead', { eventCount: 8, keyEvents: 0 }], ['purchase', { eventCount: 2, keyEvents: 2, purchaseRevenue: 49 }]], { currencyCode: 'USD' })
const dates = report(daily, [['20261101', { sessions: 5, engagedSessions: 2 }], ['20261103', { sessions: 0, engagedSessions: 0 }]])
const overview = googleGrowthOverview([measured, dates])
assert.equal(overview.outcomes.generate_lead.events, 8)
assert.equal(overview.outcomes.generate_lead.keyEvents, 0, 'Observed events and configured key events are separate')
assert.equal(overview.outcomes.sign_up.events, null, 'Missing outcome row cannot become zero')
assert.equal(overview.daily.points.length, 2, 'Missing dates cannot be fabricated as zero')
assert.equal(overview.daily.points[1].sessions, 0, 'An explicitly returned zero remains a real zero')
assert.equal(googleGrowthOverview([]).outcomes.purchase.events, null)
assert.equal(googleGrowthOverview([report(totals, [['purchase', { eventCount: 2 }]], { subjectToThresholding: true })]).outcomes.purchase.events, null)
assert.equal(googleGrowthOverview([report(totals, [['purchase', { eventCount: 2 }]], { samplingMetadatas: [{}] })]).outcomes.purchase.events, null)
assert.equal(googlePropertyUrl('539919559'), 'https://analytics.google.com/analytics/web/#/p539919559')
assert.equal(googlePropertyUrl('../other-property'), null)
console.log('Google classic growth: independent outcome totals, chronological daily observations, explicit zeros versus unknown, reporting quality and selected-property link PASS')
