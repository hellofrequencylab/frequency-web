import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: mocks.guard }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
import { getGrowthReading } from './growth-read'
import { BUILDER_STEP_EVENTS } from './growth'

beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ profileId: 'admin' }) })
describe('growth read boundary', () => {
  it('denies access before reading platform-wide data', async () => {
    mocks.guard.mockRejectedValue(new Error('denied'))
    await expect(getGrowthReading()).rejects.toThrow('denied')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('does not translate a failed or partial database response into zero traffic', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'missing migration' } })
    expect((await getGrowthReading()).state).toBe('unavailable')
    mocks.rpc.mockResolvedValue({ data: { showingUp: 0 }, error: null })
    expect((await getGrowthReading()).state).toBe('unavailable')
  })
  it('accepts a complete measured-zero response and rejects missing ordered steps as an incomplete contract', async () => {
    const data = {
      computedAt: '2026-11-12T23:00:00Z', windowDays: 30,
      showingUp: 0, previousShowingUp: 0, guestsShowingUp: 0, rsvpEligible: 0, rsvpAttended: 0,
      timeToFirstMedianHours: null, timeToFirstP90Hours: null, firstAttendanceObserved: 0,
      repeatEligible: 0, repeatReturned: 0, newMembers: 0, savedDrafts: 0, lastEventAt: null,
      builderPendingVisits: 0, weeklyAttendance: Array(8).fill(0), campaigns: [], leadCampaigns: [], recentEvents: [],
      measurement: { eventsInWindow: 0, signupEventsObserved: 0, signupEventsExpected: 0, leadEventsObserved: 0, leadEventsExpected: 0, unattributedSignups: 0, unattributedLeads: 0, futureEventRows: 0 },
      builder: BUILDER_STEP_EVENTS.map((event_type, i) => ({ i: i + 1, event_type, label: event_type, visits: 0, matureVisits: 0 })),
    }
    mocks.rpc.mockResolvedValue({ data, error: null })
    expect((await getGrowthReading()).state).toBe('available')
    mocks.rpc.mockResolvedValue({ data: { ...data, builder: [] }, error: null })
    const incomplete = await getGrowthReading()
    expect(incomplete.state).toBe('unavailable')
    if (incomplete.state === 'unavailable') expect(incomplete.message).toContain('incomplete')
  })
})
