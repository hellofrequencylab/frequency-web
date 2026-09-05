import { describe, it, expect, vi, beforeEach } from 'vitest'

// backfillAcquisition (scan2 L6-09): the acquisition record is ONE key merged server-side per
// member. The `meta` it reads comes from one list query over every member, so by the last row it is
// minutes stale; spreading it back would revert every key those members wrote meanwhile.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  assignTag: vi.fn(),
  profiles: [] as Array<{ id: string; referred_by_profile_id: string | null; meta: Record<string, unknown> | null }>,
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => {
        const api: Record<string, unknown> = {}
        api.in = () => api
        api.then = (resolve: (r: unknown) => unknown) =>
          Promise.resolve(resolve({ data: table === 'profiles' ? mocks.profiles : [], error: null }))
        return api
      },
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/traits/tags', () => ({ assignTag: mocks.assignTag }))

import { backfillAcquisition } from './backfill'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.assignTag.mockResolvedValue(undefined)
  mocks.profiles = [
    { id: 'p1', referred_by_profile_id: 'ref-1', meta: { practiceStreak: { current: 3 } } },
    { id: 'p2', referred_by_profile_id: null, meta: { acquisition: { channel: 'x' } } },
  ]
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('backfillAcquisition', () => {
  it('merges only the acquisition key for an untagged referral member, skipping one already stamped', async () => {
    const res = await backfillAcquisition()
    expect(res).toEqual({ scanned: 2, tagged: 1, skipped: 1 })
    expect(mocks.updates).toEqual([])
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = mocks.rpc.mock.calls[0] as [string, { p_profile_id: string; p_patch: Record<string, unknown> }]
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('p1')
    expect(Object.keys(args.p_patch)).toEqual(['acquisition'])
    expect((args.p_patch.acquisition as { channel: string }).channel).toBe('referral')
  })

  it('does not count a member whose merge failed as tagged', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await backfillAcquisition()
    expect(res).toEqual({ scanned: 2, tagged: 0, skipped: 2 })
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[backfillAcquisition]'), { profileId: 'p1', error: 'boom' })
  })
})
