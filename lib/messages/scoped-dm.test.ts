import { describe, it, expect, vi, beforeEach } from 'vitest'

// Scoped personal-DM policy (CRM Everywhere plan 5.7): the leadership + audience gates and the
// openScopedDm front door (gate -> block -> rate limits -> ungated seam, no body, no CRM touch).
// The gates run against a table-driven admin mock (the sibling interactions-space.test.ts pattern);
// the front door's collaborators (auth / blocking / rate-limit / the 1:1 seam) are function mocks.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}

// A chainable query mock: filters accumulate, `maybeSingle` resolves the first match, and awaiting
// the chain itself resolves the full match list (the .select().eq() list reads).
function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const api = {
    select() { return api },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api },
    in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return api },
    order() { return api },
    limit() { return api },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
    then(resolve: (v: { data: Row[]; error: null }) => void) { resolve({ data: rows(), error: null }) },
  }
  return api
}

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  isBlockedBetween: vi.fn<() => Promise<boolean>>(),
  rateLimitOk: vi.fn<(bucket: string, id: string, limit: number, window: string) => Promise<boolean>>(),
  findOrCreateDirectConversation: vi.fn<() => Promise<string>>(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: mocks.isBlockedBetween }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: mocks.rateLimitOk }))
vi.mock('@/lib/messages/direct-conversation', () => ({
  findOrCreateDirectConversation: mocks.findOrCreateDirectConversation,
}))

import {
  canDmEventAttendee,
  canDmCircleMember,
  canDmPlaceTreeMember,
  openScopedDm,
} from './scoped-dm'

const SENDER = 'leader-1'
const TARGET = 'member-1'

beforeEach(() => {
  tables = {}
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue(SENDER)
  mocks.isBlockedBetween.mockResolvedValue(false)
  mocks.rateLimitOk.mockResolvedValue(true)
  mocks.findOrCreateDirectConversation.mockResolvedValue('conv-1')
})

describe('canDmEventAttendee', () => {
  const goingRsvp = { id: 'r1', event_id: 'ev-1', profile_id: TARGET, status: 'going' }

  it('allows the event host to reach a going attendee', async () => {
    tables = { events: [{ id: 'ev-1', host_id: SENDER }], event_rsvps: [goingRsvp] }
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(true)
  })

  it('allows an ACCEPTED cohost, but never a pending invite', async () => {
    tables = {
      events: [{ id: 'ev-1', host_id: 'someone-else' }],
      event_cohosts: [{ id: 'c1', event_id: 'ev-1', profile_id: SENDER, status: 'accepted' }],
      event_rsvps: [{ ...goingRsvp, status: 'maybe' }],
    }
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(true)

    tables.event_cohosts![0].status = 'invited'
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(false)
  })

  it('allows platform staff (web_role) who neither host nor cohost', async () => {
    tables = {
      events: [{ id: 'ev-1', host_id: 'someone-else' }],
      profiles: [{ id: SENDER, web_role: 'admin' }],
      event_rsvps: [goingRsvp],
    }
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(true)
  })

  it('refuses a non-leader even when the target RSVP is valid', async () => {
    tables = { events: [{ id: 'ev-1', host_id: 'someone-else' }], event_rsvps: [goingRsvp] }
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(false)
  })

  it('refuses when the target is not going/maybe (waitlist, declined, no RSVP)', async () => {
    tables = {
      events: [{ id: 'ev-1', host_id: SENDER }],
      event_rsvps: [{ ...goingRsvp, status: 'waitlist' }],
    }
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(false)
    tables.event_rsvps = []
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-1')).toBe(false)
  })

  it('fails closed on a missing event or blank ids', async () => {
    expect(await canDmEventAttendee(SENDER, TARGET, 'ev-404')).toBe(false)
    expect(await canDmEventAttendee('', TARGET, 'ev-1')).toBe(false)
    expect(await canDmEventAttendee(SENDER, '', 'ev-1')).toBe(false)
  })
})

describe('canDmCircleMember', () => {
  const activeMembership = { id: 'm1', circle_id: 'ci-1', profile_id: TARGET, status: 'active' }

  it('allows the circle host to reach an active member', async () => {
    tables = {
      circles: [{ id: 'ci-1', host_id: SENDER, hub_id: null }],
      memberships: [activeMembership],
    }
    expect(await canDmCircleMember(SENDER, TARGET, 'ci-1')).toBe(true)
  })

  it('allows the hub guide and the nexus mentor via the leadership walk', async () => {
    tables = {
      circles: [{ id: 'ci-1', host_id: 'someone-else', hub_id: 'hub-1' }],
      hubs: [{ id: 'hub-1', guide_id: SENDER, nexus_id: null }],
      memberships: [activeMembership],
    }
    expect(await canDmCircleMember(SENDER, TARGET, 'ci-1')).toBe(true)

    // Same walk one tier up: guide is someone else, the sender mentors the nexus above.
    tables.hubs = [{ id: 'hub-1', guide_id: 'someone-else', nexus_id: 'nx-1' }]
    tables.nexus_regions = [{ id: 'nx-1', mentor_id: SENDER }]
    expect(await canDmCircleMember(SENDER, TARGET, 'ci-1')).toBe(true)
  })

  it('refuses a non-leader, and a leader reaching an inactive member', async () => {
    tables = {
      circles: [{ id: 'ci-1', host_id: 'someone-else', hub_id: null }],
      memberships: [activeMembership],
    }
    expect(await canDmCircleMember(SENDER, TARGET, 'ci-1')).toBe(false)

    tables.circles = [{ id: 'ci-1', host_id: SENDER, hub_id: null }]
    tables.memberships = [{ ...activeMembership, status: 'left' }]
    expect(await canDmCircleMember(SENDER, TARGET, 'ci-1')).toBe(false)
  })
})

describe('canDmPlaceTreeMember', () => {
  it('allows the hub guide to reach a member of a circle in the hub', async () => {
    tables = {
      hubs: [{ id: 'hub-1', guide_id: SENDER, nexus_id: null }],
      circles: [{ id: 'ci-1', hub_id: 'hub-1' }],
      memberships: [{ id: 'm1', circle_id: 'ci-1', profile_id: TARGET, status: 'active' }],
    }
    expect(await canDmPlaceTreeMember(SENDER, TARGET, { kind: 'hub', id: 'hub-1' })).toBe(true)
  })

  it('refuses when the target only belongs to a circle OUTSIDE the subtree', async () => {
    tables = {
      hubs: [{ id: 'hub-1', guide_id: SENDER, nexus_id: null }],
      circles: [
        { id: 'ci-1', hub_id: 'hub-1' },
        { id: 'ci-2', hub_id: 'hub-2' },
      ],
      memberships: [{ id: 'm1', circle_id: 'ci-2', profile_id: TARGET, status: 'active' }],
    }
    expect(await canDmPlaceTreeMember(SENDER, TARGET, { kind: 'hub', id: 'hub-1' })).toBe(false)
  })

  it('allows the nexus mentor across the full subtree walk', async () => {
    tables = {
      nexus_regions: [{ id: 'nx-1', mentor_id: SENDER }],
      hubs: [{ id: 'hub-1', guide_id: 'someone-else', nexus_id: 'nx-1' }],
      circles: [{ id: 'ci-1', hub_id: 'hub-1' }],
      memberships: [{ id: 'm1', circle_id: 'ci-1', profile_id: TARGET, status: 'active' }],
    }
    expect(await canDmPlaceTreeMember(SENDER, TARGET, { kind: 'nexus', id: 'nx-1' })).toBe(true)
  })

  it('refuses a sender who leads nothing in the scope', async () => {
    tables = {
      hubs: [{ id: 'hub-1', guide_id: 'someone-else', nexus_id: null }],
      circles: [{ id: 'ci-1', hub_id: 'hub-1' }],
      memberships: [{ id: 'm1', circle_id: 'ci-1', profile_id: TARGET, status: 'active' }],
    }
    expect(await canDmPlaceTreeMember(SENDER, TARGET, { kind: 'hub', id: 'hub-1' })).toBe(false)
  })
})

describe('openScopedDm', () => {
  // A passing event fixture: sender hosts ev-1, target is going.
  function passingEventTables() {
    tables = {
      events: [{ id: 'ev-1', host_id: SENDER }],
      event_rsvps: [{ id: 'r1', event_id: 'ev-1', profile_id: TARGET, status: 'going' }],
    }
  }

  it('runs gate -> block -> limits -> seam and returns the conversation id', async () => {
    passingEventTables()
    const out = await openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: TARGET })
    expect(out).toEqual({ conversationId: 'conv-1' })
    expect(mocks.isBlockedBetween).toHaveBeenCalledWith(SENDER, TARGET)
    expect(mocks.rateLimitOk).toHaveBeenCalledWith('scoped-dm:start', SENDER, 30, '1 d')
    expect(mocks.rateLimitOk).toHaveBeenCalledWith('scoped-dm:msg', SENDER, 20, '1 m')
    const seamCall = mocks.findOrCreateDirectConversation.mock.calls[0] as unknown[]
    expect(seamCall[1]).toBe(SENDER)
    expect(seamCall[2]).toBe(TARGET)
  })

  it('refuses before the block/limit checks when the scope gate fails', async () => {
    tables = { events: [{ id: 'ev-1', host_id: 'someone-else' }] }
    await expect(
      openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: TARGET }),
    ).rejects.toThrow(/scope you lead/)
    expect(mocks.isBlockedBetween).not.toHaveBeenCalled()
    expect(mocks.findOrCreateDirectConversation).not.toHaveBeenCalled()
  })

  it('refuses a blocked pair even when the gate passes', async () => {
    passingEventTables()
    mocks.isBlockedBetween.mockResolvedValue(true)
    await expect(
      openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: TARGET }),
    ).rejects.toThrow(/cannot message/)
    expect(mocks.findOrCreateDirectConversation).not.toHaveBeenCalled()
  })

  it('refuses when a rate limit denies, without touching the seam', async () => {
    passingEventTables()
    mocks.rateLimitOk.mockImplementation(async (bucket) => bucket !== 'scoped-dm:start')
    await expect(
      openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: TARGET }),
    ).rejects.toThrow(/tomorrow/)
    expect(mocks.findOrCreateDirectConversation).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller and a self-DM', async () => {
    passingEventTables()
    mocks.getMyProfileId.mockResolvedValue(null)
    await expect(
      openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: TARGET }),
    ).rejects.toThrow(/Sign in/)

    mocks.getMyProfileId.mockResolvedValue(SENDER)
    await expect(
      openScopedDm({ scope: { kind: 'event', id: 'ev-1' }, targetProfileId: SENDER }),
    ).rejects.toThrow(/another member/)
    expect(mocks.findOrCreateDirectConversation).not.toHaveBeenCalled()
  })
})
