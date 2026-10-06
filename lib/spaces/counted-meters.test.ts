// LIVE-749: the four counted Space meters. The seam itself (spaceAllowanceVerdict) has its own tests;
// these prove each meter counts the right rows, asks the seam, and never runs a count during the beta.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gatesLive = vi.fn<() => Promise<boolean>>()
const verdict = vi.fn()
const headroom = vi.fn()
const queries: { table: string; filters: unknown[][] }[] = []
let nextCount = 0
let planSpaceId: string | null = 'space-1'

vi.mock('@/lib/pricing/settings', () => ({ featureGatesLive: () => gatesLive() }))
vi.mock('@/lib/pricing/space-allowance', () => ({
  spaceAllowanceVerdict: (...a: unknown[]) => verdict(...a),
  spaceAllowanceHeadroom: (...a: unknown[]) => headroom(...a),
}))
const leadership = vi.fn()
let eventRow: Record<string, unknown> | null = { space_id: 'root', host_space_id: 'space-9', host_id: 'host-1' }
let hostingSpace: string | null = 'space-9'
vi.mock('@/lib/pricing/member-leadership', () => ({
  memberWithinLeadershipAllowance: (...a: unknown[]) => leadership(...a),
}))
vi.mock('@/lib/events/host-space', () => ({ resolveHostingSpaceIdFromRow: async () => hostingSpace }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = { table, filters: [] as unknown[][] }
      queries.push(q)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'is', 'neq', 'or', 'not']) {
        chain[m] = (...args: unknown[]) => {
          q.filters.push([m, ...args])
          return chain
        }
      }
      chain.maybeSingle = async () => {
        if (table === 'events') return { data: eventRow }
        if (table === 'profiles') return { data: { membership_tier: 'crew' } }
        return { data: { space_id: planSpaceId } }
      }
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ count: nextCount, error: null })
      return chain
    },
  }),
}))

import {
  checkEventGuestMeter,
  checkSpaceCircleMeter,
  checkSpaceEventMeter,
  checkSpaceServicesMeter,
  checkHostedCollaboratorMeter,
  checkMembershipTierMeter,
  checkSpaceBookingMeter,
  checkSpaceJourneyMeter,
  monthStartIso,
} from './counted-meters'

beforeEach(() => {
  queries.length = 0
  nextCount = 0
  planSpaceId = 'space-1'
  gatesLive.mockReset().mockResolvedValue(true)
  verdict.mockReset().mockResolvedValue({ allowed: true })
  headroom.mockReset().mockResolvedValue(null)
  leadership.mockReset().mockResolvedValue(true)
  eventRow = { space_id: 'root', host_space_id: 'space-9', host_id: 'host-1' }
  hostingSpace = 'space-9'
})

describe('during the beta nothing is counted and every write passes', () => {
  it.each([
    ['bookings', () => checkSpaceBookingMeter('s1')],
    ['tiers', () => checkMembershipTierMeter('s1', 9)],
    ['collaborators', () => checkHostedCollaboratorMeter('s1')],
    ['journey', () => checkSpaceJourneyMeter('p1', 'root')],
  ])('%s', async (_name, run) => {
    gatesLive.mockResolvedValue(false)
    expect(await run()).toEqual({ ok: true })
    expect(queries).toHaveLength(0)
    expect(verdict).not.toHaveBeenCalled()
  })
})

describe('bookings a month', () => {
  it('counts this month\'s live bookings and asks the seam', async () => {
    nextCount = 20
    verdict.mockResolvedValue({ allowed: false })
    const r = await checkSpaceBookingMeter('s1')
    expect(r.ok).toBe(false)
    expect(verdict).toHaveBeenCalledWith('s1', 'space_bookings', 20)
    expect(queries[0]!.table).toBe('space_bookings')
    expect(queries[0]!.filters).toContainEqual(['in', 'status', ['confirmed', 'pending']])
    expect(queries[0]!.filters).toContainEqual(['gte', 'created_at', monthStartIso()])
  })

  it('month start is the first instant of the UTC month', () => {
    expect(monthStartIso(new Date('2026-12-17T08:00:00Z'))).toBe('2026-12-01T00:00:00.000Z')
  })
})

describe('membership tiers', () => {
  it('a set that does not grow always saves, without asking for headroom', async () => {
    nextCount = 3
    expect(await checkMembershipTierMeter('s1', 2)).toEqual({ ok: true })
    expect(headroom).not.toHaveBeenCalled()
  })

  it('a growing set must fit the headroom', async () => {
    nextCount = 1
    headroom.mockResolvedValue(0)
    expect((await checkMembershipTierMeter('s1', 2)).ok).toBe(false)
    headroom.mockResolvedValue(4)
    expect((await checkMembershipTierMeter('s1', 5)).ok).toBe(true)
    expect(headroom).toHaveBeenCalledWith('s1', 'space_membership_tiers', 1)
  })
})

describe('hosted Collaborators', () => {
  it('counts accepted and pending rows for the host', async () => {
    nextCount = 3
    await checkHostedCollaboratorMeter('host')
    expect(verdict).toHaveBeenCalledWith('host', 'space_collaborators', 3)
    expect(queries[0]!.filters).toContainEqual(['in', 'status', ['accepted', 'pending']])
  })

  it('accepting a pending row does not count it twice', async () => {
    nextCount = 3
    await checkHostedCollaboratorMeter('host', { alreadyCounted: true })
    expect(verdict).toHaveBeenCalledWith('host', 'space_collaborators', 2)
  })
})

describe('people per Journey', () => {
  it('a Space Journey asks the seam with its active enrolments', async () => {
    nextCount = 25
    verdict.mockResolvedValue({ allowed: false })
    expect((await checkSpaceJourneyMeter('p1', 'root')).ok).toBe(false)
    expect(verdict).toHaveBeenCalledWith('space-1', 'space_journey', 25)
  })

  it('a personal Journey (root or no Space) is not this meter', async () => {
    planSpaceId = 'root'
    expect(await checkSpaceJourneyMeter('p1', 'root')).toEqual({ ok: true })
    planSpaceId = null
    expect(await checkSpaceJourneyMeter('p1', 'root')).toEqual({ ok: true })
    expect(verdict).not.toHaveBeenCalled()
  })
})

describe('every failure grants', () => {
  it('a seam that throws never refuses', async () => {
    verdict.mockRejectedValue(new Error('down'))
    expect(await checkSpaceBookingMeter('s1')).toEqual({ ok: true })
    expect(await checkHostedCollaboratorMeter('s1')).toEqual({ ok: true })
  })
})

describe('the new Space meters (LIVE-750)', () => {
  it('Circles count the Space Circle and every live or draft Circle', async () => {
    nextCount = 3
    await checkSpaceCircleMeter('s1')
    expect(verdict).toHaveBeenCalledWith('s1', 'space_circles', 3)
    expect(queries[0]!.filters).toContainEqual(['in', 'status', ['draft', 'forming', 'active']])
  })

  it('upcoming events count only future, live events the Space hosts', async () => {
    await checkSpaceEventMeter('s1')
    expect(verdict.mock.calls[0]![1]).toBe('space_events')
    const f = queries[0]!.filters
    expect(f).toContainEqual(['eq', 'host_space_id', 's1'])
    expect(f).toContainEqual(['is', 'removed_at', null])
    expect(f.some((x) => x[0] === 'gte' && x[1] === 'starts_at')).toBe(true)
  })

  it('a service set that grows must fit the headroom', async () => {
    nextCount = 1
    headroom.mockResolvedValue(0)
    expect((await checkSpaceServicesMeter('s1', 2)).ok).toBe(false)
    expect(await checkSpaceServicesMeter('s1', 1)).toEqual({ ok: true })
  })

  it('a Space-hosted event reads the Space plan for guests', async () => {
    nextCount = 100
    verdict.mockResolvedValue({ allowed: false })
    expect((await checkEventGuestMeter('e1')).ok).toBe(false)
    expect(verdict).toHaveBeenCalledWith('space-9', 'space_event_guests', 100)
    expect(leadership).not.toHaveBeenCalled()
  })

  it('a personal event reads its host tier for guests', async () => {
    hostingSpace = null
    nextCount = 30
    leadership.mockResolvedValue(false)
    expect((await checkEventGuestMeter('e1')).ok).toBe(false)
    expect(leadership).toHaveBeenCalledWith('event_guests', 'crew', 30)
  })
})

describe('the marketing meters (LIVE-751)', () => {
  it('campaigns count what goes out this month; a scheduled one being sent holds its place', async () => {
    const { checkCampaignMonthMeter } = await import('./counted-meters')
    nextCount = 2
    await checkCampaignMonthMeter('s1')
    expect(verdict).toHaveBeenLastCalledWith('s1', 'space_campaigns_month', 2)
    await checkCampaignMonthMeter('s1', { alreadyCounted: true })
    expect(verdict).toHaveBeenLastCalledWith('s1', 'space_campaigns_month', 1)
    expect(queries[0]!.filters).toContainEqual(['in', 'status', ['scheduled', 'sending', 'sent']])
  })

  it('live splash pages and enabled sequences ask their meters', async () => {
    const { checkSpaceFunnelMeter, checkActiveAutomationMeter } = await import('./counted-meters')
    await checkSpaceFunnelMeter('s1')
    expect(verdict).toHaveBeenLastCalledWith('s1', 'space_funnels', 0)
    expect(queries[0]!.filters).toContainEqual(['not', 'splash', 'is', null])
    await checkActiveAutomationMeter('s1')
    expect(verdict).toHaveBeenLastCalledWith('s1', 'space_automations_active', 0)
    expect(queries[1]!.filters).toContainEqual(['eq', 'enabled', true])
  })
})
