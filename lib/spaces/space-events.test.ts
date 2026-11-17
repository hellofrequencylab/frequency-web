import { describe, it, expect, vi, beforeEach } from 'vitest'

const track = vi.fn(async (..._args: unknown[]) => true)
vi.mock('@/lib/analytics/track', () => ({ track: (...args: unknown[]) => track(...args) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'member-1' }))

import { recordSpaceEvent, scheduleSpaceEvent, spaceEventProps, SPACE_ACTIVATION_EVENTS } from './space-events'
import { isClientEvent, isTrackedEvent } from '@/lib/analytics/events'
import { pixelAllowsEvent } from '@/lib/analytics/sanitize'

beforeEach(() => track.mockClear())

describe('Space activation events (LIVE-2335)', () => {
  it('registers all three as server-only and first-party only', () => {
    for (const name of SPACE_ACTIVATION_EVENTS) {
      expect(isTrackedEvent(name)).toBe(true)
      expect(isClientEvent(name)).toBe(false)
      expect(pixelAllowsEvent(name)).toBe(false)
    }
  })

  it('carries the Space id and, for a send, a whole count only', () => {
    expect(spaceEventProps('space.website_published', { spaceId: 's1', recipientCount: 9 })).toEqual({ spaceId: 's1' })
    expect(spaceEventProps('space.campaign_sent', { spaceId: 's1', recipientCount: 12 })).toEqual({ spaceId: 's1', recipientCount: 12 })
    expect(spaceEventProps('space.campaign_sent', { spaceId: 's1' })).toBeNull()
    expect(spaceEventProps('space.campaign_sent', { spaceId: 's1', recipientCount: 1.5 })).toBeNull()
    expect(spaceEventProps('space.spotlight_published', { spaceId: '' })).toBeNull()
  })

  it('records for the caller with no pixel mirror', async () => {
    expect(await recordSpaceEvent('space.campaign_sent', { spaceId: 's1', recipientCount: 3 })).toBe(true)
    expect(track).toHaveBeenCalledWith('space.campaign_sent', { spaceId: 's1', recipientCount: 3 }, 'member-1', { mirrorGa: false })
  })

  it('never throws when the ledger write fails', async () => {
    track.mockRejectedValueOnce(new Error('db down'))
    expect(await recordSpaceEvent('space.spotlight_published', { spaceId: 's1' })).toBe(false)
  })

  it('schedules without a request scope and without throwing', async () => {
    expect(() => scheduleSpaceEvent('space.website_published', { spaceId: 's1' })).not.toThrow()
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1))
  })
})
