// Headline Google readings use their own complete grains, never sums of campaign/page subsets.
import { googleReportingDate, type GoogleReport } from './google-data'

export const GOOGLE_OUTCOMES = ['sign_up', 'generate_lead', 'purchase'] as const
type Outcome = typeof GOOGLE_OUTCOMES[number]
type ReadingState = 'available' | 'empty' | 'missing' | 'limited'
const metric = (value: number | undefined): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

function coverage(report: GoogleReport | undefined): ReadingState {
  if (!report) return 'missing'
  const quality = report.coverage
  if (!quality || !quality.completeRows || quality.thresholded || quality.sampled || quality.otherRowLoss || report.rowCount !== report.rows.length) return 'limited'
  return report.rows.length ? 'available' : 'empty'
}

export function googlePropertyUrl(propertyId: string): string | null {
  return /^[0-9]{1,20}$/.test(propertyId) ? `https://analytics.google.com/analytics/web/#/p${propertyId}` : null
}

export function googleGrowthOverview(reports: GoogleReport[]) {
  const audience = reports.find(report => report.id === 'audience_summary')
  const audienceState = coverage(audience)
  const summary = audienceState === 'available' && audience?.rows.length === 1 ? audience.rows[0].metrics : undefined
  const sessions = metric(summary?.sessions), engagedSessions = metric(summary?.engagedSessions)
  const validEngagement = sessions !== null && engagedSessions !== null && engagedSessions <= sessions
  const engagement = { state: audienceState, sessions, engagedSessions, rate: validEngagement && sessions > 0 ? engagedSessions / sessions : null }

  const report = reports.find(item => item.id === 'outcome_totals')
  const outcomeState = coverage(report)
  const outcomes = Object.fromEntries(GOOGLE_OUTCOMES.map(event => [event, { events: null as number | null, keyEvents: null as number | null }])) as Record<Outcome, { events: number | null; keyEvents: number | null }>
  let revenue: number | null = null
  if (outcomeState === 'available' && report) {
    for (const event of GOOGLE_OUTCOMES) {
      const rows = report.rows.filter(row => row.dimensions.eventName === event)
      // A missing, duplicated or hidden row is unknown, not an invented zero or summed total.
      if (rows.length !== 1) continue
      outcomes[event] = { events: metric(rows[0].metrics.eventCount), keyEvents: metric(rows[0].metrics.keyEvents) }
      if (event === 'purchase') revenue = metric(rows[0].metrics.purchaseRevenue)
    }
  }
  const dailyReport = reports.find(item => item.id === 'daily_activity')
  const dailyState = coverage(dailyReport)
  const points: Array<{ date: string; sessions: number; engagedSessions: number; keyEvents: number }> = []
  if (dailyState === 'available') for (const row of dailyReport?.rows ?? []) {
    const date = googleReportingDate(row.dimensions.date)
    const count = metric(row.metrics.sessions), engaged = metric(row.metrics.engagedSessions), keyEvents = metric(row.metrics.keyEvents)
    if (date && count !== null && engaged !== null && keyEvents !== null) points.push({ date, sessions: count, engagedSessions: engaged, keyEvents })
  }
  points.sort((a, b) => a.date.localeCompare(b.date))
  return { engagement, outcomeState, outcomes, revenue, currencyCode: report?.currencyCode ?? null, daily: { state: dailyState, points } }
}
