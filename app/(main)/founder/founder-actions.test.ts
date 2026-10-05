import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimFounderRewards (scan2 L6-09, SCAN-759): the flags are claimed through ONE compare-and-set RPC
// under the profile row lock (claim_founder_flags), and what that call ADDED is the guard for the
// Gems (flag-first doctrine): an unstamped flag pays nothing, and a call that added nothing pays nothing.

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
  mocks.rpc.mockResolvedValue({ data: { added: ['avatar'], completing: false }, error: null })
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
  it('claims the done tasks through the row-locked RPC, then pays what it added', async () => {
    const res = await claimFounderRewards()
    expect(mocks.updates).toEqual([])
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_profile: string; p_tasks: string[]; p_complete: boolean }]
    expect(name).toBe('claim_founder_flags')
    expect(args.p_profile).toBe('p1')
    expect(args.p_tasks).toEqual(['avatar'])
    expect(args.p_complete).toBe(false)
    expect(mocks.awardGems).toHaveBeenCalledTimes(1)
    expect(res.newlyRewarded).toEqual(['avatar'])
    expect(res.gemsAwarded).toBe(10)
  })

  it('pays NOTHING when a concurrent call already claimed the same tasks', async () => {
    mocks.rpc.mockResolvedValue({ data: { added: [], completing: false }, error: null })
    const res = await claimFounderRewards()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })

  it('pays NOTHING when the stamp did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await claimFounderRewards()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })
})
