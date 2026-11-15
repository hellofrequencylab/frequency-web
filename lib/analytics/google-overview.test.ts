import { describe, expect, it } from 'vitest'
import type { GoogleReport } from './google-data'
import { googleGrowthOverview, googlePropertyUrl } from './google-overview'
const complete = { completeRows: true, thresholded: false, sampled: false, otherRowLoss: false }
const totals = (): GoogleReport => ({ id: 'outcome_totals', label: 'Totals', dimensions: ['eventName'], metrics: ['eventCount', 'keyEvents', 'purchaseRevenue'], rowCount: 1, warnings: [], coverage: complete, currencyCode: 'USD', rows: [{ dimensions: { eventName: 'generate_lead' }, metrics: { eventCount: 8, keyEvents: 0, purchaseRevenue: 0 } }] })
describe('complete Google growth readings', () => {
  it('keeps observed events independent of configured key events and missing outcomes unknown', () => {
    const reading = googleGrowthOverview([totals()])
    expect(reading.outcomes.generate_lead).toEqual({ events: 8, keyEvents: 0 })
    expect(reading.outcomes.sign_up.events).toBeNull()
    expect(reading.revenue).toBeNull()
  })
  it.each(['thresholded', 'sampled', 'otherRowLoss'] as const)('does not headline %s data as complete totals', flag => {
    const report = totals(); report.coverage = { ...complete, [flag]: true }
    expect(googleGrowthOverview([report]).outcomes.generate_lead.events).toBeNull()
  })
  it('rejects truncated totals and distinguishes observed empty from a missing report', () => {
    const report = totals(); report.rowCount = 100
    expect(googleGrowthOverview([report]).outcomeState).toBe('limited')
    report.rows = []; report.rowCount = 0
    expect(googleGrowthOverview([report]).outcomeState).toBe('empty')
    expect(googleGrowthOverview([]).outcomeState).toBe('missing')
    expect(googleGrowthOverview([report]).outcomes.purchase.events).toBeNull()
  })
  it('does not turn zero or impossible engagement denominators into a percentage', () => {
    const report: GoogleReport = { ...totals(), id: 'audience_summary', rows: [{ dimensions: {}, metrics: { sessions: 0, engagedSessions: 0 } }] }
    expect(googleGrowthOverview([report]).engagement.rate).toBeNull()
    report.rows[0].metrics = { sessions: 2, engagedSessions: 3 }
    expect(googleGrowthOverview([report]).engagement.rate).toBeNull()
    report.rows[0].metrics = { sessions: 10, engagedSessions: 3 }
    expect(googleGrowthOverview([report]).engagement.rate).toBe(0.3)
  })
  it('sorts actual calendar observations without fabricating missing dates', () => {
    const report: GoogleReport = { ...totals(), id: 'daily_activity', rowCount: 2, rows: ['20261103', '20261101'].map(date => ({ dimensions: { date }, metrics: { sessions: 0, engagedSessions: 0, keyEvents: 0 } })) }
    expect(googleGrowthOverview([report]).daily.points.map(row => row.date)).toEqual(['2026-11-01', '2026-11-03'])
  })
  it('links only a numeric selected Google property', () => {
    expect(googlePropertyUrl('539919559')).toBe('https://analytics.google.com/analytics/web/#/p539919559')
    expect(googlePropertyUrl('javascript:alert(1)')).toBeNull()
  })
})
