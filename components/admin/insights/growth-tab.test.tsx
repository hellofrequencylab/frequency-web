import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/analytics/growth-read', () => ({ getGrowthReading: mocks.read }))
vi.mock('./growth-tools', () => ({ GrowthTools: () => null }))
vi.mock('./live-refresh', () => ({ LiveRefresh: ({ at }: { at: string | null }) => <span data-live-reading={at ?? 'unavailable'} /> }))
import { GrowthContent } from './growth-tab'
import { growthDashboardFixture } from '@/test/fixtures/growth-dashboard'

describe('growth dashboard rendering', () => {
  it('shows unavailable data without drawing zero-valued charts', async () => {
    mocks.read.mockResolvedValue({ state: 'unavailable', message: 'Database offline' })
    const html = renderToStaticMarkup(await GrowthContent())
    expect(html).toContain('Database offline')
    expect(html).not.toContain('Showing-up Members')
    expect(html).toContain('data-live-reading="unavailable"')
  })
  it('uses design-system graphs with text equivalents and separates unmeasured return', async () => {
    mocks.read.mockResolvedValue({ state: 'available', data: growthDashboardFixture({
      computedAt: '2026-11-12T23:00:00Z', windowDays: 30, showingUp: 3, previousShowingUp: 1,
      guestsShowingUp: 0, rsvpEligible: 0, rsvpAttended: 0, timeToFirstMedianHours: null, timeToFirstP90Hours: null, firstAttendanceObserved: 0,
      newMembers: 0, savedDrafts: 2, repeatEligible: 0, repeatReturned: 0, lastEventAt: null,
      weeklyAttendance: [0, 0, 0, 0, 1, 0, 1, 3], campaigns: [], leadCampaigns: [], recentEvents: [],
      builderPendingVisits: 2,
      measurement: { eventsInWindow: 0, signupEventsObserved: 0, signupEventsExpected: 0, leadEventsObserved: 0, leadEventsExpected: 0, unattributedSignups: 0, unattributedLeads: 0, futureEventRows: 0 },
      builder: growthDashboardFixture().builder.map((s, i) => ({ ...s, visits: i === 0 ? 4 : i === 1 ? 2 : 0, matureVisits: i === 0 ? 2 : i === 1 ? 1 : 0 })),
    }) })
    const html = renderToStaticMarkup(await GrowthContent())
    expect(html).toContain('<svg')
    expect(html).not.toContain('NaN')
    expect(html).toContain('0, 0, 0, 0, 1, 0, 1, 3')
    expect(html).toContain('50% continued')
    expect(html).toContain('No first-attendance cohort has a complete follow-up yet')
    expect(html).toContain('No experiment meets the evidence threshold')
  })
  it('shows campaign comparisons with eligible and pending groups and no fictitious zero-baseline percentage', async () => {
    mocks.read.mockResolvedValue({ state: 'available', data: growthDashboardFixture({ previousShowingUp: 0 }) })
    const html = renderToStaticMarkup(await GrowthContent())
    expect(html).toContain('Signup campaigns reaching the room')
    expect(html).toContain('12 of 30 eligible signups')
    expect(html).toContain('10 still observing')
    expect(html).toContain('no prior attendance baseline')
    expect(html).not.toContain('Infinity')
    expect(html).toContain('Completed follow-up: 140 opened, 35 reported a save')
  })
})
