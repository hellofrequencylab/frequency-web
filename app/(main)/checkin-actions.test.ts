import { describe, it, expect, vi, beforeEach } from 'vitest'

// dailyCheckIn (scan2 L5-06 / L6-09): the check-in stamp is a server-side merge of ONLY the two
// check-in keys, and the Gem is paid only when the stamp landed. Before this the stamp was an
// unchecked whole-blob update: a failed stamp still paid, and the next load paid again.

const mocks = vi.hoisted(() => ({
  awardGems: vi.fn(),
  recordStreakActivity: vi.fn(),
  resolveMemberDayAndZone: vi.fn(),
  rpc: vi.fn(),
  profile: { id: 'p1', meta: {} as Record<string, unknown> } as { id: string; meta: Record<string, unknown> } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profile, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      throw new Error('dailyCheckIn must not write profiles through .from(): the stamp goes through merge_profile_meta')
    },
  }),
}))
vi.mock('@/lib/gems', () => ({ awardGems: mocks.awardGems }))
vi.mock('@/lib/achievements', () => ({ recordStreakActivity: mocks.recordStreakActivity }))
vi.mock('@/lib/member-day', () => ({ resolveMemberDayAndZone: mocks.resolveMemberDayAndZone }))

import { dailyCheckIn } from './checkin-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile = { id: 'p1', meta: { practiceStreak: { current: 4 }, daily_checkin_date: '2026-09-04', daily_checkin_streak: 2 } }
  mocks.resolveMemberDayAndZone.mockResolvedValue({ day: '2026-09-05', timezone: 'America/Los_Angeles' })
  mocks.awardGems.mockResolvedValue({ awarded: true, amount: 5 })
  mocks.recordStreakActivity.mockResolvedValue(null)
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('dailyCheckIn stamps through merge_profile_meta with only its own keys', () => {
  it('merges daily_checkin_date + daily_checkin_streak and nothing else, then pays', async () => {
    const res = await dailyCheckIn()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [name, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('merge_profile_meta')
    expect(args.p_profile_id).toBe('p1')
    // ONLY the two check-in keys: the practiceStreak read at the top must never ride along.
    expect(args.p_patch).toEqual({ daily_checkin_date: '2026-09-05', daily_checkin_streak: 3 })
    // The day/zone must reach awardGems, or the cap falls back to the UTC day while the guard
    // above keys on the member's LOCAL day. That mismatch silently paid 0 Gems for one check-in
    // in every adjacent local-day pair west of UTC (migration 20270345001200).
    expect(mocks.awardGems).toHaveBeenCalledWith('p1', 'daily_login', undefined, undefined, {
      day: '2026-09-05',
      timezone: 'America/Los_Angeles',
    })
    expect(res).toEqual({ gems: 5, dayStreak: 3 })
  })

  it('pays NOTHING when the stamp did not land (an unstamped day would pay again on the next load)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await dailyCheckIn()
    expect(res).toBeNull()
    expect(mocks.awardGems).not.toHaveBeenCalled()
    expect(mocks.recordStreakActivity).not.toHaveBeenCalled()
  })

  it('is a no-op when today is already stamped', async () => {
    mocks.profile = { id: 'p1', meta: { daily_checkin_date: '2026-09-05' } }
    expect(await dailyCheckIn()).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })
})
