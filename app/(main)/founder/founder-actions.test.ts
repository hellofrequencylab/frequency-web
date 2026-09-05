import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimFounderRewards (scan2 L6-09): the flags are ONE key (`founder`) merged server-side, and the
// merge is the guard for the Gems (flag-first doctrine): an unstamped flag pays nothing.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  awardGems: vi.fn(),
  getFounderTasks: vi.fn(),
  meta: {} as Record<string, unknown>,
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'profiles' ? { meta: mocks.meta } : null, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/gems', () => ({ awardGems: mocks.awardGems }))
vi.mock('@/lib/onboarding/founder-tasks', () => ({ getFounderTasks: mocks.getFounderTasks }))

import { claimFounderRewards } from './founder-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.awardGems.mockResolvedValue({ awarded: true, amount: 10 })
  mocks.getFounderTasks.mockResolvedValue({
    complete: false,
    tasks: [
      { key: 'avatar', done: true },
      { key: 'circle', done: false },
    ],
  })
  mocks.meta = { practiceStreak: { current: 2 }, founder: { rewarded: [] } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimFounderRewards', () => {
  it('merges only the founder key, then pays the newly done tasks', async () => {
    const res = await claimFounderRewards()
    expect(mocks.updates).toEqual([])
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: Record<string, unknown> }]
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('p1')
    expect(args.p_patch).toEqual({ founder: { rewarded: ['avatar'], badge: false } })
    expect(mocks.awardGems).toHaveBeenCalledTimes(1)
    expect(res.newlyRewarded).toEqual(['avatar'])
    expect(res.gemsAwarded).toBe(10)
  })

  it('pays NOTHING when the stamp did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await claimFounderRewards()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })
})
