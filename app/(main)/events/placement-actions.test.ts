import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// approveEventPlacement (scan-2 L5-10, the placement twin): the request-row update used to drop
// its error and the requester was told "placed" regardless. Now a refused update returns the
// failure shape and sends NO decision notice; a landed one notifies and returns ok.
// Pinned on a FAKE admin client that can refuse one table's update at a time.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** The pending request loadPendingRequest finds. */
  request: {
    id: 'req-1',
    event_id: 'event-1',
    target_type: 'space',
    space_id: 'space-1',
    circle_id: null,
    requested_by: 'host-1',
    status: 'pending',
  } as Row | null,
  /** Per-table update error: the events write and the request write are refused independently. */
  updateError: {} as Record<string, { code?: string; message: string } | undefined>,
  notifications: [] as Row[],
  updates: [] as Array<{ table: string; payload: Row }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Row = {}
      const chain = () => b
      for (const m of ['select', 'order', 'limit']) b[m] = chain
      b.eq = () => b
      b.update = (payload: Row) => {
        state.updates.push({ table, payload })
        return b
      }
      b.insert = (payload: Row) => {
        if (table === 'notifications') state.notifications.push(payload)
        return Promise.resolve({ error: null })
      }
      b.maybeSingle = async () => ({
        data:
          table === 'event_placement_requests' ? state.request
          : table === 'events' ? { title: 'Moon Circle', slug: 'moon-circle' }
          : null,
        error: null,
      })
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: state.updateError[table] ?? null })
      return b
    },
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'steward-1', isPlatformStaff: async () => false }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getEventCapabilities: async () => new Set(),
  getCircleCapabilities: async () => new Set(),
}))
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: async () => ({ id: 'space-1', slug: 'the-space' }),
  loadRootSpaceId: async () => null,
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ isAdmin: true }) }))
vi.mock('@/lib/circles/store', () => ({ spaceIdForCircle: async () => null }))
vi.mock('@/lib/events/event-drafts', () => ({ resolveRegionScopeId: async () => null }))
vi.mock('@/lib/events/placement', () => ({
  getPlacementView: async () => ({ status: 'none', target: null, requestId: null }),
  resolvePlacementTarget: async () => ({ type: 'space', id: 'space-1', name: 'The Space', slug: 'the-space' }),
  listSpaceStewardIds: async () => [],
  listSpaceEventCreatorIds: async () => [],
  listCircleStewardIds: async () => [],
  livePlacementPatch: () => ({ space_id: 'space-1' }),
  clearPlacementPatch: () => ({}),
  NO_PLACEMENT: { status: 'none', target: null, requestId: null },
}))

import { approveEventPlacement } from './placement-actions'

beforeEach(() => {
  state.updateError = {}
  state.notifications.length = 0
  state.updates.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('approveEventPlacement reads the request-row update', () => {
  it('a landed approval notifies the requester and returns ok', async () => {
    expect(await approveEventPlacement('req-1')).toEqual({ data: undefined })
    expect(state.updates.map((u) => u.table)).toEqual(['events', 'event_placement_requests'])
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0].type).toBe('event_placement_approved')
  })

  it('🔴 a refused request update sends NO "placed" notice and returns the failure shape', async () => {
    state.updateError = { event_placement_requests: { code: '42501', message: 'permission denied' } }
    const result = await approveEventPlacement('req-1')
    expect('error' in result).toBe(true)
    expect(state.notifications).toHaveLength(0)
  })

  it('a refused EVENT write stops before the request row is touched (unchanged behaviour)', async () => {
    state.updateError = { events: { message: 'permission denied' } }
    const result = await approveEventPlacement('req-1')
    expect('error' in result).toBe(true)
    expect(state.updates.map((u) => u.table)).toEqual(['events'])
    expect(state.notifications).toHaveLength(0)
  })
})
