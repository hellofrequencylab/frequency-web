import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tour writers (scan2 L6-09, then LIVE-171 / ADR-1235): both merge ONLY the fields they own INSIDE the
// `tour` key through the member's SESSION client (merge_profile_meta_path checks auth.uid() owns the
// row). recordTourEvent never sends `tour.spotlight`; setSpotlightTourState never sends the tip lists;
// so the two cannot revert each other. A failed merge is logged and the analytics event is not
// emitted for a tip that was not actually marked.

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

type PathCall = [string, { p_profile_id: string; p_path: string[]; p_patch: Record<string, unknown> }]
function call() {
  return mocks.rpc.mock.calls[0] as PathCall
}
function patch() {
  return call()[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.recordEngagementEvent.mockResolvedValue(undefined)
  mocks.meta = { practiceStreak: { current: 2 }, tour: { seen: ['a'], dismissed: [], spotlight: { status: 'paused', atStop: 1 } } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordTourEvent', () => {
  it('merges the tip fields INSIDE the tour key through the session client, then emits the event', async () => {
    await recordTourEvent('b', 'seen')
    expect(mocks.updates).toEqual([])
    expect(call()[0]).toBe('merge_profile_meta_path')
    expect(patch().p_profile_id).toBe('p1')
    expect(patch().p_path).toEqual(['tour'])
    expect(patch().p_patch).toMatchObject({ version: 1, seen: ['a', 'b'], dismissed: [] })
    // The guided-tour state another writer owns is not read here and sent back stale.
    expect('spotlight' in patch().p_patch).toBe(false)
    expect(mocks.recordEngagementEvent).toHaveBeenCalledTimes(1)
  })

  it('emits no event when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await recordTourEvent('b', 'dismissed')
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })
})

describe('setSpotlightTourState', () => {
  it('sends only `spotlight` INSIDE the tour key, never the tip lists it could have read', async () => {
    await setSpotlightTourState('paused', 2)
    expect(call()[0]).toBe('merge_profile_meta_path')
    expect(patch().p_path).toEqual(['tour'])
    expect(Object.keys(patch().p_patch)).toEqual(['spotlight'])
    expect(patch().p_patch.spotlight).toMatchObject({ status: 'paused', atStop: 2 })
  })

  it('emits no event when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await setSpotlightTourState('completed')
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })
})
