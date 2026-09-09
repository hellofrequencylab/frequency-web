import { describe, it, expect, vi, beforeEach } from 'vitest'

// The tour writer (scan2 L6-09, then LIVE-171 / ADR-1235): setSpotlightTourState merges ONLY the
// field it owns INSIDE the `tour` key, through the member's SESSION client
// (merge_profile_meta_path checks auth.uid() owns the row), so it never reads the sibling tip
// lists and sends them back stale. A failed merge is logged and the analytics event is not
// emitted for a state that was not actually written.
//
// It had a sibling writer, recordTourEvent, until 2026-09-09: the coachmark tour (TourProvider)
// was its only caller and LIVE-240 deleted that engine, so the writer and its half of this file
// went with it. The stale-sibling assertion below is what is left of the pair.

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

import { setSpotlightTourState } from './tour-actions'

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
