import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimFounderRewards (scan2 L6-09, SCAN-759): the flags are stamped by ONE compare-and-set RPC
// (claim_founder_flags, migration 20270345011800) and the Gems are paid for exactly the set the
// database says THIS call claimed (flag-first doctrine): a failed stamp pays nothing, and an
// overlapping claim that stamped nothing pays nothing. The profiles.meta read that used to decide
// the payout here is gone; the decision is the RPC's, under the row lock.

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
  mocks.rpc.mockResolvedValue({ data: { added: ['post'], completing: false }, error: null })
  mocks.awardGems.mockResolvedValue({ awarded: true, amount: 10 })
  mocks.getFounderTasks.mockResolvedValue({
    complete: false,
    tasks: [
      { key: 'post', done: true },
      { key: 'react', done: false },
    ],
  })
  mocks.meta = { practiceStreak: { current: 2 }, founder: { rewarded: [] } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimFounderRewards', () => {
  it('asks the database to claim the done tasks, then pays what it says was added', async () => {
    const res = await claimFounderRewards()
    expect(mocks.updates).toEqual([])
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('claim_founder_flags')
    expect(args).toEqual({ p_profile_id: 'p1', p_tasks: ['post'], p_complete: false })
    expect(mocks.awardGems).toHaveBeenCalledTimes(1)
    expect(mocks.awardGems).toHaveBeenCalledWith('p1', 'achievement', 5, { reason: 'founder_first_week', tasks: ['post'] })
    expect(res.newlyRewarded).toEqual(['post'])
    expect(res.gemsAwarded).toBe(10)
    expect(res.badgeGranted).toBe(false)
  })

  it('pays NOTHING when the stamp did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await claimFounderRewards()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })

  it('SCAN-759: the second tab, whose claim stamped nothing, pays nothing', async () => {
    // Same tasks done, same completion state, but the database reports the stamp already landed
    // (the other tab got there first under the row lock). The old code paid from its own read.
    mocks.getFounderTasks.mockResolvedValue({
      complete: true,
      tasks: [
        { key: 'post', done: true },
        { key: 'react', done: true },
      ],
    })
    mocks.rpc.mockResolvedValue({ data: { added: [], completing: false }, error: null })
    const res = await claimFounderRewards()
    const [, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(args).toEqual({ p_profile_id: 'p1', p_tasks: ['post', 'react'], p_complete: true })
    expect(mocks.awardGems).not.toHaveBeenCalled()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
  })

  it('pays the per-task Gems for the added set and the bonus only when the database says completing', async () => {
    mocks.getFounderTasks.mockResolvedValue({
      complete: true,
      tasks: [
        { key: 'post', done: true },
        { key: 'react', done: true },
      ],
    })
    mocks.rpc.mockResolvedValue({ data: { added: ['react'], completing: true }, error: null })
    mocks.awardGems.mockResolvedValueOnce({ awarded: true, amount: 10 }).mockResolvedValueOnce({ awarded: true, amount: 50 })
    const res = await claimFounderRewards()
    expect(mocks.awardGems).toHaveBeenCalledTimes(2)
    expect(mocks.awardGems.mock.calls[0]).toEqual(['p1', 'achievement', 5, { reason: 'founder_first_week', tasks: ['react'] }])
    expect(mocks.awardGems.mock.calls[1]).toEqual(['p1', 'achievement', 25, { reason: 'founder_first_week_complete' }])
    expect(res).toEqual({ newlyRewarded: ['react'], gemsAwarded: 60, badgeGranted: true })
  })

  it('a malformed answer from the database claims nothing rather than everything', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not an object', error: null })
    const res = await claimFounderRewards()
    expect(mocks.awardGems).not.toHaveBeenCalled()
    expect(res).toEqual({ newlyRewarded: [], gemsAwarded: 0, badgeGranted: false })
  })
})
