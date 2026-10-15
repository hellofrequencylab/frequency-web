import { describe, expect, it, vi } from 'vitest'
import { getSpaceUpcomingEvents } from './content-data'
import { networkChapterLabel } from '@/lib/sites/network-events'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('Unexpected extra database query') } }))
vi.mock('@/lib/events/store', () => ({
  listEventsForSpace: vi.fn(async () => [{ id: 'event', slug: 'renamed-meeting', title: 'Oceanside meetup', starts_at: '2026-10-20T09:00:00Z', host_space_id: 'veterans-space', space_id: 'collective', is_cancelled: false, price_cents: 0 }]),
  listCalendarEngagement: vi.fn(async () => new Map()),
  listSpaceSeriesRows: vi.fn(async () => []),
}))
vi.mock('@/lib/events/tier-prices', () => ({ tierSummariesByEvent: async () => ({}), priceLabelFromSummary: () => 'Free' }))
vi.mock('@/lib/events/payout-readiness', () => ({ eventPayoutReadyMap: async () => ({}) }))

describe('website hosting Space metadata', () => {
  it('keeps the actual host through the public event projection without a new query', async () => {
    const [event] = await getSpaceUpcomingEvents('collective')
    expect(event.hostingSpaceId).toBe('veterans-space')
    expect(networkChapterLabel(event, [{ label: 'Veterans', spaceId: 'veterans-space', match: ['veterans'] }, { label: 'Oceanside', spaceId: 'oceanside-space', match: ['oceanside'] }])).toBe('Veterans')
  })
})
