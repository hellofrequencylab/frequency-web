import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Space broadcast audience (ADR-858): segments the Message center offers and the
// send-time resolver the action trusts. Locks the ADR-274 posture (server-side re-union),
// the segment taxonomy (members / tier / circle / event), and the scope-spine derivation
// ('space' is deliberately NOT a scope_kind — a space-wide send rides the tenancy lane).

const SPACE = 'aaaaaaaa-0000-4000-a000-00000000000a'
const TIER = 'dddddddd-0000-4000-a000-00000000000d'
const CIRCLE = 'cccccccc-0000-4000-a000-00000000000c'
const EVENT = 'eeeeeeee-0000-4000-a000-00000000000e'

const state: {
  tiers: Array<Record<string, unknown>>
  tierMemberships: Array<Record<string, unknown>>
  circles: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
} = { tiers: [], tierMemberships: [], circles: [], events: [] }

function rowsFor(table: string): Array<Record<string, unknown>> {
  if (table === 'space_membership_tiers') return state.tiers
  if (table === 'space_memberships') return state.tierMemberships
  if (table === 'circles') return state.circles
  if (table === 'events') return state.events
  return []
}

function builder(table: string) {
  const api: Record<string, unknown> = {}
  const chain = () => api
  for (const m of ['select', 'eq', 'neq', 'gte', 'or', 'is', 'order']) api[m] = chain
  api.limit = async () => ({ data: rowsFor(table), error: null })
  // tiers read has no .limit — resolve on order for that path via thenable
  api.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    resolve({ data: rowsFor(table), error: null })
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/spaces/resonance-roster', () => ({
  listActiveSpaceMemberIds: async () => ['owner', 'm1', 'm2'],
}))
vi.mock('@/lib/circles/crm-roster', () => ({
  listActiveCircleMemberIds: async () => new Set(['m1', 'c-only']),
}))
vi.mock('@/lib/events/crm-roster', () => ({
  listEventCrmMemberIds: async () => new Set(['m2', 'rsvp-only']),
}))

import {
  loadSpaceBroadcastSegments,
  resolveSpaceBroadcastAudience,
  scopeForSelection,
  MEMBERS_SEGMENT_KEY,
} from './broadcast-audience'

beforeEach(() => {
  state.tiers = [{ id: TIER, name: 'Gold' }]
  state.tierMemberships = [{ tier_id: TIER, member_profile_id: 'm1' }]
  state.circles = [{ id: CIRCLE, name: 'Morning crew' }]
  state.events = [{ id: EVENT, title: 'Launch night', space_id: SPACE, host_space_id: null }]
})

describe('loadSpaceBroadcastSegments', () => {
  it('offers members first, then tier, circle, and event segments', async () => {
    const segments = await loadSpaceBroadcastSegments(SPACE)
    expect(segments[0]!.key).toBe(MEMBERS_SEGMENT_KEY)
    expect(segments.map((s) => s.key)).toEqual([
      MEMBERS_SEGMENT_KEY,
      `tier:${TIER}`,
      `circle:${CIRCLE}`,
      `event:${EVENT}`,
    ])
    expect(segments[1]!.label).toBe('Gold members')
    expect(segments[3]!.label).toBe('Launch night RSVPs')
  })

  it('drops an event hosted by ANOTHER space (host_space_id wins over placement)', async () => {
    state.events = [{ id: EVENT, title: 'Not ours', space_id: SPACE, host_space_id: 'other-space' }]
    const segments = await loadSpaceBroadcastSegments(SPACE)
    expect(segments.some((s) => s.key.startsWith('event:'))).toBe(false)
  })

  it('members segment stays even when empty, so the console can say so honestly', async () => {
    state.tiers = []
    state.circles = []
    state.events = []
    const segments = await loadSpaceBroadcastSegments(SPACE)
    expect(segments).toHaveLength(1)
    expect(segments[0]!.key).toBe(MEMBERS_SEGMENT_KEY)
  })
})

describe('resolveSpaceBroadcastAudience (ADR-274: server-side re-union)', () => {
  it('unions the selected segments, deduped', async () => {
    const ids = await resolveSpaceBroadcastAudience(SPACE, [`circle:${CIRCLE}`, `event:${EVENT}`])
    expect([...ids].sort()).toEqual(['c-only', 'm1', 'm2', 'rsvp-only'])
  })

  it('defaults to all members when nothing is selected', async () => {
    const ids = await resolveSpaceBroadcastAudience(SPACE, [])
    expect([...ids].sort()).toEqual(['m1', 'm2', 'owner'])
  })

  it('ignores unknown keys instead of trusting them', async () => {
    const ids = await resolveSpaceBroadcastAudience(SPACE, ['bogus:xyz'])
    expect(ids).toEqual([])
  })
})

describe('scopeForSelection (the spine coordinates)', () => {
  it('a single circle selection scopes the send to that circle', () => {
    expect(scopeForSelection([`circle:${CIRCLE}`])).toEqual({ kind: 'circle', id: CIRCLE })
  })

  it('a single event selection scopes to that event', () => {
    expect(scopeForSelection([`event:${EVENT}`])).toEqual({ kind: 'event', id: EVENT })
  })

  it('members, tiers, or any mix are space-wide: scope null, the tenancy lane carries it', () => {
    expect(scopeForSelection([MEMBERS_SEGMENT_KEY])).toBeNull()
    expect(scopeForSelection([`tier:${TIER}`])).toBeNull()
    expect(scopeForSelection([`circle:${CIRCLE}`, `event:${EVENT}`])).toBeNull()
  })
})
