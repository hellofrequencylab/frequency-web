import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimChoresReward (scan2 L6-09): the rewarded flag is ONE key (`chores`) merged server-side, and
// it is the guard for the Gems: an unstamped flag pays nothing.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  awardGems: vi.fn(),
  getProfileChores: vi.fn(),
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
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { meta: mocks.meta }, error: null }) }) }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/gems', () => ({ awardGems: mocks.awardGems }))
vi.mock('@/lib/onboarding/profile-chores', () => ({ getProfileChores: mocks.getProfileChores }))

import { claimChoresReward } from './chores-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.awardGems.mockResolvedValue({ awarded: true, amount: 25 })
  mocks.getProfileChores.mockResolvedValue({ complete: true, rewarded: false })
  mocks.meta = { practiceStreak: { current: 2 }, chores: { avatar: true } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('claimChoresReward', () => {
  it('merges only the chores key (with rewarded + rewarded_at), then pays', async () => {
    const res = await claimChoresReward()
    expect(mocks.updates).toEqual([])
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: Record<string, unknown> }]
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('p1')
    expect(Object.keys(args.p_patch)).toEqual(['chores'])
    expect(args.p_patch.chores).toMatchObject({ avatar: true, rewarded: true })
    expect(mocks.awardGems).toHaveBeenCalledWith('p1', 'welcome_member', undefined, { reason: 'profile_chores' })
    expect(res).toEqual({ awarded: true, amount: 25 })
  })

  it('pays NOTHING when the stamp did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await claimChoresReward()
    expect(res).toEqual({ awarded: false, amount: 0 })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })

  it('never pays twice', async () => {
    mocks.meta = { chores: { rewarded: true } }
    expect(await claimChoresReward()).toEqual({ awarded: false, amount: 0, already: true })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
