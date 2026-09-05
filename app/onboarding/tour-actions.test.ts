import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tour writers (scan2 L6-09): both merge ONLY the `tour` key through the member's SESSION client
// (merge_profile_meta checks auth.uid() owns the row). A failed merge is logged and the analytics
// event is not emitted for a tip that was not actually marked.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  recordEngagementEvent: vi.fn(),
  meta: {} as Record<string, unknown>,
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', meta: mocks.meta }, error: null }) }) }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: mocks.recordEngagementEvent }))

import { recordTourEvent, setSpotlightTourState } from './tour-actions'

function patch() {
  return (mocks.rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: Record<string, unknown> }])[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.recordEngagementEvent.mockResolvedValue(undefined)
  mocks.meta = { practiceStreak: { current: 2 }, tour: { seen: ['a'], dismissed: [] } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordTourEvent', () => {
  it('merges only the tour key through the session client, then emits the event', async () => {
    await recordTourEvent('b', 'seen')
    expect(mocks.updates).toEqual([])
    expect(patch().p_profile_id).toBe('p1')
    expect(Object.keys(patch().p_patch)).toEqual(['tour'])
    expect(patch().p_patch.tour).toMatchObject({ version: 1, seen: ['a', 'b'], dismissed: [] })
    expect(mocks.recordEngagementEvent).toHaveBeenCalledTimes(1)
  })

  it('emits no event when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await recordTourEvent('b', 'dismissed')
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })
})

describe('setSpotlightTourState', () => {
  it('merges only the tour key, keeping the tip lists beside the spotlight state', async () => {
    await setSpotlightTourState('paused', 2)
    expect(Object.keys(patch().p_patch)).toEqual(['tour'])
    const tour = patch().p_patch.tour as Record<string, unknown>
    expect(tour.seen).toEqual(['a'])
    expect(tour.spotlight).toMatchObject({ status: 'paused', atStop: 2 })
  })

  it('emits no event when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await setSpotlightTourState('completed')
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })
})
