import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { GoogleAnalyticsReading } from '@/lib/analytics/google-data'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/analytics/google-data-read', () => ({ getGoogleAnalyticsReading: mocks.read }))
import { GoogleGrowthPanel } from './google-growth-panel'

describe('Google growth reporting presentation', () => {
  it('shows an unavailable connection as unavailable instead of a zero-session chart', async () => {
    mocks.read.mockResolvedValue({ state: 'unavailable', reason: 'permission_denied', message: 'Viewer access is missing.' } satisfies GoogleAnalyticsReading)
    const html = renderToStaticMarkup(await GoogleGrowthPanel())
    expect(html).toContain('Viewer access is missing')
    expect(html).not.toContain('0 sessions')
    expect(html).toContain('Open Google Analytics')
  })
  it('retains provider freshness, scope and coverage caveats alongside the real report rows', async () => {
    mocks.read.mockResolvedValue({
      state: 'available', propertyId: '123456', hostname: 'frequencylocal.com', computedAt: '2026-11-12T23:00:00Z',
      period: { startDate: '30daysAgo', endDate: 'yesterday' },
      reports: [
        { id: 'acquisition', label: 'Acquisition quality', dimensions: ['sessionSource', 'sessionMedium', 'sessionCampaignName'], metrics: ['sessions', 'engagedSessions', 'keyEvents', 'sessionKeyEventRate'], rowCount: 1, warnings: ['Google processing may delay recent events.'], rows: [{ dimensions: { sessionSource: 'newsletter', sessionMedium: 'email', sessionCampaignName: 'Host welcome' }, metrics: { sessions: 100, engagedSessions: 70, keyEvents: 8, sessionKeyEventRate: 0.08 } }] },
        { id: 'conversions', label: 'Campaign conversions', dimensions: ['sessionCampaignName', 'eventName'], metrics: ['eventCount', 'keyEvents', 'purchaseRevenue'], rowCount: 1, warnings: [], rows: [{ dimensions: { sessionCampaignName: 'Host welcome', eventName: 'generate_lead' }, metrics: { eventCount: 8, keyEvents: 8, purchaseRevenue: 0 } }] },
      ],
    } satisfies GoogleAnalyticsReading)
    const html = renderToStaticMarkup(await GoogleGrowthPanel())
    expect(html).toContain('through yesterday')
    expect(html).toContain('Google fetched')
    expect(html).toContain('100 sessions')
    expect(html).toContain('8.0% session key-event rate')
    expect(html).toContain('Google processing may delay recent events')
    expect(html).toContain('events, not unique leads')
    expect(html).toContain('generate_lead')
    expect(html).toContain('<details>')
  })
  it('separates aggregate users, overlapping populations and repeated actions using readable labels', async () => {
    mocks.read.mockResolvedValue({
      state: 'available', propertyId: '123456', hostname: 'frequencylocal.com', computedAt: '2026-11-12T23:00:00Z',
      period: { startDate: '30daysAgo', endDate: 'yesterday' }, reports: [
        { id: 'audience_summary', label: 'Audience summary', dimensions: [], metrics: ['totalUsers'], rowCount: 1, warnings: [], rows: [{ dimensions: {}, metrics: { totalUsers: 919, activeUsers: 916, newUsers: 907, sessions: 1066, engagedSessions: 159, eventCount: 3577 } }] },
        { id: 'user_populations', label: 'Populations', dimensions: ['newVsReturning'], metrics: ['activeUsers'], rowCount: 1, warnings: [], rows: [{ dimensions: { newVsReturning: 'returning' }, metrics: { activeUsers: 40, sessions: 117, engagedSessions: 63 } }] },
        { id: 'actions', label: 'Actions', dimensions: ['eventName'], metrics: ['eventCount', 'totalUsers'], rowCount: 1, warnings: [], rows: [{ dimensions: { eventName: 'form_start' }, metrics: { eventCount: 32, totalUsers: 23 } }] },
      ],
    } satisfies GoogleAnalyticsReading)
    const html = renderToStaticMarkup(await GoogleGrowthPanel())
    expect(html).toContain('919')
    expect(html).toContain('Returning users')
    expect(html).toContain('40 active users')
    expect(html).toContain('Form started')
    expect(html).toContain('23 users recorded for this event type')
    expect(html).toContain('not conversions or an ordered flow')
    expect(html).toContain('do not add the rows')
    expect(html).not.toContain('form_start')
  })

})
